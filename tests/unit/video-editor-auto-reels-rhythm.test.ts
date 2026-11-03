import { describe, expect, it } from 'vitest'
import { generateAutoReels, type AutoReelsMedia } from '@/lib/video-editor/auto-reels'
import { generateRhythmicAutoReels, validateSynchronizedAutoReels, type RhythmicAutoReelsRequest, type SynchronizedAutoReelsProposal } from '@/lib/video-editor/auto-reels-rhythm'

const photos: AutoReelsMedia[] = ['c', 'a', 'b'].map((id) => ({ id, name: `${id}.png`, previewUrl: `blob:${id}` }))
const video: AutoReelsMedia = { id: 'v', name: 'v.webm', previewUrl: 'blob:v', type: 'video', sourceDuration: 10, trimStart: 2, trimEnd: 6 }
function request(events: number[] = [1, 2, 3, 4, 5], totalSeconds = 6): RhythmicAutoReelsRequest {
  return { format: '9:16', totalSeconds, music: { assetId: 'sha256-music', duration: 20 }, analysis: { status: 'detected', events } }
}
function synchronized(media = photos, input = request()): SynchronizedAutoReelsProposal {
  const result = generateRhythmicAutoReels(media, input)
  expect(result.kind).toBe('synchronized')
  if (result.kind !== 'synchronized') throw new Error(JSON.stringify(result))
  return result.proposal
}
function assertBounds(plan: SynchronizedAutoReelsProposal, media: AutoReelsMedia[]) {
  plan.clips.forEach((clip, index) => {
    expect(clip.sourceId).toBe(media[index].id)
    expect(clip.startTime).toBe(index ? plan.clips[index - 1].endTime : 0)
    expect(clip.duration).toBeCloseTo(clip.endTime - clip.startTime, 9)
    expect(Number.isFinite(clip.endTime)).toBe(true)
    expect(clip.duration).toBeGreaterThanOrEqual(clip.type === 'image' ? 1 : 0.5)
    if (clip.type === 'image') expect(clip.duration).toBeLessThanOrEqual(8)
    else {
      const source = media[index]
      if (source.type !== 'video') throw new Error('Tipo inesperado')
      expect(clip.trimStart).toBe(source.trimStart)
      expect(clip.trimEnd).toBeLessThanOrEqual(source.trimEnd)
      expect(clip.trimEnd! - clip.trimStart!).toBeCloseTo(clip.duration, 9)
    }
  })
  expect(plan.duration).toBe(plan.clips.at(-1)!.endTime)
}

