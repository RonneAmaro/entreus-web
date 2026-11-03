import { SUBTITLE_PRESETS, type SubtitleSegment } from '@/lib/video-editor/subtitles'

export const WHISPER_SAMPLE_RATE = 16_000

export type WhisperTranscriptSegment = {
  text: string
  startTime: number
  endTime: number
}

export type PreparedWhisperAudio = {
  pcm: Float32Array
  sampleRate: typeof WHISPER_SAMPLE_RATE
  durationSeconds: number
  peak: number
  rms: number
}

export type WhisperTimelineAudioClip = {
  channels: readonly Float32Array[]
  sourceSampleRate: number
  trimStart: number
  trimEnd: number
  timelineStart: number
}

type PrepareWhisperPcmOptions = {
  maxDurationSeconds?: number
  signal?: AbortSignal
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0

function abortError() {
  return new DOMException('Preparação de áudio cancelada.', 'AbortError')
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

function sampleAt(channels: readonly Float32Array[], position: number) {
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, channels[0].length - 1)
  const fraction = position - lower
  let mixed = 0
  for (const channel of channels) {
    const value = channel[lower] + (channel[upper] - channel[lower]) * fraction
    mixed += Number.isFinite(value) ? value : 0
  }
  return Math.max(-1, Math.min(1, mixed / channels.length))
}

export function prepareWhisperPcm(
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  options: PrepareWhisperPcmOptions = {},
): PreparedWhisperAudio {
  const maxDurationSeconds = options.maxDurationSeconds ?? 120
  if (!Number.isInteger(sourceSampleRate) || sourceSampleRate < 8_000 || sourceSampleRate > 384_000) {
    throw new Error('A taxa de amostragem do áudio é inválida.')
  }
  if (!finitePositive(maxDurationSeconds)) throw new Error('A duração máxima do áudio é inválida.')
  if (!channels.length || channels.length > 32 || !channels[0]?.length) {
    throw new Error('O áudio não contém amostras válidas.')
  }
  const sourceLength = channels[0].length
  if (channels.some((channel) => channel.length !== sourceLength)) {
    throw new Error('Os canais de áudio possuem durações diferentes.')
  }
  const sourceDuration = sourceLength / sourceSampleRate
  if (sourceDuration > maxDurationSeconds) {
    throw new Error(`O áudio excede o limite de ${maxDurationSeconds} segundos.`)
  }

  assertNotAborted(options.signal)
  const outputLength = Math.max(1, Math.round(sourceDuration * WHISPER_SAMPLE_RATE))
  const pcm = new Float32Array(outputLength)
  const sourceStep = sourceSampleRate / WHISPER_SAMPLE_RATE
  let peak = 0
  let squareSum = 0
  for (let index = 0; index < outputLength; index += 1) {
    if ((index & 0x3fff) === 0) assertNotAborted(options.signal)
    const value = sampleAt(channels, Math.min(index * sourceStep, sourceLength - 1))
    pcm[index] = value
    peak = Math.max(peak, Math.abs(value))
    squareSum += value * value
  }
  assertNotAborted(options.signal)
  return {
    pcm,
    sampleRate: WHISPER_SAMPLE_RATE,
    durationSeconds: pcm.length / WHISPER_SAMPLE_RATE,
    peak,
    rms: Math.sqrt(squareSum / pcm.length),
  }
}

function audioMetrics(pcm: Float32Array): Omit<PreparedWhisperAudio, 'pcm' | 'sampleRate' | 'durationSeconds'> {
  let peak = 0
  let squareSum = 0
  for (const value of pcm) {
    peak = Math.max(peak, Math.abs(value))
    squareSum += value * value
  }
  return { peak, rms: pcm.length ? Math.sqrt(squareSum / pcm.length) : 0 }
}

export function composeWhisperTimelinePcm(
  clips: readonly WhisperTimelineAudioClip[],
  timelineDuration: number,
  options: PrepareWhisperPcmOptions = {},
): PreparedWhisperAudio {
  const maxDurationSeconds = options.maxDurationSeconds ?? 120
  if (!finitePositive(timelineDuration) || timelineDuration > maxDurationSeconds) {
    throw new Error(`A timeline precisa ter no máximo ${maxDurationSeconds} segundos para gerar legendas automaticamente.`)
  }
  const pcm = new Float32Array(Math.max(1, Math.round(timelineDuration * WHISPER_SAMPLE_RATE)))
  const weights = new Uint8Array(pcm.length)
  for (const [clipIndex, clip] of clips.entries()) {
    assertNotAborted(options.signal)
    if (!Number.isInteger(clip.sourceSampleRate) || clip.sourceSampleRate < 8_000 || clip.sourceSampleRate > 384_000
      || !clip.channels.length || clip.channels.length > 32 || !clip.channels[0]?.length
      || clip.channels.some((channel) => channel.length !== clip.channels[0].length)) {
      throw new Error(`O trecho de áudio ${clipIndex + 1} não contém amostras válidas.`)
    }
    if (!Number.isFinite(clip.trimStart) || !Number.isFinite(clip.trimEnd) || !Number.isFinite(clip.timelineStart)
      || clip.trimStart < 0 || clip.trimEnd <= clip.trimStart || clip.timelineStart < 0) {
      throw new Error(`O trecho de áudio ${clipIndex + 1} possui tempos inválidos.`)
    }
    const sourceDuration = clip.channels[0].length / clip.sourceSampleRate
    const sourceEndTime = Math.min(clip.trimEnd, sourceDuration)
    if (clip.trimStart >= sourceEndTime) throw new Error(`O trecho de áudio ${clipIndex + 1} está fora da mídia original.`)
    const targetStart = Math.round(clip.timelineStart * WHISPER_SAMPLE_RATE)
    const outputSamples = Math.round((sourceEndTime - clip.trimStart) * WHISPER_SAMPLE_RATE)
    for (let offset = 0, targetIndex = targetStart; offset < outputSamples && targetIndex < pcm.length; offset += 1, targetIndex += 1) {
      if ((targetIndex & 0x3fff) === 0) assertNotAborted(options.signal)
      const sourcePosition = (clip.trimStart + offset / WHISPER_SAMPLE_RATE) * clip.sourceSampleRate
      const value = sampleAt(clip.channels, Math.min(sourcePosition, clip.channels[0].length - 1))
      const weight = weights[targetIndex]
      pcm[targetIndex] = weight === 0
        ? value
        : (pcm[targetIndex] * weight + value) / (weight + 1)
      weights[targetIndex] = Math.min(weight + 1, 255)
    }
  }
  const metrics = audioMetrics(pcm)
  return { pcm, sampleRate: WHISPER_SAMPLE_RATE, durationSeconds: pcm.length / WHISPER_SAMPLE_RATE, ...metrics }
}

export function isWhisperSilence(pcm: Float32Array, startTime = 0, endTime = pcm.length / WHISPER_SAMPLE_RATE) {
  const start = Math.max(0, Math.floor(startTime * WHISPER_SAMPLE_RATE))
  const end = Math.min(pcm.length, Math.ceil(endTime * WHISPER_SAMPLE_RATE))
  if (end <= start) return true
  let peak = 0
  let squareSum = 0
  for (let index = start; index < end; index += 1) {
    const value = Number.isFinite(pcm[index]) ? pcm[index] : 0
    peak = Math.max(peak, Math.abs(value))
    squareSum += value * value
  }
  const rms = Math.sqrt(squareSum / (end - start))
  return peak < 0.0001 && rms < 0.00002
}

export function filterWhisperSegmentsByAudio(segments: readonly WhisperTranscriptSegment[], pcm: Float32Array) {
  const duration = pcm.length / WHISPER_SAMPLE_RATE
  return segments.flatMap((segment) => {
    const startTime = Math.max(0, segment.startTime)
    const endTime = Math.min(duration, segment.endTime)
    if (endTime <= startTime || isWhisperSilence(pcm, startTime, endTime)) return []
    return [{ ...segment, startTime, endTime }]
  })
}

function parseWhisperTime(value: string) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value)
  if (!match) throw new Error(`Timestamp Whisper inválido: ${value}`)
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

