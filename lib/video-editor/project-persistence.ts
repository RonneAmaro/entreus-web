import type { VideoAspectPreset, VideoFrameMode, VideoSize } from './video-format'
import type { JunctionTransitions } from './timeline'
import { validColorAdjustments, type ColorAdjustments } from './color-adjustments'
import { normalizeSubtitleSegment, validSubtitle, type SubtitleSegment } from './subtitles'
import { MAX_AUDIO_CLIPS, validAudioClip, normalizeAudioClipFades, type SavedAudioClip } from './audio-clips'
import { MAX_LIBRARY_ASSETS, validLibraryAsset, type SavedLibraryAsset } from './audio-library'
import { validPhotoAssetId } from './photo-storage'
import { validVideoAssetId } from './video-storage'

export const STUDIO_PROJECT_VERSION = 1
export const STUDIO_PROJECT_PREFIX = 'entreus-studio-project-v1:'
const MAX_DOCUMENT_BYTES = 1_000_000

export type ProjectMedia = {
  id: string
  assetId?: string
  name: string
  type: string
  size: number
  lastModified: number
  duration?: number
  width?: number
  height?: number
}

export type SavedProject = {
  version: 1
  id: string
  createdAt: number
  updatedAt: number
  name: string
  editorMode: 'video' | 'photos'
  canvasSize: { width: number; height: number }
  aspectPreset?: VideoAspectPreset
  frameMode?: VideoFrameMode
  originalCanvasSize?: VideoSize
  baseVideo: ProjectMedia | null
  baseVideoDuration: number
  baseTrim: { trimStart: number; trimEnd: number }
  extraVideos: Array<{ id: string; media: ProjectMedia; sourceDuration: number; trimStart: number; trimEnd: number }>
  photoSlides: Array<{ id: string; media: ProjectMedia; duration: number; order: number; assetId?: string }>
  imageOverlays: Array<{ id: string; media: ProjectMedia; name: string; x: number; y: number; width: number; height: number; rotation: number; startTime: number; endTime: number }>
  videoOverlays: Array<{ id: string; media: ProjectMedia; name: string; x: number; y: number; width: number; height: number; rotation: number; sourceDuration: number; trimStart: number; trimEnd: number; startTime: number; endTime: number }>
  texts: Array<{ id: string; text: string; x: number; y: number; fontSize: number; width?: number; height?: number; color: string; startTime: number; endTime: number; rotation?: number; fontKey?: string; fontWeight?: number; backgroundEnabled?: boolean; backgroundColor?: string; backgroundOpacity?: number; backgroundRadius?: number; textAlign?: CanvasTextAlign }>
  stickers: Array<{ id: string; value: string; assetId?: string; customAssetId?: string; frames?: string[]; frameRate?: number; opacity?: number; x: number; y: number; size: number; rotation: number; startTime: number; endTime: number; layerOrder: number }>
  visualLayerOrder?: string[]
  sequenceOrder: string[]
  excludedClipIds: string[]
  clipTransitions: Record<string, 'none' | 'fade' | 'dissolve' | 'slide'>
  junctionTransitions?: JunctionTransitions
  photoTransition: 'none' | 'fade'
  filter: 'normal' | 'mono' | 'sepia' | 'warm'
  colorAdjustments?: Record<string, ColorAdjustments>
  videoVolume: number
  music: { media: ProjectMedia | null; name: string; selectedMusicId: string | null; duration: number; startTime: number; trimStart: number; trimEnd: number; volume: number; volumeTouched: boolean; assetId?: string; fadeIn?: number; fadeOut?: number; previousVolume?: number }
  audioClips?: SavedAudioClip[]
  audioLibrary?: SavedLibraryAsset[]
  voice: { media: ProjectMedia | null; duration: number; startTime: number; volume: number }
  caption: string
  subtitles?: SubtitleSegment[]
  currentTime: number
}

