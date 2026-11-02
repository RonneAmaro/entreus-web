import { describe, expect, it } from 'vitest'
import {
  composeWhisperTimelinePcm,
  filterWhisperSegmentsByAudio,
  isWhisperSilence,
  parseWhisperCppSegments,
  prepareWhisperPcm,
  whisperSegmentsToSubtitles,
  WHISPER_SAMPLE_RATE,
} from '@/lib/video-editor/transcription'
import { validSubtitle } from '@/lib/video-editor/subtitles'

describe('preparação de áudio para Whisper', () => {
  it('converte estéreo 48 kHz para PCM mono 16 kHz com métricas válidas', () => {
    const duration = 0.25
    const sourceRate = 48_000
    const length = duration * sourceRate
    const left = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 440 * index / sourceRate) * 0.5)
    const right = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 440 * index / sourceRate) * 0.25)

    const prepared = prepareWhisperPcm([left, right], sourceRate)

    expect(prepared.sampleRate).toBe(WHISPER_SAMPLE_RATE)
    expect(prepared.pcm).toHaveLength(duration * WHISPER_SAMPLE_RATE)
    expect(prepared.durationSeconds).toBeCloseTo(duration, 5)
    expect(prepared.peak).toBeGreaterThan(0.3)
    expect(prepared.peak).toBeLessThanOrEqual(1)
    expect(prepared.rms).toBeGreaterThan(0)
    expect([...prepared.pcm].every(Number.isFinite)).toBe(true)
  })

  it('rejeita áudio vazio, canais incompatíveis, duração excessiva e cancelamento', () => {
    expect(() => prepareWhisperPcm([], 16_000)).toThrow('não contém amostras')
    expect(() => prepareWhisperPcm([new Float32Array(4), new Float32Array(3)], 16_000)).toThrow('durações diferentes')
    expect(() => prepareWhisperPcm([new Float32Array(32_001)], 16_000, { maxDurationSeconds: 2 })).toThrow('excede o limite')
    const controller = new AbortController()
    controller.abort()
    expect(() => prepareWhisperPcm([new Float32Array(16_000)], 16_000, { signal: controller.signal })).toThrowError(DOMException)
  })

  it('compõe trims nos tempos absolutos da timeline e mistura transições sobrepostas', () => {
    const first = new Float32Array(32_000).fill(0.4)
    const second = new Float32Array(32_000).fill(0.8)
    const prepared = composeWhisperTimelinePcm([
      { channels: [first], sourceSampleRate: 16_000, trimStart: 0.5, trimEnd: 1.5, timelineStart: 0 },
      { channels: [second], sourceSampleRate: 16_000, trimStart: 0, trimEnd: 1, timelineStart: 0.5 },
    ], 1.5)
    expect(prepared.pcm[4_000]).toBeCloseTo(0.4)
    expect(prepared.pcm[12_000]).toBeCloseTo(0.6)
    expect(prepared.pcm[20_000]).toBeCloseTo(0.8)
  })

  it('recorta uma fonte longa sem converter a mídia inteira e respeita cancelamento', () => {
    const longSource = new Float32Array(180 * 16_000).fill(0.25)
    const prepared = composeWhisperTimelinePcm([
      { channels: [longSource], sourceSampleRate: 16_000, trimStart: 150, trimEnd: 151, timelineStart: 0 },
    ], 1, { maxDurationSeconds: 2 })
    expect(prepared.pcm).toHaveLength(16_000)
    expect(prepared.pcm[8_000]).toBeCloseTo(0.25)

    const controller = new AbortController()
    controller.abort()
    expect(() => composeWhisperTimelinePcm([
      { channels: [longSource], sourceSampleRate: 16_000, trimStart: 150, trimEnd: 151, timelineStart: 0 },
    ], 1, { signal: controller.signal })).toThrowError(DOMException)
  })

  it('trata silêncio por energia, preserva pausas e fala de baixo volume sem filtrar por texto', () => {
    const silence = new Float32Array(32_000)
    expect(isWhisperSilence(silence)).toBe(true)
    const quietSpeech = new Float32Array(32_000)
    for (let index = 8_000; index < 24_000; index += 1) quietSpeech[index] = Math.sin(index / 8) * 0.0002
    expect(isWhisperSilence(quietSpeech)).toBe(false)
    const segments = [
      { startTime: 0, endTime: 0.4, text: '[MÚSICA]' },
      { startTime: 0.5, endTime: 1.5, text: 'fala baixa' },
      { startTime: 1.6, endTime: 3, text: 'além do áudio' },
    ]
    expect(filterWhisperSegmentsByAudio(segments, quietSpeech)).toEqual([
      { startTime: 0.5, endTime: 1.5, text: 'fala baixa' },
    ])
  })
})

describe('adaptação da saída do whisper.cpp', () => {
  const output = `
[00:00:00.000 --> 00:00:06.760]   Olá, este é um teste.
[00:00:07.260 --> 00:00:14.880]   Hoje é um bom dia.
whisper_print_timings: total time = 1000.00 ms
`

  it('preserva timestamps por segmento e produz legendas persistíveis com IDs estáveis', () => {
    const parsed = parseWhisperCppSegments(output)
    expect(parsed).toEqual([
      { startTime: 0, endTime: 6.76, text: 'Olá, este é um teste.' },
      { startTime: 7.26, endTime: 14.88, text: 'Hoje é um bom dia.' },
    ])

    const first = whisperSegmentsToSubtitles(parsed, 'projeto-poc', 10)
    const second = whisperSegmentsToSubtitles(parsed, 'projeto-poc', 10)
    expect(first).toEqual(second)
    expect(first.map((segment) => segment.order)).toEqual([10, 11])
    expect(first.every(validSubtitle)).toBe(true)
    expect(first.every((segment) => segment.words === undefined)).toBe(true)
  })

  it('rejeita segmentos vazios, sobrepostos ou com tempos inválidos', () => {
    expect(() => whisperSegmentsToSubtitles([{ startTime: 0, endTime: 1, text: ' ' }], 'p')).toThrow('Segmento Whisper 1')
    expect(() => whisperSegmentsToSubtitles([
      { startTime: 0, endTime: 2, text: 'primeiro' },
      { startTime: 1, endTime: 3, text: 'sobreposto' },
    ], 'p')).toThrow('Segmento Whisper 2')
  })
})