export function parseWhisperCppSegments(output: string): WhisperTranscriptSegment[] {
  const pattern = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+([^\r\n]+)/g
  return [...output.matchAll(pattern)].map((match) => ({
    startTime: parseWhisperTime(match[1]),
    endTime: parseWhisperTime(match[2]),
    text: match[3].trim(),
  }))
}

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function whisperSegmentsToSubtitles(
  segments: readonly WhisperTranscriptSegment[],
  projectId: string,
  firstOrder = 0,
): SubtitleSegment[] {
  if (!projectId || projectId.length > 100) throw new Error('O projeto das legendas é inválido.')
  if (!Number.isInteger(firstOrder) || firstOrder < 0) throw new Error('A ordem inicial das legendas é inválida.')

  let previousEnd = 0
  return segments.map((segment, index) => {
    const text = segment.text.trim()
    if (!text || text.length > 2_000 || !Number.isFinite(segment.startTime) || !Number.isFinite(segment.endTime)
      || segment.startTime < 0 || segment.endTime <= segment.startTime || segment.startTime < previousEnd) {
      throw new Error(`Segmento Whisper ${index + 1} inválido.`)
    }
    previousEnd = segment.endTime
    const key = `${projectId}\u0000${index}\u0000${segment.startTime.toFixed(3)}\u0000${segment.endTime.toFixed(3)}\u0000${text}`
    return {
      id: `whisper-${index}-${stableHash(key)}`,
      projectId,
      text,
      startTime: segment.startTime,
      endTime: segment.endTime,
      order: firstOrder + index,
      style: { ...SUBTITLE_PRESETS.classic },
    }
  })
}
