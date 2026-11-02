import { describe, expect, it, vi } from 'vitest'
import { analyzeRhythm } from '@/lib/video-editor/rhythm-analysis'
import { createRhythmAnalyzer, estimateRhythmMemory, RHYTHM_MAX_ESTIMATED_BYTES } from '@/lib/video-editor/rhythm-local'
import type { SavedLibraryAsset } from '@/lib/video-editor/audio-library'

const rate = 8000
function pulses(times: number[], seconds = 4) {
  const pcm = new Float32Array(rate * seconds)
  for (const time of times) pcm.fill(0.8, Math.round(time * rate), Math.round(time * rate) + 80)
  return pcm
}
describe('análise PCM', () => {
  it('detecta pulsos conhecidos em ordem, com tolerância de 20 ms e saída reproduzível', () => {
    const input = pulses([0.5, 1.5, 2.5])
    const result = analyzeRhythm([input], rate)
    expect(result.status).toBe('detected'); expect(result.events).toHaveLength(3)
    result.events.forEach((event, i) => expect(Math.abs(event - [0.5, 1.5, 2.5][i])).toBeLessThanOrEqual(0.02))
    expect(analyzeRhythm([input], rate)).toEqual(result)
    expect(analyzeRhythm([input, Float32Array.from(input, (v) => -v)], rate)).toEqual(result)
  })
  it('separa picos próximos e não inventa eventos em silêncio, sinal constante ou ruído estacionário', () => {
    const result = analyzeRhythm([pulses([0.5, 0.6, 1.5])], rate)
    expect(result.events).toEqual([0.5, 1.5])
    const noise = new Float32Array(rate * 4); let seed = 123
    for (let i = 0; i < noise.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; noise[i] = (seed / 0xffffffff - 0.5) * 0.2 }
    for (const signal of [new Float32Array(rate * 4), new Float32Array(rate * 4).fill(0.2), noise]) expect(analyzeRhythm([signal], rate)).toEqual({ status: 'insufficient', events: [] })
  })
  it('rejeita dados, opções e duração inválidos', () => {
    const invalid = pulses([0.5]); invalid[10] = NaN
    expect(() => analyzeRhythm([invalid], rate)).toThrow()
    expect(() => analyzeRhythm([pulses([])], 0)).toThrow()
    expect(() => analyzeRhythm([pulses([]), new Float32Array(1)], rate)).toThrow()
    expect(() => analyzeRhythm([pulses([])], rate, { minSeparationSeconds: 0 })).toThrow()
    expect(() => analyzeRhythm([new Float32Array(rate * 61)], rate)).toThrow()
  })
})

const file = new File(['some audio'], 'music.wav', { type: 'audio/wav' })
const asset: SavedLibraryAsset = { source: 'local', assetId: 'x', category: 'music', duration: 4, media: { id: 'x', name: file.name, type: file.type, size: file.size, lastModified: file.lastModified } }
function setup(decode = vi.fn(async () => ({ numberOfChannels: 1, sampleRate: rate, duration: 4, length: rate * 4, getChannelData: () => pulses([0.5, 1.5]) } as unknown as AudioBuffer))) {
  const close = vi.fn(async () => {})
  const workers: { terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn>; onmessage: ((event: MessageEvent) => void) | null; onerror: null; onmessageerror: null }[] = []
  const worker = () => {
    const w = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null, onerror: null, onmessageerror: null }
    workers.push(w); return w as unknown as Worker
  }
  const analyzer = createRhythmAnalyzer({ load: vi.fn(async () => file), verify: vi.fn(async () => true), metadata: vi.fn(async () => 4), context: () => ({ decodeAudioData: decode, close } as unknown as AudioContext), worker })
  return { analyzer, close, workers, decode }
}
async function untilWorker(workers: unknown[]) { for (let i = 0; i < 30 && !workers.length; i++) await new Promise((resolve) => setTimeout(resolve, 0)); expect(workers.length).toBeGreaterThan(0) }
describe('adaptador e ciclo do worker', () => {
  it('rejeita limites antes da decodificação e estima memória PCM', async () => {
    const { analyzer, decode } = setup()
    await expect(analyzer.analyze('p', { ...asset, duration: 61 })).rejects.toMatchObject({ code: 'limit' })
    expect(decode).not.toHaveBeenCalled()
    expect(estimateRhythmMemory(60, 192000, 2, 0)).toBeGreaterThan(RHYTHM_MAX_ESTIMATED_BYTES)
    expect(estimateRhythmMemory(NaN)).toBe(Infinity)
  })
  it('trata falha de decodificação e fecha contexto', async () => {
    const { analyzer, close } = setup(vi.fn(async () => { throw new Error('bad') }))
    await expect(analyzer.analyze('p', asset)).rejects.toMatchObject({ code: 'decode' }); expect(close).toHaveBeenCalledOnce()
  })
  it('rejeita áudio decodificado fora dos limites e arquivo de formato não suportado', async () => {
    const decode = vi.fn(async () => ({ numberOfChannels: 2, sampleRate: 192000, duration: 4, length: 768000 } as unknown as AudioBuffer))
    const { analyzer, close, workers } = setup(decode)
    await expect(analyzer.analyze('p', asset)).rejects.toMatchObject({ code: 'limit' })
    expect(close).toHaveBeenCalledOnce(); expect(workers).toHaveLength(0)
    const unsupported = new File(['audio'], 'audio.ogg', { type: 'audio/ogg' })
    const other = createRhythmAnalyzer({ load: vi.fn(async () => unsupported) })
    await expect(other.analyze('p', asset)).rejects.toMatchObject({ code: 'invalid' })
  })
  it('cancela antes e durante worker, termina e ignora mensagens atrasadas', async () => {
    const { analyzer, workers, close } = setup(); const controller = new AbortController(); controller.abort()
    await expect(analyzer.analyze('p', asset, {}, controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    const pending = analyzer.analyze('p', asset); await untilWorker(workers)
    const listener = workers[0].onmessage!; analyzer.cancel()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    listener({ data: { id: 1, result: { events: [0.5], status: 'detected' } } } as MessageEvent)
    expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
  })
  it('descarta decodificação anterior e permite nova execução', async () => {
    let finish!: (value: AudioBuffer) => void
    const decoded = { numberOfChannels: 1, sampleRate: rate, duration: 4, length: rate * 4, getChannelData: () => pulses([0.5, 1.5]) } as unknown as AudioBuffer
    const decode = vi.fn().mockImplementationOnce(() => new Promise<AudioBuffer>((resolve) => { finish = resolve })).mockResolvedValue(decoded)
    const { analyzer, workers, close } = setup(decode)
    const old = analyzer.analyze('p', asset); for (let i = 0; i < 30 && !finish; i++) await new Promise((r) => setTimeout(r, 0))
    const current = analyzer.analyze('p', asset); await untilWorker(workers); finish(decoded)
    await expect(old).rejects.toMatchObject({ code: 'cancelled' })
    const request = workers[0].postMessage.mock.calls[0][0] as { id: number }
    workers[0].onmessage!({ data: { id: request.id - 1, result: { events: [9], status: 'detected' } } } as MessageEvent)
    workers[0].onmessage!({ data: { id: request.id, result: { events: [0.5, 1.5], status: 'detected' } } } as MessageEvent)
    await expect(current).resolves.toEqual({ events: [0.5, 1.5], status: 'detected' })
    expect(close).toHaveBeenCalledTimes(2); expect(workers[0].terminate).toHaveBeenCalledOnce()
  })
})
