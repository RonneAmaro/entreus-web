import { describe, expect, it } from 'vitest'
import { autoReelsMusic, generateAutoReels, type AutoReelsMedia } from '@/lib/video-editor/auto-reels'
import { validAudioClip } from '@/lib/video-editor/audio-clips'

const photos = ['c', 'a', 'b'].map((id) => ({ id, name: `${id}.png`, previewUrl: `blob:${id}` }))

describe('AutoReels local', () => {
  const video: AutoReelsMedia = { id: 'video', name: 'trecho.webm', previewUrl: 'blob:video', type: 'video', sourceDuration: 8, trimStart: 2, trimEnd: 5 }
  it('combina foto, vídeo recortado e foto sem alterar as fontes', () => {
    const media = [photos[0], video, photos[1]], before = JSON.stringify(media)
    const plan = generateAutoReels(media, { format: '9:16', timing: 'per-photo', seconds: 2 })
    expect(plan.clips.map((clip) => [clip.type, clip.startTime, clip.endTime])).toEqual([['image', 0, 2], ['video', 2, 5], ['image', 5, 7]])
    expect(plan.clips[1]).toMatchObject({ sourceDuration: 8, trimStart: 2, trimEnd: 5 })
    expect(plan).toMatchObject({ duration: 7, photoCount: 2, videoCount: 1 })
    expect(JSON.stringify(media)).toBe(before)
  })
  it('preserva dois vídeos mesmo se a duração solicitada for menor', () => {
    const plan = generateAutoReels([video, { ...video, id: 'second', trimStart: 0, trimEnd: 2 }], { format: '16:9', timing: 'total', seconds: 1 })
    expect(plan.duration).toBe(5)
    expect(plan.clips.map((clip) => clip.duration)).toEqual([3, 2])
    expect(plan.size).toEqual({ width: 1280, height: 720 })
  })
  it('distribui apenas entre as fotos o tempo restante do total', () => {
    const plan = generateAutoReels([photos[0], video, photos[1]], { format: '16:9', timing: 'total', seconds: 7 })
    expect(plan.clips.map((clip) => clip.duration)).toEqual([2, 3, 2])
    expect(() => generateAutoReels([photos[0], video], { format: '16:9', timing: 'total', seconds: 3 })).toThrow()
  })
  it('revalida o total de recortes fracionários sem rejeitar fotos nos limites', () => {
    for (const seconds of [1, 8]) {
      const media = [photos[0], { ...video, trimStart: 0, trimEnd: 1.3 }, photos[1]]
      const plan = generateAutoReels(media, { format: '16:9', timing: 'per-photo', seconds })
      const checked = generateAutoReels(media, { format: '16:9', timing: 'total', seconds: plan.duration })
      expect(checked.clips.map((clip) => clip.duration)).toEqual([seconds, 1.3, seconds])
      expect(checked.duration).toBeCloseTo(plan.duration, 9)
    }
  })
  it('rejeita recortes inválidos e mais de dez itens mistos', () => {
    const options = { format: '16:9' as const, timing: 'per-photo' as const, seconds: 2 }
    for (const patch of [{ trimEnd: 9 }, { trimStart: -1 }, { trimStart: 5 }, { sourceDuration: NaN }, { trimEnd: 2.1 }]) expect(() => generateAutoReels([{ ...video, ...patch }], options)).toThrow()
    expect(() => generateAutoReels(Array.from({ length: 11 }, (_, i) => ({ ...video, id: String(i) })), options)).toThrow()
  })
  it('gera três fotos na ordem selecionada sem intervalos nem sobreposições', () => {
    const before = JSON.stringify(photos)
    const plan = generateAutoReels(photos, { format: '9:16', timing: 'per-photo', seconds: 2 })
    expect(plan.clips.map((clip) => clip.sourceId)).toEqual(['c', 'a', 'b'])
    expect(plan.clips.map((clip) => [clip.startTime, clip.endTime])).toEqual([[0, 2], [2, 4], [4, 6]])
    expect(plan.duration).toBe(6)
    expect(plan.size).toEqual({ width: 720, height: 1280 })
    expect(JSON.stringify(photos)).toBe(before)
  })
  it('distribui a duração total e suporta formato horizontal', () => {
    const plan = generateAutoReels(photos, { format: '16:9', timing: 'total', seconds: 10 })
    expect(plan.duration).toBeCloseTo(10, 10)
    expect(plan.size).toEqual({ width: 1280, height: 720 })
    plan.clips.forEach((clip, i) => { expect(clip.duration).toBeCloseTo(10 / 3); expect(clip.startTime).toBe(i ? plan.clips[i - 1].endTime : 0) })
  })
  it('recusa ausência de mídia, indisponibilidade, duplicatas e durações inválidas', () => {
    const options = { format: '16:9' as const, timing: 'per-photo' as const, seconds: 3 }
    for (const invalid of [[], [{ ...photos[0], previewUrl: '' }], [photos[0], photos[0]]]) expect(() => generateAutoReels(invalid, options)).toThrow()
    for (const seconds of [0, -1, NaN, Infinity, 0.5, 9]) expect(() => generateAutoReels(photos, { ...options, seconds })).toThrow()
    expect(() => generateAutoReels(photos, { ...options, timing: 'total', seconds: 2 })).toThrow()
  })
  it('reutiliza a referência musical e limita a faixa à montagem ou ao arquivo', () => {
    const asset = { source: 'local' as const, assetId: 'sha256-music', category: 'music' as const, duration: 20,
      media: { id: 'sha256-music', name: 'trilha.wav', type: 'audio/wav', size: 100, lastModified: 1 } }
    const clip = autoReelsMusic(asset, 'audio-montage', 9, 6)
    expect(validAudioClip(clip)).toBe(true)
    expect(clip).toMatchObject({ assetId: asset.assetId, startTime: 9, trimEnd: 6, fadeIn: 0, fadeOut: 0 })
    expect(autoReelsMusic(asset, 'audio-short', 0, 30).trimEnd).toBe(20)
    expect(asset.media.id).toBe(asset.assetId)
  })
})