export type ReadProjectResult = { project: SavedProject | null; error?: string }

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function text(value: unknown): value is string { return typeof value === 'string' && value.length <= 10_000 }
function timing(value: Record<string, unknown>) { return finite(value.startTime) && finite(value.endTime) && value.startTime >= 0 && value.endTime > value.startTime }
function media(value: unknown): value is ProjectMedia {
  return object(value) && text(value.id) && value.id.length > 0 && text(value.name) && value.name.length > 0 && text(value.type)
    && (value.assetId === undefined || typeof value.assetId === 'string' && validVideoAssetId(value.assetId))
    && finite(value.size) && value.size > 0 && finite(value.lastModified) && value.lastModified >= 0
    && (value.duration === undefined || finite(value.duration)) && (value.width === undefined || finite(value.width)) && (value.height === undefined || finite(value.height))
}
function mediaLayer(value: unknown): value is SavedProject['imageOverlays'][number] {
  return object(value) && text(value.id) && media(value.media) && value.media.id === value.id && text(value.name) && timing(value)
    && finite(value.x) && finite(value.y) && finite(value.width) && value.width > 0 && finite(value.height) && value.height > 0 && finite(value.rotation)
}
function videoLayer(value: unknown): value is SavedProject['videoOverlays'][number] {
  if (!mediaLayer(value)) return false
  const layer = value as unknown as Record<string, unknown>
  return finite(layer.sourceDuration) && layer.sourceDuration > 0 && finite(layer.trimStart)
    && finite(layer.trimEnd) && layer.trimStart >= 0 && layer.trimEnd > layer.trimStart && layer.trimEnd <= layer.sourceDuration + 0.1
}
function clip(value: unknown): value is SavedProject['extraVideos'][number] {
  return object(value) && text(value.id) && media(value.media) && value.media.id === value.id && finite(value.sourceDuration) && value.sourceDuration > 0
    && finite(value.trimStart) && finite(value.trimEnd) && value.trimStart >= 0 && value.trimEnd > value.trimStart && value.trimEnd <= value.sourceDuration + 0.1
}
function slide(value: unknown): value is SavedProject['photoSlides'][number] {
  return object(value) && text(value.id) && media(value.media) && value.media.id === value.id && finite(value.duration) && value.duration > 0 && finite(value.order)
    && (value.assetId === undefined || typeof value.assetId === 'string' && validPhotoAssetId(value.assetId))
}
function textLayer(value: unknown): value is SavedProject['texts'][number] {
  return object(value) && text(value.id) && text(value.text) && text(value.color) && timing(value)
    && finite(value.x) && finite(value.y) && finite(value.fontSize) && value.fontSize > 0
    && (value.width === undefined || finite(value.width) && value.width > 0)
    && (value.height === undefined || finite(value.height) && value.height > 0)
    && (value.rotation === undefined || finite(value.rotation))
}
function sticker(value: unknown): value is SavedProject['stickers'][number] {
  return object(value) && text(value.id) && text(value.value) && timing(value) && finite(value.x) && finite(value.y)
    && finite(value.size) && value.size > 0 && finite(value.rotation) && finite(value.layerOrder)
    && (value.assetId === undefined || text(value.assetId))
    && (value.customAssetId === undefined || text(value.customAssetId) && value.customAssetId.length > 0)
    && (value.frames === undefined || list(value.frames, (frame) => text(frame) && frame.length > 0, 12) && value.frames.length > 0)
    && (value.frameRate === undefined || finite(value.frameRate) && value.frameRate >= 1 && value.frameRate <= 12)
    && (value.opacity === undefined || finite(value.opacity) && value.opacity >= 0.1 && value.opacity <= 1)
}
function music(value: unknown): value is SavedProject['music'] {
  return object(value) && (value.media === null || media(value.media) && value.media.id === 'audio-track') && text(value.name)
    && (value.selectedMusicId === null || text(value.selectedMusicId)) && finite(value.duration)
    && finite(value.startTime) && finite(value.trimStart) && finite(value.trimEnd) && finite(value.volume)
    && typeof value.volumeTouched === 'boolean'
    && (value.previousVolume === undefined || finite(value.previousVolume) && value.previousVolume >= 0 && value.previousVolume <= 1)
    && (value.assetId === undefined || text(value.assetId) && value.assetId.length > 0)
    && (value.fadeIn === undefined || finite(value.fadeIn) && value.fadeIn >= 0 && value.fadeIn <= 60)
    && (value.fadeOut === undefined || finite(value.fadeOut) && value.fadeOut >= 0 && value.fadeOut <= 60)
}
function voice(value: unknown): value is SavedProject['voice'] {
  return object(value) && (value.media === null || media(value.media) && value.media.id === 'voice-track') && finite(value.duration)
    && finite(value.startTime) && finite(value.volume)
}
function list(value: unknown, predicate: (item: unknown) => boolean, max = 100): value is unknown[] {
  return Array.isArray(value) && value.length <= max && value.every(predicate)
}

