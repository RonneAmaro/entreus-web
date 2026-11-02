import type { ProjectMedia } from './project-persistence'
import { MAX_MUSIC_BYTES } from './music-storage'
import { musicGainAt, type MusicTiming } from './music-audio'

export const MAX_AUDIO_CLIPS = 16
// Additional clips coexist with the legacy music slot; neither is rendered twice.
export type SavedAudioClip = {
  id: string
  assetId: string
  media: ProjectMedia
  sourceDuration: number
  startTime: number
  trimStart: number
  trimEnd: number
  volume: number
  muted: boolean
  fadeIn?: number
  fadeOut?: number
}
export type LocalAudioClip = SavedAudioClip & { file: File | null }

// Overlapping linear ramps multiply, matching consecutive FFmpeg afade filters.
export function audioClipTiming(clip: SavedAudioClip, projectDuration: number): MusicTiming {
  const length = Math.max(0, Math.min(clip.trimEnd - clip.trimStart, projectDuration - clip.startTime))
  const fade = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(length, Math.max(0, value)) : 0
  return { startTime: clip.startTime, trimStart: clip.trimStart, trimEnd: clip.trimStart + length,
    volume: audioClipGain(clip), fadeIn: fade(clip.fadeIn), fadeOut: fade(clip.fadeOut) }
}

export function normalizeAudioClipFades<T extends SavedAudioClip>(clip: T, projectDuration = Infinity): T {
  const timing = audioClipTiming(clip, projectDuration)
  return { ...clip, ...(clip.fadeIn !== undefined ? { fadeIn: timing.fadeIn } : {}), ...(clip.fadeOut !== undefined ? { fadeOut: timing.fadeOut } : {}) }
}

export function audioClipGainAt(time: number, clip: SavedAudioClip, projectDuration: number): number {
  return musicGainAt(time, audioClipTiming(clip, projectDuration))
}

export function validAudioClip(value: unknown): value is SavedAudioClip {
  if (!value || typeof value !== 'object') return false
  const clip = value as SavedAudioClip
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  return typeof clip.id === 'string' && clip.id.startsWith('audio-') && clip.id !== 'audio-track' && clip.id.length <= 128
    && typeof clip.assetId === 'string' && clip.assetId.length > 0 && clip.assetId.length <= 128
    && !!clip.media && clip.media.id === clip.id && typeof clip.media.name === 'string' && clip.media.name.length > 0 && clip.media.name.length <= 10000
    && typeof clip.media.type === 'string' && clip.media.type.startsWith('audio/')
    && finite(clip.media.size) && clip.media.size > 0 && clip.media.size <= MAX_MUSIC_BYTES
    && finite(clip.media.lastModified) && clip.media.lastModified >= 0
    && finite(clip.sourceDuration) && clip.sourceDuration > 0 && clip.sourceDuration <= 600
    && finite(clip.startTime) && clip.startTime >= 0
    && finite(clip.trimStart) && clip.trimStart >= 0 && finite(clip.trimEnd) && clip.trimEnd > clip.trimStart && clip.trimEnd <= clip.sourceDuration
    && finite(clip.volume) && clip.volume >= 0 && clip.volume <= 1 && typeof clip.muted === 'boolean'
}

export function audioClipGain(clip: Pick<SavedAudioClip, 'volume' | 'muted'>): number {
  return clip.muted ? 0 : clip.volume
}

export function audioClipSourceTime(time: number, clip: SavedAudioClip, projectDuration: number): number | null {
  const elapsed = time - clip.startTime
  return time < projectDuration && elapsed >= 0 && elapsed < clip.trimEnd - clip.trimStart ? clip.trimStart + elapsed : null
}

export async function decodeAudioClip(file: File): Promise<number> {
  if (!/\.(mp3|wav)$/i.test(file.name) || !file.type.startsWith('audio/')) throw new Error('Use um arquivo MP3 ou WAV.')
  if (!file.size || file.size > MAX_MUSIC_BYTES) throw new Error('Use um áudio de até 25 MB.')
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    if (!decoded.numberOfChannels || !Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 600) throw new Error('Duração de áudio inválida (máximo de 10 minutos).')
    return decoded.duration
  } catch {
    throw new Error('Áudio inválido ou não suportado (máximo de 10 minutos).')
  } finally { await context.close() }
}