describe('gerador AutoReels sincronizado', () => {
  it('alinha fotos a eventos periódicos, mantém ordem e não altera entradas', () => {
    const input = request(), before = JSON.stringify([photos, input])
    const plan = synchronized(photos, input)
    expect(plan.clips.map((clip) => clip.endTime)).toEqual([2, 4, 6])
    expect(plan.size).toEqual({ width: 720, height: 1280 })
    expect(plan.synchronization).toMatchObject({ musicAssetId: input.music.assetId, timeOrigin: 'music-start', version: 1 })
    expect(JSON.stringify([photos, input])).toBe(before)
    expect(generateRhythmicAutoReels(photos, input)).toEqual({ kind: 'synchronized', proposal: plan })
    assertBounds(plan, photos)
  })
  it('encurta vídeos a partir do recorte selecionado e preserva fontes', () => {
    const media = [photos[0], video, photos[1]], before = JSON.stringify(media)
    const plan = synchronized(media)
    expect(plan.clips[1]).toMatchObject({ trimStart: 2, trimEnd: 4, duration: 2, sourceDuration: 10 })
    assertBounds(plan, media); expect(JSON.stringify(media)).toBe(before)
  })
  it('seleciona eventos irregulares e resolve empates pela sequência mais cedo', () => {
    const plan = synchronized(photos, request([1.3, 1.8, 2.2, 3.8, 4.2, 4.7]))
    expect(plan.clips.map((clip) => clip.endTime)).toEqual([1.8, 3.8, 6])
    assertBounds(plan, photos)
  })
  it('busca um caminho completo quando o corte inicial mais próximo inviabilizaria vídeo curto', () => {
    const short = { ...video, trimEnd: 2.5 }
    const media = [photos[0], short, photos[1]]
    const plan = synchronized(media, request([1.2, 1.7, 2, 4], 6))
    expect(plan.clips.map((clip) => clip.endTime)).toEqual([1.2, 1.7, 6])
    assertBounds(plan, media)
  })
  it('ignora candidatos próximos demais para os limites dos clipes', () => {
    const plan = synchronized(photos, request([0.1, 0.2, 1.99, 2, 2.01, 3.99, 4, 4.01]))
    expect(plan.clips.map((clip) => clip.endTime)).toEqual([2, 4, 6])
    assertBounds(plan, photos)
  })
  it('respeita fotos nos limites de 1 e 8 segundos', () => {
    for (const seconds of [1, 8]) {
      const input = request([seconds], seconds * 2)
      const plan = synchronized(photos.slice(0, 2), input)
      expect(plan.clips.map((clip) => clip.duration)).toEqual([seconds, seconds])
    }
  })
  it('aceita dois vídeos de 0,5 s e recusa recorte menor que o mínimo', () => {
    const media = [{ ...video, trimEnd: 2.5 }, { ...video, id: 'v2', trimEnd: 2.5 }]
    const plan = synchronized(media, request([0.5], 1))
    assertBounds(plan, media)
    expect(generateRhythmicAutoReels([{ ...video, trimEnd: 2.49 }], request())).toMatchObject({ kind: 'error', reason: 'invalid-input' })
  })
  it('suporta dez mídias e recusa onze ou IDs repetidos', () => {
    const media = Array.from({ length: 10 }, (_, i) => ({ ...photos[0], id: String(i) }))
    assertBounds(synchronized(media, request([1, 2, 3, 4, 5, 6, 7, 8, 9], 10)), media)
    expect(generateRhythmicAutoReels([...media, { ...photos[0], id: 'extra' }], request())).toMatchObject({ kind: 'error', reason: 'invalid-input' })
    expect(generateRhythmicAutoReels([photos[0], photos[0]], request())).toMatchObject({ kind: 'error', reason: 'invalid-input' })
  })
  it('recusa depender de música além do intervalo disponível', () => {
    const input = request(); input.music.duration = 5
    expect(generateRhythmicAutoReels(photos, input)).toMatchObject({ kind: 'error', reason: 'music-too-short' })
    input.music.duration = 6
    expect(generateRhythmicAutoReels(photos, input).kind).toBe('synchronized')
  })
  it('retorna fallback regular explícito para silêncio ou eventos insuficientes', () => {
    for (const analysis of [{ status: 'insufficient' as const, events: [] }, { status: 'detected' as const, events: [] }, { status: 'detected' as const, events: [2] }]) {
      const input = { ...request(), analysis }
      const result = generateRhythmicAutoReels(photos, input)
      expect(result).toEqual({ kind: 'fallback', reason: 'insufficient-events', proposal: generateAutoReels(photos, { format: input.format, timing: 'total', seconds: 6 }) })
      if (result.kind === 'fallback') expect(result.proposal).not.toHaveProperty('synchronization')
    }
  })
  it('não anuncia sincronização para uma mídia sem cortes internos', () => {
    expect(generateRhythmicAutoReels([photos[0]], request())).toMatchObject({ kind: 'fallback', reason: 'insufficient-events' })
  })
  it.each([[1, 1, 2], [2, 1], [-1, 2], [NaN, 2], [Infinity, 2], [1, 21]])('identifica eventos inválidos: %j', (...events) => {
    expect(generateRhythmicAutoReels(photos, request(events))).toMatchObject({ kind: 'fallback', reason: 'invalid-events' })
  })
  it('distingue fallback viável de erro sem alternativa regular', () => {
    expect(generateRhythmicAutoReels(photos, request([0.1, 0.2]))).toMatchObject({ kind: 'fallback', reason: 'infeasible' })
    expect(generateRhythmicAutoReels(photos, request([0.1, 0.2], 2))).toMatchObject({ kind: 'error', reason: 'infeasible' })
    // Vídeos completos somam 8 s: o modo regular não pode fingir cumprir 6 s.
    expect(generateRhythmicAutoReels([video, { ...video, id: 'v2' }], request([]))).toMatchObject({ kind: 'error', reason: 'insufficient-events' })
  })
  it('usa uma grade absoluta de microssegundos sem acumular deriva', () => {
    const plan = synchronized(photos, request([1.333333333, 2.666666667], 4.0000009))
    expect(plan.clips.map((clip) => clip.endTime)).toEqual([1.333333, 2.666667, 4])
    assertBounds(plan, photos)
    expect(Math.abs(plan.duration - 4.0000009)).toBeLessThan(0.000001)
  })
  it('preserva o modo regular anterior inclusive vídeo sem ajuste ao total', () => {
    const options = { format: '16:9' as const, timing: 'total' as const, seconds: 1 }
    expect(generateAutoReels([video], options)).toMatchObject({ duration: 4, clips: [{ trimStart: 2, trimEnd: 6 }] })
  })
  it('rejeita configurações inválidas e eventos excessivos com resultado estruturado', () => {
    for (const totalSeconds of [0, -1, Infinity, NaN, 61]) expect(generateRhythmicAutoReels(photos, { ...request(), totalSeconds })).toMatchObject({ kind: 'error', reason: 'invalid-input' })
    expect(generateRhythmicAutoReels(photos, request(Array.from({ length: 601 }, (_, i) => i / 100)))).toMatchObject({ kind: 'fallback', reason: 'invalid-events' })
  })
})