export function parseSavedProject(raw: string): SavedProject {
  if (raw.length > MAX_DOCUMENT_BYTES) throw new Error('O projeto salvo excede o tamanho permitido.')
  const value: unknown = JSON.parse(raw)
  if (!object(value)) throw new Error('Documento de projeto inválido.')
  if (Array.isArray(value.subtitles)) {
    value.subtitles = value.subtitles.map((item) => object(item) && object(item.style)
      ? normalizeSubtitleSegment(item as unknown as SubtitleSegment)
      : item)
  }
  if (value.version !== STUDIO_PROJECT_VERSION) throw new Error('Versão do projeto incompatível; os dados foram preservados.')
  if (!text(value.id) || !value.id || !finite(value.createdAt) || !finite(value.updatedAt) || !text(value.name)
    || (value.editorMode !== 'video' && value.editorMode !== 'photos') || !object(value.canvasSize)
    || !finite(value.canvasSize.width) || value.canvasSize.width <= 0 || !finite(value.canvasSize.height) || value.canvasSize.height <= 0
    || (value.aspectPreset !== undefined && !['original', '16:9', '9:16', '1:1', '4:3'].includes(String(value.aspectPreset)))
    || (value.frameMode !== undefined && value.frameMode !== 'fit' && value.frameMode !== 'fill')
    || (value.originalCanvasSize !== undefined && (!object(value.originalCanvasSize)
      || !finite(value.originalCanvasSize.width) || value.originalCanvasSize.width <= 0
      || !finite(value.originalCanvasSize.height) || value.originalCanvasSize.height <= 0))
    || (value.baseVideo !== null && (!media(value.baseVideo) || value.baseVideo.id !== 'base-video')) || !finite(value.baseVideoDuration)
    || !object(value.baseTrim) || !finite(value.baseTrim.trimStart) || !finite(value.baseTrim.trimEnd)
    || !list(value.extraVideos, clip) || !list(value.photoSlides, slide)
    || !list(value.imageOverlays, mediaLayer) || !list(value.videoOverlays ?? [], videoLayer)
    || !list(value.texts, textLayer) || !list(value.stickers, sticker)
    || (value.visualLayerOrder !== undefined && (!list(value.visualLayerOrder, text, 400) || new Set(value.visualLayerOrder).size !== value.visualLayerOrder.length))
    || !list(value.sequenceOrder, text) || !list(value.excludedClipIds, text)
    || !object(value.clipTransitions) || !Object.values(value.clipTransitions).every((item) => ['none', 'fade', 'dissolve', 'slide'].includes(String(item)))
    || (value.junctionTransitions !== undefined && (!object(value.junctionTransitions) || !Object.values(value.junctionTransitions).every((item) => object(item)
      && text(item.fromId) && ['dissolve', 'dip-black'].includes(String(item.type))
      && finite(item.duration) && item.duration > 0 && item.duration <= 2)))
    || (value.photoTransition !== 'none' && value.photoTransition !== 'fade')
    || !['normal', 'mono', 'sepia', 'warm'].includes(String(value.filter))
    || (value.colorAdjustments !== undefined && (!object(value.colorAdjustments) || Object.keys(value.colorAdjustments).length > 200
      || !Object.entries(value.colorAdjustments).every(([id, adjustments]) => id.length > 0 && id.length <= 100 && validColorAdjustments(adjustments))))
    || !finite(value.videoVolume)
    || (value.audioClips !== undefined && (!list(value.audioClips, validAudioClip, MAX_AUDIO_CLIPS)
      || new Set((value.audioClips as SavedAudioClip[]).map((clip) => clip.id)).size !== value.audioClips.length))
    || (value.audioLibrary !== undefined && (!list(value.audioLibrary, validLibraryAsset, MAX_LIBRARY_ASSETS)
      || new Set((value.audioLibrary as SavedLibraryAsset[]).map((asset) => `${asset.category}:${asset.assetId}`)).size !== value.audioLibrary.length))
    || !music(value.music) || !voice(value.voice ?? { media: null, duration: 0, startTime: 0, volume: 1 })
    || !text(value.caption) || !finite(value.currentTime)
    || (value.subtitles !== undefined && (!list(value.subtitles, validSubtitle, 1000)
      || value.subtitles.some((item: unknown) => !validSubtitle(item) || item.projectId !== value.id)))) throw new Error('O projeto salvo contém dados inválidos; os dados foram preservados.')
  return { ...(value as SavedProject), ...(value.audioClips ? { audioClips: (value.audioClips as SavedAudioClip[]).map((clip) => normalizeAudioClipFades(clip)) } : {}), junctionTransitions: (value.junctionTransitions ?? {}) as JunctionTransitions,
    aspectPreset: (value.aspectPreset ?? 'original') as VideoAspectPreset,
    frameMode: (value.frameMode ?? 'fit') as VideoFrameMode,
    originalCanvasSize: (value.originalCanvasSize ?? value.canvasSize) as VideoSize,
    videoOverlays: (value.videoOverlays ?? []) as SavedProject['videoOverlays'],
    stickers: (value.stickers as SavedProject['stickers']).map((item) => ({ ...item, opacity: item.opacity ?? 1 })),
    voice: (value.voice ?? { media: null, duration: 0, startTime: 0, volume: 1 }) as SavedProject['voice'] }
}

export function projectStorageKey(owner: string) {
  if (!owner || !/^(guest|user:[0-9a-f-]{36})$/i.test(owner)) throw new Error('Identificador de proprietário inválido.')
  return `${STUDIO_PROJECT_PREFIX}${owner}`
}

export function newProjectIdentity() {
  return { id: crypto.randomUUID(), createdAt: Date.now() }
}

export function describeFile(id: string, file: File, details?: Pick<ProjectMedia, 'duration' | 'width' | 'height'>): ProjectMedia {
  return { id, name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, ...details }
}

export function matchesProjectMedia(expected: ProjectMedia, actual: File, observed?: Pick<ProjectMedia, 'duration' | 'width' | 'height'>): boolean {
  if (expected.name !== actual.name || expected.size !== actual.size || (expected.type && actual.type && expected.type !== actual.type)) return false
  if (expected.duration !== undefined && observed?.duration !== undefined && Math.abs(expected.duration - observed.duration) > 0.25) return false
  if (expected.width !== undefined && observed?.width !== undefined && expected.width !== observed.width) return false
  if (expected.height !== undefined && observed?.height !== undefined && expected.height !== observed.height) return false
  return true
}

export class ProjectAutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: SavedProject | null = null
  private lastContent = ''
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private key: string, private status: (status: 'pending' | 'saving' | 'saved' | 'error') => void, private delay = 700) {}
  load(): ReadProjectResult {
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return { project: null }
      const project = parseSavedProject(raw)
      this.lastContent = JSON.stringify({ ...project, updatedAt: 0 })
      return { project }
    } catch (error) {
      return { project: null, error: error instanceof Error ? error.message : 'Não foi possível ler o projeto salvo.' }
    }
  }
  schedule(project: SavedProject) {
    const content = JSON.stringify({ ...project, updatedAt: 0 })
    if (content === this.lastContent) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.pending = null
      this.status('saved')
      return
    }
    this.pending = project
    if (this.timer) clearTimeout(this.timer)
    this.status('pending')
    this.timer = setTimeout(() => this.flush(), this.delay)
  }
  flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.pending) return true
    const project = this.pending
    const content = JSON.stringify({ ...project, updatedAt: 0 })
    this.status('saving')
    try {
      const serialized = JSON.stringify({ ...project, updatedAt: Date.now() })
      if (serialized.length > MAX_DOCUMENT_BYTES) throw new Error('Projeto grande demais para salvar neste navegador.')
      this.storage.setItem(this.key, serialized)
      this.pending = null
      this.lastContent = content
      this.status('saved')
      return true
    } catch {
      this.status('error')
      return false
    }
  }
  dispose() { this.flush() }
}