describe('contrato de confirmação para 09G-B.3', () => {
  const media = [photos[0], video, photos[1]]
  it('reconstrói os tempos sincronizados e retorna cópia canônica da proposta', () => {
    const plan = synchronized(media), saved = JSON.parse(JSON.stringify(plan))
    const checked = validateSynchronizedAutoReels(saved, media, request())
    expect(checked.valid).toBe(true)
    if (checked.valid) { expect(checked.proposal).toEqual(plan); expect(checked.proposal).not.toBe(saved) }
    expect(plan.clips[1].trimEnd).toBe(4)
    // Reconstrução regular restauraria o recorte completo: incompatível.
    const regular = generateAutoReels(media, { format: '9:16', timing: 'total', seconds: 6 })
    expect(validateSynchronizedAutoReels(regular, media, request()).valid).toBe(false)
  })
  it('recusa adulteração de tempos, fontes, ordem, recortes, música, formato e campos extras', () => {
    const original = synchronized(media)
    const mutations: Array<(plan: SynchronizedAutoReelsProposal) => void> = [
      (p) => { p.clips[0].duration = NaN }, (p) => { p.clips[1].startTime += 0.1 },
      (p) => { p.clips[1].endTime += 0.1 }, (p) => { p.clips[1].trimStart = 0 },
      (p) => { p.clips[1].trimEnd = 9 }, (p) => { p.clips[1].sourceId = 'other' },
      (p) => { p.clips.reverse() }, (p) => { p.duration = 7 },
      (p) => { p.synchronization.musicAssetId = 'other' }, (p) => { p.format = '16:9' },
      (p) => { Object.assign(p, { extra: true }) },
    ]
    for (const mutate of mutations) {
      const copy = structuredClone(original); mutate(copy)
      expect(validateSynchronizedAutoReels(copy, media, request()).valid).toBe(false)
    }
    for (const invalid of [null, {}, [], Infinity]) expect(validateSynchronizedAutoReels(invalid, media, request()).valid).toBe(false)
  })
  it('recusa proposta obsoleta quando as mídias ou o contexto musical mudam', () => {
    const plan = synchronized(media)
    expect(validateSynchronizedAutoReels(plan, [photos[0], { ...video, trimStart: 3 }, photos[1]], request()).valid).toBe(false)
    const changed = request(); changed.music.assetId = 'changed'
    expect(validateSynchronizedAutoReels(plan, media, changed).valid).toBe(false)
    expect(validateSynchronizedAutoReels(plan, media, request([])).valid).toBe(false)
  })
})
