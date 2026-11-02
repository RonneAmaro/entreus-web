'use client'

import NextImage from 'next/image'
import { CSSProperties, ChangeEvent, KeyboardEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FFmpeg, type LogEventCallback, type ProgressEventCallback } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { FfmpegLoadTimeoutError, loadFfmpegWithTimeout, releaseFfmpegLoadAssets } from '@/lib/media/ffmpeg-load'
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  Eye,
  EyeOff,
  Check,
  ImageIcon,
  Info,
  Loader2,
  Mic,
  Move,
  Music,
  Pause,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  Redo2,
  Rocket,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import EditorToolDock, { EditorTool } from './video-editor/EditorToolDock'
import MusicLibrary from './video-editor/MusicLibrary'
import AudioClipControls from './video-editor/AudioClipControls'
import AudioClipPreview from './video-editor/AudioClipPreview'
import LocalAudioLibrary from './video-editor/LocalAudioLibrary'
import AutoReelsPanel from './video-editor/AutoReelsPanel'
import { autoReelsMusic, generateAutoReels, type AutoReelsMedia, type AutoReelsProposal } from '@/lib/video-editor/auto-reels'
import { createAutoReelsRhythmSession } from '@/lib/video-editor/auto-reels-rhythm-session'
import { MAX_LIBRARY_ASSETS, storeLibraryAsset, verifyLibraryFile, type AudioCategory, type LocalLibraryAsset } from '@/lib/video-editor/audio-library'
import { audioClipGain, audioClipTiming, normalizeAudioClipFades, decodeAudioClip, MAX_AUDIO_CLIPS, type LocalAudioClip } from '@/lib/video-editor/audio-clips'
import VideoFilmstrip from './video-editor/VideoFilmstrip'
import AutomaticSubtitlesPanel from './video-editor/AutomaticSubtitlesPanel'
import { EditorMusicTrack } from '@/lib/editor-music'
import { clipAtTime, moveClip, musicSourceTime, positionClipsWithTransitions, transitionDuration, trimVideo, validJunctionTransitions, type ClipTransition, type JunctionTransitions, type PositionedClip, type SequenceClip } from '@/lib/video-editor/timeline'
import { buildMediaSequenceGraph, type RenderClip } from '@/lib/video-editor/render-plan'
import { musicAudioFilter, musicGainAt, safeMixScale } from '@/lib/video-editor/music-audio'
import { loadMusicAsset, saveMusicAsset, MAX_MUSIC_BYTES } from '@/lib/video-editor/music-storage'
import { loadPhotoAsset, photoAssetId, storePhotoAsset } from '@/lib/video-editor/photo-storage'
import { loadVideoAsset, storeVideoAsset, videoAssetId } from '@/lib/video-editor/video-storage'
import { colorCss, colorFfmpeg, DEFAULT_COLOR_ADJUSTMENTS, type ColorAdjustments } from '@/lib/video-editor/color-adjustments'
import { fitMediaFilter, projectCanvasSize, reframeBounds, reframePoint, reframeScale, VIDEO_ASPECT_PRESETS, type VideoAspectPreset, type VideoFrameMode } from '@/lib/video-editor/video-format'
import { imageCenter, imageCornerPoint, imageLocalPoint, imageWorldPoint, normalizeImageAngle, pointInRotatedImage, resizeRotatedImageFromCorner, rotatedImageAngle, rotatedImageSize, type CanvasPoint, type ImageBounds, type ImageCorner } from '@/lib/video-editor/overlay-geometry'
import { resizedTextBox, wrapTextLines } from '@/lib/video-editor/text-geometry'
import { retimeVideoOverlay, videoOverlaySourceTime } from '@/lib/video-editor/video-overlay'
import type { VideoOverlayTiming } from '@/lib/video-editor/video-overlay'
import { mp4DownloadName } from '@/lib/video-editor/project-name'
import { ProjectAutoSave, describeFile, matchesProjectMedia, newProjectIdentity, projectStorageKey, type ProjectMedia, type SavedProject } from '@/lib/video-editor/project-persistence'
import { activeSubtitles, createSubtitle, parseSubtitleFile, resolveSubtitleStyle, subtitleAnimationState, SUBTITLE_ANIMATIONS, SUBTITLE_PRESETS, type SubtitleAnimation, type SubtitlePreset, type SubtitleSegment, type SubtitleStyle } from '@/lib/video-editor/subtitles'
import { composeWhisperTimelinePcm, type PreparedWhisperAudio, type WhisperTimelineAudioClip } from '@/lib/video-editor/transcription'
import { WHISPER_MAX_DURATION_SECONDS } from '@/lib/video-editor/whisper-runtime'
import { alignmentGuides, moveVisualLayer, orderVisualLayers, snapLayerTime, type VisualLayer, type VisualLayerType } from '@/lib/video-editor/visual-layers'
import { nextVisibleLayerId, nudgeCanvasPosition, resolveEditorShortcut, seekByKeyboard } from '@/lib/video-editor/editor-shortcuts'
import { STICKER_CATEGORIES, STICKER_LIBRARY, stickerFrameAt, stickerFrameEnableExpression, stickerFrames, stickerIsAnimated, type StickerAsset } from '@/lib/video-editor/stickers'
import { loadStickerAsset, saveStickerAsset, stickerFileKind, MAX_STICKER_BYTES, MAX_STICKER_DIMENSION } from '@/lib/video-editor/sticker-storage'
import { supabase, getBrowserUser } from '@/lib/supabase'
import {
  clearLocalVideoDraft,
  isSupportedLocalVideoDraftSource,
  loadLocalVideoDraft,
} from '@/lib/local-video-drafts'

type VideoFilter = 'normal' | 'mono' | 'sepia' | 'warm'

type TextOverlay = {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  width?: number
  height?: number
  color: string
  fontKey?: TextFontKey
  fontWeight?: number
  backgroundEnabled?: boolean
  backgroundColor?: string
  backgroundOpacity?: number
  backgroundRadius?: number
  textAlign?: CanvasTextAlign
  rotation?: number
  startTime: number
  endTime: number
}

type ImageOverlay = {
  id: string
  file: File
  url: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  startTime: number
  endTime: number
}

type VideoOverlay = ImageOverlay & {
  sourceDuration: number
  trimStart: number
  trimEnd: number
}

type StickerOverlay = {
  id: string
  value: string
  assetId?: string
  customAssetId?: string
  frames?: string[]
  frameRate?: number
  opacity?: number
  x: number
  y: number
  size: number
  rotation: number
  startTime: number
  endTime: number
  layerOrder: number
}

type CanvasSize = {
  width: number
  height: number
}

const IMAGE_CORNERS: ImageCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

type EditorMode = 'video' | 'photos'
type EditorPanel = 'add' | 'text' | 'sticker' | 'image' | 'audio' | 'effects' | 'transitions' | 'caption' | 'voice' | 'magic' | 'adjust'
type DraggingLayer = { type: 'sticker' | 'image' | 'video'; id: string } | null
type ImageResizeState = { type: 'image' | 'video'; id: string; pointerId: number; corner: ImageCorner; start: CanvasPoint; initial: ImageBounds & { rotation: number }; canvas: CanvasSize }
type ImageRotateState = { type: 'image' | 'video'; id: string; pointerId: number; start: CanvasPoint; initial: ImageBounds & { rotation: number } }
type TextGestureState = { id: string; pointerId: number; mode: 'drag' | 'resize' | 'rotate'; start: CanvasPoint; initial: TextOverlay; bounds: ImageBounds & { rotation: number } }
type StickerGestureState = { id: string; pointerId: number; mode: 'resize' | 'rotate'; start: CanvasPoint; initial: StickerOverlay; bounds: ImageBounds & { rotation: number } }
type TimelineEditableLayer = 'text' | 'sticker' | 'image' | 'video' | 'subtitle'
type TimelineDragMode = 'move' | 'trim-start' | 'trim-end'
type TimelineDragState = {
  type: TimelineEditableLayer
  id: string
  mode: TimelineDragMode
  pointerId: number
  trackLeft: number
  startClientX: number
  initialStartTime: number
  initialEndTime: number
}
type TimelineDragPreview = {
  type: TimelineEditableLayer
  id: string
  mode: TimelineDragMode
  startTime: number
  endTime: number
} | null
type PhotoTransition = 'none' | 'fade'
type CompressionPreset = 'auto' | 'light' | 'high'
type WorkspaceLayout = {
  libraryWidth: number
  propertiesWidth: number
  timelineHeight: number
  timelineCustomized: boolean
  libraryOpen: boolean
  previewOpen: boolean
  propertiesOpen: boolean
  timelineOpen: boolean
}
type WorkspaceDivider = 'library' | 'properties' | 'timeline'
const WORKSPACE_LAYOUT_KEY = 'entreus-studio-workspace-v1'
const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  libraryWidth: 440,
  propertiesWidth: 300,
  timelineHeight: 220,
  timelineCustomized: false,
  libraryOpen: true,
  previewOpen: true,
  propertiesOpen: true,
  timelineOpen: true,
}
type TextFontKey = 'system' | 'strong' | 'elegant' | 'condensed' | 'casual' | 'mono' | 'classic' | 'rounded'

type PhotoSlide = {
  id: string
  assetId?: string
  file: File
  previewUrl: string
  duration: number
  order: number
}

type ExtraVideoClip = {
  id: string
  file: File
  previewUrl: string
  sourceDuration: number
  trimStart: number
  trimEnd: number
}
type MediaImportEntry = {
  id: string
  name: string
  status: 'loading' | 'ready' | 'unsupported' | 'error'
  detail?: string
}

type CompressionProfile = {
  label: string
  maxWidth: number
  maxHeight: number
  videoBitrate: string
  audioBitrate: string
  description: string
}

type CompressionStats = {
  originalBytes: number
  optimizedBytes: number
  profile: string
  usedOptimizedFile: boolean
}

type VideoEditorMode = 'publish' | 'download'

type VideoEditorProps = {
  mode?: VideoEditorMode
}

type RenderImageInput = {
  inputName: string
  overlay: ImageOverlay | VideoOverlay
  inputIndex: number
  kind?: 'image' | 'text' | 'video' | 'subtitle' | 'sticker'
  subtitleRender?: { segment: SubtitleSegment; role: 'base' | 'highlight' }
  stickerRender?: { stickerId: string; frameIndex: number; frameCount: number }
}

type VisualSnapshot = {
  overlays: TextOverlay[]
  stickers: StickerOverlay[]
  imageTransforms: (ImageBounds & { id: string; rotation: number })[]
  videoTransforms: (ImageBounds & VideoOverlayTiming & { id: string; rotation: number })[]
  visualLayerOrder: string[]
  filter: VideoFilter
  colorAdjustments: Record<string, ColorAdjustments>
  videoVolume: number
  musicVolume: number
}

const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 42
const DEFAULT_TEXT_FONT_KEY: TextFontKey = 'system'
const DEFAULT_TEXT_BACKGROUND_COLOR = '#000000'
const DEFAULT_TEXT_BACKGROUND_OPACITY = 0.55
const DEFAULT_VIDEO_DURATION = 10
const MIN_TIMELINE_ITEM_DURATION = 0.5
const HEAVY_VIDEO_SIZE_BYTES = 30 * 1024 * 1024
const MAX_VIDEO_OVERLAYS = 3
const MAX_IMAGE_OVERLAY_SIZE_BYTES = 5 * 1024 * 1024
const MAX_PHOTO_SLIDE_SIZE_BYTES = 8 * 1024 * 1024
const MAX_PHOTO_SLIDES = 10
const DEFAULT_PHOTO_DURATION = 3
const PHOTO_VIDEO_WIDTH = 720
const PHOTO_VIDEO_HEIGHT = 1280
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const RENDERABLE_IMAGE_TYPES = ['image/png', 'image/jpeg']
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
const LAYER_ORDER = {
  video: 10,
  image: 20,
  sticker: 30,
  text: 40,
}
const TEXT_FONT_OPTIONS: { key: TextFontKey; label: string; family: string; weight: number }[] = [
  { key: 'system', label: 'Padrao', family: 'Inter, ui-sans-serif, system-ui, sans-serif', weight: 800 },
  { key: 'strong', label: 'Forte', family: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif', weight: 800 },
  { key: 'elegant', label: 'Elegante', family: 'Georgia, Times New Roman, serif', weight: 700 },
  { key: 'condensed', label: 'Condensada', family: 'Arial Narrow, Arial, sans-serif', weight: 800 },
  { key: 'casual', label: 'Manuscrita', family: 'Comic Sans MS, Trebuchet MS, cursive', weight: 700 },
  { key: 'mono', label: 'Mono', family: 'Courier New, ui-monospace, monospace', weight: 800 },
  { key: 'classic', label: 'Classica', family: 'Times New Roman, Georgia, serif', weight: 700 },
  { key: 'rounded', label: 'Arredondada', family: 'Verdana, Geneva, sans-serif', weight: 800 },
]

const TEXT_COLOR_PRESETS = ['#ffffff', '#111827', '#facc15', '#38bdf8', '#ef4444', '#22c55e', '#a855f7']

const TEXT_BACKGROUND_PRESETS = [
  { label: 'Sem fundo', enabled: false, color: DEFAULT_TEXT_BACKGROUND_COLOR, opacity: DEFAULT_TEXT_BACKGROUND_OPACITY },
  { label: 'Preto', enabled: true, color: '#000000', opacity: 0.55 },
  { label: 'Branco', enabled: true, color: '#ffffff', opacity: 0.5 },
  { label: 'Azul', enabled: true, color: '#0284c7', opacity: 0.55 },
]

const COMPRESSION_PROFILES: Record<CompressionPreset, CompressionProfile> = {
  auto: {
    label: 'Automatica',
    maxWidth: 1280,
    maxHeight: 1280,
    videoBitrate: '1500k',
    audioBitrate: '128k',
    description: 'Recomendada para o feed',
  },
  light: {
    label: 'Leve',
    maxWidth: 854,
    maxHeight: 854,
    videoBitrate: '850k',
    audioBitrate: '96k',
    description: 'Menor e mais rapida',
  },
  high: {
    label: 'Alta qualidade',
    maxWidth: 1920,
    maxHeight: 1920,
    videoBitrate: '2800k',
    audioBitrate: '160k',
    description: 'Mais qualidade, pode demorar',
  },
}

const videoFilters: {
  value: VideoFilter
  label: string
  className: string
  swatchClassName: string
}[] = [
  {
    value: 'normal',
    label: 'Original',
    className: '',
    swatchClassName: 'bg-gradient-to-br from-zinc-700 to-zinc-950',
  },
  {
    value: 'mono',
    label: 'P&B',
    className: 'grayscale contrast-125',
    swatchClassName: 'bg-gradient-to-br from-white via-zinc-500 to-black',
  },
  {
    value: 'sepia',
    label: 'Vintage',
    className: 'sepia contrast-110 brightness-95',
    swatchClassName: 'bg-gradient-to-br from-amber-200 via-yellow-700 to-zinc-950',
  },
  {
    value: 'warm',
    label: 'Quente',
    className: 'brightness-110 contrast-110 saturate-150',
    swatchClassName: 'bg-gradient-to-br from-orange-300 via-rose-500 to-purple-950',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createUploadFilePath(userId: string) {
  return `videos/${userId}_${Date.now()}.mp4`
}

const PROJECT_NAME_STORAGE_PREFIX = 'entreus-studio-project-name-v1:'

function projectNameStorageKey(file: File) {
  return `${PROJECT_NAME_STORAGE_PREFIX}${encodeURIComponent(`${file.name}:${file.size}:${file.type}`)}`
}

function readSavedProjectName(key: string) {
  try {
    return window.localStorage.getItem(key)?.trim().slice(0, 80) || null
  } catch {
    return null
  }
}

function readVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    let settled = false
    const timeout = window.setTimeout(() => finish(new Error('Tempo esgotado ao ler o vídeo.')), 15000)
    function finish(result: { duration: number; width: number; height: number } | Error) {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      probe.onloadedmetadata = null
      probe.onerror = null
      probe.removeAttribute('src')
      probe.load()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    probe.onloadedmetadata = () => {
      const duration = probe.duration
      finish(Number.isFinite(duration) && duration > 0 && probe.videoWidth > 0 && probe.videoHeight > 0
        ? { duration, width: probe.videoWidth, height: probe.videoHeight }
        : new Error('Metadados do vídeo indisponíveis.'))
    }
    probe.onerror = () => finish(new Error('Não foi possível ler ou decodificar o vídeo.'))
    probe.src = url
  })
}

function readReassociatedMediaMetadata(url: string, type: string): Promise<Pick<ProjectMedia, 'duration' | 'width' | 'height'> | undefined> {
  if (type.startsWith('video/')) return readVideoMetadata(url)
  if (!type.startsWith('image/') && !type.startsWith('audio/')) return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const probe = type.startsWith('image/') ? new Image() : new Audio()
    let settled = false
    const timeout = window.setTimeout(() => finish(new Error('Tempo esgotado ao ler a mídia.')), 15000)
    function finish(result: Pick<ProjectMedia, 'duration' | 'width' | 'height'> | Error) {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      probe.onload = null
      probe.onerror = null
      if (probe instanceof HTMLAudioElement) probe.onloadedmetadata = null
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    probe.onerror = () => finish(new Error('Mídia não pôde ser decodificada.'))
    if (probe instanceof HTMLImageElement) {
      probe.onload = () => finish({ width: probe.naturalWidth, height: probe.naturalHeight })
      probe.src = url
    } else {
      probe.onloadedmetadata = () => finish({ duration: probe.duration })
      probe.src = url
    }
  })
}

function getCanvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

function getFileExtension(fileName: string, fallback: string) {
  const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return extension || fallback
}

function getVoiceInputExtension(blob: Blob) {
  if (blob.type.includes('mp4')) return 'm4a'
  if (blob.type.includes('ogg')) return 'ogg'
  if (blob.type.includes('wav')) return 'wav'
  return 'webm'
}

function escapeDrawTextValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
}

function paintSubtitleLayer(
  context: CanvasRenderingContext2D,
  segment: SubtitleSegment,
  width: number,
  height: number,
  color: string,
  decorations: boolean,
) {
  const style = resolveSubtitleStyle(segment.style)
  const size = Math.max(8, Math.round(style.size * width / 1280))
  const font = getTextFontOption(style.font)
  context.font = `${font.weight} ${size}px ${font.family}`
  context.textAlign = style.align
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  const x = style.align === 'left' ? width * 0.06 : style.align === 'right' ? width * 0.94 : width / 2
  const maxWidth = width * 0.84
  const lines = wrapTextLines(segment.text, maxWidth, (value) => context.measureText(value).width).slice(0, 5)
  lines.forEach((line, lineIndex) => {
    const y = height * style.position / 100 - (lines.length - lineIndex) * size * 1.2 + size
    const textWidth = Math.min(context.measureText(line).width, maxWidth)
    const left = style.align === 'left' ? x : style.align === 'right' ? x - textWidth : x - textWidth / 2
    if (decorations && style.background) {
      context.fillStyle = 'rgba(0,0,0,0.7)'
      context.fillRect(left - 10, y - size - 10, textWidth + 20, size + 20)
    }
    if (decorations && style.shadow) { context.shadowColor = 'rgba(0,0,0,0.65)'; context.shadowBlur = 3; context.shadowOffsetX = 2; context.shadowOffsetY = 2 }
    if (decorations && style.outline) { context.strokeStyle = '#000000'; context.lineWidth = style.outline * 2; context.strokeText(line, x, y, maxWidth) }
    context.fillStyle = color
    context.fillText(line, x, y, maxWidth)
    context.shadowColor = 'transparent'; context.shadowBlur = 0; context.shadowOffsetX = 0; context.shadowOffsetY = 0
  })
}

function paintSubtitleSegment(
  context: CanvasRenderingContext2D,
  segment: SubtitleSegment,
  width: number,
  height: number,
  time: number,
  mode: 'animated' | 'base' | 'highlight' = 'animated',
) {
  const style = resolveSubtitleStyle(segment.style)
  const state = subtitleAnimationState(segment, time)
  context.save()
  if (mode === 'animated') {
    const anchorX = style.align === 'left' ? width * 0.06 : style.align === 'right' ? width * 0.94 : width / 2
    const anchorY = height * style.position / 100
    context.globalAlpha = state.opacity
    context.translate(anchorX, anchorY + state.translateYRatio * height)
    context.scale(state.scale, state.scale)
    context.translate(-anchorX, -anchorY)
    paintSubtitleLayer(context, segment, width, height, style.color, true)
    if (state.karaokeProgress > 0) {
      context.save()
      context.globalAlpha *= state.karaokeProgress
      paintSubtitleLayer(context, segment, width, height, style.highlightColor, false)
      context.restore()
    }
  } else if (mode === 'highlight') {
    paintSubtitleLayer(context, segment, width, height, style.highlightColor, false)
  } else {
    paintSubtitleLayer(context, segment, width, height, style.color, true)
  }
  context.restore()
}

function renderImageInputArgs(input: RenderImageInput) {
  if (input.kind !== 'subtitle' || !input.subtitleRender) return ['-i', input.inputName]
  const segmentDuration = Math.max(input.subtitleRender.segment.endTime - input.subtitleRender.segment.startTime, 0.001)
  return ['-loop', '1', '-framerate', '30', '-t', segmentDuration.toFixed(3), '-i', input.inputName]
}

function getFfmpegColor(hexColor: string) {
  return hexColor.replace('#', '0x')
}

function getFfmpegColorWithOpacity(hexColor: string, opacity: number) {
  return `${getFfmpegColor(hexColor)}@${clamp(opacity, 0, 1).toFixed(2)}`
}

function getTextFontOption(fontKey?: TextFontKey) {
  return TEXT_FONT_OPTIONS.find((item) => item.key === fontKey) || TEXT_FONT_OPTIONS[0]
}

function getTextFontCss(overlay: TextOverlay) {
  const font = getTextFontOption(overlay.fontKey)
  const weight = overlay.fontWeight || font.weight
  return `${weight} ${overlay.fontSize}px ${font.family}`
}

function getHexRgb(hexColor: string) {
  const clean = hexColor.replace('#', '')
  const value = clean.length === 3
    ? clean.split('').map((item) => item + item).join('')
    : clean

  const parsed = Number.parseInt(value, 16)
  if (!Number.isFinite(parsed)) return { r: 0, g: 0, b: 0 }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function getRgbaColor(hexColor: string, opacity: number) {
  const { r, g, b } = getHexRgb(hexColor)
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1)})`
}

function getOverlayTextBox(
  context: CanvasRenderingContext2D,
  overlay: TextOverlay,
  padding = 12
) {
  context.font = getTextFontCss(overlay)
  context.textAlign = overlay.textAlign || 'left'

  if (overlay.width && overlay.height) {
    return {
      x: overlay.x - padding,
      y: overlay.y - padding,
      width: overlay.width,
      height: overlay.height,
      textX: overlay.x,
      textY: overlay.y,
    }
  }

  const width = context.measureText(overlay.text).width
  const height = overlay.fontSize
  const align = overlay.textAlign || 'left'
  const textX = align === 'center'
    ? overlay.x - width / 2
    : align === 'right'
    ? overlay.x - width
    : overlay.x

  return {
    x: textX - padding,
    y: overlay.y - padding,
    width: width + padding * 2,
    height: height + padding * 2,
    textX,
    textY: overlay.y,
  }
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = clamp(radius, 0, Math.min(width, height) / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
  context.fill()
}

function paintTextOverlay(context: CanvasRenderingContext2D, overlay: TextOverlay) {
  context.save()
  context.font = getTextFontCss(overlay)
  context.textAlign = overlay.textAlign || 'left'
  context.textBaseline = 'top'
  const box = getOverlayTextBox(context, overlay)
  const center = imageCenter(box)
  context.translate(center.x, center.y)
  context.rotate(((overlay.rotation || 0) * Math.PI) / 180)
  context.translate(-center.x, -center.y)

  if (overlay.backgroundEnabled) {
    context.fillStyle = getRgbaColor(
      overlay.backgroundColor || DEFAULT_TEXT_BACKGROUND_COLOR,
      overlay.backgroundOpacity ?? DEFAULT_TEXT_BACKGROUND_OPACITY
    )
    fillRoundedRect(context, box.x, box.y, box.width, box.height, overlay.backgroundRadius ?? 18)
  }

  const hasBox = Boolean(overlay.width && overlay.height)
  const lines = hasBox
    ? wrapTextLines(overlay.text, Math.max(1, box.width - 24), (value) => context.measureText(value).width)
    : [overlay.text]
  if (hasBox) {
    context.beginPath()
    context.rect(box.x, box.y, box.width, box.height)
    context.clip()
  }
  const lineHeight = overlay.fontSize * 1.15
  const maxLines = hasBox ? Math.max(1, Math.floor((box.height - 24 + lineHeight * 0.15) / lineHeight)) : 1
  const align = overlay.textAlign || 'left'
  const textX = hasBox ? overlay.x + (align === 'center' ? (box.width - 24) / 2 : align === 'right' ? box.width - 24 : 0) : overlay.x
  lines.slice(0, maxLines).forEach((line, index) => {
    const y = overlay.y + index * lineHeight
    context.fillStyle = 'rgba(0, 0, 0, 0.5)'
    context.fillText(line, textX + 3, y + 3)
    context.fillStyle = overlay.color
    context.fillText(line, textX, y)
  })
  context.restore()
  return box
}

function textRotationHandleY(box: ImageBounds & { rotation: number }, canvas: { width: number; height: number }, offset: number, radius: number) {
  const top = -box.height / 2 - offset
  const topPoint = imageWorldPoint(box, { x: 0, y: top })
  if (topPoint.x >= radius && topPoint.x <= canvas.width - radius && topPoint.y >= radius && topPoint.y <= canvas.height - radius) return top
  return box.height / 2 + offset
}

function getVisualFilter(value: VideoFilter) {
  if (value === 'mono') return 'format=gray'
  if (value === 'sepia') {
    return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'
  }
  if (value === 'warm') return 'eq=brightness=0.04:contrast=1.08:saturation=1.35'
  return 'null'
}

function legacyColor(value: VideoFilter): ColorAdjustments {
  return { ...DEFAULT_COLOR_ADJUSTMENTS, preset: value }
}

function formatEditorTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'

  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type TimelineClipCardProps = {
  clip: PositionedClip
  index: number
  editorMode: EditorMode
  pixelsPerSecond: number
  active: boolean
  dragging: boolean
  onSelect: (clip: PositionedClip) => void
  onDragStart: (clip: PositionedClip, event: PointerEvent<HTMLDivElement>) => void
  onDragMove: (clip: PositionedClip, event: PointerEvent<HTMLDivElement>) => void
  onDragEnd: (clip: PositionedClip, event: PointerEvent<HTMLDivElement>) => void
  onDragCancel: (event: PointerEvent<HTMLDivElement>) => void
  onTrimStart: (clip: PositionedClip, edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>) => void
  onTrimMove: (clip: PositionedClip, edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>) => void
  onTrimEnd: (clip: PositionedClip, event: PointerEvent<HTMLDivElement>) => void
  onTrimCancel: (event: PointerEvent<HTMLDivElement>) => void
  onTrimKey: (clip: PositionedClip, edge: 'start' | 'end', event: KeyboardEvent<HTMLDivElement>) => void
}

function TimelineClipCard({ clip, index, editorMode, pixelsPerSecond, active, dragging, onSelect, onDragStart, onDragMove, onDragEnd, onDragCancel, onTrimStart, onTrimMove, onTrimEnd, onTrimCancel, onTrimKey }: TimelineClipCardProps) {
  return (
    <div
      data-clip-id={clip.id}
      className={`absolute top-1 h-12 min-w-[12px] touch-none sm:h-14 ${dragging ? 'z-20 scale-[1.03] ring-2 ring-sky-300' : ''}`}
      onDragStart={(event) => event.preventDefault()}
      style={{ left: `${Math.max(clip.startTime, 0) * pixelsPerSecond}px`, width: `${Math.max((clip.endTime - clip.startTime) * pixelsPerSecond, 0.1)}px` }}
      onPointerDown={(event) => onDragStart(clip, event)}
      onPointerMove={(event) => onDragMove(clip, event)}
      onPointerUp={(event) => onDragEnd(clip, event)}
      onPointerCancel={onDragCancel}
    >
      <button type="button" onClick={() => onSelect(clip)} className={`relative h-full w-full overflow-hidden rounded-md border text-left ${active ? 'border-white bg-sky-300 text-black ring-2 ring-sky-300' : 'border-white/10 bg-zinc-800 text-white'}`}>
        {clip.type === 'image' && clip.previewUrl ? <NextImage unoptimized src={clip.previewUrl} alt="" draggable={false} fill sizes="100px" className="object-cover opacity-80" /> : <VideoFilmstrip src={clip.previewUrl} />}
        <span className="absolute left-1 top-0.5 rounded bg-black/60 px-1 text-[9px] font-black text-white">{clip.type === 'video' ? 'Video' : editorMode === 'photos' ? index + 1 : index}</span>
        <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[9px] font-black text-white">{formatEditorTime(clip.duration)}</span>
      </button>
      {clip.type === 'video' && active && (['start', 'end'] as const).map((edge) => (
        <div key={edge} role="slider" tabIndex={0} aria-label={edge === 'start' ? 'Aparar início do clipe' : 'Aparar fim do clipe'} aria-valuemin={edge === 'start' ? 0 : (clip.trimStart || 0) + 0.5} aria-valuemax={edge === 'start' ? (clip.trimEnd || clip.sourceDuration || 1) - 0.5 : clip.sourceDuration || 1} aria-valuenow={edge === 'start' ? clip.trimStart || 0 : clip.trimEnd || clip.sourceDuration || 1} title={edge === 'start' ? 'Arraste para aparar o início' : 'Arraste para aparar o fim'} className={`absolute inset-y-0 z-30 w-5 cursor-ew-resize touch-none rounded bg-sky-200/90 shadow-[0_0_8px_rgba(125,211,252,0.7)] focus-visible:outline-2 focus-visible:outline-white sm:w-3 ${edge === 'start' ? 'left-0' : 'right-0'}`}
          onPointerDown={(event) => onTrimStart(clip, edge, event)}
          onPointerMove={(event) => onTrimMove(clip, edge, event)}
          onPointerUp={(event) => onTrimEnd(clip, event)}
          onPointerCancel={onTrimCancel}
          onKeyDown={(event) => onTrimKey(clip, edge, event)}
        />
      ))}
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'

  const megabytes = bytes / (1024 * 1024)
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`

  return `${(bytes / 1024).toFixed(0)} KB`
}

function getOverlayLabel(overlay: TextOverlay, index: number) {
  const normalizedText = overlay.text.trim()
  if (!normalizedText) return `Texto ${index + 1}`

  return normalizedText.length > 24
    ? `${normalizedText.slice(0, 24)}...`
    : normalizedText
}

function getReductionPercent(originalBytes: number, optimizedBytes: number) {
  if (originalBytes <= 0 || optimizedBytes <= 0) return 0

  return clamp(Math.round((1 - optimizedBytes / originalBytes) * 100), 0, 99)
}

function getImageRenderExtension(file: File) {
  return file.type === 'image/png' ? 'png' : 'jpg'
}

function getPhotoInputExtension(file: File) {
  return file.type === 'image/png' ? 'png' : 'jpg'
}

export default function VideoEditor({ mode = 'publish' }: VideoEditorProps) {
  const isDownloadMode = mode === 'download'
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const ffmpegListenersRef = useRef<{ ffmpeg: FFmpeg; progress: ProgressEventCallback; log: LogEventCallback } | null>(null)
  const renderOperationRef = useRef(0)
  const renderAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const outgoingVideoRef = useRef<HTMLVideoElement | null>(null)
  const videoOverlayElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const videoOverlayUrlsRef = useRef<string[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voicePlaybackRef = useRef<HTMLAudioElement | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<BlobPart[]>([])
  const voiceStartedAtRef = useRef(0)
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const subtitleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const workspaceDragRef = useRef<{ divider: WorkspaceDivider; startX: number; startY: number; startValue: number } | null>(null)
  const cancelProjectRenameRef = useRef(false)
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const pointerMovedRef = useRef(false)
  const pointerStartedOnOverlayRef = useRef(false)
  const draggingLayerRef = useRef<DraggingLayer>(null)
  const imageResizeRef = useRef<ImageResizeState | null>(null)
  const imageRotateRef = useRef<ImageRotateState | null>(null)
  const videoDragInitialRef = useRef<VideoOverlay | null>(null)
  const textGestureRef = useRef<TextGestureState | null>(null)
  const stickerGestureRef = useRef<StickerGestureState | null>(null)
  const canvasPointerIdRef = useRef<number | null>(null)
  const visualGestureActiveRef = useRef(false)
  const timelineDragRef = useRef<TimelineDragState | null>(null)
  const videoTimelineInitialRef = useRef<VideoOverlay | null>(null)
  const renderStageRef = useRef('idle')
  const renderLockRef = useRef(false)
  const visualHistoryRef = useRef<{ entries: VisualSnapshot[]; index: number }>({ entries: [], index: -1 })
  const restoringVisualHistoryRef = useRef(false)

  const [editorMode, setEditorMode] = useState<EditorMode>('video')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [projectName, setProjectName] = useState('Novo vídeo')
  const [projectNameKey, setProjectNameKey] = useState<string | null>(null)
  const [isRenamingProject, setIsRenamingProject] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [baseVideoDuration, setBaseVideoDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioClips, setAudioClips] = useState<LocalAudioClip[]>([])
  const [audioLibrary, setAudioLibrary] = useState<LocalLibraryAsset[]>([])
  const [activeAudioClipId, setActiveAudioClipId] = useState<string | null>(null)
  const [audioClipMessage, setAudioClipMessage] = useState('')
  const [audioClipBusy, setAudioClipBusy] = useState(false)
  const [musicPreviousVolume, setMusicPreviousVolume] = useState(0.45)
  const audioClipsOperationRef = useRef(0)
  const audioClipImportBusyRef = useRef(false)
  const audioClipDragRef = useRef<{ id: string; x: number; start: number; secondsPerPixel: number } | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceUrl, setVoiceUrl] = useState('')
  const [voiceDuration, setVoiceDuration] = useState(0)
  const [voiceStartTime, setVoiceStartTime] = useState(0)
  const [voiceVolume, setVoiceVolume] = useState(1)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1280, height: 720 })
  const [originalCanvasSize, setOriginalCanvasSize] = useState<CanvasSize>({ width: 1280, height: 720 })
  const [aspectPreset, setAspectPreset] = useState<VideoAspectPreset>('original')
  const aspectPresetRef = useRef<VideoAspectPreset>('original')
  const [frameMode, setFrameMode] = useState<VideoFrameMode>('fit')
  const [textValue, setTextValue] = useState('')
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR)
  const [overlays, setOverlays] = useState<TextOverlay[]>([])
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null)
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [videoOverlays, setVideoOverlays] = useState<VideoOverlay[]>([])
  const [activeVideoOverlayId, setActiveVideoOverlayId] = useState<string | null>(null)
  const [stickers, setStickers] = useState<StickerOverlay[]>([])
  const [visualLayerOrder, setVisualLayerOrder] = useState<string[]>([])
  const [alignmentGuide, setAlignmentGuide] = useState<{ x: number | null; y: number | null } | null>(null)
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [currentTime, setCurrentTime] = useState(0)
  const currentTimeRef = useRef(0)
  const [filter, setFilter] = useState<VideoFilter>('normal')
  const [colorAdjustments, setColorAdjustments] = useState<Record<string, ColorAdjustments>>({})
  const [videoVolume, setVideoVolume] = useState(1)
  const [musicVolume, setMusicVolume] = useState(0.45)
  const [musicFadeIn, setMusicFadeIn] = useState(0)
  const [musicFadeOut, setMusicFadeOut] = useState(0)
  const [musicAssetId, setMusicAssetId] = useState<string | undefined>()
  const musicImportOperationRef = useRef(0)
  const [musicStartTime, setMusicStartTime] = useState(0)
  const [musicTrimStart, setMusicTrimStart] = useState(0)
  const [musicTrimEnd, setMusicTrimEnd] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioMessage, setAudioMessage] = useState('')
  const [musicVolumeTouched, setMusicVolumeTouched] = useState(false)
  const [caption, setCaption] = useState('')
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([])
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null)
  const [subtitleMessage, setSubtitleMessage] = useState('')
  const [activePanel, setActivePanel] = useState<EditorPanel>('add')
  const [isToolSheetOpen, setIsToolSheetOpen] = useState(false)
  const [visualHistoryPosition, setVisualHistoryPosition] = useState({ index: 0, length: 1 })
  const [visualHistoryRevision, setVisualHistoryRevision] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderStage, setRenderStageState] = useState('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderMessage, setRenderMessage] = useState('')
  const [compressionPreset, setCompressionPreset] = useState<CompressionPreset>('auto')
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null)
  const [isPublishStepOpen, setIsPublishStepOpen] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [workspaceFocus, setWorkspaceFocus] = useState<'preview' | 'timeline' | null>(null)
  const workspaceFocusRestoreRef = useRef<Pick<WorkspaceLayout, 'timelineHeight' | 'timelineCustomized' | 'previewOpen' | 'timelineOpen'> | null>(null)
  const [exportInfoOpen, setExportInfoOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const shortcutHelpCloseRef = useRef<HTMLButtonElement | null>(null)
  const shortcutReturnFocusRef = useRef<HTMLElement | null>(null)
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>(DEFAULT_WORKSPACE_LAYOUT)
  const [workspaceLayoutLoaded, setWorkspaceLayoutLoaded] = useState(false)
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false)
  const [timelineDragTarget, setTimelineDragTarget] = useState<string | null>(null)
  const [timelineDragPreview, setTimelineDragPreview] = useState<TimelineDragPreview>(null)
  const [imageMessage, setImageMessage] = useState('')
  const [imageLoadVersion, setImageLoadVersion] = useState(0)
  const [photoSlides, setPhotoSlides] = useState<PhotoSlide[]>([])
  const [autoReelsApplying, setAutoReelsApplying] = useState(false)
  const autoReelsApplyingRef = useRef(false)
  const autoReelsRevisionRef = useRef('')
  const autoReelsRhythmRef = useRef<ReturnType<typeof createAutoReelsRhythmSession> | null>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [photoTransition, setPhotoTransition] = useState<PhotoTransition>('fade')
  const [photoMessage, setPhotoMessage] = useState('')
  const [photoStorageWarning, setPhotoStorageWarning] = useState('')
  const [localDraftMessage, setLocalDraftMessage] = useState('')
  const [extraVideos, setExtraVideos] = useState<ExtraVideoClip[]>([])
  const mixScale = safeMixScale(videoFile || extraVideos.length ? videoVolume : 0, audioFile ? musicVolume : 0, voiceBlob ? voiceVolume : 0, ...audioClips.map(audioClipGain))
  const [mediaImportEntries, setMediaImportEntries] = useState<MediaImportEntry[]>([])
  const [sequenceOrder, setSequenceOrder] = useState<string[]>([])
  const [excludedClipIds, setExcludedClipIds] = useState<string[]>([])
  const libraryDragRef = useRef<string | null>(null)
  const libraryDropHandledRef = useRef(false)
  const [libraryDropActive, setLibraryDropActive] = useState(false)
  const [libraryDropMessage, setLibraryDropMessage] = useState('')
  const [baseTrim, setBaseTrim] = useState({ trimStart: 0, trimEnd: DEFAULT_VIDEO_DURATION })
  const [clipTransitions, setClipTransitions] = useState<Record<string, ClipTransition>>({})
  const [junctionTransitions, setJunctionTransitions] = useState<JunctionTransitions>({})
  const [activeClipId, setActiveClipId] = useState<string | null>(null)
  const [clipDragTarget, setClipDragTarget] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [projectCreatedAt, setProjectCreatedAt] = useState(0)
  const [projectStorageReady, setProjectStorageReady] = useState(false)
  const [projectStorageError, setProjectStorageError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'pending' | 'saving' | 'saved' | 'error' | 'idle'>('idle')
  const [missingMediaRefs, setMissingMediaRefs] = useState<Record<string, ProjectMedia>>({})
  const [videoAssetIds, setVideoAssetIds] = useState<Record<string, string>>({})
  const [videoStorageWarning, setVideoStorageWarning] = useState('')
  const [reassociateMessage, setReassociateMessage] = useState('')
  const [customStickerImages, setCustomStickerImages] = useState<Record<string, HTMLImageElement>>({})
  const [customStickerMissing, setCustomStickerMissing] = useState<string[]>([])
  const [customStickerPending, setCustomStickerPending] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [customStickerMessage, setCustomStickerMessage] = useState('')
  const [customStickerRevision, setCustomStickerRevision] = useState(0)
  const customStickerOperationRef = useRef(0)
  const customStickerSavingRef = useRef(false)
  const autoSaveRef = useRef<ProjectAutoSave | null>(null)
  const projectOwnerRef = useRef<string | null>(null)
  const clipDragRef = useRef<{ id: string; pointerId: number; x: number; moved: boolean } | null>(null)
  const clipTrimDragRef = useRef<{ id: string; edge: 'start' | 'end'; pointerId: number; startX: number; startValue: number; secondsPerPixel: number } | null>(null)
  const suppressClipClickRef = useRef(false)
  const previousVolumesRef = useRef({ video: 1, music: 0.45 })
  const pendingSeekRef = useRef<number | null>(null)
  const timelineSeekFrameRef = useRef<number | null>(null)
  const timelineSeekPointerRef = useRef<number | null>(null)
  const timelineSeekStartTimeRef = useRef<number | null>(null)
  const extraVideosRef = useRef<ExtraVideoClip[]>([])
  useEffect(() => {
    let cancelled = false
    async function openProject() {
      try {
        const { data: { user } } = await getBrowserUser()
        if (cancelled) return
        if (!user && !isDownloadMode) throw new Error('Entre na sua conta para salvar este projeto.')
        const owner = user ? `user:${user.id}` : 'guest'
        const controller = new ProjectAutoSave(window.localStorage, projectStorageKey(owner), setSaveStatus)
        const result = controller.load()
        if (result.error) throw new Error(result.error)
        autoSaveRef.current = controller
        projectOwnerRef.current = owner
        const saved = result.project
        if (saved) {
          const savedMusic = saved.music.assetId && saved.music.media
            ? await loadMusicAsset(saved.id, saved.music.assetId).catch(() => null)
            : null
          const savedAudioClips = await Promise.all((saved.audioClips || []).map(async (clip) => {
            const file = await loadMusicAsset(saved.id, clip.assetId).catch(() => null)
            return { ...clip, file: file && matchesProjectMedia(clip.media, file) ? file : null }
          }))
          const library = await Promise.all((saved.audioLibrary || []).map(async (asset) => {
            const file = await loadMusicAsset(saved.id, asset.assetId).catch(() => null)
            return { ...asset, file: file && matchesProjectMedia(asset.media, file) ? file : null }
          }))
          for (const clip of savedAudioClips) {
            if (library.length < MAX_LIBRARY_ASSETS && !library.some((asset) => asset.assetId === clip.assetId)) {
              library.push({ source: 'local', category: 'music', assetId: clip.assetId, media: { ...clip.media, id: clip.assetId }, duration: clip.sourceDuration, file: clip.file })
            }
          }
          if (saved.music.assetId && saved.music.assetId.length <= 128 && saved.music.media && !saved.music.selectedMusicId && /\.(mp3|wav)$/i.test(saved.music.media.name) && saved.music.media.type.startsWith('audio/') && saved.music.media.size <= MAX_MUSIC_BYTES && saved.music.duration > 0 && saved.music.duration <= 600 && library.length < MAX_LIBRARY_ASSETS && !library.some((asset) => asset.assetId === saved.music.assetId)) {
            library.push({ source: 'local', category: 'music', assetId: saved.music.assetId, media: { ...saved.music.media, id: saved.music.assetId }, duration: saved.music.duration, file: savedMusic && matchesProjectMedia(saved.music.media, savedMusic) ? savedMusic : null })
          }
          const restoredPhotos = await Promise.all(saved.photoSlides.map(async ({ media, assetId }) => {
            if (!assetId) return null
            try {
              const file = await loadPhotoAsset(saved.id, assetId, media)
              if (!file) return null
              const url = URL.createObjectURL(file)
              try { await readReassociatedMediaMetadata(url, media.type); return { file, url } }
              catch { URL.revokeObjectURL(url); return null }
            } catch { return null }
          }))
          const restoredVideos: Record<string, { file: File; url: string }> = {}
          for (const media of [saved.baseVideo, ...saved.extraVideos.map((clip) => clip.media)]) {
            if (!media?.assetId) continue
            try {
              const file = await loadVideoAsset(saved.id, media)
              if (!file) continue
              const url = URL.createObjectURL(file)
              try {
                const observed = await readVideoMetadata(url)
                if (!matchesProjectMedia(media, file, observed)) throw new Error('Vídeo alterado.')
                restoredVideos[media.id] = { file, url }
              } catch { URL.revokeObjectURL(url) }
            } catch { /* The saved reference remains available for manual reassociation. */ }
          }
          if (cancelled) {
            restoredPhotos.forEach((photo) => { if (photo) URL.revokeObjectURL(photo.url) })
            Object.values(restoredVideos).forEach((video) => URL.revokeObjectURL(video.url))
            return
          }
          const missing: Record<string, ProjectMedia> = {}
          const placeholder = (media: ProjectMedia) => {
            missing[media.id] = media
            return new File([], media.name, { type: media.type, lastModified: media.lastModified })
          }
          setProjectId(saved.id)
          setProjectCreatedAt(saved.createdAt)
          setProjectName(saved.name)
          setProjectNameKey(null)
          setEditorMode(saved.editorMode)
          setCanvasSize(saved.canvasSize)
          setOriginalCanvasSize(saved.originalCanvasSize || saved.canvasSize)
          aspectPresetRef.current = saved.aspectPreset || 'original'
          setAspectPreset(aspectPresetRef.current)
          setFrameMode(saved.frameMode || 'fit')
          setBaseVideoDuration(saved.baseVideoDuration)
          setBaseTrim(saved.baseTrim)
          setVideoAssetIds(Object.fromEntries([saved.baseVideo, ...saved.extraVideos.map((clip) => clip.media)].flatMap((media) => media?.assetId ? [[media.id, media.assetId]] : [])))
          setVideoFile(saved.baseVideo ? restoredVideos['base-video']?.file || placeholder(saved.baseVideo) : null)
          setVideoName(saved.baseVideo?.name || '')
          setVideoUrl(restoredVideos['base-video']?.url || '')
          setExtraVideos(saved.extraVideos.map(({ media, ...clip }) => ({ ...clip, file: restoredVideos[clip.id]?.file || placeholder(media), previewUrl: restoredVideos[clip.id]?.url || '' })))
          setPhotoSlides(saved.photoSlides.map(({ media, ...slide }, index) => ({ ...slide, file: restoredPhotos[index]?.file || placeholder(media), previewUrl: restoredPhotos[index]?.url || '' })))
          setImageOverlays(saved.imageOverlays.map(({ media, ...overlay }) => ({ ...overlay, file: placeholder(media), url: '' })))
          setVideoOverlays(saved.videoOverlays.map(({ media, ...overlay }) => ({ ...overlay, file: placeholder(media), url: '' })))
          setOverlays(saved.texts as TextOverlay[])
          setStickers(saved.stickers)
          setVisualLayerOrder(saved.visualLayerOrder || [])
          setSequenceOrder(saved.sequenceOrder)
          setExcludedClipIds(saved.excludedClipIds)
          setClipTransitions(saved.clipTransitions)
          setJunctionTransitions(saved.junctionTransitions || {})
          setPhotoTransition(saved.photoTransition)
          setFilter(saved.filter)
          setColorAdjustments(saved.colorAdjustments || {})
          setVideoVolume(saved.videoVolume)
          const restoredMusic = savedMusic && saved.music.media && matchesProjectMedia(saved.music.media, savedMusic) ? savedMusic : null
          setAudioFile(restoredMusic || (saved.music.media ? placeholder(saved.music.media) : null))
          setAudioName(saved.music.name)
          setAudioUrl(restoredMusic ? URL.createObjectURL(restoredMusic) : '')
          setMusicAssetId(saved.music.assetId)
          setMusicFadeIn(saved.music.fadeIn ?? 0)
          setMusicFadeOut(saved.music.fadeOut ?? 0)
          setSelectedMusicId(saved.music.selectedMusicId)
          setAudioDuration(saved.music.duration)
          setMusicStartTime(saved.music.startTime)
          setMusicTrimStart(saved.music.trimStart)
          setMusicTrimEnd(saved.music.trimEnd)
          setMusicVolume(saved.music.volume)
          setMusicPreviousVolume(saved.music.previousVolume ?? (saved.music.volume > 0 ? saved.music.volume : 0.45))
          setAudioClips(savedAudioClips)
          setAudioLibrary(library)
          setMusicVolumeTouched(saved.music.volumeTouched)
          setVoiceBlob(saved.voice.media ? placeholder(saved.voice.media) : null)
          setVoiceUrl('')
          setVoiceDuration(saved.voice.duration)
          setVoiceStartTime(saved.voice.startTime)
          setVoiceVolume(saved.voice.volume)
          setCaption(saved.caption)
          setSubtitles(saved.subtitles ?? [])
          setCurrentTime(saved.currentTime)
          setMissingMediaRefs(missing)
          setSaveStatus('saved')
        } else {
          setProjectId(crypto.randomUUID())
          setProjectCreatedAt(Date.now())
        }
        setProjectStorageReady(true)
      } catch (error) {
        if (cancelled) return
        setProjectStorageError(error instanceof Error ? error.message : 'Não foi possível acessar o projeto salvo.')
        setSaveStatus('error')
      }
    }
    void openProject()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return
      const nextOwner = session?.user ? `user:${session.user.id}` : 'guest'
      if (projectOwnerRef.current && nextOwner !== projectOwnerRef.current) {
        autoSaveRef.current?.flush()
        window.location.reload()
      }
    })
    const onBeforeUnload = () => { autoSaveRef.current?.flush() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      cancelled = true
      subscription.unsubscribe()
      window.removeEventListener('beforeunload', onBeforeUnload)
      autoSaveRef.current?.dispose()
      autoSaveRef.current = null
      projectOwnerRef.current = null
    }
  }, [isDownloadMode])

  useEffect(() => {
    if (!projectStorageReady || !projectId || (!videoFile && photoSlides.length === 0 && overlays.length === 0 && !projectName.trim())) return
    if (visualGestureActiveRef.current || timelineDragRef.current) return
    const media = (id: string, file: File, details?: Pick<ProjectMedia, 'duration' | 'width' | 'height'>) =>
      missingMediaRefs[id] || { ...describeFile(id, file, details), ...(videoAssetIds[id] ? { assetId: videoAssetIds[id] } : {}) }
    const project: SavedProject = {
      version: 1, id: projectId, createdAt: projectCreatedAt, updatedAt: 0, name: projectName,
      editorMode, canvasSize, originalCanvasSize, aspectPreset, frameMode,
      baseVideo: videoFile ? media('base-video', videoFile, videoRef.current?.readyState ? { duration: baseVideoDuration, width: originalCanvasSize.width, height: originalCanvasSize.height } : undefined) : null,
      baseVideoDuration, baseTrim,
      extraVideos: extraVideos.map(({ id, file, sourceDuration, trimStart, trimEnd }) => ({ id, media: media(id, file, { duration: sourceDuration }), sourceDuration, trimStart, trimEnd })),
      photoSlides: photoSlides.map(({ id, file, duration, order, assetId }) => ({ id, media: media(id, file), duration, order, ...(assetId ? { assetId } : {}) })),
      imageOverlays: imageOverlays.map(({ file, url, ...overlay }) => {
        void url
        const image = imageElementsRef.current.get(overlay.id)
        return { ...overlay, media: media(overlay.id, file, image?.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : undefined) }
      }),
      videoOverlays: videoOverlays.map(({ file, url, ...overlay }) => { void url; return { ...overlay, media: media(overlay.id, file, { duration: overlay.sourceDuration }) } }),
      texts: overlays, stickers, visualLayerOrder, sequenceOrder, excludedClipIds, clipTransitions, junctionTransitions, photoTransition,
      filter, colorAdjustments, videoVolume,
      music: { media: audioFile ? media('audio-track', audioFile, audioDuration > 0 ? { duration: audioDuration } : undefined) : null, name: audioName, selectedMusicId, duration: audioDuration, startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd, volume: musicVolume, volumeTouched: musicVolumeTouched, assetId: musicAssetId, fadeIn: musicFadeIn, fadeOut: musicFadeOut, previousVolume: musicPreviousVolume },
      audioClips: audioClips.map(({ file, ...clip }) => { void file; return clip }),
      audioLibrary: audioLibrary.map(({ file, ...asset }) => { void file; return asset }),
      voice: { media: voiceBlob ? missingMediaRefs['voice-track'] || { id: 'voice-track', name: 'voz.webm', type: voiceBlob.type, size: voiceBlob.size, lastModified: projectCreatedAt, ...(voiceDuration > 0 ? { duration: voiceDuration } : {}) } : null, duration: voiceDuration, startTime: voiceStartTime, volume: voiceVolume },
      caption, subtitles, currentTime,
    }
    autoSaveRef.current?.schedule(project)
  }, [projectStorageReady, projectId, projectCreatedAt, projectName, editorMode, canvasSize, originalCanvasSize, aspectPreset, frameMode, videoFile, baseVideoDuration, baseTrim, extraVideos, photoSlides, imageOverlays, videoOverlays, overlays, stickers, visualLayerOrder, sequenceOrder, excludedClipIds, clipTransitions, junctionTransitions, photoTransition, filter, colorAdjustments, videoVolume, audioFile, audioName, selectedMusicId, audioDuration, musicStartTime, musicTrimStart, musicTrimEnd, musicVolume, musicPreviousVolume, audioClips, audioLibrary, musicVolumeTouched, musicAssetId, musicFadeIn, musicFadeOut, voiceBlob, voiceDuration, voiceStartTime, voiceVolume, caption, subtitles, currentTime, missingMediaRefs, videoAssetIds, visualHistoryRevision, timelineDragTarget])

  const customStickerIds = [...new Set(stickers.flatMap((item) => item.customAssetId ? [item.customAssetId] : []))].sort().join('|')
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const urls: string[] = []
    const ids = customStickerIds ? customStickerIds.split('|') : []
    void Promise.all(ids.map(async (id) => {
      try {
        const blob = await loadStickerAsset(projectId, id)
        if (!blob || cancelled) return null
        const url = URL.createObjectURL(blob); urls.push(url)
        const image = new Image(); image.src = url
        await image.decode()
        return [id, image] as const
      } catch { return null }
    })).then((entries) => {
      if (cancelled) return
      const valid = entries.filter((entry): entry is readonly [string, HTMLImageElement] => entry !== null)
      setCustomStickerImages(Object.fromEntries(valid))
      setCustomStickerMissing(ids.filter((id) => !valid.some(([key]) => key === id)))
    })
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [projectId, customStickerIds, customStickerRevision])

  useEffect(() => () => { if (customStickerPending) URL.revokeObjectURL(customStickerPending.url) }, [customStickerPending])

  async function prepareCustomSticker(file: File | undefined) {
    if (!file) return
    const operation = ++customStickerOperationRef.current
    setCustomStickerPending(null)
    try {
      if (file.size === 0 || file.size > MAX_STICKER_BYTES) throw new Error('Use uma imagem de até 5 MB.')
      const kind = stickerFileKind(new Uint8Array(await file.arrayBuffer()))
      if (!kind || file.type !== `image/${kind}`) throw new Error('Use PNG ou WebP estático válido.')
      const url = URL.createObjectURL(file)
      try {
        const img = new Image(); img.src = url; await img.decode()
        if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth > MAX_STICKER_DIMENSION || img.naturalHeight > MAX_STICKER_DIMENSION || img.naturalWidth * img.naturalHeight > 16777216) throw new Error('Dimensões máximas: 4096 × 4096 pixels.')
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a imagem.')
        context.drawImage(img, 0, 0)
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao converter imagem.')), 'image/png'))
        if (!mountedRef.current || customStickerOperationRef.current !== operation) return
        setCustomStickerPending({ blob, url: URL.createObjectURL(blob), name: file.name })
        setCustomStickerMessage('Confira a prévia antes de adicionar.')
      } finally { URL.revokeObjectURL(url) }
    } catch (error) {
      if (mountedRef.current && customStickerOperationRef.current === operation) setCustomStickerMessage(error instanceof Error ? error.message : 'Não foi possível ler a imagem.')
    }
  }

  async function insertCustomSticker(replaceId?: string) {
    if (!customStickerPending || !projectId || customStickerSavingRef.current) return
    customStickerSavingRef.current = true
    const operation = customStickerOperationRef.current
    const assetId = replaceId || crypto.randomUUID()
    try {
      await saveStickerAsset(projectId, assetId, customStickerPending.blob)
      if (!mountedRef.current || customStickerOperationRef.current !== operation) return
      if (!replaceId) {
        const timing = getDefaultLayerTiming()
        const sticker: StickerOverlay = { id: crypto.randomUUID(), value: customStickerPending.name, customAssetId: assetId, opacity: 1, x: canvasSize.width / 2, y: canvasSize.height / 2, size: Math.max(Math.min(canvasSize.width, canvasSize.height) * 0.12, 54), rotation: 0, ...timing, layerOrder: LAYER_ORDER.sticker }
        setStickers((current) => [...current, sticker]); setActiveStickerId(sticker.id)
        setActiveOverlayId(null); setActiveImageId(null); setActiveVideoOverlayId(null)
      }
      setCustomStickerRevision((current) => current + 1)
      setCustomStickerPending(null); setCustomStickerMessage('Sticker salvo neste navegador.')
    } catch {
      if (mountedRef.current && customStickerOperationRef.current === operation) setCustomStickerMessage('Não foi possível salvar o sticker. Verifique o espaço disponível e tente novamente.')
    } finally { customStickerSavingRef.current = false }
  }

  async function reassociateMedia(id: string, file: File | undefined) {
    const expected = missingMediaRefs[id]
    if (!expected || !file) return
    const audioOperation = musicImportOperationRef.current
    setReassociateMessage('')
    let probeUrl = ''
    try {
      probeUrl = URL.createObjectURL(file)
      const observed = await readReassociatedMediaMetadata(probeUrl, expected.type)
      if (!matchesProjectMedia(expected, file, observed)) {
        setReassociateMessage(`${expected.name}: nome, tamanho, formato ou duração não conferem. A edição foi mantida; escolha o arquivo original.`)
        return
      }
      const matching = Object.values(missingMediaRefs).filter((ref) => matchesProjectMedia(ref, file, observed)).map((ref) => ref.id)
      const includes = (target: string) => matching.includes(target)
      if (expected.type.startsWith('video/')) {
        const refs = matching.map((key) => missingMediaRefs[key]).filter((media) => media.assetId)
        if (refs.length) {
          const digest = await videoAssetId(file)
          if (refs.some((media) => media.assetId !== digest)) throw new Error('Vídeo alterado.')
        }
        try {
          const assetId = await storeVideoAsset(projectId, file)
          if (!mountedRef.current || musicImportOperationRef.current !== audioOperation) return
          setVideoAssetIds((current) => ({ ...current, ...Object.fromEntries(matching.map((key) => [key, assetId])) }))
        } catch { setVideoStorageWarning('Vídeo disponível nesta sessão, mas sem recuperação automática. Reassocie o arquivo ao reabrir; verifique o limite de 25 MB e o espaço disponível.') }
      }
      const matchingPhotos = photoSlides.filter((slide) => includes(slide.id))
      let storedPhotoId: string | undefined
      if (matchingPhotos.length) {
        if (matchingPhotos.some((slide) => slide.assetId)) {
          const digest = await photoAssetId(file)
          if (matchingPhotos.some((slide) => slide.assetId && slide.assetId !== digest)) {
            setReassociateMessage(`${expected.name}: o conteúdo não corresponde à foto salva. Escolha o arquivo original.`)
            return
          }
        }
        try {
          storedPhotoId = await storePhotoAsset(projectId, file)
        } catch {
          setPhotoStorageWarning('Não foi possível guardar a foto neste navegador. Ela poderá precisar de reassociação após reabrir; verifique o espaço disponível.')
        }
      }
      if (includes('audio-track')) {
        const assetId = musicAssetId || crypto.randomUUID()
        await saveMusicAsset(projectId, assetId, file)
        if (!mountedRef.current || musicImportOperationRef.current !== audioOperation) return
        setMusicAssetId(assetId)
      }
      if (!mountedRef.current || musicImportOperationRef.current !== audioOperation) return
      const present = new Set([
        ...(videoFile ? ['base-video'] : []), ...extraVideos.map((clip) => clip.id),
        ...photoSlides.map((slide) => slide.id), ...imageOverlays.map((overlay) => overlay.id),
        ...videoOverlays.map((overlay) => overlay.id), ...(audioFile ? ['audio-track'] : []),
        ...(voiceBlob ? ['voice-track'] : []),
      ])
      const urls = Object.fromEntries(matching.filter((key) => present.has(key)).map((key) => [key, URL.createObjectURL(file)]))
      if (includes('base-video')) { setVideoFile(file); setVideoUrl(urls['base-video']); setVideoName(file.name) }
      setExtraVideos((current) => current.map((clip) => includes(clip.id) ? { ...clip, file, previewUrl: urls[clip.id] } : clip))
      setPhotoSlides((current) => current.map((slide) => includes(slide.id) ? { ...slide, file, previewUrl: urls[slide.id], ...(storedPhotoId ? { assetId: storedPhotoId } : {}) } : slide))
      setImageOverlays((current) => current.map((overlay) => includes(overlay.id) ? { ...overlay, file, url: urls[overlay.id] } : overlay))
      setVideoOverlays((current) => current.map((overlay) => includes(overlay.id) ? { ...overlay, file, url: urls[overlay.id] } : overlay))
      if (includes('audio-track')) { setAudioFile(file); setAudioUrl(urls['audio-track']) }
      if (includes('voice-track')) { setVoiceBlob(file); setVoiceUrl(urls['voice-track']) }
      setMissingMediaRefs((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !includes(key))))
      setReassociateMessage(`${file.name} reassociado à edição.`)
    } catch {
      setReassociateMessage(`Não foi possível ler ${file.name}. A edição foi mantida.`)
    } finally {
      if (probeUrl) URL.revokeObjectURL(probeUrl)
    }
  }

  const disposeFfmpeg = useCallback((target?: FFmpeg | null, terminate = true) => {
    const ffmpeg = target ?? ffmpegRef.current
    if (!ffmpeg) return
    const listeners = ffmpegListenersRef.current
    if (listeners?.ffmpeg === ffmpeg) {
      ffmpeg.off('progress', listeners.progress)
      ffmpeg.off('log', listeners.log)
      ffmpegListenersRef.current = null
    }
    if (terminate) ffmpeg.terminate()
    releaseFfmpegLoadAssets(ffmpeg)
    if (ffmpegRef.current === ffmpeg) ffmpegRef.current = null
  }, [])

  useEffect(() => {
    const operationRef = renderOperationRef
    const stickerOperationRef = customStickerOperationRef
    const audioOperationRef = musicImportOperationRef
    const extraAudioOperationRef = audioClipsOperationRef
    const overlayElements = videoOverlayElementsRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stickerOperationRef.current++
      audioOperationRef.current++
      extraAudioOperationRef.current++
      operationRef.current++
      renderAbortRef.current?.abort()
      renderAbortRef.current = null
      renderLockRef.current = false
      draggingLayerRef.current = null
      imageResizeRef.current = null
      imageRotateRef.current = null
      textGestureRef.current = null
      stickerGestureRef.current = null
      overlayElements.forEach((video) => video.pause())
      overlayElements.clear()
      videoOverlayUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      canvasPointerIdRef.current = null
      visualGestureActiveRef.current = false
      disposeFfmpeg(ffmpegRef.current, Boolean(ffmpegRef.current?.loaded))
    }
  }, [disposeFfmpeg])

  useEffect(() => {
    extraVideosRef.current = extraVideos
  }, [extraVideos])

  useEffect(() => {
    videoOverlayUrlsRef.current = videoOverlays.map((overlay) => overlay.url)
  }, [videoOverlays])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_KEY) || 'null') as Partial<WorkspaceLayout> | null
        if (saved && typeof saved === 'object') {
          setWorkspaceLayout({
            libraryWidth: Number.isFinite(saved.libraryWidth) ? clamp(Number(saved.libraryWidth), 200, 560) : DEFAULT_WORKSPACE_LAYOUT.libraryWidth,
            propertiesWidth: Number.isFinite(saved.propertiesWidth) ? clamp(Number(saved.propertiesWidth), 280, 560) : DEFAULT_WORKSPACE_LAYOUT.propertiesWidth,
            timelineHeight: Number.isFinite(saved.timelineHeight) ? clamp(Number(saved.timelineHeight), 160, 650) : DEFAULT_WORKSPACE_LAYOUT.timelineHeight,
            timelineCustomized: saved.timelineCustomized === true,
            libraryOpen: typeof saved.libraryOpen === 'boolean' ? saved.libraryOpen : true,
            previewOpen: typeof saved.previewOpen === 'boolean' ? saved.previewOpen : true,
            propertiesOpen: typeof saved.propertiesOpen === 'boolean' ? saved.propertiesOpen : true,
            timelineOpen: typeof saved.timelineOpen === 'boolean' ? saved.timelineOpen : true,
          })
        }
      } catch {
        // Storage can be unavailable in private browsing or contain an older layout.
      }
      setWorkspaceLayoutLoaded(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!workspaceLayoutLoaded) return
    try {
      window.localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(workspaceLayout))
    } catch {
      // Layout remains usable when storage is blocked.
    }
  }, [workspaceLayout, workspaceLayoutLoaded])

  function resizeWorkspace(divider: WorkspaceDivider, delta: number, startValue: number) {
    const width = workspaceRef.current?.clientWidth || 1200
    const height = workspaceRef.current?.parentElement?.clientHeight || 700
    setWorkspaceLayout((current) => {
      if (divider === 'timeline') {
        const minimumTop = Math.max(280, Math.min(340, height * 0.45))
        const maximum = Math.min(700, Math.max(120, height - minimumTop - 18))
        return { ...current, timelineHeight: clamp(startValue - delta, 120, maximum), timelineCustomized: true }
      }
      const otherWidth = divider === 'library'
        ? (current.propertiesOpen ? current.propertiesWidth : 0)
        : (current.libraryOpen ? current.libraryWidth : 0)
      const maxWidth = Math.max(divider === 'library' ? 200 : 280, width - otherWidth - (current.previewOpen ? 480 : 320) - 24)
      const value = divider === 'library' ? startValue + delta : startValue - delta
      return divider === 'library'
        ? { ...current, libraryWidth: clamp(value, 200, Math.min(560, maxWidth)) }
        : { ...current, propertiesWidth: clamp(value, 280, Math.min(560, maxWidth)) }
    })
  }

  function beginWorkspaceResize(divider: WorkspaceDivider, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const displayedTimelineHeight = event.currentTarget.nextElementSibling?.getBoundingClientRect().height
    workspaceDragRef.current = {
      divider,
      startX: event.clientX,
      startY: event.clientY,
      startValue: divider === 'library' ? workspaceLayout.libraryWidth : divider === 'properties' ? workspaceLayout.propertiesWidth : displayedTimelineHeight || workspaceLayout.timelineHeight,
    }
  }

  function moveWorkspaceDivider(event: PointerEvent<HTMLDivElement>) {
    const drag = workspaceDragRef.current
    if (!drag) return
    resizeWorkspace(drag.divider, drag.divider === 'timeline' ? event.clientY - drag.startY : event.clientX - drag.startX, drag.startValue)
  }

  function endWorkspaceResize(event: PointerEvent<HTMLDivElement>) {
    workspaceDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function resizeWorkspaceWithKeyboard(divider: WorkspaceDivider, event: KeyboardEvent<HTMLDivElement>) {
    const horizontal = divider !== 'timeline'
    const increase = horizontal ? event.key === 'ArrowRight' : event.key === 'ArrowUp'
    const decrease = horizontal ? event.key === 'ArrowLeft' : event.key === 'ArrowDown'
    if (!increase && !decrease && event.key !== 'Home') return
    event.preventDefault()
    const displayedTimelineHeight = event.currentTarget.nextElementSibling?.getBoundingClientRect().height
    const startValue = divider === 'library' ? workspaceLayout.libraryWidth : divider === 'properties' ? workspaceLayout.propertiesWidth : displayedTimelineHeight || workspaceLayout.timelineHeight
    const step = event.shiftKey ? 40 : 10
    const target = event.key === 'Home' ? (divider === 'timeline' ? 120 : divider === 'library' ? 200 : 280) : startValue + (increase ? step : -step)
    resizeWorkspace(divider, divider === 'library' ? target - startValue : startValue - target, startValue)
  }

  function restoreWorkspaceLayout() {
    setWorkspaceLayout({ ...DEFAULT_WORKSPACE_LAYOUT })
    setWorkspaceFocus(null)
    workspaceFocusRestoreRef.current = null
    setMobileLibraryOpen(false)
  }

  function toggleWorkspaceFocus(target: 'preview' | 'timeline') {
    if (workspaceFocus === target) {
      const previous = workspaceFocusRestoreRef.current
      if (previous) setWorkspaceLayout((current) => ({ ...current, ...previous }))
      workspaceFocusRestoreRef.current = null
      setWorkspaceFocus(null)
      return
    }
    const height = workspaceRef.current?.parentElement?.clientHeight || 700
    if (!workspaceFocusRestoreRef.current) {
      workspaceFocusRestoreRef.current = {
        timelineHeight: workspaceLayout.timelineHeight,
        timelineCustomized: workspaceLayout.timelineCustomized,
        previewOpen: workspaceLayout.previewOpen,
        timelineOpen: workspaceLayout.timelineOpen,
      }
    }
    setWorkspaceFocus(target)
    setWorkspaceLayout((current) => ({
      ...current,
      previewOpen: true,
      timelineOpen: true,
      timelineCustomized: true,
      timelineHeight: target === 'preview' ? 140 : Math.min(700, Math.max(120, height - Math.max(280, Math.min(340, height * 0.45)) - 18)),
    }))
  }

  function setProjectSource(file: File, fallbackName: string) {
    const key = isDownloadMode ? projectNameStorageKey(file) : null
    const saved = key ? readSavedProjectName(key) : null
    const continuedName = projectStorageReady && (videoFile || photoSlides.length > 0) && projectName !== 'Novo vídeo' && projectName !== 'Fotos em vídeo' ? projectName : null
    const pendingName = projectNameKey === null && projectName !== 'Novo vídeo' && projectName !== 'Fotos em vídeo' ? projectName : null
    const name = continuedName || saved || pendingName || fallbackName
    setProjectNameKey(key)
    setProjectName(name)
    if (key && pendingName && !saved) {
      try {
        window.localStorage.setItem(key, pendingName)
      } catch {
        // Keep the pending title in memory when storage is unavailable.
      }
    }
  }

  function confirmProjectName() {
    const name = projectNameDraft.trim().slice(0, 80)
    if (name) {
      setProjectName(name)
      if (projectNameKey) {
        try {
          window.localStorage.setItem(projectNameKey, name)
        } catch {
          // The title remains in this editing session if storage is unavailable.
        }
      }
    }
    setIsRenamingProject(false)
  }

  function isRenderCurrent(operation: number) {
    return mountedRef.current && renderLockRef.current && renderOperationRef.current === operation
  }

  function assertRenderCurrent(operation: number) {
    if (!isRenderCurrent(operation)) throw new DOMException('Exportação cancelada.', 'AbortError')
  }

  function setRenderStage(stage: string, message?: string, operation?: number) {
    if (operation !== undefined && !isRenderCurrent(operation)) return
    renderStageRef.current = stage
    setRenderStageState(stage)
    if (message) setRenderMessage(message)
    console.info('[VideoEditor] Render stage:', stage)
  }

  function logRenderContext(stage: string, details: Record<string, unknown> = {}) {
    console.info('[VideoEditor] Render context:', {
      stage,
      ffmpegLoaded: Boolean(ffmpegRef.current?.loaded),
      video: videoFile
        ? {
            name: videoFile.name,
            type: videoFile.type,
            size: videoFile.size,
          }
        : null,
      audio: audioFile
        ? {
            name: audioFile.name,
            type: audioFile.type,
            size: audioFile.size,
          }
        : null,
      duration,
      filter,
      overlays: overlays.length,
      ...details,
    })
  }

  function clearVisualSelection() {
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActiveImageId(null)
    setActiveVideoOverlayId(null)
    draggingLayerRef.current = null
    pointerMovedRef.current = false
    pointerStartedOnOverlayRef.current = false
  }

  function openEditorPanel(panel: EditorPanel, keepVisualSelection = false) {
    if (panel !== 'audio') setActiveAudioClipId(null)
    if (panel === 'text' && hasEditorMedia && !activeOverlayId) {
      setIsToolSheetOpen(false)
      addTextOverlay()
      return
    }

    if (!keepVisualSelection) {
      clearVisualSelection()
    }

    setActivePanel(panel)
    setIsToolSheetOpen(panel !== 'text')
  }

  function selectTool(tool: EditorTool) {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches) setMobileLibraryOpen(true)
    if (activeTool === tool && isToolSheetOpen) {
      setIsToolSheetOpen(false)
      return
    }
    const panel: Record<EditorTool, EditorPanel> = {
      edit: 'add',
      sound: 'audio',
      text: 'text',
      effects: 'effects',
      stickers: 'sticker',
      transitions: 'transitions',
      captions: 'caption',
      adjust: 'adjust',
    }
    openEditorPanel(panel[tool], tool === 'text' || tool === 'stickers')
  }

  function restoreVisualSnapshot(snapshot: VisualSnapshot) {
    restoringVisualHistoryRef.current = true
    setOverlays(snapshot.overlays)
    setStickers(snapshot.stickers)
    setVisualLayerOrder(snapshot.visualLayerOrder || [])
    setImageOverlays((current) => current.map((image) => {
      const transform = snapshot.imageTransforms.find((item) => item.id === image.id)
      return transform ? { ...image, x: transform.x, y: transform.y, width: transform.width, height: transform.height, rotation: transform.rotation ?? 0 } : image
    }))
    setVideoOverlays((current) => current.map((video) => {
      const transform = snapshot.videoTransforms?.find((item) => item.id === video.id)
      return transform ? { ...video, x: transform.x, y: transform.y, width: transform.width, height: transform.height, rotation: transform.rotation ?? 0, startTime: transform.startTime, endTime: transform.endTime, trimStart: transform.trimStart, trimEnd: transform.trimEnd } : video
    }))
    setFilter(snapshot.filter)
    setColorAdjustments(snapshot.colorAdjustments || {})
    setVideoVolume(snapshot.videoVolume)
    setMusicVolume(snapshot.musicVolume)
  }

  function undoVisualChange() {
    const history = visualHistoryRef.current
    if (history.index <= 0) return
    history.index -= 1
    restoreVisualSnapshot(history.entries[history.index])
    setVisualHistoryPosition({ index: history.index, length: history.entries.length })
  }

  function redoVisualChange() {
    const history = visualHistoryRef.current
    if (history.index >= history.entries.length - 1) return
    history.index += 1
    restoreVisualSnapshot(history.entries[history.index])
    setVisualHistoryPosition({ index: history.index, length: history.entries.length })
  }

  useEffect(() => {
    if (restoringVisualHistoryRef.current) {
      restoringVisualHistoryRef.current = false
      return
    }
    if (visualGestureActiveRef.current) return
    const history = visualHistoryRef.current
    const snapshot = {
      overlays, stickers,
      imageTransforms: imageOverlays.map(({ id, x, y, width, height, rotation }) => ({ id, x, y, width, height, rotation: rotation || 0 })),
      videoTransforms: videoOverlays.map(({ id, x, y, width, height, rotation, startTime, endTime, trimStart, trimEnd, sourceDuration }) => ({ id, x, y, width, height, rotation: rotation || 0, startTime, endTime, trimStart, trimEnd, sourceDuration })),
      visualLayerOrder, filter, colorAdjustments, videoVolume, musicVolume,
    }
    if (history.index >= 0 && JSON.stringify(history.entries[history.index]) === JSON.stringify(snapshot)) return
    history.entries = [...history.entries.slice(0, history.index + 1), snapshot].slice(-30)
    history.index = history.entries.length - 1
    if (history.entries.length > 1) setVisualHistoryPosition({ index: history.index, length: history.entries.length })
  }, [overlays, stickers, imageOverlays, videoOverlays, visualLayerOrder, filter, colorAdjustments, videoVolume, musicVolume, visualHistoryRevision])

  function getDefaultLayerTiming() {
    const projectDuration = editorMode === 'photos' ? getPhotoSlidesDuration() : duration
    const safeDuration = Math.max(projectDuration, DEFAULT_VIDEO_DURATION)

    return { startTime: 0, endTime: safeDuration }
  }

  function getTimelineTotalDuration(slides = photoSlides) {
    const slidesDuration = getPhotoSlidesDuration(slides)
    return editorMode === 'video' && videoFile
      ? Math.max(baseVideoDuration, 0) + slidesDuration
      : slidesDuration
  }

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  useEffect(() => {
    return () => extraVideosRef.current.forEach((clip) => URL.revokeObjectURL(clip.previewUrl))
  }, [])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    return () => {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    }
  }, [voiceUrl])

  useEffect(() => {
    return () => {
      if (voiceRecorderRef.current?.state === 'recording') {
        voiceRecorderRef.current.stop()
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = Math.min(1, videoVolume * mixScale)
  }, [videoVolume, videoUrl, mixScale])

  useEffect(() => {
    videoOverlays.forEach((overlay) => {
      const element = videoOverlayElementsRef.current.get(overlay.id)
      if (!element || element.readyState < 1) return
      const sourceTime = videoOverlaySourceTime(overlay, currentTime)
      if (sourceTime === null) {
        element.pause()
        return
      }
      if (Math.abs(element.currentTime - sourceTime) > (isPlaying ? 0.18 : 0.03)) element.currentTime = sourceTime
      if (isPlaying) {
        if (element.paused) void element.play().catch(() => undefined)
      } else {
        element.pause()
      }
    })
  }, [videoOverlays, currentTime, isPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicGainAt(currentTime, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale })
  }, [musicVolume, audioUrl, currentTime, musicStartTime, musicTrimStart, musicTrimEnd, audioDuration, musicFadeIn, musicFadeOut, mixScale])

  useEffect(() => {
    if (voicePlaybackRef.current) voicePlaybackRef.current.volume = Math.min(1, voiceVolume * mixScale)
  }, [voiceVolume, voiceUrl, mixScale])

  useEffect(() => {
    if (!voiceBlob || !audioFile || musicVolumeTouched) return

    const timer = window.setTimeout(() => {
      setMusicVolume(0.45)
      setAudioMessage('Ajuste o volume para a narracao ficar clara.')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [audioFile, musicVolumeTouched, voiceBlob])

  const visualLayers = useMemo(() => orderVisualLayers<VisualLayer>([
    ...videoOverlays.map(({ id, startTime, endTime }) => ({ id, type: 'video' as const, startTime, endTime })),
    ...imageOverlays.map(({ id, startTime, endTime }) => ({ id, type: 'image' as const, startTime, endTime })),
    ...stickers.map(({ id, startTime, endTime }) => ({ id, type: 'sticker' as const, startTime, endTime })),
    ...overlays.map(({ id, startTime, endTime }) => ({ id, type: 'text' as const, startTime, endTime })),
  ], visualLayerOrder), [videoOverlays, imageOverlays, stickers, overlays, visualLayerOrder])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.textBaseline = 'top'

    const drawImageOverlay = (overlay: ImageOverlay) => {
        const image = imageElementsRef.current.get(overlay.id)
        if (!image || !image.complete) return

        context.save()
        context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
        context.rotate((overlay.rotation * Math.PI) / 180)
        context.drawImage(image, -overlay.width / 2, -overlay.height / 2, overlay.width, overlay.height)
        context.restore()

        if (overlay.id === activeImageId) {
          const handleSize = Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
          context.save()
          context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
          context.rotate((overlay.rotation * Math.PI) / 180)
          context.strokeStyle = 'rgba(251, 191, 36, 0.95)'
          context.lineWidth = 3
          context.setLineDash([10, 7])
          context.strokeRect(-overlay.width / 2 - 8, -overlay.height / 2 - 8, overlay.width + 16, overlay.height + 16)
          context.setLineDash([])
          context.fillStyle = 'rgba(251, 191, 36, 0.95)'
          context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          context.lineWidth = 2
          for (const corner of IMAGE_CORNERS) {
            const x = corner.endsWith('right') ? overlay.width / 2 : -overlay.width / 2
            const y = corner.startsWith('bottom') ? overlay.height / 2 : -overlay.height / 2
            context.fillStyle = 'rgba(251, 191, 36, 0.95)'
            context.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
            context.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
          }
          const rotationOffset = Math.max(18, handleSize * 1.4)
          context.beginPath()
          context.moveTo(0, -overlay.height / 2 - 8)
          context.lineTo(0, -overlay.height / 2 - rotationOffset)
          context.stroke()
          context.beginPath()
          context.arc(0, -overlay.height / 2 - rotationOffset, handleSize * 0.42, 0, Math.PI * 2)
          context.fill()
          context.stroke()
          context.restore()
        }
    }

    const drawVideoOverlay = (overlay: VideoOverlay) => {
        const video = videoOverlayElementsRef.current.get(overlay.id)
        if (video && video.readyState >= 2) {
          context.save()
          context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
          context.rotate((overlay.rotation * Math.PI) / 180)
          context.drawImage(video, -overlay.width / 2, -overlay.height / 2, overlay.width, overlay.height)
          context.restore()
        }
        if (overlay.id !== activeVideoOverlayId) return
        const handleSize = Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
        const rotationOffset = Math.max(18, handleSize * 1.4)
        context.save()
        context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
        context.rotate((overlay.rotation * Math.PI) / 180)
        context.strokeStyle = 'rgba(56, 189, 248, 0.95)'
        context.lineWidth = 3
        context.setLineDash([10, 7])
        context.strokeRect(-overlay.width / 2 - 8, -overlay.height / 2 - 8, overlay.width + 16, overlay.height + 16)
        context.setLineDash([])
        context.fillStyle = 'rgba(56, 189, 248, 0.95)'
        context.strokeStyle = 'white'
        for (const corner of IMAGE_CORNERS) {
          const x = corner.endsWith('right') ? overlay.width / 2 : -overlay.width / 2
          const y = corner.startsWith('bottom') ? overlay.height / 2 : -overlay.height / 2
          context.fillStyle = 'rgba(56, 189, 248, 0.95)'
          context.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
          context.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
        }
        context.beginPath()
        context.moveTo(0, -overlay.height / 2 - 8)
        context.lineTo(0, -overlay.height / 2 - rotationOffset)
        context.stroke()
        context.beginPath()
        context.arc(0, -overlay.height / 2 - rotationOffset, handleSize * 0.42, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.restore()
    }

    const drawSticker = (sticker: StickerOverlay) => {
        context.save()
        context.translate(sticker.x, sticker.y)
        context.rotate((sticker.rotation * Math.PI) / 180)
        context.globalAlpha = Math.min(Math.max(sticker.opacity ?? 1, 0.1), 1)
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = `800 ${sticker.size}px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Inter, sans-serif`
        const customImage = sticker.customAssetId ? customStickerImages[sticker.customAssetId] : null
        if (customImage) {
          const ratio = Math.min(sticker.size / customImage.naturalWidth, sticker.size / customImage.naturalHeight)
          const width = customImage.naturalWidth * ratio, height = customImage.naturalHeight * ratio
          context.drawImage(customImage, -width / 2, -height / 2, width, height)
        } else if (!sticker.customAssetId) context.fillText(stickerFrameAt(sticker, currentTime), 0, 0)

        if (sticker.id === activeStickerId) {
          const boxSize = sticker.size * 1.25
          const handleSize = Math.max(8, 20 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
          const rotationOffset = Math.max(18, handleSize * 1.4)
          context.globalAlpha = 1
          context.strokeStyle = 'rgba(217, 70, 239, 0.95)'
          context.lineWidth = 3
          context.setLineDash([9, 6])
          context.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize)
          context.setLineDash([])
          context.fillStyle = 'rgba(217, 70, 239, 0.95)'
          context.fillRect(boxSize / 2 - handleSize / 2, boxSize / 2 - handleSize / 2, handleSize, handleSize)
          context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          context.lineWidth = 2
          context.strokeRect(boxSize / 2 - handleSize / 2, boxSize / 2 - handleSize / 2, handleSize, handleSize)
          context.beginPath()
          context.moveTo(0, -boxSize / 2)
          context.lineTo(0, -boxSize / 2 - rotationOffset)
          context.stroke()
          context.beginPath()
          context.arc(0, -boxSize / 2 - rotationOffset, handleSize * 0.42, 0, Math.PI * 2)
          context.fill()
          context.stroke()
        }

        context.restore()
    }

    const drawText = (overlay: TextOverlay) => {
        const box = paintTextOverlay(context, overlay)
        if (overlay.id !== activeOverlayId) return
        const handleSize = Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
        const rotationOffset = Math.max(10, Math.min(18, canvas.height * 0.12))
        const center = imageCenter(box)
        const rotateY = textRotationHandleY({ ...box, rotation: overlay.rotation || 0 }, canvas, rotationOffset, handleSize * 0.42)
        context.save()
        context.translate(center.x, center.y)
        context.rotate(((overlay.rotation || 0) * Math.PI) / 180)
        context.strokeStyle = 'rgba(125, 211, 252, 0.95)'
        context.lineWidth = 3
        context.setLineDash([10, 7])
        context.strokeRect(-box.width / 2 - 2, -box.height / 2 - 2, box.width + 4, box.height + 4)
        context.setLineDash([])
        context.fillStyle = 'rgba(14, 165, 233, 0.95)'
        context.fillRect(box.width / 2 - handleSize / 2, box.height / 2 - handleSize / 2, handleSize, handleSize)
        context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        context.lineWidth = 2
        context.strokeRect(box.width / 2 - handleSize / 2, box.height / 2 - handleSize / 2, handleSize, handleSize)
        context.beginPath()
        context.moveTo(0, Math.sign(rotateY) * (box.height / 2 + 2))
        context.lineTo(0, rotateY)
        context.stroke()
        context.beginPath()
        context.arc(0, rotateY, handleSize * 0.42, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.restore()
    }

    for (const layer of visualLayers) {
      if (currentTime < layer.startTime || currentTime > layer.endTime) continue
      if (layer.type === 'image') {
        const image = imageOverlays.find((item) => item.id === layer.id)
        if (image) drawImageOverlay(image)
      } else if (layer.type === 'video') {
        const video = videoOverlays.find((item) => item.id === layer.id)
        if (video && videoOverlaySourceTime(video, currentTime) !== null) drawVideoOverlay(video)
      } else if (layer.type === 'sticker') {
        const sticker = stickers.find((item) => item.id === layer.id)
        if (sticker) drawSticker(sticker)
      } else {
        const text = overlays.find((item) => item.id === layer.id)
        if (text) drawText(text)
      }
    }
    // Selection controls live above every visual layer, including a PiP brought to the top.
    const selectedMedia = imageOverlays.find((item) => item.id === activeImageId && currentTime >= item.startTime && currentTime <= item.endTime)
      || videoOverlays.find((item) => item.id === activeVideoOverlayId && videoOverlaySourceTime(item, currentTime) !== null)
    if (selectedMedia) {
      const color = selectedMedia.id === activeImageId ? '#fbbf24' : '#38bdf8'
      const handleSize = Math.max(6, 20 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotationOffset = Math.max(18, handleSize * 1.4)
      context.save()
      context.translate(selectedMedia.x + selectedMedia.width / 2, selectedMedia.y + selectedMedia.height / 2)
      context.rotate(selectedMedia.rotation * Math.PI / 180)
      context.strokeStyle = color
      context.lineWidth = 3
      context.setLineDash([10, 7])
      context.strokeRect(-selectedMedia.width / 2 - 8, -selectedMedia.height / 2 - 8, selectedMedia.width + 16, selectedMedia.height + 16)
      context.setLineDash([])
      for (const corner of IMAGE_CORNERS) {
        const x = corner.endsWith('right') ? selectedMedia.width / 2 : -selectedMedia.width / 2
        const y = corner.startsWith('bottom') ? selectedMedia.height / 2 : -selectedMedia.height / 2
        context.fillStyle = color
        context.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
        context.strokeStyle = 'white'
        context.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
      }
      context.strokeStyle = color
      context.beginPath()
      context.moveTo(0, -selectedMedia.height / 2 - 8)
      context.lineTo(0, -selectedMedia.height / 2 - rotationOffset)
      context.stroke()
      context.fillStyle = color
      context.beginPath()
      context.arc(0, -selectedMedia.height / 2 - rotationOffset, handleSize * 0.42, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
    const selectedText = overlays.find((item) => item.id === activeOverlayId && currentTime >= item.startTime && currentTime <= item.endTime)
    if (selectedText) {
      const box = getOverlayTextBox(context, selectedText)
      const center = imageCenter(box)
      const handleSize = Math.max(6, 20 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotateY = textRotationHandleY({ ...box, rotation: selectedText.rotation || 0 }, canvas, Math.max(10, Math.min(18, canvas.height * 0.12)), handleSize * 0.42)
      context.save()
      context.translate(center.x, center.y)
      context.rotate((selectedText.rotation || 0) * Math.PI / 180)
      context.strokeStyle = '#7dd3fc'
      context.lineWidth = 3
      context.setLineDash([10, 7])
      context.strokeRect(-box.width / 2 - 2, -box.height / 2 - 2, box.width + 4, box.height + 4)
      context.setLineDash([])
      context.fillStyle = '#0ea5e9'
      context.fillRect(box.width / 2 - handleSize / 2, box.height / 2 - handleSize / 2, handleSize, handleSize)
      context.beginPath()
      context.arc(0, rotateY, handleSize * 0.42, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
    const selectedSticker = stickers.find((item) => item.id === activeStickerId && currentTime >= item.startTime && currentTime <= item.endTime)
    if (selectedSticker) {
      const size = selectedSticker.size * 1.25
      context.save()
      context.translate(selectedSticker.x, selectedSticker.y)
      context.rotate(selectedSticker.rotation * Math.PI / 180)
      context.strokeStyle = '#d946ef'
      context.lineWidth = 3
      context.setLineDash([9, 6])
      context.strokeRect(-size / 2, -size / 2, size, size)
      context.setLineDash([])
      context.fillStyle = '#d946ef'
      context.fillRect(size / 2 - 8, size / 2 - 8, 16, 16)
      context.restore()
    }
    if (alignmentGuide) {
      context.save()
      context.strokeStyle = 'rgba(125, 211, 252, 0.7)'
      context.lineWidth = Math.max(1, canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
      context.setLineDash([6, 6])
      if (alignmentGuide.x !== null) { context.beginPath(); context.moveTo(alignmentGuide.x, 0); context.lineTo(alignmentGuide.x, canvas.height); context.stroke() }
      if (alignmentGuide.y !== null) { context.beginPath(); context.moveTo(0, alignmentGuide.y); context.lineTo(canvas.width, alignmentGuide.y); context.stroke() }
      context.restore()
    }
  }, [imageOverlays, videoOverlays, stickers, overlays, visualLayers, currentTime, activeImageId, activeVideoOverlayId, activeStickerId, activeOverlayId, alignmentGuide, customStickerImages])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas, canvasSize, imageLoadVersion])

  useEffect(() => {
    imageOverlays.forEach((overlay) => {
      if (!overlay.url) return
      if (imageElementsRef.current.has(overlay.id)) return

      const image = new Image()
      image.onload = () => setImageLoadVersion((current) => current + 1)
      image.onerror = () => {
        URL.revokeObjectURL(overlay.url)
        imageElementsRef.current.delete(overlay.id)
        setMissingMediaRefs((current) => ({ ...current, [overlay.id]: current[overlay.id] || describeFile(overlay.id, overlay.file) }))
        setImageOverlays((current) => current.map((item) => item.id === overlay.id ? { ...item, url: '' } : item))
        if (activeImageId === overlay.id) setActiveImageId(null)
        setImageMessage('Não foi possível carregar esta imagem. A camada foi preservada; reassocie o arquivo original.')
      }
      image.src = overlay.url
      imageElementsRef.current.set(overlay.id, image)
    })

    Array.from(imageElementsRef.current.keys()).forEach((id) => {
      if (!imageOverlays.some((overlay) => overlay.id === id)) {
        imageElementsRef.current.delete(id)
      }
    })
  }, [imageOverlays, activeImageId])

  useEffect(() => {
    if (activeOverlayId && !overlays.some((overlay) => overlay.id === activeOverlayId)) {
      const timer = window.setTimeout(() => setActiveOverlayId(null), 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeOverlayId, overlays])

  useEffect(() => {
    if (activeStickerId && !stickers.some((sticker) => sticker.id === activeStickerId)) {
      const timer = window.setTimeout(() => setActiveStickerId(null), 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeStickerId, stickers])

  useEffect(() => {
    if (activeImageId && !imageOverlays.some((overlay) => overlay.id === activeImageId)) {
      const timer = window.setTimeout(() => setActiveImageId(null), 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeImageId, imageOverlays])

  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  function updateMediaImport(id: string, name: string, status: MediaImportEntry['status'], detail?: string) {
    setMediaImportEntries((current) => {
      const next = current.filter((entry) => entry.id !== id)
      return [...next, { id, name, status, detail }]
    })
  }

  function loadVideoFile(file: File, message = '') {
    setVideoAssetIds({})
    setVideoStorageWarning('')
    updateMediaImport('base-video', file.name, 'loading')
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    videoOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    videoOverlayElementsRef.current.forEach((element) => element.pause())
    videoOverlayElementsRef.current.clear()
    imageElementsRef.current.clear()

    setEditorMode('video')
    setAspectPreset('original')
    aspectPresetRef.current = 'original'
    setFrameMode('fit')
    setOriginalCanvasSize({ width: 1280, height: 720 })
    setCanvasSize({ width: 1280, height: 720 })
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setVideoName(file.name)
    setProjectSource(file, file.name.replace(/\.[^.]+$/, '') || 'Novo vídeo')
    setBaseVideoDuration(DEFAULT_VIDEO_DURATION)
    extraVideos.forEach((clip) => URL.revokeObjectURL(clip.previewUrl))
    setExtraVideos([])
    setSequenceOrder(['base-video'])
    setExcludedClipIds([])
    setBaseTrim({ trimStart: 0, trimEnd: DEFAULT_VIDEO_DURATION })
    setClipTransitions({})
    setJunctionTransitions({})
    setActiveClipId('base-video')
    setOverlays([])
    setActiveOverlayId(null)
    setStickers([])
    setActiveStickerId(null)
    setImageOverlays([])
    setVisualLayerOrder([])
    setActiveImageId(null)
    setVideoOverlays([])
    setActiveVideoOverlayId(null)
    photoSlides.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
    extraVideos.forEach((clip) => URL.revokeObjectURL(clip.previewUrl))
    setPhotoSlides([])
    setExtraVideos([])
    setActivePhotoId(null)
    setImageMessage('')
    setPhotoMessage('')
    setCompressionStats(null)
    setRenderMessage('')
    setIsPlaying(false)
    setCurrentTime(0)
    audioRef.current?.pause()
    voicePlaybackRef.current?.pause()
    if (audioRef.current) audioRef.current.currentTime = musicTrimStart
    if (voicePlaybackRef.current) voicePlaybackRef.current.currentTime = 0
    setActivePanel('add')
    setIsToolSheetOpen(false)
    setLocalDraftMessage(message)
  }

  async function importVideoFiles(files: File[]) {
    if (files.length === 0) return
    const newProject = !videoFile && photoSlides.length === 0
    if (newProject) loadVideoFile(files.shift()!)
    const additions = await Promise.all(files.map(async (file) => {
      const id = crypto.randomUUID()
      updateMediaImport(id, file.name, 'loading')
      let previewUrl = ''
      try {
        previewUrl = URL.createObjectURL(file)
        const sourceDuration = (await readVideoMetadata(previewUrl)).duration
        updateMediaImport(id, file.name, 'ready')
        return { id, file, previewUrl, sourceDuration, trimStart: 0, trimEnd: sourceDuration }
      } catch {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        updateMediaImport(id, file.name, 'error', 'Falha ao ler ou decodificar o vídeo.')
        return null
      }
    }))
    const readyAdditions = additions.filter((clip): clip is NonNullable<typeof clip> => clip !== null)
    if (readyAdditions.length > 0) {
      setEditorMode('video')
      setExtraVideos((current) => [...current, ...readyAdditions])
      setSequenceOrder((current) => [...current, ...readyAdditions.map((clip) => clip.id)])
      setPhotoMessage(`${readyAdditions.length} vídeo(s) adicionado(s) à sequência.`)
    }
  }

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    void importVideoFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  function importPhotoSlides(files: File[], hasImportedVideo = false) {
    if (files.length === 0) return

    setPhotoMessage('')

    const availableSlots = Math.max(MAX_PHOTO_SLIDES - photoSlides.length, 0)
    if (availableSlots <= 0) {
      files.forEach((file) => updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', `Limite de ${MAX_PHOTO_SLIDES} fotos atingido.`))
      setPhotoMessage(`Use no maximo ${MAX_PHOTO_SLIDES} fotos neste modo.`)
      return
    }

    const acceptedSlides: PhotoSlide[] = []

    for (const file of files.slice(0, availableSlots)) {
      if (!RENDERABLE_IMAGE_TYPES.includes(file.type)) {
        updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'Use PNG ou JPG para clipes de foto.')
        setPhotoMessage('Fotos em video aceitam PNG ou JPG neste MVP.')
        continue
      }

      if (file.size > MAX_PHOTO_SLIDE_SIZE_BYTES) {
        updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'A foto precisa ter até 8 MB.')
        setPhotoMessage('Cada foto precisa ter ate 8 MB.')
        continue
      }

      const id = crypto.randomUUID()
      let previewUrl = ''
      try {
        previewUrl = URL.createObjectURL(file)
      } catch {
        updateMediaImport(id, file.name, 'error', 'Falha ao importar o arquivo.')
        continue
      }
      updateMediaImport(id, file.name, 'loading')
      const probe = new Image()
      const firstStandalonePhoto = !hasImportedVideo && !videoFile && extraVideos.length === 0 && photoSlides.length === 0 && acceptedSlides.length === 0
      const failPhoto = () => {
        URL.revokeObjectURL(previewUrl)
        setPhotoSlides((current) => current.filter((slide) => slide.id !== id))
        setSequenceOrder((current) => current.filter((clipId) => clipId !== id))
        updateMediaImport(id, file.name, 'error', 'Falha ao ler ou decodificar a foto.')
      }
      probe.onload = () => { void probe.decode().then(() => {
        if (firstStandalonePhoto) {
          const scale = Math.min(1, 1280 / Math.max(probe.naturalWidth, probe.naturalHeight))
          const original = { width: Math.max(2, Math.round(probe.naturalWidth * scale / 2) * 2), height: Math.max(2, Math.round(probe.naturalHeight * scale / 2) * 2) }
          setOriginalCanvasSize(original)
          if (aspectPresetRef.current === 'original') setCanvasSize(original)
        }
        updateMediaImport(id, file.name, 'ready')
        void storePhotoAsset(projectId, file).then((assetId) => {
          if (!mountedRef.current) return
          setPhotoSlides((current) => current.map((slide) => slide.file === file ? { ...slide, assetId } : slide))
        }).catch(() => {
          if (mountedRef.current) setPhotoStorageWarning('Não foi possível guardar uma foto neste navegador. Ela poderá precisar de reassociação após reabrir; verifique o espaço disponível.')
        })
      }).catch(failPhoto) }
      probe.onerror = failPhoto
      probe.src = previewUrl
      acceptedSlides.push({
        id,
        file,
        previewUrl,
        duration: DEFAULT_PHOTO_DURATION,
        order: photoSlides.length + acceptedSlides.length,
      })
    }

    if (files.length > availableSlots) {
      files.slice(availableSlots).forEach((file) => updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', `Limite de ${MAX_PHOTO_SLIDES} fotos atingido.`))
      setPhotoMessage(`Foram adicionadas ${availableSlots} fotos. O limite inicial e ${MAX_PHOTO_SLIDES}.`)
    }

    if (acceptedSlides.length > 0) {
      if (videoRef.current) videoRef.current.pause()
      setIsPlaying(false)
      const hasBaseVideo = hasImportedVideo || (editorMode === 'video' && Boolean(videoFile || extraVideos.length > 0))

      if (!hasBaseVideo) {
        setEditorMode('photos')
        if (projectNameKey === null) setProjectSource(acceptedSlides[0].file, 'Fotos em vídeo')
        setVideoFile(null)
        if (videoUrl) URL.revokeObjectURL(videoUrl)
        setVideoUrl('')
        setVideoName('')
        setBaseVideoDuration(0)
        setOverlays([])
        setActiveOverlayId(null)
        setStickers([])
        setActiveStickerId(null)
        setVisualLayerOrder([])
        setImageOverlays((current) => {
          current.forEach((overlay) => URL.revokeObjectURL(overlay.url))
          return []
        })
        imageElementsRef.current.clear()
        setActiveImageId(null)
        setOriginalCanvasSize({ width: PHOTO_VIDEO_WIDTH, height: PHOTO_VIDEO_HEIGHT })
        setCanvasSize(projectCanvasSize(aspectPresetRef.current, { width: PHOTO_VIDEO_WIDTH, height: PHOTO_VIDEO_HEIGHT }))
        setCurrentTime(0)
      } else {
        setPhotoMessage('Foto adicionada como clipe da sequencia.')
      }

      setPhotoSlides((current) => {
        const nextSlides = [...current, ...acceptedSlides]
        setDuration(hasBaseVideo ? getTimelineTotalDuration(nextSlides) : getPhotoSlidesDuration(nextSlides))
        return nextSlides
      })
      setSequenceOrder((current) => [...current, ...acceptedSlides.map((slide) => slide.id)])
      setActivePhotoId((current) => current || acceptedSlides[0]?.id || null)
    }

  }

  function handlePhotoSlidesChange(event: ChangeEvent<HTMLInputElement>) {
    importPhotoSlides(Array.from(event.target.files || []))
    event.target.value = ''
  }

  function selectAdditionalAudio(id: string) {
    setActiveClipId(null)
    clearVisualSelection()
    setActiveAudioClipId(id)
    openEditorPanel('audio', true)
  }

  async function libraryOperation(task: (operation: number) => Promise<void>) {
    if (!projectStorageReady || audioClipImportBusyRef.current || isRendering) return
    const operation = audioClipsOperationRef.current
    audioClipImportBusyRef.current = true; setAudioClipBusy(true); setAudioClipMessage('')
    try { await task(operation) }
    catch (error) {
      if (mountedRef.current && audioClipsOperationRef.current === operation) setAudioClipMessage(error instanceof Error ? error.message : 'Não foi possível acessar o áudio.')
    } finally {
      if (audioClipsOperationRef.current === operation) { audioClipImportBusyRef.current = false; if (mountedRef.current) setAudioClipBusy(false) }
    }
  }

  async function importLibraryFiles(files: File[], category: AudioCategory) {
    if (!files.length) return
    await libraryOperation(async (operation) => {
      const library = [...audioLibrary], updated: LocalLibraryAsset[] = []
      for (const file of files) {
        const duration = await decodeAudioClip(file)
        if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
        const asset = await storeLibraryAsset(projectId, file, duration, category, library)
        if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
        for (let i = 0; i < library.length; i++) if (library[i].assetId === asset.assetId) library[i] = { ...library[i], file: asset.file }
        const index = library.findIndex((item) => item.assetId === asset.assetId && item.category === category)
        if (index >= 0) library[index] = asset
        else { if (library.length >= MAX_LIBRARY_ASSETS) throw new Error('Limite de 100 itens na biblioteca.'); library.push(asset) }
        updated.push(asset)
      }
      setAudioLibrary(library)
      setAudioClips((current) => current.map((clip) => {
        const asset = updated.find((item) => item.assetId === clip.assetId)
        return asset?.file ? { ...clip, file: asset.file } : clip
      }))
      setAudioClipMessage('Áudio salvo na biblioteca deste projeto.')
    })
  }

  async function addLibraryAsset(asset: LocalLibraryAsset) {
    if (audioClips.length >= MAX_AUDIO_CLIPS) { setAudioClipMessage(`Limite de ${MAX_AUDIO_CLIPS} faixas adicionais por projeto.`); return }
    await libraryOperation(async (operation) => {
      let duration: number
      try {
        if (!asset.file || !await verifyLibraryFile(asset)) throw new Error('Arquivo ausente ou alterado. Reassocie o áudio.')
        duration = await decodeAudioClip(asset.file)
      } catch {
        if (mountedRef.current && audioClipsOperationRef.current === operation) {
          setAudioLibrary((current) => current.map((item) => item.assetId === asset.assetId ? { ...item, file: null } : item))
          setAudioClips((current) => current.map((clip) => clip.assetId === asset.assetId ? { ...clip, file: null } : clip))
        }
        throw new Error('Arquivo ausente ou inválido. Reassocie o áudio.')
      }
      if (Math.abs(duration - asset.duration) > 0.25) throw new Error('A duração do áudio não corresponde ao arquivo salvo.')
      if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
      const id = `audio-${crypto.randomUUID()}`
      setAudioClips((current) => [...current, { id, assetId: asset.assetId, file: asset.file, media: { ...asset.media, id }, sourceDuration: asset.duration, startTime: 0, trimStart: 0, trimEnd: asset.duration, volume: 0.45, muted: false }])
      selectAdditionalAudio(id)
      setAudioClipMessage('Áudio adicionado à timeline.')
    })
  }

  async function reassociateLibraryAsset(asset: LocalLibraryAsset, file: File) {
    await libraryOperation(async (operation) => {
      const duration = await decodeAudioClip(file)
      if (!matchesProjectMedia(asset.media, file, { duration }) || !await verifyLibraryFile({ ...asset, file })) throw new Error('O arquivo não corresponde ao áudio salvo.')
      if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
      await saveMusicAsset(projectId, asset.assetId, file)
      if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
      setAudioLibrary((current) => current.map((item) => item.assetId === asset.assetId ? { ...item, file } : item))
      setAudioClips((current) => current.map((clip) => clip.assetId === asset.assetId ? { ...clip, file } : clip))
      if (musicAssetId === asset.assetId && missingMediaRefs['audio-track']) {
        setAudioFile(file); setAudioUrl(URL.createObjectURL(file))
        setMissingMediaRefs((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'audio-track')))
      }
      setAudioClipMessage('Áudio reassociado.')
    })
  }

  async function importAdditionalAudio(files: File[]) {
    if (!files.length || !projectStorageReady || audioClipImportBusyRef.current || isRendering) return
    if (files.length + audioClips.length > MAX_AUDIO_CLIPS) { setAudioClipMessage(`Limite de ${MAX_AUDIO_CLIPS} faixas adicionais por projeto.`); return }
    const operation = audioClipsOperationRef.current
    audioClipImportBusyRef.current = true
    setAudioClipBusy(true)
    setAudioClipMessage('Validando e salvando áudio...')
    try {
      const additions: LocalAudioClip[] = []
      const library = [...audioLibrary]
      for (const file of files) {
        const sourceDuration = await decodeAudioClip(file)
        if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
        const asset = await storeLibraryAsset(projectId, file, sourceDuration, 'music', library)
        if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
        for (let i = 0; i < library.length; i++) if (library[i].assetId === asset.assetId) library[i] = { ...library[i], file: asset.file }
        const existing = library.findIndex((item) => item.assetId === asset.assetId && item.category === asset.category)
        if (existing < 0) {
          if (library.length >= MAX_LIBRARY_ASSETS) throw new Error('Limite de 100 itens na biblioteca.')
          library.push(asset)
        } else library[existing] = asset
        const id = `audio-${crypto.randomUUID()}`
        additions.push({ id, assetId: asset.assetId, file: asset.file, media: { ...asset.media, id }, sourceDuration: asset.duration, startTime: 0, trimStart: 0, trimEnd: asset.duration, volume: 0.45, muted: false })
      }
      setAudioClips((current) => [...current.map((clip) => {
        const asset = additions.find((item) => item.assetId === clip.assetId)
        return asset?.file ? { ...clip, file: asset.file } : clip
      }), ...additions])
      setAudioLibrary(library)
      setActiveAudioClipId(additions[0]?.id || null)
      setAudioClipMessage(`${additions.length} faixa(s) salva(s) neste navegador.`)
    } catch (error) {
      if (mountedRef.current && audioClipsOperationRef.current === operation) setAudioClipMessage(error instanceof Error ? error.message : 'Não foi possível salvar as faixas de áudio.')
    } finally {
      if (audioClipsOperationRef.current === operation) { audioClipImportBusyRef.current = false; if (mountedRef.current) setAudioClipBusy(false) }
    }
  }

  async function reassociateAudioClip(id: string, file: File) {
    const clip = audioClips.find((item) => item.id === id)
    if (!clip || audioClipImportBusyRef.current || isRendering) return
    const operation = audioClipsOperationRef.current
    audioClipImportBusyRef.current = true; setAudioClipBusy(true)
    try {
      const observedDuration = await decodeAudioClip(file)
      if (!matchesProjectMedia(clip.media, file, { duration: observedDuration })) throw new Error('O arquivo não corresponde ao áudio salvo.')
      if (!await verifyLibraryFile({ source: 'local', category: 'music', assetId: clip.assetId, media: { ...clip.media, id: clip.assetId }, duration: clip.sourceDuration, file })) throw new Error('O conteúdo do arquivo não corresponde ao áudio salvo.')
      if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
      await saveMusicAsset(projectId, clip.assetId, file)
      if (!mountedRef.current || audioClipsOperationRef.current !== operation) return
      setAudioClips((current) => current.map((item) => item.assetId === clip.assetId ? { ...item, file } : item))
      setAudioLibrary((current) => current.map((item) => item.assetId === clip.assetId ? { ...item, file } : item))
      setAudioClipMessage('Áudio reassociado.')
    } catch (error) {
      if (mountedRef.current && audioClipsOperationRef.current === operation) setAudioClipMessage(error instanceof Error ? error.message : 'Falha ao reassociar áudio.')
    } finally {
      if (audioClipsOperationRef.current === operation) { audioClipImportBusyRef.current = false; if (mountedRef.current) setAudioClipBusy(false) }
    }
  }

  async function importAudioFile(file: File | undefined, track?: EditorMusicTrack) {
    if (!file) return
    const operation = ++musicImportOperationRef.current
    let nextUrl = ''
    try {
      if (!projectId || !projectStorageReady) throw new Error('Aguarde o projeto carregar.')
      if (!/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name) || !file.type.startsWith('audio/')) throw new Error('Use MP3, WAV, M4A, AAC ou OGG compatível.')
      if (!file.size || file.size > MAX_MUSIC_BYTES) throw new Error('Use um áudio de até 25 MB.')
      nextUrl = URL.createObjectURL(file)
      const probe = new Audio()
      const duration = await new Promise<number>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve(probe.duration)
        probe.onerror = () => reject(new Error('Áudio inválido ou não suportado.'))
        probe.src = nextUrl
      })
      if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('A duração deve ser de até 10 minutos.')
      const context = new AudioContext()
      try {
        const decoded = await context.decodeAudioData(await file.arrayBuffer())
        if (!decoded.numberOfChannels || !decoded.length || !Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 600) throw new Error('O arquivo não contém áudio válido.')
      } finally { await context.close() }
      if (!mountedRef.current || musicImportOperationRef.current !== operation) return
      const assetId = crypto.randomUUID()
      await saveMusicAsset(projectId, assetId, file)
      if (!mountedRef.current || musicImportOperationRef.current !== operation) return
      audioRef.current?.pause()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioFile(file); setAudioUrl(nextUrl); nextUrl = ''
      setAudioName(track?.title || file.name); setMusicAssetId(assetId)
      if (!track && /\.(mp3|wav)$/i.test(file.name)) setAudioLibrary((current) => current.length < MAX_LIBRARY_ASSETS && !current.some((item) => item.assetId === assetId)
        ? [...current, { source: 'local', category: 'music', assetId, media: describeFile(assetId, file, { duration }), duration, file }] : current)
      setSelectedMusicId(track?.id || null); setAudioDuration(duration)
      setMusicStartTime(0); setMusicTrimStart(0); setMusicTrimEnd(0)
      setMusicFadeIn(0); setMusicFadeOut(0)
      setMissingMediaRefs((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'audio-track')))
      updateMediaImport('audio-track', file.name, 'ready')
      setAudioMessage('Música salva neste navegador.')
    } catch (error) {
      if (mountedRef.current && musicImportOperationRef.current === operation) setAudioMessage(error instanceof Error ? error.message : 'Não foi possível importar ou salvar o áudio.')
    } finally { if (nextUrl) URL.revokeObjectURL(nextUrl) }
  }

  function handleAudioChange(event: ChangeEvent<HTMLInputElement>) {
    void importAudioFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleUseLibraryTrack(file: File, track: EditorMusicTrack) {
    void importAudioFile(file, track)
  }

  function importImageOverlay(file: File | undefined) {
    if (!file) return

    setImageMessage('')

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'Use PNG, JPG ou WebP.')
      setImageMessage('Use uma imagem PNG, JPG ou WebP.')
      return
    }

    if (file.size > MAX_IMAGE_OVERLAY_SIZE_BYTES) {
      updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'A imagem precisa ter até 5 MB.')
      setImageMessage('Use uma imagem menor que 5 MB.')
      return
    }

    let imageUrl = ''
    try {
      imageUrl = URL.createObjectURL(file)
    } catch {
      updateMediaImport(crypto.randomUUID(), file.name, 'error', 'Falha ao importar a imagem.')
      return
    }
    const initialWidth = Math.min(canvasSize.width * 0.34, 320)
    const initialHeight = Math.min(canvasSize.height * 0.34, 320)
    const timing = getDefaultLayerTiming()
    const overlay: ImageOverlay = {
      id: crypto.randomUUID(),
      file,
      url: imageUrl,
      name: file.name,
      x: (canvasSize.width - initialWidth) / 2,
      y: (canvasSize.height - initialHeight) / 2,
      width: initialWidth,
      height: initialHeight,
      rotation: 0,
      startTime: timing.startTime,
      endTime: timing.endTime,
    }
    updateMediaImport(overlay.id, file.name, 'loading')

    const image = new Image()
    image.onload = () => {
      void image.decode().then(() => updateMediaImport(overlay.id, file.name, 'ready')).catch(() => {
        updateMediaImport(overlay.id, file.name, 'error', 'Falha ao decodificar a imagem.')
        setImageOverlays((current) => current.filter((item) => item.id !== overlay.id))
        URL.revokeObjectURL(imageUrl)
      })
      const aspectRatio = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1

      setImageOverlays((current) => current.map((item) => {
        if (item.id !== overlay.id) return item
        const width = Math.min(item.width, canvasSize.width, canvasSize.height * aspectRatio)
        const height = width / aspectRatio
        return { ...item, width, height, x: (canvasSize.width - width) / 2, y: (canvasSize.height - height) / 2 }
      }))
    }
    image.onerror = () => {
      updateMediaImport(overlay.id, file.name, 'error', 'Falha ao ler a imagem.')
      URL.revokeObjectURL(imageUrl)
      imageElementsRef.current.delete(overlay.id)
      setImageOverlays((current) => current.filter((item) => item.id !== overlay.id))
      setActiveImageId((current) => (current === overlay.id ? null : current))
      setImageMessage('Nao foi possivel carregar esta imagem. Use PNG ou JPG para garantir imagem no video final.')
    }
    image.src = imageUrl
    imageElementsRef.current.set(overlay.id, image)

    setImageOverlays((current) => [...current, overlay])
    setActiveImageId(overlay.id)
    setActiveVideoOverlayId(null)
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActivePanel('image')
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    importImageOverlay(event.target.files?.[0])
    event.target.value = ''
  }

  async function importVideoOverlay(file: File | undefined) {
    if (!file || !videoFile) return
    if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
      setImageMessage('Use MP4, WebM, MOV ou M4V para o vídeo sobreposto.')
      return
    }
    if (file.size > HEAVY_VIDEO_SIZE_BYTES || videoOverlays.length >= MAX_VIDEO_OVERLAYS) {
      setImageMessage(`O vídeo sobreposto deve ter até 30 MB; máximo de ${MAX_VIDEO_OVERLAYS} camadas.`)
      return
    }
    const url = URL.createObjectURL(file)
    const id = crypto.randomUUID()
    updateMediaImport(id, file.name, 'loading')
    try {
      const metadata = await readVideoMetadata(url)
      const startTime = currentTime + MIN_TIMELINE_ITEM_DURATION < timelineDuration ? currentTime : 0
      const windowDuration = Math.min(metadata.duration, timelineDuration - startTime)
      if (windowDuration < MIN_TIMELINE_ITEM_DURATION) throw new Error('Vídeo curto demais para a camada.')
      const aspect = metadata.width / metadata.height
      const width = Math.min(canvasSize.width * 0.38, canvasSize.height * 0.38 * aspect)
      const height = width / aspect
      const overlay: VideoOverlay = {
        id, file, url, name: file.name,
        x: (canvasSize.width - width) / 2, y: (canvasSize.height - height) / 2,
        width, height, rotation: 0, sourceDuration: metadata.duration,
        trimStart: 0, trimEnd: windowDuration, startTime, endTime: startTime + windowDuration,
      }
      setVideoOverlays((current) => [...current, overlay])
      setActiveVideoOverlayId(id)
      setActiveImageId(null)
      setActiveOverlayId(null)
      setActiveStickerId(null)
      setActivePanel('add')
      updateMediaImport(id, file.name, 'ready')
      setImageMessage('')
    } catch {
      URL.revokeObjectURL(url)
      updateMediaImport(id, file.name, 'error', 'Não foi possível ler o vídeo sobreposto.')
      setImageMessage('Não foi possível ler o vídeo sobreposto.')
    }
  }

  function handleVideoOverlayChange(event: ChangeEvent<HTMLInputElement>) {
    void importVideoOverlay(event.target.files?.[0])
    event.target.value = ''
  }

  function handleUnifiedImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    const videos = files.filter((file) => ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(file.type))
    const photos = files.filter((file) => RENDERABLE_IMAGE_TYPES.includes(file.type))
    const webpImages = files.filter((file) => file.type === 'image/webp')
    const audios = files.filter((file) => file.type.startsWith('audio/'))
    if (videos.length > 0) void importVideoFiles(videos)
    if (photos.length > 0) importPhotoSlides(photos, videos.length > 0)
    if (webpImages.length > 0) importImageOverlay(webpImages[0])
    webpImages.slice(1).forEach((file) => updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'Importe uma sobreposição WebP por vez.'))
    if (audios.length > 0) void importAudioFile(audios[0])
    if (audios.length > 1) {
      audios.slice(1).forEach((file) => updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'A timeline aceita uma música por vez.'))
      setAudioMessage('A timeline aceita uma música de cada vez; a primeira faixa foi adicionada.')
    }
    const accepted = new Set([...videos, ...photos, ...webpImages, ...audios])
    files.filter((file) => !accepted.has(file)).forEach((file) => updateMediaImport(crypto.randomUUID(), file.name, 'unsupported', 'Formato não suportado pelo editor.'))
    if (accepted.size < files.length) setPhotoMessage('Alguns arquivos não são compatíveis com este editor.')
  }

  function removeAudioTrack() {
    musicImportOperationRef.current++
    setMusicAssetId(undefined)
    setMusicFadeIn(0)
    setMusicFadeOut(0)
    const audio = audioRef.current

    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioFile(null)
    setAudioUrl('')
    setAudioName('')
    setSelectedMusicId(null)
    setAudioDuration(0)
    setMusicStartTime(0)
    setMusicTrimStart(0)

    setMusicTrimEnd(0)
    setAudioMessage('')
    setMusicVolumeTouched(false)
    console.info('[VideoEditor] Music track removed')
  }

  function playMusicPreview() {
    if (!audioUrl) return

    if (videoRef.current) {
      setAudioMessage('Tocando musica junto com o video.')
      void startPreviewPlayback()
      return
    }

    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.volume = Math.min(1, musicVolume * mixScale)
    audio.play().catch((error) => {
      console.warn('[VideoEditor] Music preview failed:', error)
      setAudioMessage('Nao foi possivel tocar a previa desta musica.')
    })
  }

  async function startVoiceRecording() {
    setVoiceMessage('')
    voicePlaybackRef.current?.pause()
    voicePreviewRef.current?.pause()

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setVoiceMessage('Este navegador nao suporta gravacao de voz.')
      console.info('[VideoEditor] MediaRecorder support:', false)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceMessage('Este navegador nao permite acesso ao microfone aqui.')
      console.info('[VideoEditor] getUserMedia support:', false)
      return
    }

    console.info('[VideoEditor] MediaRecorder support:', true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      voiceChunksRef.current = []
      voiceStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceStartedAtRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        const nextUrl = URL.createObjectURL(blob)
        const nextDuration = Math.max((Date.now() - voiceStartedAtRef.current) / 1000, 0.1)

        if (voiceUrl) URL.revokeObjectURL(voiceUrl)
        setVoiceBlob(blob)
        setVoiceUrl(nextUrl)
        setVoiceDuration(nextDuration)
        setVoiceStartTime(0)
        setVoiceMessage('Voz pronta')
        if (audioFile && !musicVolumeTouched) {
          setMusicVolume(0.45)
          setAudioMessage('Ajuste o volume para a narracao ficar clara.')
        }
        setIsRecordingVoice(false)
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
        voiceStreamRef.current = null
        console.info('[VideoEditor] Voice recording done:', {
          duration: nextDuration,
          size: blob.size,
          type: blob.type,
        })
      }

      recorder.start()
      setIsRecordingVoice(true)
      setVoiceMessage('Gravando...')
    } catch (error) {
      console.warn('[VideoEditor] Voice recording failed:', error)
      setIsRecordingVoice(false)
      setVoiceMessage('Permissao de microfone negada.')
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      voiceStreamRef.current = null
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    recorder.stop()
  }

  function playVoicePreview() {
    if (!voiceUrl) return

    if (videoRef.current) {
      setVoiceMessage('Tocando voz junto com o video.')
      void startPreviewPlayback()
      return
    }

    if (!voicePreviewRef.current) return
    voicePreviewRef.current.currentTime = 0
    voicePreviewRef.current.play().catch((error) => {
      console.warn('[VideoEditor] Voice preview failed:', error)
      setVoiceMessage('Nao foi possivel tocar a previa da voz.')
    })
  }

  function removeVoiceRecording() {
    voicePlaybackRef.current?.pause()
    voicePreviewRef.current?.pause()
    if (voicePlaybackRef.current) voicePlaybackRef.current.currentTime = 0
    if (voicePreviewRef.current) voicePreviewRef.current.currentTime = 0
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    setVoiceBlob(null)
    setVoiceUrl('')
    setVoiceDuration(0)
    setVoiceStartTime(0)
    setVoiceVolume(1)
    setVoiceMessage('')
    console.info('[VideoEditor] Voice track removed')
  }

  function clearEditorProject() {
    audioClipsOperationRef.current++
    audioClipImportBusyRef.current = false
    setAudioClipBusy(false)
    setAudioClips([])
    setAudioLibrary([])
    setActiveAudioClipId(null)
    setAudioClipMessage('')
    setMusicPreviousVolume(0.45)
    musicImportOperationRef.current++
    setMusicAssetId(undefined)
    setMusicFadeIn(0)
    setMusicFadeOut(0)
    customStickerOperationRef.current++
    setCustomStickerPending(null)
    setCustomStickerMessage('')
    visualHistoryRef.current = { entries: [], index: -1 }
    restoringVisualHistoryRef.current = false
    setVisualHistoryPosition({ index: 0, length: 1 })
    videoRef.current?.pause()
    audioRef.current?.pause()
    voicePlaybackRef.current?.pause()
    voicePreviewRef.current?.pause()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    videoOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    videoOverlayElementsRef.current.forEach((element) => element.pause())
    videoOverlayElementsRef.current.clear()
    photoSlides.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
    extraVideos.forEach((clip) => URL.revokeObjectURL(clip.previewUrl))
    imageElementsRef.current.clear()

    setEditorMode('video')
    setAspectPreset('original')
    aspectPresetRef.current = 'original'
    setFrameMode('fit')
    setOriginalCanvasSize({ width: 1280, height: 720 })
    setCanvasSize({ width: 1280, height: 720 })
    setVideoFile(null)
    setVideoUrl('')
    setVideoName('')
    setProjectName('Novo vídeo')
    setProjectNameKey(null)
    setIsRenamingProject(false)
    setAudioFile(null)
    setAudioUrl('')
    setAudioName('')
    setSelectedMusicId(null)
    setVoiceBlob(null)
    setVoiceUrl('')
    setVoiceDuration(0)
    setVoiceStartTime(0)
    setVoiceVolume(1)
    setVoiceMessage('')
    setMusicStartTime(0)
    setMusicTrimStart(0)

    setMusicTrimEnd(0)
    setAudioDuration(0)
    setOverlays([])
    setActiveOverlayId(null)
    setImageOverlays([])
    setActiveImageId(null)
    setVideoOverlays([])
    setActiveVideoOverlayId(null)
    setVisualLayerOrder([])
    setPhotoSlides([])
    setExtraVideos([])
    setSequenceOrder([])
    setBaseTrim({ trimStart: 0, trimEnd: DEFAULT_VIDEO_DURATION })
    setClipTransitions({})
    setJunctionTransitions({})
    setActiveClipId(null)
    setActivePhotoId(null)
    setPhotoTransition('fade')
    setPhotoMessage('')
    setImageMessage('')
    setCaption('')
    setSubtitles([])
    setActiveSubtitleId(null)
    setTextValue('')
    setCompressionStats(null)
    setIsPublishStepOpen(false)
    setRenderProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setActivePanel('text')
  }

  function startNewProject(confirmed = false) {
    if (!confirmed && !window.confirm('Criar um novo projeto neste navegador? A edição atual salva será substituída.')) return false
    if (autoSaveRef.current?.flush() === false) {
      setProjectStorageError('A edição atual não foi salva. Resolva o erro antes de criar outro projeto.')
      return false
    }
    clearEditorProject()
    setStickers([])
    setFilter('normal')
    setColorAdjustments({})
    setVideoVolume(1)
    setMusicVolume(0.45)
    setMissingMediaRefs({})
    setVideoAssetIds({})
    setVideoStorageWarning('')
    setReassociateMessage('')
    setProjectStorageError('')
    const identity = newProjectIdentity()
    setProjectId(identity.id)
    setProjectCreatedAt(identity.createdAt)
    return true
  }

  useEffect(() => {
    if (!projectStorageReady) return
    const source = new URLSearchParams(window.location.search).get('source')
    if (!isSupportedLocalVideoDraftSource(source)) return
    let cancelled = false
    const messageTimer = window.setTimeout(() => {
      if (!cancelled) setLocalDraftMessage('Carregando gravação local do EntreUS Lab...')
    }, 0)
    loadLocalVideoDraft(source)
      .then((file) => {
        if (cancelled) return
        if (!file) {
          setLocalDraftMessage('Não encontrei uma gravação local para importar. Baixe o vídeo e selecione manualmente.')
          return
        }
        const hasPriorEdit = Boolean(videoFile || photoSlides.length || imageOverlays.length || videoOverlays.length || overlays.length || stickers.length || projectName !== 'Novo vídeo')
        if (hasPriorEdit) {
          if (!window.confirm('Já existe uma edição salva neste navegador. Substituí-la por esta gravação local?')) {
            setLocalDraftMessage('A edição anterior foi mantida. A gravação local continua disponível no Lab.')
            return
          }
          if (!startNewProject(true)) return
        }
        loadVideoFile(file, 'Gravação local importada. O vídeo continua apenas neste navegador.')
        if (hasPriorEdit) { setProjectName(file.name.replace(/\.[^.]+$/, '') || 'Novo vídeo'); setProjectNameKey(null) }
        void clearLocalVideoDraft(source)
      })
      .catch(() => {
        if (!cancelled) setLocalDraftMessage('Não foi possível importar a gravação local agora. Baixe o vídeo e selecione manualmente.')
      })
    return () => { cancelled = true; window.clearTimeout(messageTimer) }
    // Importa após a restauração para não substituir um projeto salvo sem aviso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStorageReady])

  function changeAspectPreset(nextPreset: VideoAspectPreset) {
    if (nextPreset === aspectPreset) return
    aspectPresetRef.current = nextPreset
    const nextSize = projectCanvasSize(nextPreset, originalCanvasSize)
    videoRef.current?.pause()
    pauseBackgroundMusic()
    setIsPlaying(false)
    if (nextSize.width !== canvasSize.width || nextSize.height !== canvasSize.height) {
      const scale = reframeScale(canvasSize, nextSize, originalCanvasSize)
      setImageOverlays((current) => current.map((overlay) => reframeBounds(overlay, canvasSize, nextSize, originalCanvasSize)))
      setVideoOverlays((current) => current.map((overlay) => reframeBounds(overlay, canvasSize, nextSize, originalCanvasSize)))
      setOverlays((current) => current.map((overlay) => ({
        ...reframePoint(overlay, canvasSize, nextSize),
        fontSize: Math.max(1, overlay.fontSize * scale),
        ...(overlay.width ? { width: overlay.width * scale } : {}),
        ...(overlay.height ? { height: overlay.height * scale } : {}),
      })))
      setStickers((current) => current.map((sticker) => ({ ...reframePoint(sticker, canvasSize, nextSize), size: sticker.size * scale })))
      setCanvasSize(nextSize)
      setVisualHistoryRevision((current) => current + 1)
    }
    setAspectPreset(nextPreset)
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    if (activeVideoClip?.id === 'base-video' && videoFile) updateMediaImport('base-video', videoFile.name, 'ready')

    const nextBaseDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : DEFAULT_VIDEO_DURATION
    if (activeVideoClip?.id === 'base-video' || !activeVideoClip) {
      const original = { width: video.videoWidth || 1280, height: video.videoHeight || 720 }
      setOriginalCanvasSize(original)
      if (aspectPresetRef.current === 'original') setCanvasSize(original)
    }
    if (activeVideoClip?.id === 'base-video' || !activeVideoClip) {
      setBaseVideoDuration(nextBaseDuration)
      setBaseTrim((current) => current.trimStart === 0 && current.trimEnd === DEFAULT_VIDEO_DURATION
        ? { trimStart: 0, trimEnd: nextBaseDuration }
        : trimVideo(nextBaseDuration, current.trimStart, current.trimEnd))
    }
    if (activeVideoClip) {
      video.currentTime = pendingSeekRef.current ??
        (activeVideoClip.trimStart || 0) + clamp(currentTime - activeVideoClip.startTime, 0, activeVideoClip.duration)
      pendingSeekRef.current = null
      if (isPlaying) void video.play().catch(() => setIsPlaying(false))
    }
  }

  function handleTimeUpdate() {
    // O relógio da sequência é atualizado por requestAnimationFrame.
  }

  function handleSeek(value: number) {
    const video = videoRef.current
    const nextTime = clamp(value, 0, timelineClips.at(-1)?.endTime || 0)
    const clip = clipAtTime(timelineClips, nextTime)
    if (video && clip?.type === 'video') {
      const sourceTime = (clip.trimStart || 0) + Math.min(nextTime - clip.startTime, clip.duration)
      pendingSeekRef.current = sourceTime
      if (video.currentSrc === clip.previewUrl && video.readyState >= 1) {
        video.currentTime = sourceTime
        pendingSeekRef.current = null
      }
    } else if (video) {
      video.pause()
    }
    syncPreviewAudioTracks(nextTime, isPlaying)
    setCurrentTime(nextTime)
  }

  function seekFromTimelinePointer(event: PointerEvent<HTMLElement>, immediate = false) {
    const canvas = event.currentTarget.closest('[data-timeline-canvas]')
    if (!(canvas instanceof HTMLElement)) return
    const seconds = clamp((event.clientX - canvas.getBoundingClientRect().left) / (60 * timelineZoom), 0, timelineDuration)
    if (timelineSeekFrameRef.current !== null) window.cancelAnimationFrame(timelineSeekFrameRef.current)
    if (immediate) {
      timelineSeekFrameRef.current = null
      handleSeek(seconds)
    } else {
      timelineSeekFrameRef.current = window.requestAnimationFrame(() => {
        timelineSeekFrameRef.current = null
        handleSeek(seconds)
      })
    }
  }

  function startTimelineSeek(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    videoRef.current?.pause()
    pauseBackgroundMusic()
    setIsPlaying(false)
    timelineSeekStartTimeRef.current = currentTime
    timelineSeekPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    seekFromTimelinePointer(event, true)
  }

  function moveTimelineSeek(event: PointerEvent<HTMLElement>) {
    if (timelineSeekPointerRef.current === event.pointerId) seekFromTimelinePointer(event)
  }

  function endTimelineSeek(event: PointerEvent<HTMLElement>) {
    if (timelineSeekPointerRef.current !== event.pointerId) return
    if (event.type === 'pointercancel') {
      if (timelineSeekFrameRef.current !== null) window.cancelAnimationFrame(timelineSeekFrameRef.current)
      timelineSeekFrameRef.current = null
      handleSeek(timelineSeekStartTimeRef.current ?? currentTime)
    } else seekFromTimelinePointer(event, true)
    timelineSeekPointerRef.current = null
    timelineSeekStartTimeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handleAdvanceToPublish() {
    if (!canPublish || isRendering) return

    videoRef.current?.pause()
    pauseBackgroundMusic()
    setIsPlaying(false)
    setIsPublishStepOpen(true)
  }

  function getSyncedAudioTime(targetTime: number) {
    const audio = audioRef.current
    const audioDuration = audio?.duration || 0

    if (!audio || !Number.isFinite(audioDuration) || audioDuration <= 0) {
      return 0
    }

    return musicSourceTime(targetTime, musicStartTime, musicTrimStart, musicTrimEnd || audioDuration) ?? musicTrimStart
  }

  function syncBackgroundMusic(targetTime: number) {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = getSyncedAudioTime(targetTime)
  }

  function getSyncedVoiceTime(targetTime: number) {
    if (!voiceUrl || targetTime < voiceStartTime) return 0
    return clamp(targetTime - voiceStartTime, 0, voiceDuration || 0)
  }

  function syncVoiceTrack(targetTime: number) {
    const voice = voicePlaybackRef.current
    if (!voice) return

    voice.currentTime = getSyncedVoiceTime(targetTime)
  }

  function syncPreviewAudioTracks(targetTime: number, shouldPlay: boolean) {
    const audio = audioRef.current
    const voice = voicePlaybackRef.current

    if (audio && audioUrl) {
      const sourceTime = musicSourceTime(targetTime, musicStartTime, musicTrimStart, musicTrimEnd || audioDuration)
      if (sourceTime === null) {
        if (!audio.paused) audio.pause()
        audio.currentTime = musicTrimStart
      } else {
        const expectedAudioTime = sourceTime
        if (Math.abs(audio.currentTime - expectedAudioTime) > 0.35) {
          audio.currentTime = expectedAudioTime
        }
        audio.volume = musicGainAt(targetTime, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale })
        audio.loop = false

        if (shouldPlay && audio.paused) {
          audio.play().catch(() => {
            // Browser autoplay policies may block audio until the next user gesture.
          })
        }
      }
    }

    if (voice && voiceUrl) {
      const voiceEndTime = voiceStartTime + voiceDuration
      const shouldVoicePlay =
        shouldPlay &&
        targetTime >= voiceStartTime &&
        (!voiceDuration || targetTime <= voiceEndTime)

      if (!shouldVoicePlay) {
        if (!voice.paused) voice.pause()
        voice.currentTime = getSyncedVoiceTime(targetTime)
        return
      }

      const expectedVoiceTime = getSyncedVoiceTime(targetTime)
      if (Math.abs(voice.currentTime - expectedVoiceTime) > 0.35) {
        voice.currentTime = expectedVoiceTime
      }
      voice.volume = Math.min(1, voiceVolume * mixScale)

      if (voice.paused) {
        voice.play().catch(() => {
          // Browser autoplay policies may block audio until the next user gesture.
        })
      }
    }
  }

  async function startPreviewPlayback() {
    const video = videoRef.current
    if (currentTime >= timelineDuration) {
      handleSeek(0)
      setIsPlaying(true)
      return
    }
    syncPreviewAudioTracks(currentTime, true)
    if (activeSequenceClip?.type === 'video' && video) await video.play()
    setIsPlaying(true)
  }

  async function playBackgroundMusic() {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    syncPreviewAudioTracks(currentTime, true)
  }

  function pauseBackgroundMusic() {
    audioRef.current?.pause()
    voicePlaybackRef.current?.pause()
  }


  function addTextOverlay() {
    const cleanText = activeOverlayId ? 'Novo texto' : textValue.trim() || 'Novo texto'
    const timing = getDefaultLayerTiming()
    const initialFontSize = Math.min(fontSize, Math.max(18, Math.floor(canvasSize.height * 0.23)))
    const width = Math.max(48, Math.min(canvasSize.width * 0.75, canvasSize.width - 24))
    const height = Math.max(initialFontSize + 24, Math.min(canvasSize.height * 0.8, initialFontSize * 2.3 + 24))

    const overlay: TextOverlay = {
      id: crypto.randomUUID(),
      text: cleanText,
      x: canvasSize.width * 0.12,
      y: canvasSize.height * 0.12,
      fontSize: initialFontSize,
      width,
      height,
      color: textColor,
      fontKey: DEFAULT_TEXT_FONT_KEY,
      fontWeight: getTextFontOption(DEFAULT_TEXT_FONT_KEY).weight,
      backgroundEnabled: false,
      backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
      backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
      backgroundRadius: 18,
      textAlign: 'left',
      rotation: 0,
      startTime: timing.startTime,
      endTime: timing.endTime,
    }

    setOverlays((current) => [...current, overlay])
    setActiveOverlayId(overlay.id)
    setActiveStickerId(null)
    setActiveImageId(null)
    setActivePanel('text')
    setTextValue(cleanText)
  }

  function addSticker(asset: StickerAsset) {
    const timing = getDefaultLayerTiming()
    const sticker: StickerOverlay = {
      id: crypto.randomUUID(),
      value: asset.frames[0],
      assetId: asset.id,
      frames: [...asset.frames],
      frameRate: asset.frameRate,
      opacity: 1,
      x: canvasSize.width * 0.5,
      y: canvasSize.height * 0.5,
      size: Math.max(Math.min(canvasSize.width, canvasSize.height) * 0.12, 54),
      rotation: 0,
      startTime: timing.startTime,
      endTime: timing.endTime,
      layerOrder: LAYER_ORDER.sticker,
    }

    setStickers((current) => [...current, sticker])
    setActiveStickerId(sticker.id)
    setActiveOverlayId(null)
    setActiveImageId(null)
    setActivePanel('sticker')
  }

  function findOverlayAtPoint(point: { x: number; y: number }) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!context) return null

    for (const overlay of [...overlays].reverse()) {
      if (currentTime < overlay.startTime || currentTime > overlay.endTime) continue

      const textBox = getOverlayTextBox(context, overlay)

      if (pointInRotatedImage({ ...textBox, rotation: overlay.rotation || 0 }, point, 4)) {
        return overlay
      }
    }

    return null
  }

  function findImageAtPoint(point: { x: number; y: number }) {
    for (const overlay of [...imageOverlays].reverse()) {
      if (currentTime < overlay.startTime || currentTime > overlay.endTime) continue

      if (pointInRotatedImage(overlay, point, 10)) {
        return overlay
      }
    }

    return null
  }

  function findVideoOverlayAtPoint(point: CanvasPoint) {
    for (const overlay of [...videoOverlays].reverse()) {
      if (videoOverlaySourceTime(overlay, currentTime) === null) continue
      if (pointInRotatedImage(overlay, point, 10)) return overlay
    }
    return null
  }

  function findStickerAtPoint(point: { x: number; y: number }) {
    for (const sticker of [...stickers].reverse()) {
      if (currentTime < sticker.startTime || currentTime > sticker.endTime) continue
      const side = sticker.size * 1.3
      if (pointInRotatedImage({ x: sticker.x - side / 2, y: sticker.y - side / 2, width: side, height: side, rotation: sticker.rotation }, point)) return sticker
    }

    return null
  }

  function findVisualLayerAtPoint(point: CanvasPoint): VisualLayer | null {
    for (const layer of [...visualLayers].reverse()) {
      const hit = layer.type === 'text' ? findOverlayAtPoint(point)?.id === layer.id
        : layer.type === 'sticker' ? findStickerAtPoint(point)?.id === layer.id
        : layer.type === 'image' ? findImageAtPoint(point)?.id === layer.id
        : findVideoOverlayAtPoint(point)?.id === layer.id
      if (hit) return layer
    }
    return null
  }

  function selectOverlay(overlay: TextOverlay) {
    setActiveOverlayId(overlay.id)
    setActiveStickerId(null)
    setActiveImageId(null)
    setActiveVideoOverlayId(null)
    setActivePanel('text')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function selectSticker(sticker: StickerOverlay) {
    setActiveStickerId(sticker.id)
    setActiveOverlayId(null)
    setActiveImageId(null)
    setActiveVideoOverlayId(null)
    setActivePanel('sticker')

    if (currentTime < sticker.startTime || currentTime > sticker.endTime) {
      handleSeek(sticker.startTime)
    }
  }

  function selectImageOverlay(overlay: ImageOverlay) {
    setActiveImageId(overlay.id)
    setActiveVideoOverlayId(null)
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActivePanel('image')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function selectVideoOverlay(overlay: VideoOverlay) {
    setActiveVideoOverlayId(overlay.id)
    setActiveImageId(null)
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActivePanel('add')
    if (videoOverlaySourceTime(overlay, currentTime) === null) handleSeek(overlay.startTime)
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || canvasPointerIdRef.current !== null) return

    const point = getCanvasPoint(event, canvas)
    canvasPointerIdRef.current = event.pointerId
    const selectedImage = imageOverlays.find((item) => item.id === activeImageId)
    if (selectedImage && currentTime >= selectedImage.startTime && currentTime <= selectedImage.endTime) {
      const handleRadius = Math.max(6, (22 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotationOffset = Math.max(18, Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1)) * 1.4)
      const local = imageLocalPoint(selectedImage, point)
      const initial = { x: selectedImage.x, y: selectedImage.y, width: selectedImage.width, height: selectedImage.height, rotation: selectedImage.rotation || 0 }
      if (Math.hypot(local.x, local.y + selectedImage.height / 2 + rotationOffset) <= handleRadius) {
        imageRotateRef.current = { type: 'image', id: selectedImage.id, pointerId: event.pointerId, start: point, initial }
        visualGestureActiveRef.current = true
        pointerStartedOnOverlayRef.current = true
        pointerMovedRef.current = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
      const corner = IMAGE_CORNERS.find((candidate) => {
        const handle = imageCornerPoint(selectedImage, candidate)
        return Math.hypot(point.x - handle.x, point.y - handle.y) <= handleRadius
      })
      if (corner) {
        imageResizeRef.current = {
          type: 'image',
          id: selectedImage.id,
          pointerId: event.pointerId,
          corner,
          start: point,
          initial,
          canvas: { width: canvas.width, height: canvas.height },
        }
        visualGestureActiveRef.current = true
        pointerStartedOnOverlayRef.current = true
        pointerMovedRef.current = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
    }
    const selectedVideo = videoOverlays.find((item) => item.id === activeVideoOverlayId)
    if (selectedVideo && videoOverlaySourceTime(selectedVideo, currentTime) !== null) {
      const handleRadius = Math.max(6, (22 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotationOffset = Math.max(18, Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1)) * 1.4)
      const local = imageLocalPoint(selectedVideo, point)
      const initial = { x: selectedVideo.x, y: selectedVideo.y, width: selectedVideo.width, height: selectedVideo.height, rotation: selectedVideo.rotation }
      if (Math.hypot(local.x, local.y + selectedVideo.height / 2 + rotationOffset) <= handleRadius) {
        imageRotateRef.current = { type: 'video', id: selectedVideo.id, pointerId: event.pointerId, start: point, initial }
      } else {
        const corner = IMAGE_CORNERS.find((candidate) => {
          const handle = imageCornerPoint(selectedVideo, candidate)
          return Math.hypot(point.x - handle.x, point.y - handle.y) <= handleRadius
        })
        if (corner) imageResizeRef.current = { type: 'video', id: selectedVideo.id, pointerId: event.pointerId, corner, start: point, initial, canvas: { width: canvas.width, height: canvas.height } }
      }
      if (imageRotateRef.current || imageResizeRef.current) {
        visualGestureActiveRef.current = true
        pointerStartedOnOverlayRef.current = true
        pointerMovedRef.current = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
    }
    const selectedText = overlays.find((item) => item.id === activeOverlayId)
    const context = canvas.getContext('2d')
    if (selectedText && context && currentTime >= selectedText.startTime && currentTime <= selectedText.endTime) {
      const bounds = { ...getOverlayTextBox(context, selectedText), rotation: selectedText.rotation || 0 }
      const local = imageLocalPoint(bounds, point)
      const handleRadius = Math.max(6, (22 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
      const handleSize = Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotationOffset = Math.max(10, Math.min(18, canvas.height * 0.12))
      const rotateY = textRotationHandleY(bounds, canvas, rotationOffset, handleSize * 0.42)
      const mode = Math.hypot(local.x, local.y - rotateY) <= handleRadius
        ? 'rotate'
        : Math.abs(local.x - bounds.width / 2) <= handleRadius && Math.abs(local.y - bounds.height / 2) <= handleRadius
          ? 'resize'
          : null
      if (mode) {
        textGestureRef.current = { id: selectedText.id, pointerId: event.pointerId, mode, start: point, initial: selectedText, bounds }
        visualGestureActiveRef.current = true
        pointerStartedOnOverlayRef.current = true
        pointerMovedRef.current = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
    }
    const selectedSticker = stickers.find((item) => item.id === activeStickerId && currentTime >= item.startTime && currentTime <= item.endTime)
    if (selectedSticker) {
      const side = selectedSticker.size * 1.25
      const bounds = { x: selectedSticker.x - side / 2, y: selectedSticker.y - side / 2, width: side, height: side, rotation: selectedSticker.rotation }
      const local = imageLocalPoint(bounds, point)
      const handleSize = Math.max(8, 20 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
      const handleRadius = Math.max(8, 22 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
      const rotationOffset = Math.max(18, handleSize * 1.4)
      const mode = Math.hypot(local.x, local.y + side / 2 + rotationOffset) <= handleRadius
        ? 'rotate'
        : Math.abs(local.x - side / 2) <= handleRadius && Math.abs(local.y - side / 2) <= handleRadius
          ? 'resize'
          : null
      if (mode) {
        stickerGestureRef.current = { id: selectedSticker.id, pointerId: event.pointerId, mode, start: point, initial: selectedSticker, bounds }
        visualGestureActiveRef.current = true
        pointerStartedOnOverlayRef.current = true
        pointerMovedRef.current = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
    }
    const hit = findVisualLayerAtPoint(point)
    const overlay = hit?.type === 'text' ? overlays.find((item) => item.id === hit.id) || null : null
    const sticker = hit?.type === 'sticker' ? stickers.find((item) => item.id === hit.id) || null : null
    const imageOverlay = hit?.type === 'image' ? imageOverlays.find((item) => item.id === hit.id) || null : null
    const videoOverlay = hit?.type === 'video' ? videoOverlays.find((item) => item.id === hit.id) || null : null

    if (!overlay && !sticker && !imageOverlay && !videoOverlay) {
      setActiveOverlayId(null)
      setActiveStickerId(null)
      setActiveImageId(null)
      setActiveVideoOverlayId(null)
      pointerStartedOnOverlayRef.current = false
      pointerMovedRef.current = false
      draggingLayerRef.current = null
      return
    }

    visualGestureActiveRef.current = true
    pointerStartedOnOverlayRef.current = true
    pointerMovedRef.current = false
    canvas.setPointerCapture(event.pointerId)
    if (overlay) {
      const bounds = context ? { ...getOverlayTextBox(context, overlay), rotation: overlay.rotation || 0 } : { x: overlay.x, y: overlay.y, width: 1, height: overlay.fontSize, rotation: overlay.rotation || 0 }
      textGestureRef.current = { id: overlay.id, pointerId: event.pointerId, mode: 'drag', start: point, initial: overlay, bounds }
      setActiveOverlayId(overlay.id)
      setActiveStickerId(null)
      setActiveImageId(null)
      setActiveVideoOverlayId(null)
      setActivePanel('text')
    } else if (sticker) {
      draggingLayerRef.current = { type: 'sticker', id: sticker.id }
      setActiveOverlayId(null)
      setActiveStickerId(sticker.id)
      setActiveImageId(null)
      setActiveVideoOverlayId(null)
      setActivePanel('sticker')
      setDragOffset({
        x: point.x - sticker.x,
        y: point.y - sticker.y,
      })
    } else if (imageOverlay) {
      draggingLayerRef.current = { type: 'image', id: imageOverlay.id }
      setActiveOverlayId(null)
      setActiveStickerId(null)
      setActiveImageId(imageOverlay.id)
      setActiveVideoOverlayId(null)
      setActivePanel('image')
      setDragOffset({
        x: point.x - imageOverlay.x,
        y: point.y - imageOverlay.y,
      })
    } else if (videoOverlay) {
      draggingLayerRef.current = { type: 'video', id: videoOverlay.id }
      videoDragInitialRef.current = videoOverlay
      selectVideoOverlay(videoOverlay)
      setDragOffset({ x: point.x - videoOverlay.x, y: point.y - videoOverlay.y })
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvasPointerIdRef.current === null) {
      const point = getCanvasPoint(event, canvas)
      const selectedMedia = imageOverlays.find((item) => item.id === activeImageId && currentTime >= item.startTime && currentTime <= item.endTime)
        || videoOverlays.find((item) => item.id === activeVideoOverlayId && videoOverlaySourceTime(item, currentTime) !== null)
      const handleRadius = Math.max(6, (22 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
      if (selectedMedia) {
        const local = imageLocalPoint(selectedMedia, point)
        const rotationOffset = Math.max(18, Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1)) * 1.4)
        if (Math.hypot(local.x, local.y + selectedMedia.height / 2 + rotationOffset) <= handleRadius) {
          canvas.style.cursor = 'crosshair'
          return
        }
        const corner = IMAGE_CORNERS.find((candidate) => {
          const handle = imageCornerPoint(selectedMedia, candidate)
          return Math.hypot(point.x - handle.x, point.y - handle.y) <= handleRadius
        })
        if (corner) {
          canvas.style.cursor = corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
          return
        }
      }
      const selectedText = overlays.find((item) => item.id === activeOverlayId && currentTime >= item.startTime && currentTime <= item.endTime)
      const context = canvas.getContext('2d')
      const selectedSticker = stickers.find((item) => item.id === activeStickerId && currentTime >= item.startTime && currentTime <= item.endTime)
      if (selectedSticker) {
        const side = selectedSticker.size * 1.25
        const bounds = { x: selectedSticker.x - side / 2, y: selectedSticker.y - side / 2, width: side, height: side, rotation: selectedSticker.rotation }
        const local = imageLocalPoint(bounds, point)
        const handleSize = Math.max(8, 20 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1))
        const rotationOffset = Math.max(18, handleSize * 1.4)
        if (Math.hypot(local.x, local.y + side / 2 + rotationOffset) <= handleRadius) {
          canvas.style.cursor = 'crosshair'
          return
        }
        if (Math.abs(local.x - side / 2) <= handleRadius && Math.abs(local.y - side / 2) <= handleRadius) {
          canvas.style.cursor = 'nwse-resize'
          return
        }
      }
      if (selectedText && context) {
        const bounds = { ...getOverlayTextBox(context, selectedText), rotation: selectedText.rotation || 0 }
        const local = imageLocalPoint(bounds, point)
        const handleSize = Math.max(6, (20 * canvas.width) / Math.max(canvas.getBoundingClientRect().width, 1))
        const rotateY = textRotationHandleY(bounds, canvas, Math.max(10, Math.min(18, canvas.height * 0.12)), handleSize * 0.42)
        if (Math.hypot(local.x, local.y - rotateY) <= handleRadius) {
          canvas.style.cursor = 'crosshair'
          return
        }
        if (Math.abs(local.x - bounds.width / 2) <= handleRadius && Math.abs(local.y - bounds.height / 2) <= handleRadius) {
          canvas.style.cursor = 'nwse-resize'
          return
        }
      }
      canvas.style.cursor = findVisualLayerAtPoint(point) ? 'grab' : 'default'
      return
    }
    if (canvasPointerIdRef.current !== event.pointerId) return
    const resizing = imageResizeRef.current
    const rotating = imageRotateRef.current
    const textGesture = textGestureRef.current
    const stickerGesture = stickerGestureRef.current
    const draggingLayer = draggingLayerRef.current
    if (!draggingLayer && !resizing && !rotating && !textGesture && !stickerGesture) return

    if (!canvas.hasPointerCapture(event.pointerId)) return

    const point = getCanvasPoint(event, canvas)
    pointerMovedRef.current = true
    if (textGesture) {
      if (textGesture.mode === 'rotate') {
        const rotation = rotatedImageAngle(textGesture.bounds, textGesture.start, point)
        setOverlays((current) => current.map((overlay) => overlay.id === textGesture.id ? { ...overlay, rotation } : overlay))
      } else if (textGesture.mode === 'resize') {
        const next = resizedTextBox(textGesture.bounds, textGesture.start, point,
          { width: canvas.width, height: canvas.height },
          { width: 40, height: Math.max(32, textGesture.initial.fontSize + 24) })
        const x = clamp(next.x + 12, 12 - next.width / 2, canvas.width + 12 - next.width / 2)
        const y = clamp(next.y + 12, 12 - next.height / 2, canvas.height + 12 - next.height / 2)
        setOverlays((current) => current.map((overlay) => overlay.id === textGesture.id ? { ...overlay, width: next.width, height: next.height, x, y } : overlay))
      } else {
        const xOffset = textGesture.bounds.x + textGesture.bounds.width / 2 - textGesture.initial.x
        const yOffset = textGesture.bounds.y + textGesture.bounds.height / 2 - textGesture.initial.y
        const x = clamp(textGesture.initial.x + point.x - textGesture.start.x, -xOffset, canvas.width - xOffset)
        const y = clamp(textGesture.initial.y + point.y - textGesture.start.y, -yOffset, canvas.height - yOffset)
        setAlignmentGuide(alignmentGuides({ ...textGesture.bounds, x: textGesture.bounds.x + x - textGesture.initial.x, y: textGesture.bounds.y + y - textGesture.initial.y }, canvas, 6 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1)))
        setOverlays((current) => current.map((overlay) => overlay.id === textGesture.id ? { ...overlay, x, y } : overlay))
      }
      return
    }
    if (stickerGesture) {
      if (stickerGesture.mode === 'rotate') {
        const rotation = rotatedImageAngle(stickerGesture.bounds, stickerGesture.start, point)
        setStickers((current) => current.map((sticker) => sticker.id === stickerGesture.id ? { ...sticker, rotation } : sticker))
      } else {
        const next = resizeRotatedImageFromCorner(stickerGesture.bounds, 'bottom-right', stickerGesture.start, point,
          { width: canvas.width, height: canvas.height })
        setStickers((current) => current.map((sticker) => sticker.id === stickerGesture.id ? {
          ...sticker,
          size: Math.max(28, next.width / 1.25),
          x: next.x + next.width / 2,
          y: next.y + next.height / 2,
        } : sticker))
      }
      return
    }
    if (rotating) {
      const rotation = rotatedImageAngle(rotating.initial, rotating.start, point)
      if (rotating.type === 'video') setVideoOverlays((current) => current.map((video) => video.id === rotating.id ? { ...video, rotation } : video))
      else setImageOverlays((current) => current.map((image) => image.id === rotating.id ? { ...image, rotation } : image))
      return
    }
    if (resizing) {
      const next = resizeRotatedImageFromCorner(resizing.initial, resizing.corner, resizing.start, point, resizing.canvas)
      if (resizing.type === 'video') setVideoOverlays((current) => current.map((video) => video.id === resizing.id ? { ...video, ...next } : video))
      else setImageOverlays((current) => current.map((image) => image.id === resizing.id ? { ...image, ...next } : image))
      return
    }

    if (!draggingLayer) return

    if (draggingLayer.type === 'sticker') {
      const sticker = stickers.find((item) => item.id === draggingLayer.id)
      if (sticker) setAlignmentGuide(alignmentGuides({ x: point.x - dragOffset.x - sticker.size / 2, y: point.y - dragOffset.y - sticker.size / 2, width: sticker.size, height: sticker.size }, canvas, 6 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1)))
      setStickers((current) =>
        current.map((sticker) => {
          if (sticker.id !== draggingLayer.id) return sticker

          return {
            ...sticker,
            x: clamp(point.x - dragOffset.x, 0, canvas.width),
            y: clamp(point.y - dragOffset.y, 0, canvas.height),
          }
        })
      )
      return
    }

    if (draggingLayer.type === 'video') {
      const video = videoOverlays.find((item) => item.id === draggingLayer.id)
      if (video) setAlignmentGuide(alignmentGuides({ ...video, x: point.x - dragOffset.x, y: point.y - dragOffset.y }, canvas, 6 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1)))
      setVideoOverlays((current) => current.map((overlay) => overlay.id === draggingLayer.id ? {
        ...overlay,
        x: clamp(point.x - dragOffset.x, 0, canvas.width - overlay.width),
        y: clamp(point.y - dragOffset.y, 0, canvas.height - overlay.height),
      } : overlay))
      return
    }

    const image = imageOverlays.find((item) => item.id === draggingLayer.id)
    if (image) setAlignmentGuide(alignmentGuides({ ...image, x: point.x - dragOffset.x, y: point.y - dragOffset.y }, canvas, 6 * canvas.width / Math.max(canvas.getBoundingClientRect().width, 1)))
    setImageOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== draggingLayer.id) return overlay

        return {
          ...overlay,
          x: clamp(point.x - dragOffset.x, 0, canvas.width - overlay.width),
          y: clamp(point.y - dragOffset.y, 0, canvas.height - overlay.height),
        }
      })
    )
  }

  function finishCanvasPointer(event: PointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    if (canvasPointerIdRef.current !== event.pointerId) return
    const canvas = canvasRef.current
    const hadCapture = canvas?.hasPointerCapture(event.pointerId)

    const resizing = imageResizeRef.current
    const rotating = imageRotateRef.current
    const textGesture = textGestureRef.current
    if (cancelled && textGesture) {
      setOverlays((current) => current.map((overlay) => overlay.id === textGesture.id ? textGesture.initial : overlay))
    }
    if (cancelled && resizing) {
      if (resizing.type === 'video') setVideoOverlays((current) => current.map((video) => video.id === resizing.id ? { ...video, ...resizing.initial } : video))
      else setImageOverlays((current) => current.map((image) => image.id === resizing.id ? { ...image, ...resizing.initial } : image))
    }
    if (cancelled && rotating) {
      if (rotating.type === 'video') setVideoOverlays((current) => current.map((video) => video.id === rotating.id ? { ...video, ...rotating.initial } : video))
      else setImageOverlays((current) => current.map((image) => image.id === rotating.id ? { ...image, ...rotating.initial } : image))
    }
    if (cancelled && draggingLayerRef.current?.type === 'video' && videoDragInitialRef.current) {
      const initial = videoDragInitialRef.current
      setVideoOverlays((current) => current.map((video) => video.id === initial.id ? initial : video))
    }
    if (!cancelled && !pointerStartedOnOverlayRef.current && !pointerMovedRef.current) {
      void togglePlayback()
    }

    const shouldCommitHistory = visualGestureActiveRef.current && pointerMovedRef.current && !cancelled
    visualGestureActiveRef.current = false
    canvasPointerIdRef.current = null
    imageResizeRef.current = null
    imageRotateRef.current = null
    textGestureRef.current = null
    stickerGestureRef.current = null
    pointerMovedRef.current = false
    pointerStartedOnOverlayRef.current = false
    draggingLayerRef.current = null
    setAlignmentGuide(null)
    videoDragInitialRef.current = null
    if (hadCapture) canvas?.releasePointerCapture(event.pointerId)
    if (shouldCommitHistory) setVisualHistoryRevision((current) => current + 1)
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    finishCanvasPointer(event, false)
  }

  function handlePointerCancel(event: PointerEvent<HTMLCanvasElement>) {
    finishCanvasPointer(event, true)
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!hasEditorMedia) return

    if (isPlaying) {
      video?.pause()
      pauseBackgroundMusic()
      setIsPlaying(false)
    } else {
      await startPreviewPlayback()
    }
  }

  function handleVideoPlay() {
    syncPreviewAudioTracks(currentTime, true)
  }

  function handleVideoPause() {
    // A troca de clipes pausa o elemento antes de carregar o próximo vídeo.
  }

  function handleVideoEnded() {
    const next = activeSequenceClip && timelineClips[activeSequenceClip.order + 1]
    if (next) handleSeek(next.startTime)
    else {
      setIsPlaying(false)
      pauseBackgroundMusic()
    }
  }

  function updateActiveOverlayTiming(key: 'startTime' | 'endTime', value: number) {
    if (!activeOverlayId || !Number.isFinite(value)) return

    setOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== activeOverlayId) return overlay

        const nextValue = clamp(value, 0, duration)

        if (key === 'startTime') {
          return {
            ...overlay,
            startTime: Math.min(nextValue, Math.max(overlay.endTime - MIN_TIMELINE_ITEM_DURATION, 0)),
          }
        }

        return {
          ...overlay,
          endTime: Math.max(nextValue, Math.min(overlay.startTime + MIN_TIMELINE_ITEM_DURATION, duration)),
        }
      })
    )
  }

  function updateActiveImageTiming(key: 'startTime' | 'endTime', value: number) {
    if (!activeImageId) return

    setImageOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== activeImageId) return overlay

        const nextValue = clamp(value, 0, duration)

        if (key === 'startTime') {
          return {
            ...overlay,
            startTime: Math.min(nextValue, Math.max(overlay.endTime - MIN_TIMELINE_ITEM_DURATION, 0)),
          }
        }

        return {
          ...overlay,
          endTime: Math.max(nextValue, Math.min(overlay.startTime + MIN_TIMELINE_ITEM_DURATION, duration)),
        }
      })
    )
  }

  function updateActiveImageSize(width: number) {
    if (!activeImageId) return

    setImageOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== activeImageId) return overlay

        const aspectRatio = overlay.width > 0 && overlay.height > 0
          ? overlay.width / overlay.height
          : 1
        const maxWidth = Math.min(canvasSize.width, canvasSize.height * aspectRatio)
        const nextWidth = clamp(width, Math.min(32, maxWidth), maxWidth)
        const nextHeight = nextWidth / aspectRatio

        return {
          ...overlay,
          width: nextWidth,
          height: nextHeight,
          x: clamp(overlay.x, 0, Math.max(canvasSize.width - nextWidth, 0)),
          y: clamp(overlay.y, 0, Math.max(canvasSize.height - nextHeight, 0)),
        }
      })
    )
  }

  function updateActiveImageRotation(rotation: number) {
    if (!activeImageId) return

    setImageOverlays((current) =>
      current.map((overlay) =>
        overlay.id === activeImageId
          ? {
              ...overlay,
              rotation: normalizeImageAngle(rotation),
            }
          : overlay
      )
    )
  }

  function updateActiveStickerTiming(key: 'startTime' | 'endTime', value: number) {
    if (!activeStickerId) return

    setStickers((current) =>
      current.map((sticker) => {
        if (sticker.id !== activeStickerId) return sticker

        const nextValue = clamp(value, 0, duration)

        if (key === 'startTime') {
          return {
            ...sticker,
            startTime: Math.min(nextValue, Math.max(sticker.endTime - MIN_TIMELINE_ITEM_DURATION, 0)),
          }
        }

        return {
          ...sticker,
          endTime: Math.max(nextValue, Math.min(sticker.startTime + MIN_TIMELINE_ITEM_DURATION, duration)),
        }
      })
    )
  }

  function normalizeTimelineTiming(startTime: number, endTime: number) {
    const maxDuration = Math.max(timelineDuration, MIN_TIMELINE_ITEM_DURATION)
    const nextStart = clamp(startTime, 0, Math.max(maxDuration - MIN_TIMELINE_ITEM_DURATION, 0))
    const nextEnd = clamp(endTime, nextStart + MIN_TIMELINE_ITEM_DURATION, maxDuration)

    return {
      startTime: nextStart,
      endTime: nextEnd,
    }
  }

  function snapTimelineTime(value: number, id: string) {
    const points = [0, currentTime, timelineDuration,
      ...timelineClips.flatMap((clip) => [clip.startTime, clip.endTime]),
      ...visualLayers.filter((layer) => layer.id !== id).flatMap((layer) => [layer.startTime, layer.endTime]),
    ]
    return snapLayerTime(value, points, timelinePixelsPerSecond)
  }

  function updateTimelineLayerTiming(type: TimelineEditableLayer, id: string, startTime: number, endTime: number) {
    const timing = normalizeTimelineTiming(startTime, endTime)

    if (type === 'subtitle') {
      setSubtitles((current) => current.map((item) => item.id === id ? { ...item, ...timing, words: undefined } : item))
      return
    }

    if (type === 'video') {
      setVideoOverlays((current) => current.map((overlay) => overlay.id === id
        ? retimeVideoOverlay(overlay, startTime !== overlay.startTime ? 'trim-start' : 'trim-end', timing.startTime, timing.endTime)
        : overlay))
      return
    }

    if (type === 'text') {
      setOverlays((current) =>
        current.map((overlay) =>
          overlay.id === id
            ? {
                ...overlay,
                ...timing,
              }
            : overlay
        )
      )
      return
    }

    if (type === 'sticker') {
      setStickers((current) =>
        current.map((sticker) =>
          sticker.id === id
            ? {
                ...sticker,
                ...timing,
              }
            : sticker
        )
      )
      return
    }

    setImageOverlays((current) =>
      current.map((overlay) =>
        overlay.id === id
          ? {
              ...overlay,
              ...timing,
            }
          : overlay
      )
    )
  }

  function selectTimelineLayer(type: TimelineEditableLayer, id: string) {
    if (type === 'subtitle') {
      setActiveSubtitleId(id)
      setActivePanel('caption')
      return
    }
    if (type === 'video') {
      const overlay = videoOverlays.find((item) => item.id === id)
      if (overlay) selectVideoOverlay(overlay)
      return
    }
    if (type === 'text') {
      const overlay = overlays.find((item) => item.id === id)
      if (overlay) selectOverlay(overlay)
      return
    }

    if (type === 'sticker') {
      const sticker = stickers.find((item) => item.id === id)
      if (sticker) selectSticker(sticker)
      return
    }

    const overlay = imageOverlays.find((item) => item.id === id)
    if (overlay) selectImageOverlay(overlay)
  }

  function applyTimelineDrag(clientX: number) {
    const dragState = timelineDragRef.current
    if (!dragState || timelineDuration <= 0) return

    const secondsPerPixel = 1 / (60 * timelineZoom)
    const deltaSeconds = (clientX - dragState.startClientX) * secondsPerPixel
    const originalDuration = Math.max(
      dragState.initialEndTime - dragState.initialStartTime,
      MIN_TIMELINE_ITEM_DURATION,
    )
    let nextStart = dragState.initialStartTime
    let nextEnd = dragState.initialEndTime

    if (dragState.mode === 'trim-start') {
      nextStart = clamp(
        snapTimelineTime(dragState.initialStartTime + deltaSeconds, dragState.id),
        0,
        dragState.initialEndTime - MIN_TIMELINE_ITEM_DURATION,
      )
    } else if (dragState.mode === 'trim-end') {
      nextEnd = clamp(
        snapTimelineTime(dragState.initialEndTime + deltaSeconds, dragState.id),
        dragState.initialStartTime + MIN_TIMELINE_ITEM_DURATION,
        timelineDuration,
      )
    } else {
      const proposedStart = dragState.initialStartTime + deltaSeconds
      const snappedStart = snapTimelineTime(proposedStart, dragState.id)
      const snappedEnd = snapTimelineTime(proposedStart + originalDuration, dragState.id) - originalDuration
      const startDistance = Math.abs(snappedStart - proposedStart)
      const endDistance = Math.abs(snappedEnd - proposedStart)
      const nextSnappedStart = startDistance > 1e-6 && (endDistance <= 1e-6 || startDistance <= endDistance)
        ? snappedStart
        : endDistance > 1e-6 ? snappedEnd : proposedStart
      nextStart = clamp(
        nextSnappedStart,
        0,
        Math.max(timelineDuration - originalDuration, 0),
      )
      nextEnd = nextStart + originalDuration
    }

    const timing = normalizeTimelineTiming(nextStart, nextEnd)
    if (dragState.type === 'video' && videoTimelineInitialRef.current) {
      const initial = videoTimelineInitialRef.current
      setVideoOverlays((current) => current.map((overlay) => overlay.id === dragState.id
        ? retimeVideoOverlay(initial, dragState.mode, timing.startTime, timing.endTime)
        : overlay))
    } else {
      updateTimelineLayerTiming(dragState.type, dragState.id, timing.startTime, timing.endTime)
    }
    setTimelineDragPreview({
      type: dragState.type,
      id: dragState.id,
      mode: dragState.mode,
      startTime: timing.startTime,
      endTime: timing.endTime,
    })
  }

  function handleTimelineLayerDragStart(
    event: PointerEvent<HTMLElement>,
    type: TimelineEditableLayer,
    id: string,
    mode: TimelineDragMode,
    startTime: number,
    endTime: number,
  ) {
    if (timelineDuration <= 0) return

    event.preventDefault()
    event.stopPropagation()

    const track = event.currentTarget.closest('[data-timeline-track]')
    if (!(track instanceof HTMLElement)) return

    const trackRect = track.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)

    selectTimelineLayer(type, id)
    setTimelineDragTarget(`${type}:${id}:${mode}`)
    setTimelineDragPreview({ type, id, mode, startTime, endTime })
    timelineDragRef.current = {
      type,
      id,
      mode,
      pointerId: event.pointerId,
      trackLeft: trackRect.left,
      startClientX: event.clientX,
      initialStartTime: startTime,
      initialEndTime: endTime,
    }
    videoTimelineInitialRef.current = type === 'video' ? videoOverlays.find((overlay) => overlay.id === id) || null : null
    if (type === 'video') visualGestureActiveRef.current = true

    if (isPlaying) {
      videoRef.current?.pause()
      pauseBackgroundMusic()
      setIsPlaying(false)
    }
  }

  function handleTimelineLayerDragMove(event: PointerEvent<HTMLElement>) {
    const dragState = timelineDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    applyTimelineDrag(event.clientX)
  }

  function handleTimelineLayerDragEnd(event: PointerEvent<HTMLElement>) {
    const dragState = timelineDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') {
      if (dragState.type === 'video' && videoTimelineInitialRef.current) {
        const initial = videoTimelineInitialRef.current
        setVideoOverlays((current) => current.map((overlay) => overlay.id === initial.id ? initial : overlay))
      } else updateTimelineLayerTiming(dragState.type, dragState.id, dragState.initialStartTime, dragState.initialEndTime)
    } else {
      applyTimelineDrag(event.clientX)
    }
    if (dragState.type === 'video') {
      visualGestureActiveRef.current = false
      if (event.type === 'pointerup') setVisualHistoryRevision((current) => current + 1)
    }
    timelineDragRef.current = null
    videoTimelineInitialRef.current = null
    setTimelineDragTarget(null)
    setTimelineDragPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function updateActiveOverlayText(value: string) {
    if (!activeOverlayId) {
      setTextValue(value)
      return
    }

    setOverlays((current) =>
      current.map((overlay) =>
        overlay.id === activeOverlayId
          ? {
              ...overlay,
              text: value,
            }
          : overlay
      )
    )
  }

  function updateActiveOverlayStyle(
    key: 'fontSize' | 'color' | 'fontKey' | 'fontWeight' | 'backgroundEnabled' | 'backgroundColor' | 'backgroundOpacity' | 'backgroundRadius' | 'textAlign',
    value: number | string | boolean
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) return
    if (!activeOverlayId) {
      if (key === 'fontSize') setFontSize(Number(value))
      if (key === 'color') setTextColor(String(value))
      return
    }

    const nextValue = key === 'fontSize' || key === 'fontWeight' || key === 'backgroundOpacity' || key === 'backgroundRadius'
      ? Number(value)
      : key === 'backgroundEnabled'
      ? Boolean(value)
      : String(value)

    setOverlays((current) =>
      current.map((overlay) =>
        overlay.id === activeOverlayId
          ? {
              ...overlay,
              [key]: nextValue,
              ...(key === 'fontKey'
                ? { fontWeight: getTextFontOption(String(value) as TextFontKey).weight }
                : {}),
            }
          : overlay
      )
    )
  }

  function updateActiveOverlayPosition(key: 'x' | 'y', value: number) {
    if (!activeOverlayId || !Number.isFinite(value)) return
    const maximum = key === 'x' ? canvasSize.width : canvasSize.height
    setOverlays((current) => current.map((overlay) => overlay.id === activeOverlayId
      ? { ...overlay, [key]: clamp(value, 0, maximum) }
      : overlay))
  }

  function updateActiveOverlayBox(key: 'width' | 'height', value: number) {
    if (!activeOverlayId || !Number.isFinite(value)) return
    const context = canvasRef.current?.getContext('2d')
    setOverlays((current) => current.map((overlay) => {
      if (overlay.id !== activeOverlayId) return overlay
      const measured = context ? getOverlayTextBox(context, overlay) : null
      return {
        ...overlay,
        width: key === 'width' ? clamp(value, 40, canvasSize.width) : overlay.width || measured?.width || 40,
        height: key === 'height' ? clamp(value, Math.max(32, overlay.fontSize + 24), canvasSize.height) : overlay.height || measured?.height || overlay.fontSize + 24,
      }
    }))
  }

  function nudgeActiveOverlayTiming(key: 'startTime' | 'endTime', delta: number) {
    if (!activeOverlay) return
    updateActiveOverlayTiming(key, activeOverlay[key] + delta)
  }

  function nudgeActiveStickerTiming(key: 'startTime' | 'endTime', delta: number) {
    if (!activeSticker) return
    updateActiveStickerTiming(key, activeSticker[key] + delta)
  }

  function nudgeActiveImageTiming(key: 'startTime' | 'endTime', delta: number) {
    if (!activeImageOverlay) return
    updateActiveImageTiming(key, activeImageOverlay[key] + delta)
  }

  function nudgeMusicStart(delta: number) {
    setMusicStartTime((current) => clamp(current + delta, 0, Math.max(timelineDuration - 0.1, 0)))
  }

  function nudgeMusicTrim(delta: number) {
    setMusicTrimStart((current) => clamp(current + delta, 0, Math.max(audioDuration - 0.1, 0)))
  }

  function nudgeVoiceStart(delta: number) {
    setVoiceStartTime((current) => clamp(current + delta, 0, Math.max(timelineDuration - 0.1, 0)))
  }

  function applyTextBackgroundPreset(preset: typeof TEXT_BACKGROUND_PRESETS[number]) {
    updateActiveOverlayStyle('backgroundEnabled', preset.enabled)
    updateActiveOverlayStyle('backgroundColor', preset.color)
    updateActiveOverlayStyle('backgroundOpacity', preset.opacity)
    updateActiveOverlayStyle('backgroundRadius', 18)
  }

  function removeActiveOverlay() {
    if (!activeOverlayId) return

    setOverlays((current) => current.filter((overlay) => overlay.id !== activeOverlayId))
    setActiveOverlayId(null)
    setTextValue('')
  }

  function removeActiveImageOverlay() {
    if (!activeImageId) return

    const activeImage = imageOverlays.find((overlay) => overlay.id === activeImageId)
    if (activeImage) URL.revokeObjectURL(activeImage.url)

    imageElementsRef.current.delete(activeImageId)
    setImageOverlays((current) => current.filter((overlay) => overlay.id !== activeImageId))
    setActiveImageId(null)
    setImageMessage('')
  }

  function removeActiveVideoOverlay() {
    if (!activeVideoOverlayId) return
    const activeVideo = videoOverlays.find((overlay) => overlay.id === activeVideoOverlayId)
    if (activeVideo) URL.revokeObjectURL(activeVideo.url)
    videoOverlayElementsRef.current.get(activeVideoOverlayId)?.pause()
    videoOverlayElementsRef.current.delete(activeVideoOverlayId)
    setVideoOverlays((current) => current.filter((overlay) => overlay.id !== activeVideoOverlayId))
    setActiveVideoOverlayId(null)
  }

  function updateActiveStickerStyle(key: 'size' | 'rotation' | 'opacity', value: number) {
    if (!activeStickerId) return

    setStickers((current) =>
      current.map((sticker) =>
        sticker.id === activeStickerId
          ? {
              ...sticker,
              [key]: value,
            }
          : sticker
      )
    )
  }

  function removeActiveSticker() {
    if (!activeStickerId) return

    setStickers((current) => current.filter((sticker) => sticker.id !== activeStickerId))
    setActiveStickerId(null)
  }

  function removePhotoSlide(slideId: string) {
    const slide = photoSlides.find((item) => item.id === slideId)
    if (slide) URL.revokeObjectURL(slide.previewUrl)
    setSequenceOrder((current) => current.filter((id) => id !== slideId))
    setActiveClipId((current) => current === slideId ? null : current)

    setPhotoSlides((current) => {
      const nextSlides = current
        .filter((item) => item.id !== slideId)
        .map((item, index) => ({ ...item, order: index }))
      const nextDuration = nextSlides.reduce((total, item) => total + item.duration, 0)
      const nextTotalDuration = editorMode === 'video' && videoFile
        ? baseVideoDuration + nextDuration
        : Math.max(nextDuration, DEFAULT_VIDEO_DURATION)
      setDuration(nextTotalDuration)
      setCurrentTime((currentTimeValue) =>
        clamp(currentTimeValue, 0, Math.max(nextTotalDuration, 0))
      )
      setActivePhotoId((currentActiveId) =>
        currentActiveId === slideId ? nextSlides[0]?.id || null : currentActiveId
      )
      return nextSlides
    })
  }

  function selectPhotoSlide(slideId: string) {
    const slideStart = timelineClips.find((clip) => clip.id === slideId)?.startTime || 0
    setActiveClipId(slideId)
    setActivePhotoId(slideId)
    handleSeek(slideStart)
  }

  function movePhotoSlide(slideId: string, direction: -1 | 1) {
    setPhotoSlides((current) => {
      const orderedSlides = [...current].sort((a, b) => a.order - b.order)
      const currentIndex = orderedSlides.findIndex((slide) => slide.id === slideId)
      const targetIndex = currentIndex + direction

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedSlides.length) {
        return current
      }

      const nextSlides = [...orderedSlides]
      const [slide] = nextSlides.splice(currentIndex, 1)
      nextSlides.splice(targetIndex, 0, slide)

      return nextSlides.map((item, index) => ({ ...item, order: index }))
    })
  }

  function updatePhotoSlideDuration(slideId: string, value: number) {
    const nextDuration = clamp(value, 1, 8)

    setPhotoSlides((current) => {
      const nextSlides = current.map((slide) =>
        slide.id === slideId
          ? {
              ...slide,
              duration: nextDuration,
            }
          : slide
      )
      const nextTotalDuration = editorMode === 'video' && videoFile
        ? baseVideoDuration + nextSlides.reduce((total, slide) => total + slide.duration, 0)
        : nextSlides.reduce((total, slide) => total + slide.duration, 0)
      setDuration(nextTotalDuration)
      setCurrentTime((currentTimeValue) => clamp(currentTimeValue, 0, nextTotalDuration))
      return nextSlides
    })
  }

  function updateSelectedVideoTrim(edge: 'start' | 'end', value: number) {
    if (!selectedClip || selectedClip.type !== 'video') return
    updateVideoTrimById(selectedClip.id, edge, value)
    handleSeek(selectedClip.startTime)
  }

  function updateVideoTrimById(id: string, edge: 'start' | 'end', value: number) {
    if (id === 'base-video') {
      setBaseTrim((current) => {
        const bounds = trimVideo(baseVideoDuration, edge === 'start' ? value : current.trimStart, edge === 'end' ? value : current.trimEnd)
        return { trimStart: bounds.trimStart, trimEnd: bounds.trimEnd }
      })
      return
    }
    setExtraVideos((current) => current.map((clip) => {
      if (clip.id !== id) return clip
      const bounds = trimVideo(clip.sourceDuration, edge === 'start' ? value : clip.trimStart, edge === 'end' ? value : clip.trimEnd)
      return { ...clip, trimStart: bounds.trimStart, trimEnd: bounds.trimEnd }
    }))
  }

  function splitSelectedVideo() {
    if (!selectedClip || selectedClip.type !== 'video' || !videoFile) return
    const offset = currentTime - selectedClip.startTime
    if (offset < 0.5 || selectedClip.duration - offset < 0.5) return
    const sourceTime = (selectedClip.trimStart || 0) + offset
    const sourceFile = selectedClip.id === 'base-video'
      ? videoFile
      : extraVideos.find((clip) => clip.id === selectedClip.id)?.file
    if (!sourceFile) return
    const newClip: ExtraVideoClip = {
      id: crypto.randomUUID(), file: sourceFile, previewUrl: URL.createObjectURL(sourceFile),
      sourceDuration: selectedClip.sourceDuration || DEFAULT_VIDEO_DURATION,
      trimStart: sourceTime, trimEnd: selectedClip.trimEnd || selectedClip.sourceDuration || DEFAULT_VIDEO_DURATION,
    }
    updateVideoTrimById(selectedClip.id, 'end', sourceTime)
    setExtraVideos((current) => [...current, newClip])
    if (videoAssetIds[selectedClip.id]) setVideoAssetIds((current) => ({ ...current, [newClip.id]: videoAssetIds[selectedClip.id] }))
    setSequenceOrder([...timelineClips.map((clip) => clip.id).slice(0, selectedClip.order + 1), newClip.id, ...timelineClips.map((clip) => clip.id).slice(selectedClip.order + 1)])
    setActiveClipId(newClip.id)
  }

  function removeSelectedClip() {
    if (!selectedClip) return
    videoRef.current?.pause()
    pauseBackgroundMusic()
    setIsPlaying(false)
    setExcludedClipIds((current) => [...current, selectedClip.id])
    setSequenceOrder((current) => current.filter((id) => id !== selectedClip.id))
    setActiveClipId(null)
    handleSeek(Math.max(selectedClip.startTime - 0.01, 0))
  }

  function toggleTrackMute(track: 'video' | 'music') {
    if (track === 'video') {
      if (videoVolume > 0) previousVolumesRef.current.video = videoVolume
      setVideoVolume(videoVolume > 0 ? 0 : previousVolumesRef.current.video)
    } else {
      if (musicVolume > 0) setMusicPreviousVolume(musicVolume)
      setMusicVolume(musicVolume > 0 ? 0 : musicPreviousVolume)
    }
  }

  async function getFFmpeg(operation: number) {
    assertRenderCurrent(operation)
    if (ffmpegRef.current?.loaded) {
      setIsReady(true)
      logRenderContext('ffmpeg_already_loaded')
      return ffmpegRef.current
    }

    if (ffmpegRef.current) disposeFfmpeg(ffmpegRef.current)
    setRenderStage('ffmpeg_loading', 'Carregando motor de video...', operation)

    const ffmpeg = new FFmpeg()
    ffmpegRef.current = ffmpeg

    const progress: ProgressEventCallback = ({ progress }) => {
      if (mountedRef.current && renderLockRef.current && ffmpegRef.current === ffmpeg) {
        setRenderProgress(clamp(Math.round(progress * 100), 0, 100))
      }
    }

    const log: LogEventCallback = ({ type, message }) => {
      console.info('[VideoEditor] FFmpeg:', { type, message })
    }
    ffmpeg.on('progress', progress)
    ffmpeg.on('log', log)
    ffmpegListenersRef.current = { ffmpeg, progress, log }

    try {
      await loadFfmpegWithTimeout(ffmpeg, renderAbortRef.current?.signal)
      assertRenderCurrent(operation)
    } catch (error) {
      disposeFfmpeg(ffmpeg, false)
      if (isRenderCurrent(operation)) setIsReady(false)
      throw error
    }

    setIsReady(true)
    logRenderContext('ffmpeg_loaded')
    return ffmpeg
  }

  function cancelExport() {
    if (!renderLockRef.current || renderStageRef.current === 'uploading' || renderStageRef.current === 'done') return
    renderOperationRef.current++
    renderAbortRef.current?.abort()
    renderAbortRef.current = null
    renderLockRef.current = false
    disposeFfmpeg(ffmpegRef.current, Boolean(ffmpegRef.current?.loaded))
    setIsReady(false)
    setIsRendering(false)
    setRenderProgress(0)
    setCompressionStats(null)
    setIsPublishStepOpen(false)
    setRenderStage('cancelled', 'Exportação cancelada.')
  }

  function finishRenderOperation(operation: number) {
    if (!isRenderCurrent(operation)) return
    renderAbortRef.current = null
    renderLockRef.current = false
    setIsRendering(false)
  }

  function getFriendlyRenderErrorMessage(error: unknown) {
    if (error instanceof FfmpegLoadTimeoutError) {
      return 'O motor de video demorou para carregar. Tente novamente.'
    }
    if (error instanceof Error && error.message === 'SEQUENCE_RENDER_FAILED') {
      return isDownloadMode
        ? 'Nao foi possivel exportar a sequencia com fotos neste navegador. Tente menos fotos, reduza duracoes ou use outro navegador.'
        : 'Nao foi possivel renderizar a sequencia com fotos neste navegador. Tente menos fotos, reduza duracoes ou publique apenas o video principal.'
    }

    if (error instanceof Error && error.message === 'IMAGE_OVERLAY_RENDER_FAILED') {
      return 'Nao foi possivel incluir a imagem no video final. Tente uma imagem PNG/JPG menor.'
    }

    if (renderStageRef.current === 'optimizing') {
      return isDownloadMode
        ? 'Nao foi possivel otimizar este video neste navegador. Tente exportar com qualidade leve ou use um video menor.'
        : 'Nao foi possivel otimizar este video neste navegador. Vamos publicar a versao padrao quando possivel; se falhar de novo, tente um video menor.'
    }

    if (renderStageRef.current === 'ffmpeg_loading') {
      return 'Nao foi possivel carregar o motor de video. Tente outro navegador atualizado ou verifique a conexao.'
    }

    if (renderStageRef.current === 'uploading') {
      return 'O video foi renderizado, mas o envio falhou. Verifique a conexao e tente publicar novamente.'
    }

    return isDownloadMode
      ? 'Nao foi possivel exportar o video neste navegador. Tente um video menor ou outro navegador. No celular, evite videos muito longos.'
      : 'Nao foi possivel renderizar neste navegador. Tente um video menor, feche apps pesados ou use outro navegador. No celular, evite videos muito longos.'
  }

  function buildTextDrawFilters() {
    return overlays.map((overlay) => {
      const drawTextOptions = [
          'drawtext',
          `text='${escapeDrawTextValue(overlay.text)}'`,
          `x=${Math.round(overlay.x)}`,
          `y=${Math.round(overlay.y)}`,
          `fontsize=${Math.round(overlay.fontSize)}`,
          `fontcolor=${getFfmpegColor(overlay.color)}`,
          'shadowcolor=black@0.55',
          'shadowx=3',
          'shadowy=3',
      ]

      if (overlay.backgroundEnabled) {
        drawTextOptions.push(
          'box=1',
          `boxcolor=${getFfmpegColorWithOpacity(
            overlay.backgroundColor || DEFAULT_TEXT_BACKGROUND_COLOR,
            overlay.backgroundOpacity ?? DEFAULT_TEXT_BACKGROUND_OPACITY
          )}`,
          'boxborderw=14'
        )
      }

      drawTextOptions.push(`enable='between(t,${overlay.startTime.toFixed(3)},${overlay.endTime.toFixed(3)})'`)

      return drawTextOptions.join(':')
    })
  }

  function getStickerPlacement(sticker: StickerOverlay) {
    const outputWidth = canvasSize.width || 1280
    const outputHeight = canvasSize.height || 720
    const size = clamp(Math.round(sticker.size), 16, Math.max(outputWidth, outputHeight))
    const x = clamp(Math.round(sticker.x - size / 2), 0, Math.max(outputWidth - size, 0))
    const y = clamp(Math.round(sticker.y - size / 2), 0, Math.max(outputHeight - size, 0))

    return { x, y, size }
  }

  function buildStickerDrawFilters(includeStickers = true, layers = stickers) {
    if (!includeStickers) return []

    return layers.flatMap((sticker) => {
      const placement = getStickerPlacement(sticker)
      const endTime = Number.isFinite(sticker.endTime) ? sticker.endTime : duration
      return stickerFrames(sticker).map((frame, frameIndex) => [
          'drawtext',
          `text='${escapeDrawTextValue(frame)}'`,
          `x=${placement.x}`,
          `y=${placement.y}`,
          `fontsize=${placement.size}`,
          `fontcolor=white@${Math.min(Math.max(sticker.opacity ?? 1, 0.1), 1).toFixed(2)}`,
          'shadowcolor=black@0.5',
          'shadowx=2',
          'shadowy=2',
          `enable='${stickerFrameEnableExpression(sticker, frameIndex, endTime)}'`,
        ].join(':'))
    })
  }

  function clipColorFilter(id: string) {
    return colorAdjustments[id] ? colorFfmpeg(colorAdjustments[id]) : getVisualFilter(filter)
  }

  function buildVideoFilter(includeOutputFormat = true, includeStickers = true) {
    const filters = [
      clipColorFilter('base-video'),
      fitMediaFilter(canvasSize, frameMode),
      ...buildStickerDrawFilters(includeStickers),
      ...buildTextDrawFilters(),
    ]

    if (includeOutputFormat) filters.push('format=yuv420p')
    return filters.join(',')
  }

  function getRenderableImageOverlays() {
    return imageOverlays.filter((overlay) => RENDERABLE_IMAGE_TYPES.includes(overlay.file.type))
  }

  async function createTextRenderInputs(startIndex: number): Promise<RenderImageInput[]> {
    if (overlays.length === 0 && subtitles.length === 0 && stickers.length === 0) return []
    await document.fonts.ready
    const width = canvasSize.width || 1280
    const height = canvasSize.height || 720
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('TEXT_RASTER_FAILED')
    const inputs: RenderImageInput[] = []
    for (const [index, textOverlay] of overlays.entries()) {
      context.clearRect(0, 0, width, height)
      paintTextOverlay(context, textOverlay)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('TEXT_RASTER_FAILED')),
        'image/png'
      ))
      const inputName = `text_overlay_${index}.png`
      const file = new File([blob], inputName, { type: 'image/png' })
      inputs.push({
        inputName,
        inputIndex: startIndex + inputs.length,
        kind: 'text',
        overlay: {
          id: textOverlay.id, file, url: '', name: inputName,
          x: 0, y: 0, width, height, rotation: 0,
          startTime: textOverlay.startTime, endTime: textOverlay.endTime,
        },
      })
    }
    for (const [index, segment] of subtitles.entries()) {
      context.clearRect(0, 0, width, height)
      paintSubtitleSegment(context, segment, width, height, segment.startTime, 'base')
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('SUBTITLE_RASTER_FAILED')), 'image/png'
      ))
      const inputName = `subtitle_overlay_${index}.png`
      const file = new File([blob], inputName, { type: 'image/png' })
      inputs.push({
        inputName, inputIndex: startIndex + inputs.length, kind: 'subtitle', subtitleRender: { segment, role: 'base' },
        overlay: { id: segment.id, file, url: '', name: inputName, x: 0, y: 0, width, height, rotation: 0, startTime: segment.startTime, endTime: segment.endTime },
      })
      const style = resolveSubtitleStyle(segment.style)
      if (style.karaokeMode === 'segment') {
        context.clearRect(0, 0, width, height)
        paintSubtitleSegment(context, segment, width, height, segment.startTime, 'highlight')
        const highlightBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('SUBTITLE_RASTER_FAILED')), 'image/png'
        ))
        const highlightName = `subtitle_highlight_${index}.png`
        const highlightFile = new File([highlightBlob], highlightName, { type: 'image/png' })
        inputs.push({
          inputName: highlightName, inputIndex: startIndex + inputs.length, kind: 'subtitle', subtitleRender: { segment, role: 'highlight' },
          overlay: { id: `${segment.id}-highlight`, file: highlightFile, url: '', name: highlightName, x: 0, y: 0, width, height, rotation: 0, startTime: segment.startTime, endTime: segment.endTime },
        })
      }
    }
    const stickerCanvas = document.createElement('canvas')
    stickerCanvas.width = 256
    stickerCanvas.height = 256
    const stickerContext = stickerCanvas.getContext('2d')
    if (!stickerContext && stickers.length > 0) throw new Error('STICKER_RASTER_FAILED')
    for (const [stickerIndex, sticker] of stickers.entries()) {
      const frames = stickerFrames(sticker)
      for (const [frameIndex, frame] of frames.entries()) {
        stickerContext!.clearRect(0, 0, 256, 256)
        stickerContext!.save()
        stickerContext!.globalAlpha = Math.min(Math.max(sticker.opacity ?? 1, 0.1), 1)
        stickerContext!.textAlign = 'center'
        stickerContext!.textBaseline = 'middle'
        stickerContext!.font = '800 190px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial, sans-serif'
        stickerContext!.fillStyle = '#ffffff'
        if (sticker.customAssetId) {
          const image = customStickerImages[sticker.customAssetId]
          if (!image) throw new Error('STICKER_ASSET_MISSING')
          const ratio = Math.min(204.8 / image.naturalWidth, 204.8 / image.naturalHeight)
          const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio
          stickerContext!.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height)
        } else stickerContext!.fillText(frame, 128, 132)
        stickerContext!.restore()
        const blob = await new Promise<Blob>((resolve, reject) => stickerCanvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('STICKER_RASTER_FAILED')), 'image/png'
        ))
        const inputName = `sticker_${stickerIndex}_${frameIndex}.png`
        const file = new File([blob], inputName, { type: 'image/png' })
        const side = sticker.size * 1.25
        inputs.push({
          inputName,
          inputIndex: startIndex + inputs.length,
          kind: 'sticker',
          stickerRender: { stickerId: sticker.id, frameIndex, frameCount: frames.length },
          overlay: {
            id: `${sticker.id}-frame-${frameIndex}`, file, url: '', name: inputName,
            x: sticker.x - side / 2, y: sticker.y - side / 2, width: side, height: side,
            rotation: sticker.rotation, startTime: sticker.startTime, endTime: sticker.endTime,
          },
        })
      }
    }
    return inputs
  }

  function getSubtitleRenderInputCount() {
    return subtitles.reduce((count, segment) => count + (resolveSubtitleStyle(segment.style).karaokeMode === 'segment' ? 2 : 1), 0)
  }

  function getSubtitleRenderInputNames() {
    return subtitles.flatMap((segment, index) => resolveSubtitleStyle(segment.style).karaokeMode === 'segment'
      ? [`subtitle_overlay_${index}.png`, `subtitle_highlight_${index}.png`]
      : [`subtitle_overlay_${index}.png`])
  }

  function getStickerRenderInputCount() {
    return stickers.reduce((count, sticker) => count + stickerFrames(sticker).length, 0)
  }

  function getStickerRenderInputNames() {
    return stickers.flatMap((sticker, stickerIndex) => stickerFrames(sticker).map((_, frameIndex) => `sticker_${stickerIndex}_${frameIndex}.png`))
  }

  function getImageOverlayPlacement(overlay: ImageOverlay) {
    const outputWidth = canvasSize.width || 1280
    const outputHeight = canvasSize.height || 720
    const scaleX = outputWidth / (canvasSize.width || outputWidth)
    const scaleY = outputHeight / (canvasSize.height || outputHeight)
    const width = Math.max(2, Math.round(overlay.width * scaleX))
    const height = Math.max(2, Math.round(overlay.height * scaleY))

    return {
      x: clamp(Math.round(overlay.x * scaleX), 0, Math.max(outputWidth - width, 0)),
      y: clamp(Math.round(overlay.y * scaleY), 0, Math.max(outputHeight - height, 0)),
      width,
      height,
    }
  }

  function appendImageOverlayFilters(
    filters: string[], previousLabel: string, inputIndex: number, overlay: ImageOverlay,
    imageLabel: string, nextLabel: string, timing: string,
  ) {
    const placement = getImageOverlayPlacement(overlay)
    const rotation = normalizeImageAngle(overlay.rotation || 0)
    if (rotation === 0) {
      filters.push(`[${inputIndex}:v]scale=${placement.width}:${placement.height}[${imageLabel}]`)
      filters.push(`[${previousLabel}][${imageLabel}]overlay=${placement.x}:${placement.y}${timing}[${nextLabel}]`)
      return
    }
    const box = rotatedImageSize({ ...placement, rotation })
    // Extra transparent pixels cover interpolation at the extreme corners.
    const expandedWidth = Math.ceil(box.width) + 2
    const expandedHeight = Math.ceil(box.height) + 2
    const angle = (rotation * Math.PI / 180).toFixed(9)
    const centerX = overlay.x + overlay.width / 2
    const centerY = overlay.y + overlay.height / 2
    const x = Math.round(centerX - expandedWidth / 2)
    const y = Math.round(centerY - expandedHeight / 2)
    filters.push(`[${inputIndex}:v]scale=${placement.width}:${placement.height},format=rgba,rotate=${angle}:ow=${expandedWidth}:oh=${expandedHeight}:c=none[${imageLabel}]`)
    filters.push(`[${previousLabel}][${imageLabel}]overlay=${x}:${y}${timing}[${nextLabel}]`)
  }

  function appendVideoOverlayFilters(
    filters: string[], previousLabel: string, inputIndex: number, overlay: VideoOverlay,
    imageLabel: string, nextLabel: string,
  ) {
    const placement = getImageOverlayPlacement(overlay)
    const rotation = normalizeImageAngle(overlay.rotation)
    const source = `[${inputIndex}:v]trim=start=${overlay.trimStart.toFixed(3)}:duration=${(overlay.trimEnd - overlay.trimStart).toFixed(3)},setpts=PTS-STARTPTS+${overlay.startTime.toFixed(3)}/TB,scale=${placement.width}:${placement.height},format=rgba`
    if (rotation === 0) {
      filters.push(`${source}[${imageLabel}]`)
      filters.push(`[${previousLabel}][${imageLabel}]overlay=${placement.x}:${placement.y}:eof_action=pass:repeatlast=0[${nextLabel}]`)
      return
    }
    const box = rotatedImageSize({ ...placement, rotation })
    const expandedWidth = Math.ceil(box.width) + 2
    const expandedHeight = Math.ceil(box.height) + 2
    const x = Math.round(overlay.x + overlay.width / 2 - expandedWidth / 2)
    const y = Math.round(overlay.y + overlay.height / 2 - expandedHeight / 2)
    const angle = (rotation * Math.PI / 180).toFixed(9)
    filters.push(`${source},rotate=${angle}:ow=${expandedWidth}:oh=${expandedHeight}:c=none[${imageLabel}]`)
    filters.push(`[${previousLabel}][${imageLabel}]overlay=${x}:${y}:eof_action=pass:repeatlast=0[${nextLabel}]`)
  }

  function appendSubtitleOverlayFilters(
    filters: string[], previousLabel: string, input: RenderImageInput,
    imageLabel: string, nextLabel: string,
  ) {
    const subtitleRender = input.subtitleRender
    if (!subtitleRender) return
    const { segment, role } = subtitleRender
    const style = resolveSubtitleStyle(segment.style)
    const segmentDuration = Math.max(segment.endTime - segment.startTime, 0.001)
    const enterDuration = Math.min(style.enterDuration, segmentDuration / 2)
    const exitDuration = Math.min(style.exitDuration, segmentDuration / 2)
    const intensity = style.animationIntensity / 100
    const filtersForInput = ['format=rgba']
    const animated = style.animation !== 'none'

    if (animated && enterDuration > 0) filtersForInput.push(`fade=t=in:st=0:d=${enterDuration.toFixed(3)}:alpha=1`)
    if (animated && exitDuration > 0) filtersForInput.push(`fade=t=out:st=${(segmentDuration - exitDuration).toFixed(3)}:d=${exitDuration.toFixed(3)}:alpha=1`)
    if (role === 'highlight') filtersForInput.push(`fade=t=in:st=0:d=${segmentDuration.toFixed(3)}:alpha=1`)

    if ((style.animation === 'pop' || style.animation === 'zoom') && enterDuration > 0 && intensity > 0) {
      const progress = `min(1,max(0,t/${enterDuration.toFixed(3)}))`
      const factor = style.animation === 'pop'
        ? `1-${(0.18 * intensity).toFixed(5)}*(1-${progress})+${(0.14 * intensity).toFixed(5)}*sin(PI*${progress})`
        : `1-${(0.08 * intensity).toFixed(5)}*(1-${progress})`
      filtersForInput.push(`scale=w='max(2,trunc(iw*(${factor})/2)*2)':h='max(2,trunc(ih*(${factor})/2)*2)':eval=frame`)
    }
    filtersForInput.push(`setpts=PTS-STARTPTS+${segment.startTime.toFixed(3)}/TB`)
    filters.push(`[${input.inputIndex}:v]${filtersForInput.join(',')}[${imageLabel}]`)

    const anchorX = style.align === 'left' ? 0.06 : style.align === 'right' ? 0.94 : 0.5
    const anchorY = style.position / 100
    const x = `(main_w-overlay_w)*${anchorX.toFixed(3)}`
    const baseY = `(main_h-overlay_h)*${anchorY.toFixed(3)}`
    const y = style.animation === 'slide' && enterDuration > 0 && intensity > 0
      ? `${baseY}+if(lt(t,${(segment.startTime + enterDuration).toFixed(3)}),main_h*${(0.03 * intensity).toFixed(5)}*(1-max(0,t-${segment.startTime.toFixed(3)})/${enterDuration.toFixed(3)}),0)`
      : baseY
    filters.push(`[${previousLabel}][${imageLabel}]overlay=x='${x}':y='${y}':eof_action=pass:repeatlast=0[${nextLabel}]`)
  }

  function appendVisualOverlayFilters(
    filters: string[], previousLabel: string, renderImages: RenderImageInput[],
    includeTiming: boolean, includeStickers: boolean, prefix: string,
  ) {
    let currentLabel = previousLabel
    const inputs = new Map(renderImages.filter((input) => input.kind !== 'sticker').map((input) => [input.overlay.id, input]))
    const ordered = orderVisualLayers<VisualLayer>([
      ...renderImages.filter((input) => input.kind !== 'subtitle').map((input) => ({ id: input.overlay.id, type: (input.kind === 'video' ? 'video' : input.kind === 'text' ? 'text' : 'image') as VisualLayerType, startTime: input.overlay.startTime, endTime: input.overlay.endTime })),
      ...stickers.map(({ id, startTime, endTime }) => ({ id, type: 'sticker' as const, startTime, endTime })),
    ], visualLayerOrder)
    let imageIndex = 0
    ordered.forEach((layer) => {
      if (layer.type === 'sticker') {
        const sticker = stickers.find((item) => item.id === layer.id)
        if (!sticker || !includeStickers) return
        const stickerInputs = renderImages.filter((input) => input.kind === 'sticker' && input.stickerRender?.stickerId === sticker.id)
        if (stickerInputs.length === 0) {
          const draws = buildStickerDrawFilters(true, [sticker])
          draws.forEach((draw, frameIndex) => {
            const nextLabel = `${prefix}sticker${layer.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}${frameIndex}`
            filters.push(`[${currentLabel}]${draw}[${nextLabel}]`)
            currentLabel = nextLabel
          })
          return
        }
        stickerInputs.forEach((input, frameIndex) => {
          const frame = input.stickerRender?.frameIndex ?? frameIndex
          const timing = `:enable='${stickerFrameEnableExpression(sticker, frame, sticker.endTime)}'`
          const imageLabel = `${prefix}stickerimg${imageIndex}`
          const nextLabel = `${prefix}stickerlayer${imageIndex}`
          appendImageOverlayFilters(filters, currentLabel, input.inputIndex, input.overlay, imageLabel, nextLabel, timing)
          currentLabel = nextLabel
          imageIndex++
        })
        return
      }
      const renderImage = inputs.get(layer.id)
      if (!renderImage) return
      const index = imageIndex++
      const startTime = Number.isFinite(renderImage.overlay.startTime) ? renderImage.overlay.startTime : 0
      const endTime = Number.isFinite(renderImage.overlay.endTime) ? renderImage.overlay.endTime : duration
      const timing = includeTiming ? `:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'` : ''
      const imageLabel = `${prefix}img${index}`
      const nextLabel = `${prefix}layer${index}`
      if (renderImage.kind === 'video') appendVideoOverlayFilters(filters, currentLabel, renderImage.inputIndex, renderImage.overlay as VideoOverlay, imageLabel, nextLabel)
      else appendImageOverlayFilters(filters, currentLabel, renderImage.inputIndex, renderImage.overlay, imageLabel, nextLabel, timing)
      currentLabel = nextLabel
    })
    renderImages.filter((input) => input.kind === 'subtitle').forEach((input, index) => {
      const nextLabel = `${prefix}subtitle${index}`
      appendSubtitleOverlayFilters(filters, currentLabel, input, `${prefix}subimg${index}`, nextLabel)
      currentLabel = nextLabel
    })
    filters.push(`[${currentLabel}]format=yuv420p[v]`)
  }

  function buildImageVideoFilter(
    renderImages: RenderImageInput[],
    includeTiming: boolean,
    includeStickers = true
  ) {
    const filters = [`[0:v]${clipColorFilter('base-video')},${fitMediaFilter(canvasSize, frameMode)}[vbase]`]
    appendVisualOverlayFilters(filters, 'vbase', renderImages, includeTiming, includeStickers, 'main')

    return filters.join(';')
  }

  function buildAudioMixFilters({
    totalDuration,
    musicInputIndex,
    voiceInputIndex,
    includeOriginalAudio,
    mixDuration,
  }: {
    totalDuration: number
    musicInputIndex: number | null
    voiceInputIndex: number | null
    includeOriginalAudio: boolean
    mixDuration: 'first' | 'longest'
  }) {
    const filters: string[] = []
    const labels: string[] = []

    if (includeOriginalAudio) {
      filters.push(`[0:a]volume=${(videoVolume * mixScale).toFixed(6)}[a0]`)
      labels.push('[a0]')
    }

    if (musicInputIndex !== null) {
      filters.push(musicAudioFilter(musicInputIndex, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale }, 'aMusic'))
      labels.push('[aMusic]')
    }

    if (voiceInputIndex !== null) {
      const voiceDelayMs = Math.max(Math.round(voiceStartTime * 1000), 0)
      filters.push(
        `[${voiceInputIndex}:a]adelay=${voiceDelayMs}:all=1,atrim=0:${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${(voiceVolume * mixScale).toFixed(6)}[aVoice]`
      )
      labels.push('[aVoice]')
    }

    if (labels.length === 0) return filters
    if (labels.length === 1) return [...filters, `${labels[0]}anull[a]`]

    return [
      ...filters,
      `${labels.join('')}amix=inputs=${labels.length}:duration=${mixDuration}:dropout_transition=0:normalize=0[a]`,
    ]
  }

  function buildRenderArgs(
    inputVideoName: string,
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    renderImages: RenderImageInput[],
    includeImageTiming = true,
    includeStickers = true,
    hasBaseAudio = true
  ) {
    const hasRenderImages = renderImages.length > 0

    if (!hasBaseAudio) {
      const videoGraph = hasRenderImages
        ? buildImageVideoFilter(renderImages, includeImageTiming, includeStickers)
        : `[0:v]${buildVideoFilter(true, includeStickers)}[v]`
      const audioFilters = buildAudioMixFilters({
        totalDuration: duration,
        musicInputIndex: inputAudioName ? 1 : null,
        voiceInputIndex,
        includeOriginalAudio: false,
        mixDuration: 'longest',
      })
      return [
        '-i', inputVideoName,
        ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
        ...renderImages.flatMap(renderImageInputArgs),
        ...(inputVoiceName ? ['-i', inputVoiceName] : []),
        '-filter_complex', [videoGraph, ...audioFilters].join(';'),
        '-map', '[v]', ...(audioFilters.length ? ['-map', '[a]'] : ['-an']),
        '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        ...(audioFilters.length ? ['-c:a', 'aac', '-b:a', '192k'] : []),
        '-movflags', '+faststart', '-t', duration.toFixed(3), 'entreus_output.mp4',
      ]
    }

    if (inputVoiceName) {
      const inputArgs = [
        '-i',
        inputVideoName,
        ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
        ...renderImages.flatMap(renderImageInputArgs),
        '-i',
        inputVoiceName,
      ]
      const videoGraph = hasRenderImages
        ? buildImageVideoFilter(renderImages, includeImageTiming, includeStickers)
        : `[0:v]${buildVideoFilter(true, includeStickers)}[v]`
      const audioFilters = buildAudioMixFilters({
        totalDuration: duration,
        musicInputIndex: inputAudioName ? 1 : null,
        voiceInputIndex,
        includeOriginalAudio: true,
        mixDuration: 'first',
      })

      return [
        ...inputArgs,
        '-filter_complex',
        [videoGraph, ...audioFilters].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        'entreus_output.mp4',
      ]
    }

    const videoFilter = hasRenderImages
      ? buildImageVideoFilter(renderImages, includeImageTiming, includeStickers)
      : buildVideoFilter(true, includeStickers)

    if (!inputAudioName) {
      if (hasRenderImages) {
        return [
          '-i',
          inputVideoName,
          ...renderImages.flatMap(renderImageInputArgs),
          '-filter_complex',
          `${videoFilter};[0:a]volume=${(videoVolume * mixScale).toFixed(6)}[a]`,
          '-map',
          '[v]',
          '-map',
          '[a]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-shortest',
          'entreus_output.mp4',
        ]
      }

      return [
        '-i',
        inputVideoName,
        '-filter_complex',
        `[0:v]${videoFilter}[v];[0:a]volume=${(videoVolume * mixScale).toFixed(6)}[a]`,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        'entreus_output.mp4',
      ]
    }

    return [
      '-i',
      inputVideoName,
      '-stream_loop',
      '-1',
      '-i',
      inputAudioName,
      ...renderImages.flatMap(renderImageInputArgs),
      '-filter_complex',
      hasRenderImages
        ? [
            videoFilter,
            `[0:a]volume=${(videoVolume * mixScale).toFixed(6)}[a0]`,
            musicAudioFilter(1, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale }, 'a1'),
            '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]',
          ].join(';')
        : [
            `[0:v]${videoFilter}[v]`,
            `[0:a]volume=${(videoVolume * mixScale).toFixed(6)}[a0]`,
            musicAudioFilter(1, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale }, 'a1'),
            '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]',
          ].join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-t',
      duration.toFixed(3),
      'entreus_output.mp4',
    ]
  }

  function buildFallbackRenderArgs(
    inputVideoName: string,
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    renderImages: RenderImageInput[],
    includeImageTiming = false,
    includeStickers = true
  ) {
    const hasRenderImages = renderImages.length > 0

    if (inputVoiceName) {
      const inputArgs = [
        '-i',
        inputVideoName,
        ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
        ...renderImages.flatMap(renderImageInputArgs),
        '-i',
        inputVoiceName,
      ]
      const videoGraph = hasRenderImages
        ? buildImageVideoFilter(renderImages, includeImageTiming, includeStickers)
        : `[0:v]${buildVideoFilter(true, includeStickers)}[v]`
      const audioFilters = buildAudioMixFilters({
        totalDuration: duration,
        musicInputIndex: inputAudioName ? 1 : null,
        voiceInputIndex,
        includeOriginalAudio: false,
        mixDuration: 'longest',
      })

      return [
        ...inputArgs,
        '-filter_complex',
        [videoGraph, ...audioFilters].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-t',
        duration.toFixed(3),
        'entreus_output.mp4',
      ]
    }

    const videoFilter = hasRenderImages
      ? buildImageVideoFilter(renderImages, includeImageTiming, includeStickers)
      : buildVideoFilter(true, includeStickers)

    if (!inputAudioName) {
      if (hasRenderImages) {
        return [
          '-i',
          inputVideoName,
          ...renderImages.flatMap(renderImageInputArgs),
          '-filter_complex',
          videoFilter,
          '-map',
          '[v]',
          '-an',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-movflags',
          '+faststart',
          'entreus_output.mp4',
        ]
      }

      return [
        '-i',
        inputVideoName,
        '-filter_complex',
        `[0:v]${videoFilter}[v]`,
        '-map',
        '[v]',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-movflags',
        '+faststart',
        'entreus_output.mp4',
      ]
    }

    return [
      '-i',
      inputVideoName,
      '-stream_loop',
      '-1',
      '-i',
      inputAudioName,
      ...renderImages.flatMap(renderImageInputArgs),
      '-filter_complex',
      hasRenderImages
        ? [
            videoFilter,
            musicAudioFilter(1, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale }, 'a'),
          ].join(';')
        : [
            `[0:v]${videoFilter}[v]`,
            musicAudioFilter(1, { startTime: musicStartTime, trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut, volume: musicVolume * mixScale }, 'a'),
          ].join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-t',
      duration.toFixed(3),
      'entreus_output.mp4',
    ]
  }

  function shouldPreferCompactCompression() {
    const isCoarseMobileDevice =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1)

    return isCoarseMobileDevice || (videoFile?.size || 0) > HEAVY_VIDEO_SIZE_BYTES
  }

  function getCompressionProfile() {
    if (compressionPreset === 'light') return COMPRESSION_PROFILES.light
    if (compressionPreset === 'high') return COMPRESSION_PROFILES.high

    return shouldPreferCompactCompression()
      ? COMPRESSION_PROFILES.light
      : COMPRESSION_PROFILES.auto
  }

  function buildCompressionArgs(inputName: string, outputName: string, profile: CompressionProfile) {
    const scaleFilter = [
      'scale=',
      `'if(gt(iw,ih),min(iw,${profile.maxWidth}),-2)'`,
      ':',
      `'if(gt(iw,ih),-2,min(ih,${profile.maxHeight}))'`,
    ].join('')

    return [
      '-i',
      inputName,
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      profile.videoBitrate,
      '-maxrate',
      profile.videoBitrate,
      '-bufsize',
      `${Number.parseInt(profile.videoBitrate, 10) * 2}k`,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      profile.audioBitrate,
      '-movflags',
      '+faststart',
      outputName,
    ]
  }

  function readFfmpegBytes(outputData: Awaited<ReturnType<FFmpeg['readFile']>>) {
    const outputBytes =
      typeof outputData === 'string'
        ? new TextEncoder().encode(outputData)
        : outputData

    return new Uint8Array(outputBytes)
  }

  async function optimizeRenderedVideo(ffmpeg: FFmpeg, renderedName: string, optimizedName: string, operation: number) {
    const renderedData = await ffmpeg.readFile(renderedName)
    assertRenderCurrent(operation)
    const renderedArray = readFfmpegBytes(renderedData)
    const profile = getCompressionProfile()

    setRenderStage('optimizing', `Otimizando video (${profile.label})...`, operation)
    console.info('[VideoEditor] Compression start:', {
      sourceBytes: renderedArray.byteLength,
      chosenPreset: compressionPreset,
      profile: profile.label,
      maxWidth: profile.maxWidth,
      maxHeight: profile.maxHeight,
      videoBitrate: profile.videoBitrate,
      audioBitrate: profile.audioBitrate,
    })

    try {
      await cleanupFfmpegFiles(ffmpeg, [optimizedName])

      const compressionArgs = buildCompressionArgs(renderedName, optimizedName, profile)
      console.info('[VideoEditor] FFmpeg compression command:', compressionArgs.join(' '))
      const exitCode = await ffmpeg.exec(compressionArgs)

      if (exitCode !== 0) {
        throw new Error('FFmpeg retornou erro ao otimizar o video.')
      }

      const optimizedData = await ffmpeg.readFile(optimizedName)
      assertRenderCurrent(operation)
      const optimizedArray = readFfmpegBytes(optimizedData)
      const usedOptimizedFile = optimizedArray.byteLength < renderedArray.byteLength
      const finalArray = usedOptimizedFile ? optimizedArray : renderedArray

      setCompressionStats({
        originalBytes: renderedArray.byteLength,
        optimizedBytes: finalArray.byteLength,
        profile: profile.label,
        usedOptimizedFile,
      })

      console.info('[VideoEditor] Compression done:', {
        sourceBytes: renderedArray.byteLength,
        optimizedBytes: optimizedArray.byteLength,
        uploadedBytes: finalArray.byteLength,
        reductionPercent: getReductionPercent(renderedArray.byteLength, finalArray.byteLength),
        usedOptimizedFile,
        profile: profile.label,
      })

      return finalArray
    } catch (error) {
      assertRenderCurrent(operation)
      console.warn('[VideoEditor] Compression failed, publishing standard render:', {
        error,
        sourceBytes: renderedArray.byteLength,
        chosenPreset: compressionPreset,
        profile: profile.label,
      })
      setRenderStage('optimizing_fallback', 'Nao foi possivel otimizar neste navegador. Tentando publicar com renderizacao padrao.', operation)
      setCompressionStats({
        originalBytes: renderedArray.byteLength,
        optimizedBytes: renderedArray.byteLength,
        profile: `${profile.label} (padrao)`,
        usedOptimizedFile: false,
      })

      return renderedArray
    }
  }

  async function cleanupFfmpegFiles(ffmpeg: FFmpeg, paths: string[]) {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await ffmpeg.deleteFile(path)
        } catch {
          // Ignore cleanup misses in the virtual FS.
        }
      })
    )
  }

  function getPhotoSlidesDuration(slides = photoSlides) {
    return slides.reduce((total, slide) => total + slide.duration, 0)
  }

  function buildPhotoVideoFilter(slides: PhotoSlide[], useFade: boolean, renderImages: RenderImageInput[] = []) {
    const slideFilters = slides.map((slide, index) => {
      const baseFilters = [
        fitMediaFilter(canvasSize, frameMode),
        clipColorFilter(slide.id),
        'format=yuv420p',
      ]

      // Explicit hard cuts (including AutoReels) override the legacy global fade.
      if (useFade && clipTransitions[slide.id] !== 'none' && slide.duration > 0.8) {
        baseFilters.push('fade=t=in:st=0:d=0.25')
        baseFilters.push(`fade=t=out:st=${Math.max(slide.duration - 0.25, 0).toFixed(2)}:d=0.25`)
      }

      return `[${index}:v]${baseFilters.join(',')}[p${index}]`
    })

    const filters = [...slideFilters]
    if (slides.length === 1) filters.push('[p0]null[pjoined]')
    else {
      const concatInputs = slides.map((_, index) => `[p${index}]`).join('')
      filters.push(`${concatInputs}concat=n=${slides.length}:v=1:a=0[pjoined]`)
    }
    appendVisualOverlayFilters(filters, 'pjoined', renderImages, true, true, 'photo')
    return filters.join(';')
  }

  function buildPhotoRenderArgs(
    photoInputs: { name: string; slide: PhotoSlide }[],
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    useFade: boolean,
    renderImages: RenderImageInput[] = [],
  ) {
    const totalDuration = getPhotoSlidesDuration(photoInputs.map((item) => item.slide))
    const inputArgs = photoInputs.flatMap((item) => [
      '-loop',
      '1',
      '-t',
      item.slide.duration.toFixed(3),
      '-i',
      item.name,
    ])
    const fullInputArgs = [
      ...inputArgs,
      ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
      ...renderImages.flatMap(renderImageInputArgs),
      ...(inputVoiceName ? ['-i', inputVoiceName] : []),
    ]
    const musicInputIndex = inputAudioName ? photoInputs.length : null
    const audioFilters = buildAudioMixFilters({
      totalDuration,
      musicInputIndex,
      voiceInputIndex,
      includeOriginalAudio: false,
      mixDuration: 'longest',
    })

    if (inputAudioName || inputVoiceName) {
      return [
        ...fullInputArgs,
        '-filter_complex',
        [
          buildPhotoVideoFilter(photoInputs.map((item) => item.slide), useFade, renderImages),
          ...audioFilters,
        ].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-t',
        totalDuration.toFixed(3),
        'entreus_output.mp4',
      ]
    }

    return [
      ...fullInputArgs,
      '-filter_complex',
      buildPhotoVideoFilter(photoInputs.map((item) => item.slide), useFade, renderImages),
      '-map',
      '[v]',
      '-r',
      '30',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      'entreus_output.mp4',
    ]
  }

  function buildSequenceVideoFilter(
    photoInputs: { inputIndex: number; slide: PhotoSlide }[],
    renderImages: RenderImageInput[],
    includeImageTiming = true,
    includeStickers = true
  ) {
    const outputWidth = canvasSize.width || 1280
    const outputHeight = canvasSize.height || 720
    const filters = [
      `[0:v]${clipColorFilter('base-video')},${fitMediaFilter({ width: outputWidth, height: outputHeight }, frameMode)},format=yuv420p[vclip0]`,
    ]

    photoInputs.forEach((item, index) => {
      filters.push(
        `[${item.inputIndex}:v]${fitMediaFilter({ width: outputWidth, height: outputHeight }, frameMode)},${clipColorFilter(item.slide.id)},format=yuv420p[vclip${index + 1}]`
      )
    })

    const concatInputs = Array.from({ length: photoInputs.length + 1 }, (_, index) => `[vclip${index}]`).join('')
    filters.push(`${concatInputs}concat=n=${photoInputs.length + 1}:v=1:a=0[vseq]`)

    appendVisualOverlayFilters(filters, 'vseq', renderImages, includeImageTiming, includeStickers, 'seq')

    return filters.join(';')
  }

  function buildSequenceRenderArgs(
    inputVideoName: string,
    photoInputs: { name: string; inputIndex: number; slide: PhotoSlide }[],
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    renderImages: RenderImageInput[],
    includeImageTiming = true,
    includeStickers = true,
    hasBaseAudio = true
  ) {
    const inputArgs = [
      '-i',
      inputVideoName,
      ...photoInputs.flatMap((item) => [
        '-loop',
        '1',
        '-t',
        item.slide.duration.toFixed(3),
        '-i',
        item.name,
      ]),
      ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
      ...renderImages.flatMap(renderImageInputArgs),
      ...(inputVoiceName ? ['-i', inputVoiceName] : []),
    ]
    const audioFilters = buildAudioMixFilters({
      totalDuration: duration,
      musicInputIndex: inputAudioName ? 1 + photoInputs.length : null,
      voiceInputIndex,
      includeOriginalAudio: hasBaseAudio,
      mixDuration: 'first',
    })
    const hasAudio = audioFilters.length > 0

    return [
      ...inputArgs,
      '-filter_complex',
      [
        buildSequenceVideoFilter(photoInputs, renderImages, includeImageTiming, includeStickers),
        ...audioFilters,
      ].join(';'),
      '-map',
      '[v]',
      ...(hasAudio ? ['-map', '[a]'] : ['-an']),
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []),
      '-movflags',
      '+faststart',
      '-t',
      duration.toFixed(3),
      'entreus_output.mp4',
    ]
  }

  function getOutputBlob(outputArray: Uint8Array) {
    const outputBuffer = outputArray.buffer.slice(
      outputArray.byteOffset,
      outputArray.byteOffset + outputArray.byteLength
    ) as ArrayBuffer

    return new Blob([outputBuffer], { type: 'video/mp4' })
  }

  function downloadOutputArray(outputArray: Uint8Array, operation: number) {
    assertRenderCurrent(operation)
    const outputBlob = getOutputBlob(outputArray)
    const downloadUrl = URL.createObjectURL(outputBlob)
    const downloadLink = document.createElement('a')

    downloadLink.href = downloadUrl
    downloadLink.download = mp4DownloadName(projectName)
    downloadLink.rel = 'noreferrer'
    document.body.appendChild(downloadLink)
    downloadLink.click()
    downloadLink.remove()

    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000)
    setRenderProgress(100)
    setRenderStage('done', 'Download iniciado. Se o download nao comecar, tente novamente.', operation)
  }

  async function publishOutputArray(outputArray: Uint8Array, operation: number) {
    assertRenderCurrent(operation)
    const outputBlob = getOutputBlob(outputArray)

    setRenderStage('uploading', 'Enviando para a EntreUS...', operation)

    const {
      data: { user },
      error: userError,
    } = await getBrowserUser()
    assertRenderCurrent(operation)

    if (userError || !user) {
      throw new Error('Usuario nao autenticado.')
    }

    const filePath = createUploadFilePath(user.id)
    const { error: uploadError } = await supabase.storage
      .from('posts')
      .upload(filePath, outputBlob, {
        cacheControl: '3600',
        contentType: 'video/mp4',
        upsert: false,
      })
    assertRenderCurrent(operation)

    if (uploadError) {
      throw uploadError
    }

    const { data: publicUrlData } = supabase.storage
      .from('posts')
      .getPublicUrl(filePath)

    const { error: insertError } = await supabase.from('posts').insert({
      user_id: user.id,
      video_url: publicUrlData.publicUrl,
      content: caption.trim() || null,
      created_at: new Date().toISOString(),
    })
    assertRenderCurrent(operation)

    if (insertError) {
      throw insertError
    }

    setRenderProgress(100)
    setRenderStage('done', 'Publicado com sucesso!', operation)
    autoSaveRef.current?.flush()
    setIsPublishStepOpen(false)
  }

  // All visual export paths converge here. Copy the rendered video without decoding it again.
  async function mixAdditionalAudio(outputArray: Uint8Array, operation: number): Promise<Uint8Array> {
    const clips = audioClips.filter((clip) => !clip.muted && clip.volume > 0 && clip.startTime < timelineDuration)
    if (!clips.length) return outputArray
    const ffmpeg = await getFFmpeg(operation)
    const baseName = `audio_mix_base_${operation}.mp4`, outputName = `audio_mix_final_${operation}.mp4`
    const names = clips.map((clip, index) => `audio_mix_${operation}_${index}.${getFileExtension(clip.media.name, 'wav')}`)
    const files = [baseName, outputName, ...names]
    try {
      setRenderStage('mixing_audio', 'Misturando faixas de áudio...', operation)
      await ffmpeg.writeFile(baseName, outputArray)
      assertRenderCurrent(operation)
      let missing = false
      const probeLog: LogEventCallback = ({ message }) => { if (/Stream map ['"]?0:a:0['"]? matches no streams/i.test(message)) missing = true }
      ffmpeg.on('log', probeLog)
      let probe: number
      try { probe = await ffmpeg.exec(['-v', 'error', '-i', baseName, '-map', '0:a:0', '-c:a', 'copy', '-f', 'null', '-']) }
      finally { ffmpeg.off('log', probeLog) }
      assertRenderCurrent(operation)
      if (probe !== 0 && !missing) throw new Error('Não foi possível verificar o áudio original para mixagem.')
      for (let index = 0; index < clips.length; index++) {
        const file = clips[index].file
        if (!file) throw new Error('Reassocie os arquivos de áudio antes de exportar.')
        await ffmpeg.writeFile(names[index], await fetchFile(file))
        assertRenderCurrent(operation)
      }
      const filters = [probe === 0 ? '[0:a:0]anull[aBase]' : `anullsrc=r=44100:cl=stereo,atrim=duration=${timelineDuration.toFixed(3)}[aBase]`]
      clips.forEach((clip, index) => filters.push(musicAudioFilter(index + 1, { ...audioClipTiming(clip, timelineDuration), volume: audioClipGain(clip) * mixScale }, `aExtra${index}`)))
      filters.push(`[aBase]${clips.map((_, index) => `[aExtra${index}]`).join('')}amix=inputs=${clips.length + 1}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=duration=${timelineDuration.toFixed(3)}[aMix]`)
      const exit = await ffmpeg.exec(['-i', baseName, ...names.flatMap((name) => ['-i', name]), '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[aMix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', timelineDuration.toFixed(3), '-movflags', '+faststart', outputName])
      assertRenderCurrent(operation)
      if (exit !== 0) throw new Error('Falha na mixagem das faixas. O vídeo não foi exportado.')
      const data = await ffmpeg.readFile(outputName)
      assertRenderCurrent(operation)
      if (typeof data === 'string' || !data.byteLength) throw new Error('Saída da mixagem inválida.')
      return new Uint8Array(data)
    } finally { if (isRenderCurrent(operation) && ffmpeg.loaded) await cleanupFfmpegFiles(ffmpeg, files) }
  }

  async function finishRenderedOutput(outputArray: Uint8Array, operation: number) {
    assertRenderCurrent(operation)
    outputArray = await mixAdditionalAudio(outputArray, operation)
    assertRenderCurrent(operation)
    if (isDownloadMode) {
      setRenderStage('downloading', 'Preparando download...', operation)
      downloadOutputArray(outputArray, operation)
      return
    }

    await publishOutputArray(outputArray, operation)
  }

  async function renderPhotoVideo(operation: number) {
    if (photoSlides.length === 0 || isRendering) return
    const setStage = (stage: string, message: string) => setRenderStage(stage, message, operation)

    pauseBackgroundMusic()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setStage('starting', isReady ? 'Preparando fotos...' : 'Carregando motor de video...')

    const orderedSlides = [...photoSlides].sort((a, b) => a.order - b.order)
    const photoInputs = orderedSlides.map((slide, index) => ({
      slide,
      name: `photo_slide_${index}.${getPhotoInputExtension(slide.file)}`,
    }))
    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const inputVoiceName = voiceBlob ? `voice_track.${getVoiceInputExtension(voiceBlob)}` : null
    const voiceInputIndex = inputVoiceName
      ? photoInputs.length + (inputAudioName ? 1 : 0) + overlays.length + getSubtitleRenderInputCount() + getStickerRenderInputCount()
      : null
    let renderImageInputs: RenderImageInput[] = []
    const outputName = 'entreus_output.mp4'
    const optimizedOutputName = 'entreus_output_optimized.mp4'
    const filesToClean = [
      ...photoInputs.map((item) => item.name),
      outputName,
      optimizedOutputName,
      ...(inputAudioName ? [inputAudioName] : []),
      ...(inputVoiceName ? [inputVoiceName] : []),
      ...overlays.map((_, index) => `text_overlay_${index}.png`),
      ...getSubtitleRenderInputNames(),
      ...getStickerRenderInputNames(),
    ]
    let activeFfmpeg: FFmpeg | null = null

    try {
      renderImageInputs = await createTextRenderInputs(photoInputs.length + (inputAudioName ? 1 : 0))
      const ffmpeg = await getFFmpeg(operation)
      activeFfmpeg = ffmpeg
      assertRenderCurrent(operation)
      setDuration(getPhotoSlidesDuration(orderedSlides))
      setStage('cleanup', 'Preparando fotos...')
      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setStage('write_photos', 'Enviando fotos para o FFmpeg...')
      await Promise.all(
        photoInputs.map(async (item) => {
          await ffmpeg.writeFile(item.name, await fetchFile(item.slide.file))
        })
      )
      for (const image of renderImageInputs) await ffmpeg.writeFile(image.inputName, await fetchFile(image.overlay.file))

      if (audioFile && inputAudioName) {
        setStage('write_audio', 'Preparando audio...')
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      if (voiceBlob && inputVoiceName) {
        setStage('write_voice', 'Preparando voz...')
        console.info('[VideoEditor] Voice input for photo render:', {
          size: voiceBlob.size,
          type: voiceBlob.type,
          duration: voiceDuration,
          startTime: voiceStartTime,
          volume: voiceVolume,
          inputIndex: voiceInputIndex,
        })
        await ffmpeg.writeFile(inputVoiceName, await fetchFile(voiceBlob))
      }

      const useFadeTransition = photoTransition === 'fade'
      const renderArgs = buildPhotoRenderArgs(photoInputs, inputAudioName, inputVoiceName, voiceInputIndex, useFadeTransition, renderImageInputs)
      console.info('[VideoEditor] Photo FFmpeg command:', renderArgs.join(' '))
      setStage('exec_photos', 'Renderizando fotos em video...')

      let exitCode = await ffmpeg.exec(renderArgs)

      if (exitCode !== 0 && useFadeTransition) {
        console.warn('[VideoEditor] Photo fade render failed:', { exitCode })
        setStage('exec_photos_fallback', 'Tentando sem transicao...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const fallbackArgs = buildPhotoRenderArgs(photoInputs, inputAudioName, inputVoiceName, voiceInputIndex, false, renderImageInputs)
        console.info('[VideoEditor] Photo fallback command:', fallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(fallbackArgs)
      }

      if (exitCode !== 0) {
        throw new Error('PHOTO_RENDER_FAILED')
      }

      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName, operation)
      await finishRenderedOutput(outputArray, operation)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
      if (isRenderCurrent(operation) && activeFfmpeg?.loaded) await cleanupFfmpegFiles(activeFfmpeg, filesToClean)
      console.error('[VideoEditor] Photo render failed:', {
        stage: renderStageRef.current,
        error,
        transition: photoTransition,
        photos: orderedSlides.map((slide) => ({
          name: slide.file.name,
          type: slide.file.type,
          size: slide.file.size,
          duration: slide.duration,
        })),
        hasAudio: Boolean(audioFile),
        hasVoice: Boolean(voiceBlob),
      })
      if (isRenderCurrent(operation)) setRenderMessage(getFriendlyRenderErrorMessage(error))
    } finally {
      if (isRenderCurrent(operation)) setIsRendering(false)
    }
  }

  async function renderAdvancedSequence(operation: number) {
    const setStage = (stage: string, message: string) => setRenderStage(stage, message, operation)
    const clips = timelineClips.map((clip, index) => {
      const file = clip.id === 'base-video'
        ? videoFile
        : clip.type === 'video'
          ? extraVideos.find((item) => item.id === clip.id)?.file
          : photoSlides.find((item) => item.id === clip.id)?.file
      if (!file) throw new Error(`Arquivo do clipe não encontrado: ${clip.id}`)
      const extension = clip.type === 'video'
        ? getFileExtension(file.name, 'mp4')
        : getPhotoInputExtension(file)
      return { clip, file, inputName: `sequence_clip_${index}.${extension}`, inputIndex: index }
    })
    if (clips.length === 0) return

    pauseBackgroundMusic()
    videoRef.current?.pause()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setStage('starting', 'Preparando sequência...')

    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const inputVoiceName = voiceBlob ? `voice_track.${getVoiceInputExtension(voiceBlob)}` : null
    const musicInputIndex = inputAudioName ? clips.length : null
    const renderableImageOverlays = getRenderableImageOverlays()
    const visualInputStart = clips.length + (inputAudioName ? 1 : 0)
    const renderVideoInputs: RenderImageInput[] = videoOverlays.map((overlay, index) => ({
      inputName: `video_overlay_${index}.${getFileExtension(overlay.file.name, 'mp4')}`,
      overlay, inputIndex: visualInputStart + index, kind: 'video',
    }))
    const renderImageInputs: RenderImageInput[] = [...renderVideoInputs, ...renderableImageOverlays.map((overlay, index) => ({
      inputName: `image_overlay_${index}.${getImageRenderExtension(overlay.file)}`,
      overlay,
      inputIndex: visualInputStart + renderVideoInputs.length + index,
    }))]
    const voiceInputIndex = inputVoiceName
      ? clips.length + (inputAudioName ? 1 : 0) + renderImageInputs.length + overlays.length + getSubtitleRenderInputCount() + getStickerRenderInputCount()
      : null
    const outputName = 'entreus_output.mp4'
    const optimizedOutputName = 'entreus_output_optimized.mp4'
    const probeNames = clips.filter((item) => item.clip.type === 'video').map((item) => `audio_probe_${item.inputIndex}.txt`)
    const filesToClean = [
      ...clips.map((item) => item.inputName), ...probeNames,
      ...(inputAudioName ? [inputAudioName] : []),
      ...(inputVoiceName ? [inputVoiceName] : []),
      ...renderImageInputs.map((item) => item.inputName),
      ...overlays.map((_, index) => `text_overlay_${index}.png`),
      ...getSubtitleRenderInputNames(),
      ...getStickerRenderInputNames(),
      outputName, optimizedOutputName,
    ]
    let activeFfmpeg: FFmpeg | null = null

    try {
      renderImageInputs.push(...await createTextRenderInputs(visualInputStart + renderImageInputs.length))
      assertRenderCurrent(operation)
      const ffmpeg = await getFFmpeg(operation)
      activeFfmpeg = ffmpeg
      assertRenderCurrent(operation)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
      for (const item of clips) {
        setStage('write_sequence_clip', 'Preparando clipes da timeline...')
        await ffmpeg.writeFile(item.inputName, await fetchFile(item.file))
      }
      if (audioFile && inputAudioName) await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      if (voiceBlob && inputVoiceName) await ffmpeg.writeFile(inputVoiceName, await fetchFile(voiceBlob))
      for (const image of renderImageInputs) {
        await ffmpeg.writeFile(image.inputName, await fetchFile(image.overlay.file))
      }

      const renderClips: RenderClip[] = []
      for (const item of clips) {
        let hasAudio = false
        if (item.clip.type === 'video') {
          const probeName = `audio_probe_${item.inputIndex}.txt`
          await ffmpeg.ffprobe([
            '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index',
            '-of', 'csv=p=0', item.inputName, '-o', probeName,
          ])
          let probeOutput
          try {
            probeOutput = await ffmpeg.readFile(probeName, 'utf8')
          } catch {
            throw new Error('Não foi possível analisar o áudio de um clipe.')
          }
          hasAudio = typeof probeOutput === 'string' && probeOutput.trim().length > 0
        }
        renderClips.push({
          id: item.clip.id, type: item.clip.type, duration: item.clip.duration,
          trimStart: item.clip.trimStart, transition: item.clip.transition,
          inputName: item.inputName, inputIndex: item.inputIndex, hasAudio,
        })
      }
      const plan = buildMediaSequenceGraph(renderClips, {
        transitions: validJunctionTransitions(timelineClips, junctionTransitions),
        width: canvasSize.width || 1280,
        height: canvasSize.height || 720,
        frameMode,
        visualFilter: getVisualFilter(filter),
        clipFilters: Object.fromEntries(clips.map(({ clip }) => [clip.id, clipColorFilter(clip.id)])),
        videoVolume: videoVolume * mixScale,
        ...(musicInputIndex !== null ? { music: {
          inputIndex: musicInputIndex, volume: musicVolume * mixScale, startTime: musicStartTime,
          trimStart: musicTrimStart, trimEnd: musicTrimEnd || audioDuration || timelineDuration, fadeIn: musicFadeIn, fadeOut: musicFadeOut,
        } } : {}),
        ...(voiceInputIndex !== null ? { voice: {
          inputIndex: voiceInputIndex, volume: voiceVolume * mixScale, startTime: voiceStartTime,
        } } : {}),
      })
      const buildArgs = (includeImageTiming: boolean, includeStickers: boolean) => {
        const filters = [...plan.videoFilters]
        appendVisualOverlayFilters(filters, 'vseq', renderImageInputs, includeImageTiming, includeStickers, 'advanced')
        filters.push(...plan.audioFilters)
        return [
          ...plan.inputArgs,
          ...(inputAudioName ? ['-i', inputAudioName] : []),
          ...renderImageInputs.flatMap(renderImageInputArgs),
          ...(inputVoiceName ? ['-i', inputVoiceName] : []),
          '-filter_complex', filters.join(';'),
          '-map', '[v]', ...(plan.hasAudio ? ['-map', '[a]'] : ['-an']),
          '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          ...(plan.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []),
          '-movflags', '+faststart', '-t', plan.totalDuration.toFixed(3), outputName,
        ]
      }

      setStage('exec_sequence', 'Renderizando sequência...')
      let exitCode = await ffmpeg.exec(buildArgs(true, true))
      const hasTimedImages = renderImageInputs.some(({ overlay }) => overlay.startTime > 0 || overlay.endTime < duration)
      if (exitCode !== 0 && renderImageInputs.length > 0 && !hasTimedImages) {
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        exitCode = await ffmpeg.exec(buildArgs(false, true))
      }
      if (exitCode !== 0 && stickers.some((sticker) => sticker.customAssetId)) throw new Error('STICKER_RASTER_FAILED')
      if (exitCode !== 0 && stickers.length > 0) {
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        exitCode = await ffmpeg.exec(buildArgs(hasTimedImages, false))
      }
      if (exitCode !== 0) throw new Error('SEQUENCE_RENDER_FAILED')
      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName, operation)
      await finishRenderedOutput(outputArray, operation)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
      if (isRenderCurrent(operation) && activeFfmpeg?.loaded) await cleanupFfmpegFiles(activeFfmpeg, filesToClean)
      console.error('[VideoEditor] Sequence render failed:', { stage: renderStageRef.current, error })
      if (isRenderCurrent(operation)) setRenderMessage(getFriendlyRenderErrorMessage(error))
    } finally {
      if (isRenderCurrent(operation)) setIsRendering(false)
    }
  }

  async function renderFinalVideo() {
    if (renderLockRef.current) return
    if (audioClipImportBusyRef.current || audioClips.some((clip) => !clip.file)) {
      setRenderMessage('Aguarde a importação ou reassocie as faixas de áudio ausentes antes de exportar.')
      openEditorPanel('audio')
      return
    }
    if (!hasAdvancedSequence && editorMode !== 'photos' && (!videoFile || isRendering)) return
    const operation = ++renderOperationRef.current
    renderAbortRef.current = new AbortController()
    renderLockRef.current = true
    const setStage = (stage: string, message: string) => setRenderStage(stage, message, operation)

    if (hasAdvancedSequence) {
      try {
        await renderAdvancedSequence(operation)
      } finally {
        finishRenderOperation(operation)
      }
      return
    }

    if (editorMode === 'photos') {
      try {
        await renderPhotoVideo(operation)
      } finally {
        finishRenderOperation(operation)
      }
      return
    }

    if (!videoFile) {
      finishRenderOperation(operation)
      return
    }

    pauseBackgroundMusic()
    videoRef.current?.pause()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setStage('starting', isReady ? 'Preparando video...' : 'Carregando motor de video...')

    const inputVideoName = `input.${getFileExtension(videoFile.name, 'mp4')}`
    const orderedSequencePhotos = editorMode === 'video'
      ? [...photoSlides].sort((a, b) => a.order - b.order)
      : []
    const sequencePhotoInputs = orderedSequencePhotos.map((slide, index) => ({
      slide,
      name: `sequence_photo_${index}.${getPhotoInputExtension(slide.file)}`,
      inputIndex: index + 1,
    }))
    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const inputVoiceName = voiceBlob ? `voice_track.${getVoiceInputExtension(voiceBlob)}` : null
    const outputName = 'entreus_output.mp4'
    const optimizedOutputName = 'entreus_output_optimized.mp4'
    const renderableImageOverlays = getRenderableImageOverlays()
    const imageInputStartIndex = 1 + sequencePhotoInputs.length + (inputAudioName ? 1 : 0)
    const renderVideoInputs: RenderImageInput[] = videoOverlays.map((overlay, index) => ({
      inputName: `video_overlay_${index}.${getFileExtension(overlay.file.name, 'mp4')}`,
      overlay, inputIndex: imageInputStartIndex + index, kind: 'video',
    }))
    const renderImageInputs: RenderImageInput[] = [...renderVideoInputs, ...renderableImageOverlays.map((overlay, index) => ({
      inputName: `image_overlay_${index}.${getImageRenderExtension(overlay.file)}`,
      overlay,
      inputIndex: imageInputStartIndex + renderVideoInputs.length + index,
    }))]
    const voiceInputIndex = inputVoiceName
      ? 1 + sequencePhotoInputs.length + (inputAudioName ? 1 : 0) + renderImageInputs.length + overlays.length + getSubtitleRenderInputCount() + getStickerRenderInputCount()
      : null
    const filesToClean = [
      inputVideoName,
      outputName,
      optimizedOutputName,
      ...sequencePhotoInputs.map((item) => item.name),
      ...(inputAudioName ? [inputAudioName] : []),
      ...(inputVoiceName ? [inputVoiceName] : []),
      ...renderImageInputs.map((renderImage) => renderImage.inputName),
      ...overlays.map((_, index) => `text_overlay_${index}.png`),
      ...getSubtitleRenderInputNames(),
      ...getStickerRenderInputNames(),
    ]
    let activeFfmpeg: FFmpeg | null = null

    try {
      renderImageInputs.push(...await createTextRenderInputs(imageInputStartIndex + renderImageInputs.length))
      assertRenderCurrent(operation)
      if (imageOverlays.some((overlay) => overlay.file.type === 'image/webp')) {
        setImageMessage('WebP aparece na previa, mas ainda nao entra no video final. Use PNG ou JPG.')
      }
      logRenderContext('start', {
        inputVideoName,
        inputAudioName,
        inputVoiceName,
        compressionPreset,
        canvasSize,
        sequencePhotos: sequencePhotoInputs.map((item) => ({
          name: item.slide.file.name,
          type: item.slide.file.type,
          size: item.slide.file.size,
          duration: item.slide.duration,
          inputName: item.name,
          inputIndex: item.inputIndex,
        })),
        imageOverlays: renderImageInputs.map((renderImage) => ({
          type: renderImage.overlay.file.type,
          size: renderImage.overlay.file.size,
          name: renderImage.overlay.name,
          inputName: renderImage.inputName,
          inputIndex: renderImage.inputIndex,
          placement: getImageOverlayPlacement(renderImage.overlay),
          startTime: renderImage.overlay.startTime,
          endTime: renderImage.overlay.endTime,
          rotation: renderImage.overlay.rotation,
        })),
        stickers: stickers.map((sticker) => ({
          value: sticker.value,
          placement: getStickerPlacement(sticker),
          startTime: sticker.startTime,
          endTime: sticker.endTime,
          rotation: sticker.rotation,
        })),
      })
      const ffmpeg = await getFFmpeg(operation)
      activeFfmpeg = ffmpeg
      assertRenderCurrent(operation)

      setStage('cleanup', 'Preparando video...')
      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setStage('write_video', 'Preparando video...')
      await ffmpeg.writeFile(inputVideoName, await fetchFile(videoFile))
      let audioStreamMissing = false
      const onAudioProbeLog: LogEventCallback = ({ message }) => {
        if (/Stream map ['"]?0:a:0['"]? matches no streams/i.test(message)) audioStreamMissing = true
      }
      ffmpeg.on('log', onAudioProbeLog)
      let probeExitCode: number
      try {
        probeExitCode = await ffmpeg.exec(['-v', 'error', '-i', inputVideoName, '-map', '0:a:0', '-c:a', 'copy', '-f', 'null', '-'])
      } finally {
        ffmpeg.off('log', onAudioProbeLog)
      }
      if (probeExitCode !== 0 && !audioStreamMissing) throw new Error(`Não foi possível analisar o áudio do vídeo base (FFmpeg ${probeExitCode}).`)
      const hasBaseAudio = probeExitCode === 0
      console.info('[VideoEditor] Base audio stream:', hasBaseAudio ? 'present' : 'absent')

      for (const photoInput of sequencePhotoInputs) {
        setStage('write_sequence_photo', 'Preparando foto da timeline...')
        await ffmpeg.writeFile(photoInput.name, await fetchFile(photoInput.slide.file))
      }

      if (audioFile && inputAudioName) {
        setStage('write_audio', 'Preparando audio...')
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      if (voiceBlob && inputVoiceName) {
        setStage('write_voice', 'Preparando voz...')
        console.info('[VideoEditor] Voice input for video render:', {
          size: voiceBlob.size,
          type: voiceBlob.type,
          duration: voiceDuration,
          startTime: voiceStartTime,
          volume: voiceVolume,
          inputIndex: voiceInputIndex,
        })
        await ffmpeg.writeFile(inputVoiceName, await fetchFile(voiceBlob))
      }

      for (const renderImageInput of renderImageInputs) {
        const placement = getImageOverlayPlacement(renderImageInput.overlay)
        setStage('write_image', 'Preparando imagem...')
        console.info('[VideoEditor] Image overlay input:', {
          type: renderImageInput.overlay.file.type,
          size: renderImageInput.overlay.file.size,
          name: renderImageInput.overlay.name,
          inputName: renderImageInput.inputName,
          placement,
          startTime: renderImageInput.overlay.startTime,
          endTime: renderImageInput.overlay.endTime,
          rotation: renderImageInput.overlay.rotation,
        })
        await ffmpeg.writeFile(renderImageInput.inputName, await fetchFile(renderImageInput.overlay.file))
      }

      const renderArgs = sequencePhotoInputs.length > 0
        ? buildSequenceRenderArgs(inputVideoName, sequencePhotoInputs, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, true, true, hasBaseAudio)
        : buildRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, true, true, hasBaseAudio)
      const hasTimedImages = renderImageInputs.some(({ overlay }) =>
        overlay.startTime > 0 || overlay.endTime < duration
      )
      console.info('[VideoEditor] FFmpeg command:', renderArgs.join(' '))
      setStage('exec_primary', 'Renderizando versao final...')

      let exitCode = await ffmpeg.exec(renderArgs)
      let renderPath = 'primary'
      if (exitCode !== 0 && inputAudioName) throw new Error('MUSIC_MIX_FAILED')

      if (exitCode !== 0 && renderImageInputs.length > 0 && !hasTimedImages) {
        console.warn('[VideoEditor] FFmpeg image timing render failed:', { exitCode })
        setStage('exec_image_fallback', 'Ajustando imagem e tentando novamente...')
        renderPath = 'image_timing_fallback'
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const imageFallbackArgs = sequencePhotoInputs.length > 0
          ? buildSequenceRenderArgs(inputVideoName, sequencePhotoInputs, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, false, true, hasBaseAudio)
          : buildRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, false, true, hasBaseAudio)
        console.info('[VideoEditor] FFmpeg image fallback command:', imageFallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(imageFallbackArgs)
      }

      if (exitCode !== 0 && stickers.length > 0) {
        if (stickers.some((sticker) => sticker.customAssetId)) throw new Error('STICKER_RASTER_FAILED')
        console.warn('[VideoEditor] FFmpeg sticker render failed, retrying without stickers:', {
          exitCode,
          stickers: stickers.length,
        })
        setStage('exec_sticker_fallback', 'Ajustando figurinhas e tentando novamente...')
        renderPath = 'sticker_fallback'
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const stickerFallbackArgs = sequencePhotoInputs.length > 0
          ? buildSequenceRenderArgs(
              inputVideoName,
              sequencePhotoInputs,
              inputAudioName,
              inputVoiceName,
              voiceInputIndex,
              renderImageInputs,
              hasTimedImages,
              false,
              hasBaseAudio
            )
          : buildRenderArgs(
              inputVideoName,
              inputAudioName,
              inputVoiceName,
              voiceInputIndex,
              renderImageInputs,
              hasTimedImages,
              false,
              hasBaseAudio
            )
        console.info('[VideoEditor] FFmpeg sticker fallback command:', stickerFallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(stickerFallbackArgs)
      }

      if (exitCode !== 0 && sequencePhotoInputs.length === 0) {
        console.warn('[VideoEditor] FFmpeg primary render failed:', { exitCode })
        setStage('exec_fallback', 'Ajustando mixagem e tentando novamente...')
        renderPath = 'audio_fallback'
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const fallbackArgs = buildFallbackRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, true, stickers.length === 0)
        console.info('[VideoEditor] FFmpeg fallback command:', fallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(fallbackArgs)
      }

      if (exitCode !== 0) {
        if (sequencePhotoInputs.length > 0) {
          throw new Error('SEQUENCE_RENDER_FAILED')
        }
        if (renderImageInputs.length > 0) {
          throw new Error('IMAGE_OVERLAY_RENDER_FAILED')
        }
        throw new Error('FFmpeg retornou erro ao renderizar o video.')
      }

      console.info('[VideoEditor] Render path:', renderPath)

      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName, operation)
      await finishRenderedOutput(outputArray, operation)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
      if (isRenderCurrent(operation) && activeFfmpeg?.loaded) await cleanupFfmpegFiles(activeFfmpeg, filesToClean)
      console.error('[VideoEditor] Render failed:', {
        stage: renderStageRef.current,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        ffmpegLoaded: Boolean(ffmpegRef.current?.loaded),
        video: videoFile
          ? {
              name: videoFile.name,
              type: videoFile.type,
              size: videoFile.size,
            }
          : null,
        audio: audioFile
          ? {
              name: audioFile.name,
              type: audioFile.type,
              size: audioFile.size,
            }
          : null,
        voice: voiceBlob
          ? {
              type: voiceBlob.type,
              size: voiceBlob.size,
              duration: voiceDuration,
            }
          : null,
        duration,
        canvasSize,
      })
      if (isRenderCurrent(operation)) setRenderMessage(getFriendlyRenderErrorMessage(error))
    } finally {
      finishRenderOperation(operation)
    }
  }

  const activeOverlay = overlays.find((overlay) => overlay.id === activeOverlayId)
  const activeImageOverlay = imageOverlays.find((overlay) => overlay.id === activeImageId)
  const activeVideoOverlay = videoOverlays.find((overlay) => overlay.id === activeVideoOverlayId)
  const activeSticker = stickers.find((sticker) => sticker.id === activeStickerId)
  const activeVisualLayerId = activeOverlayId || activeImageId || activeVideoOverlayId || activeStickerId
  const activeVisualLayerIndex = visualLayers.findIndex((layer) => layer.id === activeVisualLayerId)
  const selectedFilter = videoFilters.find((item) => item.value === filter) || videoFilters[0]
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const editableText = activeOverlay ? activeOverlay.text : textValue
  const editableFontSize = activeOverlay ? activeOverlay.fontSize : fontSize
  const editableTextColor = activeOverlay ? activeOverlay.color : textColor
  const editableFontKey = activeOverlay?.fontKey || DEFAULT_TEXT_FONT_KEY
  const editableBackgroundEnabled = activeOverlay?.backgroundEnabled || false
  const editableBackgroundColor = activeOverlay?.backgroundColor || DEFAULT_TEXT_BACKGROUND_COLOR
  const editableBackgroundOpacity = activeOverlay?.backgroundOpacity ?? DEFAULT_TEXT_BACKGROUND_OPACITY
  const editableTextAlign = activeOverlay?.textAlign || 'left'
  const timelineBlocks = Array.from({ length: 6 }, (_, index) => index)
  const photoSlidesDuration = getPhotoSlidesDuration()
  const orderedPhotoSlides = [...photoSlides].sort((a, b) => a.order - b.order)
  const hasAppendedPhotoClips = editorMode === 'video' && Boolean(videoFile) && photoSlides.length > 0
  const libraryClips: SequenceClip[] = [
    ...(editorMode === 'video' && videoFile ? [{
      id: 'base-video', type: 'video' as const, name: videoName || 'Vídeo', previewUrl: videoUrl,
      sourceDuration: baseVideoDuration, trimStart: baseTrim.trimStart, trimEnd: baseTrim.trimEnd,
      duration: Math.max(baseTrim.trimEnd - baseTrim.trimStart, 0.5),
      transition: clipTransitions['base-video'] || 'none',
    }] : []),
    ...extraVideos.map((clip) => ({
      id: clip.id, type: 'video' as const, name: clip.file.name, previewUrl: clip.previewUrl,
      sourceDuration: clip.sourceDuration, trimStart: clip.trimStart, trimEnd: clip.trimEnd,
      duration: clip.trimEnd - clip.trimStart, transition: clipTransitions[clip.id] || 'none',
    })),
    ...orderedPhotoSlides.map((slide) => ({
      id: slide.id, type: 'image' as const, name: slide.file.name, previewUrl: slide.previewUrl,
      duration: slide.duration, transition: clipTransitions[slide.id] || 'none',
    })),
  ]
  const availableClips = libraryClips.filter((clip) => !excludedClipIds.includes(clip.id))
  const order = [...sequenceOrder, ...availableClips.map((clip) => clip.id).filter((id) => !sequenceOrder.includes(id))]
  const timelineClips: PositionedClip[] = positionClipsWithTransitions(order.flatMap((id) => {
    const clip = availableClips.find((item) => item.id === id)
    return clip ? [clip] : []
  }), junctionTransitions)
  const activeSequenceClip = timelineClips.findLast((clip) => currentTime >= clip.startTime && currentTime < clip.endTime) || clipAtTime(timelineClips, currentTime)
  const precedingClip = activeSequenceClip && activeSequenceClip.order > 0 ? timelineClips[activeSequenceClip.order - 1] : null
  const activeJoinDuration = activeSequenceClip && precedingClip ? transitionDuration(precedingClip, activeSequenceClip, junctionTransitions) : 0
  const transitionProgress = activeSequenceClip && activeJoinDuration > 0 ? clamp((currentTime - activeSequenceClip.startTime) / activeJoinDuration, 0, 1) : 1
  const outgoingTransitionClip = precedingClip && activeSequenceClip && currentTime < precedingClip.endTime && activeJoinDuration > 0 ? precedingClip : null
  const selectedClip = timelineClips.find((clip) => clip.id === activeClipId) || null
  const editingClipId = selectedClip?.id || activeSequenceClip?.id
  const editingColor = editingClipId ? colorAdjustments[editingClipId] || legacyColor(filter) : legacyColor(filter)
  const activeColorStyle = (id?: string) => id && colorAdjustments[id] ? colorCss(colorAdjustments[id]) : undefined
  function updateEditingColor(patch: Partial<ColorAdjustments>) {
    if (!editingClipId) return
    setColorAdjustments((current) => ({ ...current, [editingClipId]: { ...(current[editingClipId] || legacyColor(filter)), ...patch } }))
  }
  const selectedPreviousClip = selectedClip?.order ? timelineClips[selectedClip.order - 1] : null
  const selectedJunction = selectedClip && selectedPreviousClip && junctionTransitions[selectedClip.id]?.fromId === selectedPreviousClip.id ? junctionTransitions[selectedClip.id] : null
  const selectedJunctionMax = selectedClip && selectedPreviousClip ? Math.max(0, Math.min(2, selectedClip.duration / 2 - 0.05, selectedPreviousClip.duration / 2 - 0.05)) : 0
  function updateSelectedJunction(type: 'none' | 'dissolve' | 'dip-black', requestedDuration?: number) {
    if (!selectedClip || !selectedPreviousClip) return
    setClipTransitions((current) => ({ ...current, [selectedClip.id]: 'none' }))
    setJunctionTransitions((current) => {
      const next = { ...current }
      if (type === 'none') delete next[selectedClip.id]
      else next[selectedClip.id] = { fromId: selectedPreviousClip.id, type, duration: Math.max(0.1, Math.min(requestedDuration ?? selectedJunction?.duration ?? 0.5, selectedJunctionMax)) }
      return next
    })
  }
  const activeVideoClip = activeSequenceClip?.type === 'video' ? activeSequenceClip : null
  const activePhotoClip = activeSequenceClip?.type === 'image' ? activeSequenceClip : null
  const activePhotoSlide = activePhotoClip
    ? photoSlides.find((slide) => slide.id === activePhotoClip.id) || null
    : null
  const sequenceSignature = timelineClips.map((clip) => `${clip.id}:${clip.duration}:${clip.trimStart || 0}:${clip.transition}:${clip.startTime}`).join('|')

  useEffect(() => {
    const valid = validJunctionTransitions(timelineClips, junctionTransitions)
    if (JSON.stringify(valid) === JSON.stringify(junctionTransitions)) return
    const timer = window.setTimeout(() => setJunctionTransitions(valid), 0)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceSignature, junctionTransitions])

  useEffect(() => {
    const total = timelineClips.at(-1)?.endTime || 0
    const frame = window.requestAnimationFrame(() => {
      setDuration(total)
      setCurrentTime((time) => clamp(time, 0, total))
    })
    return () => window.cancelAnimationFrame(frame)
  // A sequência é reconstruída no render; a assinatura muda apenas quando o conteúdo muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceSignature])

  useEffect(() => {
    if (!isPlaying || !activeSequenceClip) return
    let frame = 0
    let startedAt: number | null = null
    const startedFrom = currentTimeRef.current
    const clip = activeSequenceClip
    const tick = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp
      const video = videoRef.current
      const next = clip.type === 'video' && video && Object.keys(junctionTransitions).length === 0
        ? clip.startTime + Math.max(video.currentTime - (clip.trimStart || 0), 0)
        : startedFrom + (timestamp - startedAt) / 1000
      const following = timelineClips[clip.order + 1]
      if (following && next >= following.startTime - 0.025) {
        pendingSeekRef.current = following.type === 'video' ? following.trimStart || 0 : null
        setCurrentTime(following.startTime)
        syncPreviewAudioTracks(following.startTime, true)
        return
      }
      if (next >= clip.endTime - 0.025) {
        if (following) {
          pendingSeekRef.current = following.type === 'video' ? following.trimStart || 0 : null
          setCurrentTime(following.startTime)
          syncPreviewAudioTracks(following.startTime, true)
        } else {
          setCurrentTime(clip.endTime)
          setIsPlaying(false)
          pauseBackgroundMusic()
        }
        return
      }
      setCurrentTime(next)
      syncPreviewAudioTracks(next, true)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  // O intervalo reinicia somente quando muda o clipe ativo ou a sequência.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeSequenceClip?.id, sequenceSignature, musicStartTime, musicTrimStart, musicTrimEnd, musicFadeIn, musicFadeOut, musicVolume, audioDuration, audioUrl, mixScale, voiceVolume, voiceStartTime, voiceDuration, voiceUrl])

  useEffect(() => {
    const outgoing = outgoingVideoRef.current
    const incoming = videoRef.current
    if (incoming && activeVideoClip && Object.keys(junctionTransitions).length > 0) {
      const target = (activeVideoClip.trimStart || 0) + Math.max(0, currentTime - activeVideoClip.startTime)
      if (incoming.readyState >= 1 && Math.abs(incoming.currentTime - target) > (isPlaying ? 0.2 : 0.02)) incoming.currentTime = target
      incoming.volume = Math.min(1, videoVolume * mixScale * (outgoingTransitionClip ? transitionProgress : 1))
    }
    if (!outgoing || !outgoingTransitionClip || outgoingTransitionClip.type !== 'video') return
    const target = (outgoingTransitionClip.trimStart || 0) + currentTime - outgoingTransitionClip.startTime
    if (outgoing.readyState >= 1 && Math.abs(outgoing.currentTime - target) > (isPlaying ? 0.2 : 0.02)) outgoing.currentTime = target
    outgoing.volume = Math.min(1, videoVolume * mixScale * (1 - transitionProgress))
    if (isPlaying && outgoing.paused) void outgoing.play().catch(() => {})
    if (!isPlaying && !outgoing.paused) outgoing.pause()
  }, [currentTime, activeVideoClip, outgoingTransitionClip, transitionProgress, isPlaying, videoVolume, junctionTransitions, mixScale])

  const sequencePhotoPreview = activePhotoClip
    ? photoSlides.find((slide) => slide.id === activePhotoClip.id) || null
    : null
  const timelineDuration = timelineClips.at(-1)?.endTime || 0
  function placeLibraryClip(id: string, beforeId?: string) {
    const clip = libraryClips.find((item) => item.id === id)
    if (isRendering || !projectStorageReady || autoReelsApplying || !clip) return
    if (!clip.previewUrl || missingMediaRefs[id]) { setLibraryDropMessage('Reassocie o arquivo original na biblioteca antes de adicionar este clipe.'); return }
    const ids = timelineClips.map((item) => item.id).filter((item) => item !== id)
    const position = beforeId ? ids.indexOf(beforeId) : ids.length
    ids.splice(position < 0 ? ids.length : position, 0, id)
    setExcludedClipIds((current) => current.filter((item) => item !== id))
    setSequenceOrder(ids)
    setActiveClipId(id)
    setWorkspaceLayout((current) => ({ ...current, timelineOpen: true }))
    setLibraryDropMessage(`${clip.name}: ${excludedClipIds.includes(id) ? 'adicionado à' : 'reposicionado na'} timeline, sem duplicação. As durações foram preservadas.`)
  }
  const autoReelsMedia: AutoReelsMedia[] = libraryClips.filter((clip) => clip.previewUrl && !missingMediaRefs[clip.id] && !excludedClipIds.includes(clip.id)
    && !mediaImportEntries.some((entry) => entry.id === clip.id && entry.status !== 'ready'))
    .map((clip) => clip.type === 'video'
      ? { id: clip.id, name: clip.name, previewUrl: clip.previewUrl, type: 'video', sourceDuration: clip.sourceDuration!, trimStart: clip.trimStart!, trimEnd: clip.trimEnd! }
      : { id: clip.id, name: clip.name, previewUrl: clip.previewUrl, type: 'image' })
  const autoReelsRevision = JSON.stringify([projectId, sequenceSignature, aspectPreset, canvasSize, photoSlides.length,
    autoReelsMedia, audioClips.map(({ file, ...clip }) => [clip, Boolean(file)]),
    audioLibrary.map((asset) => [asset.assetId, asset.category, asset.duration, asset.media, Boolean(asset.file)]),
    videoVolume, junctionTransitions, overlays, stickers, subtitles])
  useEffect(() => { autoReelsRevisionRef.current = autoReelsRevision }, [autoReelsRevision])
  useEffect(() => () => { autoReelsRhythmRef.current?.cancel() }, [projectId])

  async function analyzeAutoReels(ids: string[], format: '16:9' | '9:16', seconds: number, musicKey: string, signal: AbortSignal) {
    const revision = autoReelsRevision
    if (isRendering || audioClipBusy || autoReelsApplyingRef.current || !projectStorageReady) throw new Error('Aguarde a operação atual do editor.')
    const music = audioLibrary.find((asset) => `${asset.category}:${asset.assetId}` === musicKey)
    const selected = ids.map((id) => autoReelsMedia.find((item) => item.id === id))
    if (!music?.file || selected.some((item) => !item)) throw new Error('Música ou mídia indisponível. Reassocie os arquivos.')
    const session = autoReelsRhythmRef.current ?? (autoReelsRhythmRef.current = createAutoReelsRhythmSession())
    const prepared = await session.prepare({ projectId, revision, media: selected as AutoReelsMedia[], music }, format, seconds, signal)
    if (signal.aborted || !mountedRef.current || autoReelsRevisionRef.current !== revision) { session.cancel(); throw new Error('O projeto mudou ou a análise foi cancelada. Gere outra proposta.') }
    return prepared
  }

  async function applyAutoReels(proposal: AutoReelsProposal, revision: string, musicKey: string, rhythmToken?: string) {
    if (autoReelsApplyingRef.current || isRendering || audioClipBusy || !projectStorageReady) throw new Error('Aguarde a operação atual do editor.')
    if (revision !== autoReelsRevision || revision !== autoReelsRevisionRef.current) throw new Error('O projeto mudou. Gere outra proposta.')
    const selected = proposal.clips.map((clip) => autoReelsMedia.find((item) => item.id === clip.sourceId))
    if (selected.some((item) => !item) || timelineClips.length + selected.length > 10
      || photoSlides.length + selected.filter((item) => item?.type === 'image').length > MAX_PHOTO_SLIDES) throw new Error('Mídias indisponíveis ou limite de 10 itens atingido. Gere outra proposta.')
    const music = musicKey ? audioLibrary.find((asset) => `${asset.category}:${asset.assetId}` === musicKey) : undefined
    if (musicKey && (!music?.file || audioClips.length >= MAX_AUDIO_CLIPS)) throw new Error('Música indisponível ou limite de faixas atingido.')
    if ('synchronization' in proposal && !rhythmToken) throw new Error('Proposta musical sem análise válida. Gere outra proposta.')
    autoReelsApplyingRef.current = true; setAutoReelsApplying(true)
    const createdUrls: string[] = []
    let applied = false
    try {
      const checked = rhythmToken
        ? await (async () => {
          if (!music || !autoReelsRhythmRef.current) throw new Error('Análise musical indisponível. Gere outra proposta.')
          return autoReelsRhythmRef.current.confirm(rhythmToken, proposal, { projectId, revision, media: autoReelsMedia, music })
        })()
        : generateAutoReels(selected.filter((item) => item !== undefined), { format: proposal.format, timing: 'total', seconds: proposal.duration })
      const storedVideos: Record<string, string> = {}
      let videoStorageFailed = false
      for (const item of checked.clips.filter((clip) => clip.type === 'video')) {
        const file = item.sourceId === 'base-video' ? videoFile : extraVideos.find((clip) => clip.id === item.sourceId)?.file
        if (!file) throw new Error('Um vídeo ficou indisponível. Gere outra proposta.')
        try { storedVideos[item.sourceId] = await storeVideoAsset(projectId, file) }
        catch { videoStorageFailed = true }
      }
      if (music) {
        if (!await verifyLibraryFile(music) || !music.file) throw new Error('Reassocie o arquivo da música antes de aplicar.')
        const observed = await decodeAudioClip(music.file)
        if (Math.abs(observed - music.duration) > 0.25) throw new Error('A duração da música não corresponde ao arquivo salvo.')
      }
      if (!mountedRef.current || autoReelsRevisionRef.current !== revision || renderLockRef.current || audioClipImportBusyRef.current) throw new Error('O projeto mudou ou iniciou outra operação. Gere outra proposta.')
      const firstOrder = Math.max(-1, ...photoSlides.map((slide) => slide.order)) + 1
      const photoAdditions: PhotoSlide[] = []
      const videoAdditions: ExtraVideoClip[] = []
      const additions = checked.clips.map((clip, index) => {
        const photo = photoSlides.find((slide) => slide.id === clip.sourceId)
        const file = photo?.file || (clip.sourceId === 'base-video' ? videoFile : extraVideos.find((item) => item.id === clip.sourceId)?.file)
        if (!file) throw new Error('Mídia indisponível.')
        const previewUrl = URL.createObjectURL(file)
        createdUrls.push(previewUrl)
        const id = crypto.randomUUID()
        if (clip.type === 'image' && photo) photoAdditions.push({ id, file, previewUrl, duration: clip.duration, order: firstOrder + index, ...(photo.assetId ? { assetId: photo.assetId } : {}) })
        else {
          videoAdditions.push({ id, file, previewUrl, sourceDuration: clip.sourceDuration!, trimStart: clip.trimStart!, trimEnd: clip.trimEnd! })
          if (storedVideos[clip.sourceId]) storedVideos[id] = storedVideos[clip.sourceId]
        }
        return { id, type: clip.type }
      })
      const audio = music ? { ...autoReelsMusic(music, `audio-${crypto.randomUUID()}`, timelineDuration, checked.duration), file: music.file } : null
      videoRef.current?.pause(); pauseBackgroundMusic(); setIsPlaying(false)
      changeAspectPreset(checked.format)
      setPhotoSlides((current) => [...current, ...photoAdditions])
      setExtraVideos((current) => [...current, ...videoAdditions])
      setVideoAssetIds((current) => ({ ...current, ...storedVideos }))
      if (videoStorageFailed) setVideoStorageWarning('A montagem foi aplicada, mas um vídeo não pôde ser guardado localmente. Reassocie-o ao reabrir; verifique o limite de 25 MB e o espaço disponível.')
      setSequenceOrder([...timelineClips.map((clip) => clip.id), ...additions.map((slide) => slide.id)])
      setClipTransitions((current) => ({ ...current, ...Object.fromEntries(additions.map((slide) => [slide.id, 'none' as const])) }))
      setDuration(timelineDuration + checked.duration)
      setCurrentTime(timelineDuration)
      setActivePhotoId(additions[0].type === 'image' ? additions[0].id : null); setActiveClipId(additions[0].id)
      if (audio) setAudioClips((current) => [...current, audio])
      applied = true
    } finally {
      if (!applied) createdUrls.forEach((url) => URL.revokeObjectURL(url))
      autoReelsApplyingRef.current = false
      if (mountedRef.current) setAutoReelsApplying(false)
    }
  }
  const timelinePixelsPerSecond = 60 * timelineZoom
  const formatTimelineTick = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  const timelineWidthPx = Math.ceil((timelineDuration + 4) * timelinePixelsPerSecond)
  const desiredTickSeconds = Math.max(100 / timelinePixelsPerSecond, (timelineDuration + 4) / 499)
  const timelineTickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600].find((step) => step >= desiredTickSeconds) || Math.ceil(desiredTickSeconds / 3600) * 3600
  const timelineTicks = Array.from({ length: Math.min(500, Math.floor((timelineDuration + 4) / timelineTickStep) + 1) }, (_, index) => index * timelineTickStep)
  const selectedSubtitle = subtitles.find((item) => item.id === activeSubtitleId) ?? null
  const selectedSubtitleStyle = selectedSubtitle ? resolveSubtitleStyle(selectedSubtitle.style) : null
  const visibleSubtitles = activeSubtitles(subtitles, currentTime)
  const hasTimelineVideo = timelineClips.some((clip) => clip.type === 'video')
  const automaticSubtitleSource = hasTimelineVideo && voiceBlob
    ? 'o áudio dos vídeos e da narração'
    : hasTimelineVideo
      ? 'o áudio original dos vídeos'
      : voiceBlob
        ? 'a narração'
        : 'a faixa de áudio'
  const canGenerateAutomaticSubtitles = Boolean(projectId && timelineDuration > 0
    && ((hasTimelineVideo && videoVolume > 0) || (voiceBlob && voiceVolume > 0) || (audioFile && musicVolume > 0)))

  async function prepareAutomaticSubtitleAudio(signal: AbortSignal): Promise<PreparedWhisperAudio> {
    if (timelineDuration <= 0 || timelineDuration > WHISPER_MAX_DURATION_SECONDS) {
      throw new Error(`A timeline precisa ter no máximo ${WHISPER_MAX_DURATION_SECONDS} segundos para gerar legendas automaticamente.`)
    }
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) throw new Error('Este navegador não consegue preparar áudio localmente.')
    const audioContext = new AudioContextClass()
    const decoded = new Map<Blob, Promise<AudioBuffer | null>>()

    const decode = (media: Blob) => {
      const cached = decoded.get(media)
      if (cached) return cached
      const pending = (async () => {
        if (signal.aborted) throw new DOMException('Preparação de áudio cancelada.', 'AbortError')
        try {
          const bytes = await media.arrayBuffer()
          if (signal.aborted) throw new DOMException('Preparação de áudio cancelada.', 'AbortError')
          return await audioContext.decodeAudioData(bytes)
        } catch (error) {
          if (signal.aborted) throw error
          return null
        }
      })()
      decoded.set(media, pending)
      return pending
    }
    const channels = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
    const clips: WhisperTimelineAudioClip[] = []

    try {
      if (videoVolume > 0) {
        for (const clip of timelineClips) {
          if (clip.type !== 'video') continue
          const file = clip.id === 'base-video' ? videoFile : extraVideos.find((item) => item.id === clip.id)?.file
          if (!file) continue
          const buffer = await decode(file)
          if (!buffer?.numberOfChannels) continue
          clips.push({
            channels: channels(buffer),
            sourceSampleRate: buffer.sampleRate,
            trimStart: clip.trimStart || 0,
            trimEnd: Math.min(clip.trimEnd ?? buffer.duration, buffer.duration),
            timelineStart: clip.startTime,
          })
        }
      }

      if (voiceBlob && voiceVolume > 0 && voiceStartTime < timelineDuration) {
        const buffer = await decode(voiceBlob)
        if (buffer?.numberOfChannels) {
          clips.push({
            channels: channels(buffer),
            sourceSampleRate: buffer.sampleRate,
            trimStart: 0,
            trimEnd: Math.min(buffer.duration, timelineDuration - voiceStartTime),
            timelineStart: voiceStartTime,
          })
        }
      }

      if (!clips.length && audioFile && musicVolume > 0 && musicStartTime < timelineDuration) {
        const buffer = await decode(audioFile)
        if (buffer?.numberOfChannels) {
          const trimEnd = Math.min(musicTrimEnd > musicTrimStart ? musicTrimEnd : buffer.duration, buffer.duration)
          clips.push({
            channels: channels(buffer),
            sourceSampleRate: buffer.sampleRate,
            trimStart: musicTrimStart,
            trimEnd: Math.min(trimEnd, musicTrimStart + timelineDuration - musicStartTime),
            timelineStart: musicStartTime,
          })
        }
      }

      if (!clips.length) throw new Error('Nenhuma faixa de áudio decodificável foi encontrada na timeline.')
      return composeWhisperTimelinePcm(clips, timelineDuration, {
        maxDurationSeconds: WHISPER_MAX_DURATION_SECONDS,
        signal,
      })
    } finally {
      await audioContext.close().catch(() => {})
    }
  }

  function addAutomaticSubtitles(generated: SubtitleSegment[]) {
    if (!generated.length) return
    setSubtitles((current) => [...current, ...generated])
    setActiveSubtitleId(generated[0].id)
    setSubtitleMessage(`${generated.length} legenda(s) automáticas adicionada(s). Revise a timeline antes de exportar.`)
  }

  function addSubtitle() {
    if (timelineDuration < MIN_TIMELINE_ITEM_DURATION) return
    const startTime = Math.min(currentTime, Math.max(0, timelineDuration - MIN_TIMELINE_ITEM_DURATION))
    const segment = createSubtitle(projectId, crypto.randomUUID(), startTime, Math.min(startTime + 2.5, timelineDuration), subtitles.length)
    setSubtitles((current) => [...current, segment])
    setActiveSubtitleId(segment.id)
    setActivePanel('caption')
    setSubtitleMessage('')
  }

  function updateSelectedSubtitle(patch: Partial<SubtitleSegment>) {
    if (!activeSubtitleId) return
    setSubtitles((current) => current.map((item) => item.id === activeSubtitleId ? { ...item, ...patch } : item))
  }

  function updateSelectedSubtitleStyle(patch: Partial<SubtitleStyle>) {
    if (!selectedSubtitle) return
    updateSelectedSubtitle({ style: { ...resolveSubtitleStyle(selectedSubtitle.style), ...patch } })
  }

  function selectSubtitlePreset(preset: SubtitlePreset) {
    updateSelectedSubtitle({ style: { ...SUBTITLE_PRESETS[preset] } })
    setSubtitleMessage(`Preset ${preset === 'high-contrast' ? 'alto contraste' : preset} aplicado à legenda selecionada.`)
  }

  function restoreSelectedSubtitleStyle() {
    if (!selectedSubtitle) return
    updateSelectedSubtitle({ style: { ...SUBTITLE_PRESETS[selectedSubtitle.style.preset] } })
    setSubtitleMessage('Estilo da legenda restaurado para o padrão do preset.')
  }

  function applySelectedSubtitleStyleToAll() {
    if (!selectedSubtitle || subtitles.length < 2) return
    if (!window.confirm(`Aplicar este estilo às ${subtitles.length} legendas da trilha? Os textos e tempos serão preservados.`)) return
    const style = resolveSubtitleStyle(selectedSubtitle.style)
    setSubtitles((current) => current.map((item) => ({ ...item, style: { ...style } })))
    setSubtitleMessage(`Estilo aplicado a ${subtitles.length} legendas. Textos e tempos foram preservados.`)
  }

  function splitSelectedSubtitle() {
    if (!selectedSubtitle || currentTime <= selectedSubtitle.startTime + 0.1 || currentTime >= selectedSubtitle.endTime - 0.1) return
    const newId = crypto.randomUUID()
    setSubtitles((current) => current.flatMap((item) => item.id === selectedSubtitle.id
      ? [{ ...item, endTime: currentTime, words: undefined }, { ...item, id: newId, startTime: currentTime, order: current.length, words: undefined }]
      : [item]))
    setActiveSubtitleId(newId)
  }

  function moveSelectedSubtitle(direction: -1 | 1) {
    if (!activeSubtitleId) return
    setSubtitles((current) => {
      const ordered = [...current].sort((a, b) => a.order - b.order)
      const index = ordered.findIndex((item) => item.id === activeSubtitleId)
      const next = index + direction
      if (index < 0 || next < 0 || next >= ordered.length) return current
      const [selected] = ordered.splice(index, 1)
      ordered.splice(next, 0, selected)
      return ordered.map((item, order) => ({ ...item, order }))
    })
  }

  async function importSubtitles(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 500_000) throw new Error('O arquivo de legendas é grande demais.')
      const format = file.name.toLowerCase().endsWith('.srt') ? 'srt' : file.name.toLowerCase().endsWith('.vtt') ? 'vtt' : null
      if (!format) throw new Error('Escolha um arquivo SRT ou WebVTT.')
      const parsed = parseSubtitleFile(await file.text(), format, projectId, subtitles.length)
      if (parsed.some((item) => item.endTime > timelineDuration + 0.01)) throw new Error('Há legendas além da duração do projeto.')
      setSubtitles((current) => [...current, ...parsed])
      setActiveSubtitleId(parsed[0].id)
      setSubtitleMessage(`${parsed.length} legenda(s) adicionada(s). As existentes foram preservadas.`)
    } catch (error) {
      setSubtitleMessage(error instanceof Error ? error.message : 'Não foi possível importar as legendas.')
    }
  }

  useEffect(() => {
    const canvas = subtitleCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    activeSubtitles(subtitles, currentTime).forEach((segment) => paintSubtitleSegment(context, segment, canvas.width, canvas.height, currentTime))
  }, [subtitles, currentTime, canvasSize])

  function renderSubtitlePreview() {
    if (!visibleSubtitles.length) return null
    const primary = visibleSubtitles.find((item) => item.id === activeSubtitleId) ?? visibleSubtitles[0]
    const animation = subtitleAnimationState(primary, currentTime)
    const style = resolveSubtitleStyle(primary.style)
    return <canvas ref={subtitleCanvasRef} data-testid="subtitle-preview" data-subtitle-animation={style.animation} data-subtitle-animation-opacity={animation.opacity.toFixed(3)} data-subtitle-animation-scale={animation.scale.toFixed(3)} data-subtitle-karaoke-progress={animation.karaokeProgress.toFixed(3)} role="img" aria-label={visibleSubtitles.map((item) => item.text).join(' ')} width={canvasSize.width || 1280} height={canvasSize.height || 720} className="pointer-events-none absolute inset-0 z-[55] h-full w-full" />
  }

  function selectTimelineClip(clip: PositionedClip) {
    clearVisualSelection()
    setActiveClipId(clip.id)
    if (clip.type === 'image') selectPhotoSlide(clip.id)
    else { setActivePhotoId(null); handleSeek(clip.startTime) }
  }

  function beginClipDrag(clip: PositionedClip, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    clipDragRef.current = { id: clip.id, pointerId: event.pointerId, x: event.clientX, moved: false }
  }

  function moveClipDrag(clip: PositionedClip, event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current
    if (!drag || drag.id !== clip.id || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.x) < 8) return
    drag.moved = true
    const track = event.currentTarget.closest('[data-timeline-track]')
    if (!track) return
    const rect = track.getBoundingClientRect()
    const target = clipAtTime(timelineClips, clamp((event.clientX - rect.left) / timelinePixelsPerSecond, 0, Math.max(timelineDuration - 0.001, 0)))
    setClipDragTarget(target?.id || null)
  }

  function endClipDrag(clip: PositionedClip, event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current
    if (!drag || drag.id !== clip.id || drag.pointerId !== event.pointerId) return
    if (drag?.moved) {
      const track = event.currentTarget.closest('[data-timeline-track]')
      if (track) {
        const rect = track.getBoundingClientRect()
        const target = clipAtTime(timelineClips, clamp((event.clientX - rect.left) / timelinePixelsPerSecond, 0, Math.max(timelineDuration - 0.001, 0)))
        if (target) setSequenceOrder(moveClip(timelineClips.map((item) => item.id), drag.id, target.order))
      }
      suppressClipClickRef.current = true
    } else if (drag?.id === clip.id) {
      selectTimelineClip(clip)
    }
    clipDragRef.current = null
    setClipDragTarget(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function cancelClipDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    clipDragRef.current = null
    setClipDragTarget(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function clickTimelineClip(clip: PositionedClip) {
    if (suppressClipClickRef.current) {
      suppressClipClickRef.current = false
      return
    }
    selectTimelineClip(clip)
  }

  function beginClipTrim(clip: PositionedClip, edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    clipTrimDragRef.current = { id: clip.id, edge, pointerId: event.pointerId, startX: event.clientX, startValue: edge === 'start' ? clip.trimStart || 0 : clip.trimEnd || clip.sourceDuration || 1, secondsPerPixel: 1 / timelinePixelsPerSecond }
  }

  function moveClipTrim(clip: PositionedClip, edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    const drag = clipTrimDragRef.current
    if (drag?.id !== clip.id || drag.edge !== edge) return
    updateVideoTrimById(clip.id, edge, drag.startValue + (event.clientX - drag.startX) * drag.secondsPerPixel)
  }

  function endClipTrim(clip: PositionedClip, event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    clipTrimDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    handleSeek(clip.startTime)
  }

  function cancelClipTrim(event: PointerEvent<HTMLDivElement>) {
    const drag = clipTrimDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateVideoTrimById(drag.id, drag.edge, drag.startValue)
    clipTrimDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function keyClipTrim(clip: PositionedClip, edge: 'start' | 'end', event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    updateVideoTrimById(clip.id, edge, (edge === 'start' ? clip.trimStart || 0 : clip.trimEnd || clip.sourceDuration || 1) + (event.key === 'ArrowRight' ? 0.1 : -0.1))
  }
  const hasEditorMedia = timelineClips.length > 0
  const referencedMediaIds = new Set([
    ...(videoFile ? ['base-video'] : []),
    ...extraVideos.map((clip) => clip.id), ...photoSlides.map((slide) => slide.id),
    ...imageOverlays.map((overlay) => overlay.id), ...videoOverlays.map((overlay) => overlay.id),
    ...(audioFile ? ['audio-track'] : []), ...(voiceBlob ? ['voice-track'] : []),
  ])
  const missingMedia = Object.values(missingMediaRefs).filter((media) => referencedMediaIds.has(media.id))
  const selectedVideoCanSplit = Boolean(!activeVisualLayerId && selectedClip?.type === 'video' && currentTime - selectedClip.startTime >= 0.5 && selectedClip.endTime - currentTime >= 0.5)
  const splitUnavailableReason = activeVisualLayerId || selectedClip?.type !== 'video' ? 'Selecione um clipe de vídeo para dividir' : 'Posicione o playhead dentro do clipe, a pelo menos 0,5 s das bordas'
  const canPublish = hasEditorMedia && missingMedia.length === 0 && stickers.every((sticker) => !sticker.customAssetId || Boolean(customStickerImages[sticker.customAssetId]))
  const hasAdvancedSequence = extraVideos.length > 0 || baseTrim.trimStart > 0 ||
    (videoFile && Math.abs(baseTrim.trimEnd - baseVideoDuration) > 0.1) ||
    timelineClips.some((clip, index) => clip.id !== (videoFile ? ['base-video', ...orderedPhotoSlides.map((slide) => slide.id)] : orderedPhotoSlides.map((slide) => slide.id))[index]) ||
    Object.values(clipTransitions).some((transition) => transition !== 'none') ||
    (musicTrimEnd > 0 && musicTrimEnd < audioDuration - 0.1)
  const controlsVisible = Boolean(hasEditorMedia && !isPlaying)
  const sourceMediaBytes = editorMode === 'video'
    ? (videoFile?.size || 0) + photoSlides.reduce((total, slide) => total + slide.file.size, 0)
    : photoSlides.reduce((total, slide) => total + slide.file.size, 0)
  const getTimelineLeft = (startTime: number) =>
    Math.max(startTime, 0) * timelinePixelsPerSecond
  const getTimelineWidth = (startTime: number, endTime: number, minWidth = 8) =>
    Math.max((endTime - startTime) * timelinePixelsPerSecond, minWidth)
  const getTimelineDragFeedback = (type: TimelineEditableLayer, id: string) => {
    if (!timelineDragPreview || timelineDragPreview.type !== type || timelineDragPreview.id !== id) return null

    const durationLabel = formatEditorTime(timelineDragPreview.endTime - timelineDragPreview.startTime)

    if (timelineDragPreview.mode === 'trim-start') {
      return `start: ${formatEditorTime(timelineDragPreview.startTime)}`
    }

    if (timelineDragPreview.mode === 'trim-end') {
      return `end: ${formatEditorTime(timelineDragPreview.endTime)}`
    }

    return `duracao: ${durationLabel}`
  }
  const musicTimelineEnd = audioDuration > 0
    ? Math.min(musicStartTime + Math.max((musicTrimEnd || audioDuration) - musicTrimStart, 0), timelineDuration)
    : timelineDuration
  const voiceTimelineEnd = voiceDuration > 0
    ? Math.min(voiceStartTime + voiceDuration, timelineDuration)
    : voiceStartTime
  const waveformBars = Array.from({ length: 18 }, (_, index) => 35 + ((index * 17) % 55))
  const activeImageTimelineWidth = activeImageOverlay && duration > 0
    ? ((activeImageOverlay.endTime - activeImageOverlay.startTime) / duration) * 100
    : 0
  const activeStickerTimelineWidth = activeSticker && duration > 0
    ? ((activeSticker.endTime - activeSticker.startTime) / duration) * 100
    : 0
  const hasWebPImageOverlay = imageOverlays.some((overlay) => overlay.file.type === 'image/webp')
  const publishHints = [
    ...(isDownloadMode ? ['No Lab, o vídeo final é baixado no navegador e não cria post no feed. Em celulares, exportar pode demorar.'] : []),
    ...(hasAppendedPhotoClips ? ['Fotos e videos da timeline entram no render final na ordem exibida.'] : []),
    ...(hasWebPImageOverlay ? ['Dica: para publicar com imagem, use PNG ou JPG. WebP fica apenas na previa.'] : []),
  ]
  const publishInfoLabel = isDownloadMode ? 'Informações da exportação' : 'Informações da publicação'
  const publishButtonLabel = isRendering
    ? renderMessage.toLowerCase().includes('download')
      ? 'Baixando...'
      : renderMessage.toLowerCase().includes('enviando') || renderMessage.toLowerCase().includes('publicando')
      ? isDownloadMode ? 'Exportando...' : 'Enviando...'
      : 'Renderizando...'
    : isDownloadMode
    ? 'Baixar video'
    : 'Publicar'
  const advanceButtonLabel = isRendering ? publishButtonLabel : isDownloadMode ? 'Exportar MP4' : 'Avancar'
  const activeTool: EditorTool = activePanel === 'audio' || activePanel === 'voice'
    ? 'sound'
    : activePanel === 'text'
    ? 'text'
    : activePanel === 'effects'
    ? 'effects'
    : activePanel === 'transitions'
    ? 'transitions'
    : activePanel === 'caption'
    ? 'captions'
    : activePanel === 'magic'
    ? 'effects'
    : activePanel === 'sticker'
    ? 'stickers'
    : activePanel === 'adjust'
    ? 'adjust'
    : 'edit'
  const layerTrackHeight = (count: number) => Math.max(40, count * 32 + 8)
  const timelineTracks = [
    { label: 'Legendas', icon: <Captions className="h-3 w-3" />, active: Boolean(selectedSubtitle), visible: subtitles.length > 0, height: layerTrackHeight(subtitles.length) },
    { label: 'Texto', icon: <Type className="h-3 w-3" />, active: Boolean(activeOverlay), visible: overlays.length > 0, height: layerTrackHeight(overlays.length) },
    { label: 'Figurinhas', icon: <Sparkles className="h-3 w-3" />, active: Boolean(activeSticker), visible: stickers.length > 0 && timelineExpanded, height: layerTrackHeight(stickers.length) },
    { label: 'PiP', icon: <Video className="h-3 w-3" />, active: Boolean(activeVideoOverlay), visible: videoOverlays.length > 0 && timelineExpanded, height: layerTrackHeight(videoOverlays.length) },
    { label: 'Imagens', icon: <ImageIcon className="h-3 w-3" />, active: Boolean(activeImageOverlay), visible: imageOverlays.length > 0 && timelineExpanded, height: layerTrackHeight(imageOverlays.length) },
    { label: 'Video', icon: <Video className="h-3 w-3" />, active: activePanel === 'effects', visible: true, height: 64 },
    { label: 'Voz', icon: <Mic className="h-3 w-3" />, active: activePanel === 'voice', visible: Boolean(voiceUrl) && timelineExpanded, height: 32 },
    { label: 'Musica', icon: <Music className="h-3 w-3" />, active: activePanel === 'audio' && Boolean(audioName), visible: Boolean(audioName), height: 32 },
  ]
  const compressionOptions: { id: CompressionPreset; label: string; description: string }[] = [
    { id: 'auto', label: 'Automatica', description: 'Recomendada' },
    { id: 'light', label: 'Leve', description: 'Menor arquivo' },
    { id: 'high', label: 'Alta', description: 'Mais qualidade' },
  ]

  useEffect(() => {
    if (shortcutHelpOpen) shortcutHelpCloseRef.current?.focus()
  }, [shortcutHelpOpen])

  function closeShortcutHelp() {
    setShortcutHelpOpen(false)
    window.requestAnimationFrame(() => shortcutReturnFocusRef.current?.focus())
  }

  function openShortcutHelp(source: HTMLElement | null) {
    shortcutReturnFocusRef.current = source
    setShortcutHelpOpen(true)
  }

  function selectLayerByKeyboard(direction: -1 | 1) {
    const eligible = visualLayers.filter((layer) => (timelineExpanded || layer.type === 'text'))
    const id = nextVisibleLayerId(eligible, activeVisualLayerId, currentTime, direction)
    if (!id) return false
    const layer = visualLayers.find((item) => item.id === id)
    if (layer?.type === 'text') {
      const item = overlays.find((candidate) => candidate.id === id)
      if (item) selectOverlay(item)
    } else if (layer?.type === 'image') {
      const item = imageOverlays.find((candidate) => candidate.id === id)
      if (item) selectImageOverlay(item)
    } else if (layer?.type === 'video') {
      const item = videoOverlays.find((candidate) => candidate.id === id)
      if (item) selectVideoOverlay(item)
    } else if (layer?.type === 'sticker') {
      const item = stickers.find((candidate) => candidate.id === id)
      if (item) selectSticker(item)
    }
    window.requestAnimationFrame(() => {
      const clips = document.querySelectorAll<HTMLElement>('[data-editor-layer-id]')
      Array.from(clips).find((clip) => clip.dataset.editorLayerId === id)?.focus()
    })
    return true
  }

  function nudgeSelectedLayer(key: 'x' | 'y', direction: -1 | 1, shift: boolean) {
    if (activeImageOverlay && currentTime >= activeImageOverlay.startTime && currentTime <= activeImageOverlay.endTime) {
      setImageOverlays((current) => current.map((item) => item.id === activeImageOverlay.id ? {
        ...item, [key]: nudgeCanvasPosition(item[key], Math.max(0, (key === 'x' ? canvasSize.width - item.width : canvasSize.height - item.height)), direction, shift),
      } : item))
    } else if (activeVideoOverlay && videoOverlaySourceTime(activeVideoOverlay, currentTime) !== null) {
      setVideoOverlays((current) => current.map((item) => item.id === activeVideoOverlay.id ? {
        ...item, [key]: nudgeCanvasPosition(item[key], Math.max(0, (key === 'x' ? canvasSize.width - item.width : canvasSize.height - item.height)), direction, shift),
      } : item))
    } else if (activeSticker && currentTime >= activeSticker.startTime && currentTime <= activeSticker.endTime) {
      setStickers((current) => current.map((item) => item.id === activeSticker.id ? {
        ...item, [key]: nudgeCanvasPosition(item[key], key === 'x' ? canvasSize.width : canvasSize.height, direction, shift),
      } : item))
    } else if (activeOverlay && currentTime >= activeOverlay.startTime && currentTime <= activeOverlay.endTime) {
      setOverlays((current) => current.map((item) => item.id === activeOverlay.id ? {
        ...item, [key]: nudgeCanvasPosition(item[key], key === 'x' ? canvasSize.width : canvasSize.height, direction, shift),
      } : item))
    } else return false
    setVisualHistoryRevision((current) => current + 1)
    return true
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (shortcutHelpOpen) {
      if (event.key === 'Escape') { event.preventDefault(); closeShortcutHelp() }
      return
    }
    const editable = Boolean(target.closest('input, textarea, select, [contenteditable]') || target.isContentEditable)
    const inDialog = Boolean(target.closest('[role="dialog"], [aria-modal="true"]'))
    const busy = isPublishStepOpen || isRendering || editable || inDialog
    const control = target.closest('button, [role="button"], [role="slider"], [role="separator"]')
    const controlFocused = Boolean(control && !control.hasAttribute('data-editor-layer-id'))
    const context = target.closest('[data-editor-timeline]') ? 'timeline' : target.matches('[data-editor-preview-surface]') ? 'preview' : 'studio'
    const action = resolveEditorShortcut(event, context, busy, controlFocused)
    if (!action) return
    if (action === 'help') { event.preventDefault(); openShortcutHelp(target); return }
    if (action === 'escape') {
      event.preventDefault()
      if (canvasPointerIdRef.current !== null && canvasRef.current) {
        canvasRef.current.dispatchEvent(new window.PointerEvent('pointercancel', { pointerId: canvasPointerIdRef.current, bubbles: true }))
      } else if (timelineDragRef.current || timelineSeekPointerRef.current !== null || clipDragRef.current || clipTrimDragRef.current) {
        const pointerId = timelineDragRef.current?.pointerId ?? timelineSeekPointerRef.current ?? clipDragRef.current?.pointerId ?? clipTrimDragRef.current?.pointerId
        const captured = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-editor-timeline] *')).find((node) => pointerId !== undefined && node.hasPointerCapture?.(pointerId))
        if (captured && pointerId !== undefined) captured.dispatchEvent(new window.PointerEvent('pointercancel', { pointerId, bubbles: true }))
      } else {
        clearVisualSelection()
        setActiveClipId(null)
        setActiveAudioClipId(null)
      }
      return
    }
    if (canvasPointerIdRef.current !== null || timelineDragRef.current || timelineSeekPointerRef.current !== null || clipDragRef.current || clipTrimDragRef.current) return
    if (action === 'play') { if (hasEditorMedia) { event.preventDefault(); void togglePlayback() }; return }
    if (action === 'split') { if (selectedVideoCanSplit) { event.preventDefault(); splitSelectedVideo() }; return }
    if (action === 'delete') {
      if (activePanel === 'audio' && activeAudioClipId) {
        event.preventDefault()
        setAudioClips((current) => current.filter((clip) => clip.id !== activeAudioClipId))
        setActiveAudioClipId(null)
        return
      }
      if (!activeVisualLayerId && !selectedClip) return
      event.preventDefault()
      if (activeOverlayId) removeActiveOverlay()
      else if (activeStickerId) removeActiveSticker()
      else if (activeImageId) removeActiveImageOverlay()
      else if (activeVideoOverlayId) removeActiveVideoOverlay()
      else removeSelectedClip()
      return
    }
    if (action === 'seek-back' || action === 'seek-forward') {
      event.preventDefault()
      handleSeek(seekByKeyboard(currentTime, timelineDuration, action === 'seek-back' ? -1 : 1, event.shiftKey))
      return
    }
    if (action === 'layer-up' || action === 'layer-down') {
      if (selectLayerByKeyboard(action === 'layer-up' ? 1 : -1)) event.preventDefault()
      return
    }
    const axis = action === 'nudge-left' || action === 'nudge-right' ? 'x' : 'y'
    const direction = action === 'nudge-left' || action === 'nudge-up' ? -1 : 1
    if (nudgeSelectedLayer(axis, direction, event.shiftKey)) event.preventDefault()
  }

  return (
    <section data-workspace-ready={workspaceLayoutLoaded && (projectStorageReady || Boolean(projectStorageError))} onKeyDown={handleEditorKeyDown} className={`relative flex w-full min-w-0 flex-col overflow-hidden border border-white/10 bg-[#10111c] text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)] ring-1 ring-sky-400/10 ${isDownloadMode ? 'h-full min-h-0 rounded-xl' : 'h-[calc(100dvh-6.5rem)] rounded-[1.5rem] xl:h-[calc(100dvh-7rem)]'}`}>
          {!projectStorageReady && !projectStorageError && <div className="absolute inset-0 z-[110] grid place-items-center bg-[#10111c]/95 text-sm font-semibold text-sky-100" role="status">Carregando projeto salvo…</div>}
          <header className="relative z-[70] grid w-full shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 border-b border-white/10 bg-[#11131f]/95 px-2 py-1 sm:h-11 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-4 sm:py-0 xl:h-10">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white sm:h-9 sm:w-9"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                <NextImage src="/logo-icon.png" alt="" width={855} height={869} priority aria-hidden="true" className="h-6 w-6 shrink-0 object-contain sm:h-7 sm:w-7" />
                <p className="truncate text-[10px] font-black text-sky-200/80 sm:hidden">Studio</p>
                <p className="hidden whitespace-nowrap text-base font-black tracking-tight text-white sm:block">Entre<span className="text-[#1c539c]">US</span><span className="ml-1 text-xs tracking-normal text-sky-200/80">Studio</span></p>
              </div>
            </div>

            <div className="col-span-2 row-start-2 flex min-w-0 items-center justify-center gap-2 text-center sm:col-span-1 sm:row-start-auto sm:block">
              {isRenamingProject ? (
                <input
                  autoFocus
                  type="text"
                  maxLength={80}
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onBlur={() => { if (!cancelProjectRenameRef.current) confirmProjectName(); cancelProjectRenameRef.current = false }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') confirmProjectName()
                    if (event.key === 'Escape') { cancelProjectRenameRef.current = true; setIsRenamingProject(false) }
                  }}
                  aria-label="Nome do projeto"
                  className="w-full min-w-0 max-w-[55%] rounded-md border border-sky-400/60 bg-[#080b16] px-2 py-1 text-center text-xs font-black text-white outline-none focus:ring-2 focus:ring-sky-400 sm:max-w-full sm:text-base"
                />
              ) : (
                <button type="button" onClick={() => { cancelProjectRenameRef.current = false; setProjectNameDraft(projectName); setIsRenamingProject(true) }} aria-label={`Renomear projeto: ${projectName}`} title="Renomear projeto" className="group inline-flex min-h-8 min-w-0 max-w-[55%] items-center justify-center gap-1 rounded-md px-1 text-xs font-black leading-tight text-white hover:bg-white/10 sm:min-h-6 sm:max-w-full sm:text-base">
                  <span className="truncate">{projectName}</span><Pencil className="h-3 w-3 shrink-0 text-zinc-500 group-hover:text-sky-300" />
                </button>
              )}
              <p role="status" aria-label="Estado do salvamento" className={`shrink-0 whitespace-nowrap text-[9px] font-semibold sm:text-[10px] ${saveStatus === 'error' ? 'text-red-300' : saveStatus === 'saved' ? 'text-emerald-300' : 'text-amber-200'}`}>
                {saveStatus === 'saved' ? 'Salvo neste navegador' : saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'pending' ? 'Alterações pendentes' : saveStatus === 'error' ? 'Erro ao salvar' : 'Preparando salvamento'}
              </p>
            </div>

            <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-0.5 sm:col-start-auto sm:row-start-auto sm:gap-2">
              <button type="button" onClick={() => startNewProject()} disabled={!projectStorageReady} aria-label="Novo projeto" title="Novo projeto" className="min-h-8 min-w-9 rounded-md px-1.5 py-1 text-[10px] font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-40 sm:min-h-0 sm:min-w-0 sm:text-xs">Novo</button>
              <button type="button" onClick={undoVisualChange} disabled={visualHistoryPosition.index <= 0} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-200 transition hover:bg-white/15 disabled:opacity-30 sm:h-9 sm:w-9" aria-label="Desfazer alteração visual" title="Desfazer">
                <Undo2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={redoVisualChange} disabled={visualHistoryPosition.index >= visualHistoryPosition.length - 1} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-200 transition hover:bg-white/15 disabled:opacity-30 sm:h-9 sm:w-9" aria-label="Refazer alteração visual" title="Refazer">
                <Redo2 className="h-4 w-4" />
              </button>
              <div className="relative">
                <button type="button" onClick={(event) => openShortcutHelp(event.currentTarget)} aria-label="Ajuda de atalhos" aria-keyshortcuts="?" aria-expanded={shortcutHelpOpen} aria-controls="studio-shortcut-help" title="Atalhos (?)" className="grid h-8 w-8 place-items-center rounded-full text-sky-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">?</button>
                {shortcutHelpOpen && <div id="studio-shortcut-help" role="dialog" aria-label="Atalhos do Studio" className="absolute right-0 top-10 z-[105] w-72 rounded-xl border border-sky-300/30 bg-[#0c1221] p-3 text-xs text-sky-50 shadow-2xl sm:w-80">
                  <div className="flex items-center justify-between gap-2"><strong>Atalhos do Studio</strong><button ref={shortcutHelpCloseRef} type="button" onClick={closeShortcutHelp} aria-label="Fechar ajuda de atalhos" className="rounded p-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"><X className="h-4 w-4" /></button></div>
                  <p className="mt-2 font-semibold text-sky-200">Editor</p>
                  <p>Espaço: reproduzir ou pausar · S: dividir vídeo selecionado · Delete/Backspace: excluir seleção · Escape: cancelar gesto ou desselecionar · ?: esta ajuda.</p>
                  <p className="mt-2 font-semibold text-sky-200">Timeline focada</p>
                  <p>←/→: avançar 0,1 s · Shift + ←/→: 1 s · ↑/↓: selecionar camada visível na ordem visual.</p>
                  <p className="mt-2 font-semibold text-sky-200">Prévia focada</p>
                  <p>Setas: mover a camada selecionada 1 px do projeto · Shift + setas: 10 px.</p>
                </div>}
              </div>
              {publishHints.length > 0 && (
                <div className="relative" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setExportInfoOpen(true) }} onPointerLeave={(event) => { if (event.pointerType === 'mouse') setExportInfoOpen(false) }}>
                  <button type="button" onClick={() => setExportInfoOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setExportInfoOpen(false) }} aria-label={publishInfoLabel} aria-expanded={exportInfoOpen} title={publishInfoLabel} className="grid h-8 w-8 place-items-center rounded-full text-sky-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"><Info className="h-4 w-4" /></button>
                  {exportInfoOpen && <div role="dialog" aria-label={publishInfoLabel} className="absolute right-0 top-10 z-[100] w-64 rounded-xl border border-sky-300/20 bg-[#0c1221] p-3 text-left text-xs font-medium leading-5 text-sky-50 shadow-2xl sm:w-72">
                    <button type="button" onClick={() => setExportInfoOpen(false)} aria-label={`Fechar ${publishInfoLabel.toLowerCase()}`} className="float-right ml-2 rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
                    {publishHints.map((hint) => <p key={hint} className="mb-2 last:mb-0">{hint}</p>)}
                  </div>}
                </div>
              )}
              <button
                type="button"
                onClick={handleAdvanceToPublish}
                disabled={!canPublish || isRendering}
                aria-label={advanceButtonLabel}
                className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-2 text-[10px] font-black text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-xs"
              >
                {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                <span className="hidden sm:inline">{advanceButtonLabel}</span>
                <span className="max-[359px]:hidden sm:hidden">{isDownloadMode ? 'MP4' : 'Avançar'}</span>
              </button>
            </div>
          </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={workspaceRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden xl:flex-row">
        <aside
          aria-label="Biblioteca de mídia"
          className={`${mobileLibraryOpen ? 'fixed inset-x-2 bottom-2 top-[12dvh] z-[100] flex rounded-2xl border border-white/20 shadow-2xl' : 'hidden'} min-h-0 flex-col overflow-hidden bg-[#151622] xl:static xl:z-auto xl:min-w-[200px] xl:max-w-[560px] xl:w-[var(--panel-width)] xl:shrink xl:rounded-none xl:border-0 xl:border-r xl:border-white/10 xl:shadow-none ${workspaceLayout.libraryOpen ? 'xl:flex' : 'xl:hidden'}`}
          style={{ '--panel-width': `${workspaceLayout.libraryWidth}px` } as CSSProperties}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-1.5">
            <h2 className="text-sm font-black">Biblioteca</h2>
            <button type="button" onClick={() => { setMobileLibraryOpen(false); setWorkspaceLayout((current) => ({ ...current, libraryOpen: false })) }} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10" aria-label="Recolher biblioteca" title="Recolher biblioteca"><PanelLeftClose className="h-4 w-4" /></button>
          </div>
          <EditorToolDock active={activeTool} onSelect={selectTool} />
          <input type="file" accept="video/*,.mp4,.mov,.webm,.m4v" multiple onChange={handleVideoChange} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple onChange={handlePhotoSlidesChange} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2.5">
            {activePanel === 'add' && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-black">Mídia</h3>
                <AutoReelsPanel key={projectId} media={autoReelsMedia} startTime={timelineDuration} revision={autoReelsRevision}
                  unavailable={missingMedia.filter((item) => item.type.startsWith('image/') || item.type.startsWith('video/')).map((item) => item.name)}
                  slots={Math.max(0, Math.min(10 - timelineClips.length, MAX_PHOTO_SLIDES - photoSlides.length))} disabled={isRendering || audioClipBusy || autoReelsApplying || !projectStorageReady}
                  music={audioLibrary.filter((asset) => asset.category === 'music' && asset.file).map((asset) => ({ key: `${asset.category}:${asset.assetId}`, name: asset.media.name, duration: asset.duration }))}
                  onApply={applyAutoReels} onAnalyze={analyzeAutoReels} />
                {photoStorageWarning && <p role="alert" className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-100">{photoStorageWarning}</p>}
                {videoStorageWarning && <p role="alert" className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-100">{videoStorageWarning}</p>}
                {projectStorageError && <p role="alert" className="rounded-lg border border-red-300/30 bg-red-500/10 p-2 text-xs text-red-100">{projectStorageError} O projeto anterior foi preservado no armazenamento local.</p>}
                {saveStatus === 'error' && !projectStorageError && <p role="alert" className="rounded-lg border border-red-300/30 bg-red-500/10 p-2 text-xs text-red-100">O navegador recusou o salvamento. Mantenha esta aba aberta e libere espaço antes de tentar outra edição.</p>}
                {missingMedia.length > 0 && <div data-testid="missing-project-media" className="space-y-2 rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                  <p className="font-bold">{missingMedia.length} arquivo(s) original(is) ausente(s). Reassocie para prévia e exportação completas.</p>
                  {missingMedia.map((media) => <label key={media.id} className="block cursor-pointer rounded border border-amber-300/20 p-2">
                    <span className="block truncate">{media.name} · {formatFileSize(media.size)}</span>
                    <span className="text-amber-200 underline">Escolher arquivo original</span>
                    <input type="file" accept={media.type || undefined} className="sr-only" aria-label={`Reassociar ${media.name}`} onChange={(event) => { void reassociateMedia(media.id, event.target.files?.[0]); event.target.value = '' }} />
                  </label>)}
                  <p>A exportação fica indisponível até todos os arquivos da edição estarem presentes.</p>
                </div>}
                {reassociateMessage && <p role="status" className="text-xs text-amber-200">{reassociateMessage}</p>}
                <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-500/15 px-3 py-2 text-xs font-black text-sky-100 transition hover:bg-sky-500/25">
                  <Plus className="h-4 w-4" /> Importar
                  <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4" multiple onChange={handleUnifiedImport} className="sr-only" aria-label="Importar mídias" />
                </label>
                {videoFile && <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-500/20">
                  <Plus className="h-4 w-4" /> Vídeo sobreposto (PiP)
                  <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v" onChange={handleVideoOverlayChange} className="sr-only" aria-label="Adicionar vídeo sobreposto" />
                </label>}
                {videoOverlays.map((overlay) => <button key={overlay.id} type="button" onClick={() => selectVideoOverlay(overlay)} className={`w-full truncate rounded-lg border px-3 py-2 text-left text-xs ${overlay.id === activeVideoOverlayId ? 'border-sky-300 bg-sky-500/20 text-white' : 'border-white/10 text-zinc-300'}`}>{overlay.name} · {overlay.startTime.toFixed(1)}s–{overlay.endTime.toFixed(1)}s</button>)}
                <p className="text-[10px] text-zinc-500">Vídeo, JPG/PNG, WebP como sobreposição de prévia e áudio local.</p>
                <button type="button" onClick={() => openEditorPanel('audio')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 hover:underline"><Music className="h-3 w-3" />Músicas</button>

                {!isDownloadMode && <button type="button" onClick={() => openEditorPanel('caption')} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-xs font-bold text-zinc-200 hover:bg-white/10"><Captions className="h-5 w-5 text-sky-300" /> Legenda do post <ArrowRight className="ml-auto h-4 w-4 text-zinc-500" /></button>}

                {photoMessage && (
                  <div className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                    {photoMessage}
                  </div>
                )}

                {photoSlides.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-zinc-950 p-3 xl:hidden">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-black text-zinc-300">Fotos</span>
                      <span className="text-xs font-semibold text-zinc-600">
                        {photoSlides.length} / {MAX_PHOTO_SLIDES} - {formatEditorTime(photoSlidesDuration)}
                      </span>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/25 p-1">
                      {[
                        { value: 'none' as PhotoTransition, label: 'Sem transicao' },
                        { value: 'fade' as PhotoTransition, label: 'Fade suave' },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setPhotoTransition(item.value)}
                          className={`rounded-md px-2 py-2 text-xs font-black transition ${
                            photoTransition === item.value
                              ? 'bg-sky-500 text-white'
                              : 'text-zinc-500 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-2">
                      {orderedPhotoSlides.map((slide, index) => (
                        <div
                          key={slide.id}
                          className={`grid gap-2 rounded-lg border p-2 ${
                            slide.id === activePhotoId
                              ? 'border-sky-300/60 bg-sky-500/15'
                              : 'border-white/10 bg-black/25'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => selectPhotoSlide(slide.id)}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                          <span className="relative flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-900">
                            {slide.previewUrl && <NextImage unoptimized src={slide.previewUrl} alt="" fill sizes="32px" className="object-cover" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-white">
                              {index + 1}. {slide.file.name}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-500">
                              {slide.duration}s
                            </span>
                          </span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePhotoSlide(slide.id, -1)}
                              disabled={index === 0}
                              className="h-8 rounded-lg border border-white/10 px-2 text-xs font-black text-zinc-300 disabled:opacity-30"
                            >
                              Antes
                            </button>
                            <button
                              type="button"
                              onClick={() => movePhotoSlide(slide.id, 1)}
                              disabled={index === orderedPhotoSlides.length - 1}
                              className="h-8 rounded-lg border border-white/10 px-2 text-xs font-black text-zinc-300 disabled:opacity-30"
                            >
                              Depois
                            </button>
                            <label className="flex min-w-0 flex-1 items-center gap-2 px-1 text-[11px] font-black text-zinc-500">
                              <span>{slide.duration}s</span>
                              <input
                                type="range"
                                min="1"
                                max="8"
                                step="1"
                                value={slide.duration}
                                onChange={(event) => updatePhotoSlideDuration(slide.id, Number(event.target.value))}
                                className="min-w-0 flex-1 accent-sky-500"
                                aria-label="Duracao da foto"
                              />
                            </label>
                          <button
                            type="button"
                            onClick={() => removePhotoSlide(slide.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-100 hover:bg-red-500/15"
                            aria-label="Remover foto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {activePanel === 'text' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black">Texto</h3>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {activeOverlay ? 'Ajuste o texto em Propriedades' : 'Nova camada de texto'}
                    </p>
                  </div>
                  {activeOverlay && (
                    <button
                      type="button"
                      onClick={removeActiveOverlay}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/10 text-red-100 transition hover:bg-red-500/20 xl:hidden"
                      aria-label="Remover texto selecionado"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                </div>

                <button type="button" onClick={addTextOverlay} className="hidden rounded-lg border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 xl:inline-flex"><Plus className="mr-1 h-4 w-4" />Novo texto</button>
                <label className="block xl:hidden">
                  <span className="text-xs font-black text-zinc-400">Frase</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={editableText}
                      onChange={(event) => updateActiveOverlayText(event.target.value)}
                      placeholder="Digite uma frase"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-sky-300"
                    />
                    <button
                      type="button"
                      onClick={addTextOverlay}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-black transition hover:bg-sky-50"
                      aria-label={activeOverlay ? 'Adicionar novo texto' : 'Adicionar texto'}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </label>

                <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Camadas</span>
                    <span className="text-xs font-semibold text-zinc-600">{overlays.length}</span>
                  </div>
                  {overlays.length > 0 ? (
                    <div className="grid gap-2">
                      {overlays.map((overlay, index) => (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => selectOverlay(overlay)}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            overlay.id === activeOverlayId
                              ? 'border-sky-300/60 bg-sky-500/15 text-sky-50'
                              : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20'
                          }`}
                        >
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                            style={{ backgroundColor: overlay.color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black">
                              {getOverlayLabel(overlay, index)}
                            </span>
                            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
                              {overlay.startTime.toFixed(1)}s - {overlay.endTime.toFixed(1)}s
                            </span>
                          </span>
                          {overlay.id === activeOverlayId && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-zinc-600">Nenhum texto adicionado.</p>
                  )}
                </div>

                <label className="block xl:hidden">
                  <span className="text-xs font-black text-zinc-400">Tamanho</span>
                  <input
                    type="range"
                    min="18"
                    max="120"
                    value={editableFontSize}
                    onChange={(event) => updateActiveOverlayStyle('fontSize', Number(event.target.value))}
                    className="mt-3 w-full accent-sky-500"
                  />
                  <span className="mt-1 block text-xs font-semibold text-zinc-500">{editableFontSize}px</span>
                </label>

                <label className="block xl:hidden">
                  <span className="text-xs font-black text-zinc-400">Cor</span>
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2">
                    <input
                      type="color"
                      value={editableTextColor}
                      onChange={(event) => updateActiveOverlayStyle('color', event.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    />
                    <span className="text-sm font-semibold text-zinc-400">{editableTextColor.toUpperCase()}</span>
                  </div>
                </label>

                {activeOverlay && (
                  <div className="rounded-xl border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 xl:hidden">
                    Selecione a camada e ajuste o tempo em Propriedades.
                  </div>
                )}
              </div>
            )}

            {activePanel === 'sticker' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black">Figurinhas</h3>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {activeSticker ? 'Editando elemento visual' : 'Escolha uma figurinha'}
                    </p>
                  </div>
                  {activeSticker && (
                    <button
                      type="button"
                      onClick={removeActiveSticker}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/10 text-red-100 transition hover:bg-red-500/20"
                      aria-label="Remover figurinha selecionada"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <label className="block cursor-pointer text-sm font-bold">+ Importar sticker<input aria-label="Importar sticker" type="file" accept="image/png,image/webp" className="block w-full text-xs" onChange={(event) => { void prepareCustomSticker(event.target.files?.[0]); event.target.value = '' }} /></label>
                  <p className="text-xs text-zinc-400">PNG ou WebP estático, até 5 MB e 4096 × 4096 pixels. Salvo apenas neste navegador.</p>
                  {customStickerMessage && <p role="status" className="text-xs">{customStickerMessage}</p>}
                  {customStickerPending && <div className="space-y-2"><NextImage unoptimized src={customStickerPending.url} alt="Prévia do sticker" width={96} height={96} className="h-24 w-24 bg-zinc-700 object-contain" /><button type="button" onClick={() => void insertCustomSticker()} className="rounded bg-fuchsia-700 p-2 text-xs">Adicionar sticker</button>{customStickerMissing.map((id) => <button key={id} type="button" onClick={() => void insertCustomSticker(id)} className="ml-2 rounded bg-amber-800 p-2 text-xs">Reassociar {id}</button>)}</div>}
                  {customStickerMissing.length > 0 && <p role="alert" className="text-xs text-amber-200">Sticker local ausente. Importe o arquivo novamente e escolha Reassociar antes de exportar.</p>}
                </div>
                <div className="space-y-3" aria-label="Galeria de figurinhas">
                  {STICKER_CATEGORIES.map((category) => (
                    <section key={category.id} aria-labelledby={`sticker-category-${category.id}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 id={`sticker-category-${category.id}`} className="text-xs font-black uppercase tracking-wide text-zinc-400">{category.label}</h4>
                        {category.id === 'animated' && <span className="rounded-full bg-fuchsia-400/15 px-2 py-0.5 text-[10px] font-black text-fuchsia-200">quadros reais</span>}
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {STICKER_LIBRARY.filter((sticker) => sticker.category === category.id).map((sticker) => (
                          <button
                            key={sticker.id}
                            type="button"
                            onClick={() => addSticker(sticker)}
                            className="relative flex aspect-square items-center justify-center rounded-2xl border border-fuchsia-300/15 bg-fuchsia-500/10 text-3xl transition hover:border-fuchsia-200/40 hover:bg-fuchsia-500/20 active:scale-95"
                            aria-label={`Adicionar figurinha ${sticker.label}${sticker.frames.length > 1 ? ' animada' : ''}`}
                            title={sticker.label}
                          >
                            {sticker.frames[0]}
                            {sticker.frames.length > 1 && <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-fuchsia-300 ring-2 ring-zinc-950" aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Camadas</span>
                    <span className="text-xs font-semibold text-zinc-600">{stickers.length}</span>
                  </div>
                  {stickers.length > 0 ? (
                    <div className="grid gap-2">
                      {stickers.map((sticker) => (
                        <button
                          key={sticker.id}
                          type="button"
                          onClick={() => selectSticker(sticker)}
                          aria-label={`Selecionar figurinha ${stickerIsAnimated(sticker) ? `${sticker.assetId || sticker.value} animada` : sticker.value}`}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            sticker.id === activeStickerId
                              ? 'border-fuchsia-300/60 bg-fuchsia-500/15 text-fuchsia-50'
                              : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20'
                          }`}
                        >
                          <span className="text-xl leading-none">{sticker.value}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black">Figurinha{stickerIsAnimated(sticker) ? ' animada' : ''}</span>
                            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
                              {sticker.startTime.toFixed(1)}s - {sticker.endTime.toFixed(1)}s
                            </span>
                          </span>
                          {sticker.id === activeStickerId && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-zinc-600">Nenhuma figurinha adicionada.</p>
                  )}
                </div>

                {activeSticker && (
                  <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-50">
                    <div className="flex items-center justify-between gap-3 font-black">
                      <span className="inline-flex items-center gap-2">
                        <Move className="h-4 w-4" />
                        Selecionada
                      </span>
                      <span className="text-xs text-fuchsia-100/60">
                        X {Math.round(activeSticker.x)} / Y {Math.round(activeSticker.y)}
                      </span>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-xs font-black text-fuchsia-100/80">Tamanho</span>
                      <input
                        type="range"
                        min="28"
                        max="180"
                        value={activeSticker.size}
                        onChange={(event) => updateActiveStickerStyle('size', Number(event.target.value))}
                        className="mt-2 w-full accent-fuchsia-400"
                      />
                    </label>

                    <label className="mt-3 block">
                      <span className="text-xs font-black text-fuchsia-100/80">Rotacao</span>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        value={activeSticker.rotation}
                        onChange={(event) => updateActiveStickerStyle('rotation', Number(event.target.value))}
                        className="mt-2 w-full accent-fuchsia-400"
                      />
                    </label>

                    <label className="mt-3 block">
                      <span className="text-xs font-black text-fuchsia-100/80">Opacidade</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={activeSticker.opacity ?? 1}
                        onChange={(event) => updateActiveStickerStyle('opacity', Number(event.target.value))}
                        aria-label="Opacidade da figurinha"
                        className="mt-2 w-full accent-fuchsia-400"
                      />
                    </label>

                    <p className="mt-2 rounded-lg border border-fuchsia-200/15 bg-black/20 px-3 py-2 text-[11px] font-semibold text-fuchsia-100/70">
                      Arraste no canvas; use o quadrado para escala e o circulo para rotacao. A composicao e preservada no MP4.
                    </p>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black text-fuchsia-100">
                        <span>Tempo</span>
                        <span>{activeSticker.startTime.toFixed(1)}s - {activeSticker.endTime.toFixed(1)}s</span>
                      </div>

                      <div className="relative mb-4 h-2 rounded-full bg-white/10">
                        <div
                          className="absolute top-0 h-full rounded-full bg-fuchsia-300"
                          style={{
                            left: `${duration > 0 ? (activeSticker.startTime / duration) * 100 : 0}%`,
                            width: `${activeStickerTimelineWidth}%`,
                          }}
                        />
                        <div
                          className="absolute -top-1 h-4 w-1 rounded-full bg-sky-200"
                          style={{ left: `${progressPercent}%` }}
                        />
                      </div>

                      <label className="block">
                        <span className="text-xs font-bold text-fuchsia-100/70">Entrada</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeSticker.startTime}
                          onChange={(event) => updateActiveStickerTiming('startTime', Number(event.target.value))}
                          className="mt-2 w-full accent-fuchsia-400"
                        />
                      </label>

                      <label className="mt-3 block">
                        <span className="text-xs font-bold text-fuchsia-100/70">Saida</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeSticker.endTime}
                          onChange={(event) => updateActiveStickerTiming('endTime', Number(event.target.value))}
                          className="mt-2 w-full accent-fuchsia-400"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={removeActiveSticker}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover figurinha
                    </button>
                  </div>
                )}
              </div>
            )}

            {activePanel === 'image' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black">Imagem</h3>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {activeImageOverlay ? 'Imagem sobreposta selecionada' : 'Adicionar imagem'}
                    </p>
                  </div>
                  {activeImageOverlay && (
                    <button
                      type="button"
                      onClick={removeActiveImageOverlay}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/10 text-red-100 transition hover:bg-red-500/20"
                      aria-label="Remover imagem selecionada"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid gap-1 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                  <span>Dica: para publicar com imagem, use PNG ou JPG.</span>
                  <span>WebP fica apenas na previa; PNG/JPG preservam a rotacao no MP4.</span>
                </div>

                {imageMessage && (
                  <div className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                    {imageMessage}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-amber-300/30 bg-amber-500/10 px-4 py-4 transition hover:bg-amber-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-100">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">Adicionar imagem</span>
                    <span className="block truncate text-xs text-amber-100/60">PNG, JPG, WebP ate 5 MB</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp"
                    onChange={handleImageChange}
                    className="sr-only"
                  />
                </label>

                <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Camadas</span>
                    <span className="text-xs font-semibold text-zinc-600">{imageOverlays.length}</span>
                  </div>
                  {imageOverlays.length > 0 ? (
                    <div className="grid gap-2">
                      {imageOverlays.map((overlay) => (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => selectImageOverlay(overlay)}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            overlay.id === activeImageId
                              ? 'border-amber-300/60 bg-amber-500/15 text-amber-50'
                              : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20'
                          }`}
                        >
                          <ImageIcon className="h-4 w-4 shrink-0 text-amber-200" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black">{overlay.name}</span>
                            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
                              {overlay.startTime.toFixed(1)}s - {overlay.endTime.toFixed(1)}s
                            </span>
                          </span>
                          {overlay.id === activeImageId && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-zinc-600">Nenhuma imagem adicionada.</p>
                  )}
                </div>

                {activeImageOverlay && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-50">
                    <div className="flex items-center justify-between gap-3 font-black">
                      <span className="inline-flex items-center gap-2">
                        <Move className="h-4 w-4" />
                        Selecionada
                      </span>
                      <span className="text-xs text-amber-100/60">
                        X {Math.round(activeImageOverlay.x)} / Y {Math.round(activeImageOverlay.y)}
                      </span>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-xs font-black text-amber-100/80">Largura</span>
                      <input
                        type="range"
                        min="32"
                        max={canvasSize.width}
                        value={activeImageOverlay.width}
                        onChange={(event) => updateActiveImageSize(Number(event.target.value))}
                        className="mt-2 w-full accent-amber-300"
                      />
                      <span className="mt-1 block text-xs font-semibold text-amber-100/60">
                        {Math.round(activeImageOverlay.width)}px
                      </span>
                    </label>

                    <label className="mt-3 block">
                      <span className="text-xs font-black text-amber-100/80">Rotacao</span>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={activeImageOverlay.rotation}
                        onChange={(event) => updateActiveImageRotation(Number(event.target.value))}
                        className="mt-2 w-full accent-amber-300"
                      />
                    </label>

                    <p className="mt-2 rounded-lg border border-amber-200/15 bg-black/20 px-3 py-2 text-[11px] font-semibold text-amber-100/70">
                      Arraste a alca circular acima da imagem para girar. PNG/JPG girados entram no video final.
                    </p>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black text-amber-100">
                        <span>Tempo</span>
                        <span>{activeImageOverlay.startTime.toFixed(1)}s - {activeImageOverlay.endTime.toFixed(1)}s</span>
                      </div>

                      <div className="relative mb-4 h-2 rounded-full bg-white/10">
                        <div
                          className="absolute top-0 h-full rounded-full bg-amber-300"
                          style={{
                            left: `${duration > 0 ? (activeImageOverlay.startTime / duration) * 100 : 0}%`,
                            width: `${activeImageTimelineWidth}%`,
                          }}
                        />
                        <div
                          className="absolute -top-1 h-4 w-1 rounded-full bg-sky-200"
                          style={{ left: `${progressPercent}%` }}
                        />
                      </div>

                      <label className="block">
                        <span className="text-xs font-bold text-amber-100/70">Entrada</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeImageOverlay.startTime}
                          onChange={(event) => updateActiveImageTiming('startTime', Number(event.target.value))}
                          className="mt-2 w-full accent-amber-300"
                        />
                      </label>

                      <label className="mt-3 block">
                        <span className="text-xs font-bold text-amber-100/70">Saida</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeImageOverlay.endTime}
                          onChange={(event) => updateActiveImageTiming('endTime', Number(event.target.value))}
                          className="mt-2 w-full accent-amber-300"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={removeActiveImageOverlay}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover imagem
                    </button>
                  </div>
                )}
              </div>
            )}

            {activePanel === 'audio' && (
              <div className="space-y-4">
                <LocalAudioLibrary projectId={projectId} assets={audioLibrary} timelinePlaying={isPlaying} disabled={isRendering || audioClipBusy || !projectStorageReady}
                  onImport={(files, category) => void importLibraryFiles(files, category)} onAdd={(asset) => void addLibraryAsset(asset)}
                  onReassociate={(asset, file) => void reassociateLibraryAsset(asset, file)}
                  onLicenseChange={(asset, licenseInfo) => setAudioLibrary((current) => current.map((item) => item.assetId === asset.assetId && item.category === asset.category ? { ...item, licenseInfo } : item))}
                  onPreviewStart={() => { videoRef.current?.pause(); pauseBackgroundMusic(); setIsPlaying(false) }} />
                <AudioClipControls clips={audioClips} selected={activeAudioClipId} duration={timelineDuration} disabled={isRendering || audioClipBusy || !projectStorageReady}
                  onSelect={selectAdditionalAudio}
                  onChange={(id, changes) => setAudioClips((current) => current.map((clip) => clip.id === id ? normalizeAudioClipFades({ ...clip, ...changes }, timelineDuration) : clip))}
                  onRemove={(id) => { setAudioClips((current) => current.filter((clip) => clip.id !== id)); setActiveAudioClipId((current) => current === id ? null : current) }}
                  onImport={(files) => void importAdditionalAudio(files)} onReassociate={(id, file) => void reassociateAudioClip(id, file)} />
                {audioClipMessage && <p role="status" className="text-xs text-amber-200">{audioClipMessage}</p>}
                <MusicLibrary selectedId={selectedMusicId} onUse={handleUseLibraryTrack} />

                {audioMessage && (
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100">
                    {audioMessage}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-3 transition hover:bg-white/10">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-white">Importar</span>
                    <span className="block truncate text-[10px] text-zinc-400">Seu áudio</span>
                  </span>
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                    onChange={handleAudioChange}
                    className="sr-only"
                  />
                </label>
                <button type="button" onClick={() => openEditorPanel('voice')} className="flex items-center gap-2 rounded-2xl border border-violet-300/15 bg-violet-400/[0.07] px-3 py-3 text-left transition hover:bg-violet-400/15">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-400/15 text-violet-200"><Mic className="h-5 w-5" /></span>
                  <span><span className="block text-xs font-black text-white">Gravar voz</span><span className="block text-[10px] text-zinc-400">Narração</span></span>
                </button>
                </div>

                {audioName && (
                  <div className="space-y-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/70">Musica</p>
                        <p className="mt-1 truncate text-sm font-semibold text-emerald-50">{audioName}</p>
                        <p className="mt-1 text-xs font-bold text-emerald-100/60">
                          {audioDuration > 0 ? formatEditorTime(audioDuration) : 'Duracao lendo...'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removeAudioTrack}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-emerald-50 transition hover:bg-red-500/20 hover:text-red-100"
                        aria-label="Remover trilha sonora"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={playMusicPreview}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-200"
                    >
                      <Play className="h-4 w-4" />
                      Ouvir com video
                    </button>
                  </div>
                )}

                <label className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Video original</span>
                    <button type="button" aria-label={videoVolume ? 'Silenciar vídeo' : 'Ativar áudio do vídeo'} onClick={() => toggleTrackMute('video')} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">{videoVolume ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
                    <span className="text-xs font-semibold text-zinc-500">{Math.round(videoVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={videoVolume}
                    onChange={(event) => setVideoVolume(Number(event.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                </label>

                <label className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Musica</span>
                    <button type="button" aria-label={musicVolume ? 'Silenciar música' : 'Ativar música'} onClick={() => toggleTrackMute('music')} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">{musicVolume ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
                    <span className="text-xs font-semibold text-zinc-500">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={musicVolume}
                    onChange={(event) => {
                      setMusicVolume(Number(event.target.value))
                      setMusicVolumeTouched(true)
                    }}
                    disabled={!audioUrl}
                    className="mt-2 w-full accent-emerald-400 disabled:opacity-40"
                  />
                </label>
                {mixScale < 1 && <p className="text-xs text-amber-200">A mixagem reduz proporcionalmente o volume das faixas para reservar margem e reduzir distorção.</p>}

                <label className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Inicio da musica</span>
                    <span className="text-xs font-semibold text-zinc-500">{formatEditorTime(musicStartTime)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(timelineDuration - 0.1, 0)}
                    step="0.1"
                    value={musicStartTime}
                    onChange={(event) => setMusicStartTime(Number(event.target.value))}
                    disabled={!audioUrl}
                    className="mt-2 w-full accent-emerald-400 disabled:opacity-40"
                  />
                </label>

                <label className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Trecho usado da musica</span>
                    <span className="text-xs font-semibold text-zinc-500">{formatEditorTime(musicTrimStart)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max((musicTrimEnd || audioDuration) - 0.1, 0)}
                    step="0.1"
                    value={musicTrimStart}
                    onChange={(event) => {
                      const nextOffset = Number(event.target.value)
                      setMusicTrimStart(nextOffset)
                      if (audioRef.current) {
                        audioRef.current.currentTime = nextOffset
                      }
                      syncPreviewAudioTracks(currentTime, isPlaying)
                    }}
                    disabled={!audioUrl || audioDuration <= 0}
                    className="mt-2 w-full accent-emerald-400 disabled:opacity-40"
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs font-black text-zinc-300"><span>Fim do trecho</span><span>{formatEditorTime(musicTrimEnd || audioDuration)}</span></span>
                  <input aria-label="Fim do trecho da música" type="range" min={Math.min(musicTrimStart + 0.1, audioDuration)} max={audioDuration} step="0.1" value={musicTrimEnd || audioDuration} onChange={(event) => setMusicTrimEnd(Number(event.target.value))} disabled={!audioUrl || audioDuration <= 0} className="mt-2 w-full accent-emerald-400 disabled:opacity-40" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-bold">Fade-in (s)<input aria-label="Fade-in da música" type="number" min="0" max="60" step="0.1" value={musicFadeIn} disabled={!audioUrl} onChange={(event) => setMusicFadeIn(clamp(Number(event.target.value) || 0, 0, 60))} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label>
                  <label className="text-xs font-bold">Fade-out (s)<input aria-label="Fade-out da música" type="number" min="0" max="60" step="0.1" value={musicFadeOut} disabled={!audioUrl} onChange={(event) => setMusicFadeOut(clamp(Number(event.target.value) || 0, 0, 60))} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label>
                </div>
              </div>
            )}

            {activePanel === 'effects' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Efeitos</h3>
                  <p className="mt-1 text-sm text-zinc-500">Escolha um filtro.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                {videoFilters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => updateEditingColor({ preset: item.value })}
                    aria-pressed={editingColor.preset === item.value}
                    className={`rounded-2xl border p-2 text-left transition ${
                      editingColor.preset === item.value
                        ? 'border-blue-300/50 bg-blue-500/15 text-blue-50'
                        : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-blue-300/25'
                    }`}
                  >
                    <span className={`block h-12 rounded-xl ${item.swatchClassName}`} />
                    <span className="mt-2 block text-xs font-black">{item.label}</span>
                  </button>
                ))}
                </div>
                <div className="grid grid-cols-2 gap-2" aria-label="Novos filtros">
                  {([{ value: 'cool', label: 'Frio' }, { value: 'cinematic', label: 'Cinematográfico' }] as const).map((preset) => (
                    <button key={preset.value} type="button" onClick={() => updateEditingColor({ preset: preset.value })} aria-pressed={editingColor.preset === preset.value} className="rounded-xl border border-white/20 p-3 text-left text-xs aria-pressed:border-sky-300 aria-pressed:bg-sky-400/20">{preset.label}</button>
                  ))}
                </div>
                <p className="text-xs text-zinc-400">{editingClipId ? `Aplicando ao clipe: ${selectedClip?.name || activeSequenceClip?.name}` : 'Selecione um vídeo ou fotografia na timeline.'}</p>
                {([{ key: 'intensity', label: 'Intensidade', min: 0 }, { key: 'brightness', label: 'Brilho', min: -100 }, { key: 'contrast', label: 'Contraste', min: -100 }, { key: 'saturation', label: 'Saturação', min: -100 }, { key: 'temperature', label: 'Temperatura de cor', min: -100 }] as const).map(({ key, label, min }) => (
                  <label key={key} className="block text-xs text-zinc-200">{label}: {editingColor[key]}
                    <input aria-label={label} type="range" min={min} max="100" step="1" value={editingColor[key]} disabled={!editingClipId} onChange={(event) => updateEditingColor({ [key]: Number(event.target.value) })} className="mt-2 w-full accent-sky-400" />
                  </label>
                ))}
                <button type="button" disabled={!editingClipId} onClick={() => updateEditingColor(DEFAULT_COLOR_ADJUSTMENTS)} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Restaurar ajustes</button>
              </div>
            )}

            {activePanel === 'magic' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-fuchsia-300" /><h3 className="text-base font-black">Um toque de magia</h3></div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Brilho', value: 'warm' as VideoFilter, color: 'from-amber-300 via-orange-500 to-fuchsia-600' },
                    { label: 'Cinema', value: 'sepia' as VideoFilter, color: 'from-amber-700 via-stone-800 to-black' },
                    { label: 'Clássico', value: 'mono' as VideoFilter, color: 'from-white via-zinc-500 to-black' },
                  ].map((preset) => (
                    <button key={preset.value} type="button" onClick={() => updateEditingColor({ preset: preset.value })} aria-pressed={editingColor.preset === preset.value} className={`overflow-hidden rounded-2xl border p-1.5 text-left transition ${editingColor.preset === preset.value ? 'border-fuchsia-300 bg-fuchsia-300/10 ring-2 ring-fuchsia-300/25' : 'border-white/10 bg-white/[0.04]'}`}>
                      <span className={`grid h-16 place-items-center rounded-xl bg-gradient-to-br ${preset.color}`}><Sparkles className="h-6 w-6 text-white drop-shadow" /></span>
                      <span className="block px-1 py-2 text-center text-[11px] font-black text-white">{preset.label}</span>
                    </button>
                  ))}
                </div>
                <div className="rounded-2xl border border-dashed border-fuchsia-300/20 bg-fuchsia-400/[0.06] px-3 py-3 text-center text-[11px] font-semibold text-fuchsia-100/70">Auto cut · IA · Templates em breve</div>
              </div>
            )}

            {activePanel === 'transitions' && (
              <div className="space-y-2 text-xs text-zinc-300">
                <h3 className="text-sm font-black text-white">Transições</h3>
                <p>Selecione a junção pelo clipe à direita. A sobreposição reduz a duração do projeto pelo tempo escolhido.</p>
                {selectedPreviousClip && selectedClip ? <div className="space-y-2 rounded-lg border border-white/10 p-3" aria-label="Transição da junção selecionada">
                  <p className="font-semibold">{selectedPreviousClip.name} → {selectedClip.name}</p>
                  <div className="flex flex-wrap gap-2">{(['none', 'dissolve', 'dip-black'] as const).map((type) => <button key={type} type="button" onClick={() => updateSelectedJunction(type)} aria-pressed={(selectedJunction?.type || 'none') === type} className="rounded-md border border-white/20 px-3 py-2 aria-pressed:bg-sky-400 aria-pressed:text-black">{{ none: 'Corte', dissolve: 'Dissolver', 'dip-black': 'Pelo preto' }[type]}</button>)}</div>
                  {selectedJunction && <label className="block">Duração (s)<input type="number" aria-label="Duração da transição" min="0.1" max={selectedJunctionMax} step="0.1" value={selectedJunction.duration} onChange={(event) => updateSelectedJunction(selectedJunction.type, event.currentTarget.valueAsNumber)} className="ml-2 w-20 rounded bg-zinc-950 p-2 text-white" /></label>}
                  <p>Duração do projeto: {formatEditorTime(timelineDuration)}</p>
                </div> : <p>Selecione um clipe após o primeiro para editar sua junção.</p>}
              </div>
            )}

            {activePanel === 'adjust' && (
              <div className="space-y-5">
                <div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-sky-300" /><h3 className="text-base font-black">Ajustar</h3></div>
                <label className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="flex justify-between text-xs font-bold text-zinc-200"><span className="flex items-center gap-2"><Volume2 className="h-4 w-4" /> Áudio original</span><span>{Math.round(videoVolume * 100)}%</span></span>
                  <input type="range" min="0" max="1" step="0.01" value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} className="mt-3 w-full accent-sky-400" />
                </label>
                <label className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="flex justify-between text-xs font-bold text-zinc-200"><span className="flex items-center gap-2"><Music className="h-4 w-4" /> Música</span><span>{Math.round(musicVolume * 100)}%</span></span>
                  <input type="range" min="0" max="1" step="0.01" value={musicVolume} onChange={(event) => { setMusicVolume(Number(event.target.value)); setMusicVolumeTouched(true) }} disabled={!audioUrl} className="mt-3 w-full accent-fuchsia-400 disabled:opacity-40" />
                </label>
                <div>
                  <p className="mb-2 text-xs font-bold text-zinc-400">Qualidade final</p>
                  <div className="grid grid-cols-3 gap-2">
                    {compressionOptions.map((option) => <button key={option.id} type="button" onClick={() => setCompressionPreset(option.id)} aria-pressed={compressionPreset === option.id} className={`rounded-xl px-2 py-3 text-xs font-black ${compressionPreset === option.id ? 'bg-sky-400 text-sky-950' : 'bg-white/[0.06] text-zinc-300'}`}>{option.label}</button>)}
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'caption' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Legendas do vídeo</h3>
                  <p className="mt-1 text-sm text-zinc-500">Crie segmentos temporizados, importe SRT/WebVTT ou gere uma transcrição local para revisar.</p>
                </div>
                <AutomaticSubtitlesPanel
                  key={projectId}
                  canTranscribe={canGenerateAutomaticSubtitles}
                  projectId={projectId}
                  firstOrder={subtitles.length}
                  timelineDuration={timelineDuration}
                  sourceDescription={automaticSubtitleSource}
                  prepareAudio={prepareAutomaticSubtitleAudio}
                  onConfirm={addAutomaticSubtitles}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addSubtitle} disabled={timelineDuration <= 0} className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-sky-950 disabled:opacity-40">Adicionar legenda</button>
                  <label className="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-xs font-bold">Importar SRT/VTT<input type="file" accept=".srt,.vtt,text/plain,text/vtt" className="sr-only" onChange={(event) => { void importSubtitles(event.target.files?.[0]); event.target.value = '' }} /></label>
                </div>
                {subtitleMessage && <p role="status" className="text-xs text-amber-200">{subtitleMessage}</p>}
                {subtitles.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Navegar pelas legendas">{[...subtitles].sort((a, b) => a.startTime - b.startTime || a.order - b.order).map((item) => <button key={item.id} type="button" onClick={() => { setActiveSubtitleId(item.id); handleSeek(item.startTime) }} aria-pressed={item.id === activeSubtitleId} className={`max-w-full truncate rounded-lg border px-2 py-1 text-xs ${item.id === activeSubtitleId ? 'border-sky-300 bg-sky-400/20' : 'border-white/20'}`}>{item.startTime.toFixed(1)}s {item.text}</button>)}</div>}
                {selectedSubtitle && selectedSubtitleStyle && <div className="space-y-3 rounded-xl border border-sky-300/20 p-3">
                  <label className="block text-xs font-bold">Texto da legenda<textarea aria-label="Texto da legenda" value={selectedSubtitle.text} onChange={(event) => updateSelectedSubtitle({ text: event.target.value.trim() ? event.target.value : 'Nova legenda', words: undefined })} rows={3} className="mt-1 w-full rounded bg-zinc-950 p-2 text-white" /></label>
                  <div className="grid grid-cols-2 gap-2 text-xs"><label>Início (s)<input aria-label="Início da legenda" type="number" min="0" max={selectedSubtitle.endTime - MIN_TIMELINE_ITEM_DURATION} step="0.1" value={selectedSubtitle.startTime} onChange={(event) => updateTimelineLayerTiming('subtitle', selectedSubtitle.id, Number(event.target.value), selectedSubtitle.endTime)} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Fim (s)<input aria-label="Fim da legenda" type="number" min={selectedSubtitle.startTime + MIN_TIMELINE_ITEM_DURATION} max={timelineDuration} step="0.1" value={selectedSubtitle.endTime} onChange={(event) => updateTimelineLayerTiming('subtitle', selectedSubtitle.id, selectedSubtitle.startTime, Number(event.target.value))} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div>
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={splitSelectedSubtitle} className="rounded border border-white/20 px-2 py-1 text-xs">Dividir no playhead</button><button type="button" onClick={() => moveSelectedSubtitle(-1)} className="rounded border border-white/20 px-2 py-1 text-xs">Subir ordem</button><button type="button" onClick={() => moveSelectedSubtitle(1)} className="rounded border border-white/20 px-2 py-1 text-xs">Descer ordem</button><button type="button" onClick={() => { setSubtitles((current) => current.filter((item) => item.id !== selectedSubtitle.id)); setActiveSubtitleId(null) }} className="rounded border border-red-300/40 px-2 py-1 text-xs text-red-200">Excluir legenda</button></div>
                  <label className="block text-xs">Preset
                    <select aria-label="Preset da legenda" value={selectedSubtitleStyle.preset} onChange={(event) => selectSubtitlePreset(event.target.value as SubtitlePreset)} className="mt-1 w-full rounded bg-zinc-950 p-2">
                      <option value="classic">Clássico</option><option value="modern">Moderno</option><option value="pop">Pop</option><option value="cinematic">Cinemático</option><option value="karaoke">Karaokê por segmento</option><option value="high-contrast">Alto contraste</option>
                    </select>
                  </label>
                  <details open className="rounded-lg border border-white/10 p-2">
                    <summary className="cursor-pointer text-xs font-black">Aparência</summary>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <label>Fonte<select aria-label="Fonte da legenda" value={selectedSubtitleStyle.font} onChange={(event) => updateSelectedSubtitleStyle({ font: event.target.value as SubtitleSegment['style']['font'] })} className="mt-1 w-full rounded bg-zinc-950 p-2">{TEXT_FONT_OPTIONS.map((fontOption) => <option key={fontOption.key} value={fontOption.key}>{fontOption.label}</option>)}</select></label>
                      <label>Tamanho<input aria-label="Tamanho da legenda" type="number" min="12" max="120" value={selectedSubtitleStyle.size} onChange={(event) => updateSelectedSubtitleStyle({ size: Math.max(12, Math.min(120, Number(event.target.value))) })} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label>
                      <label>Cor<input aria-label="Cor da legenda" type="color" value={selectedSubtitleStyle.color} onChange={(event) => updateSelectedSubtitleStyle({ color: event.target.value })} className="mt-1 h-9 w-full" /></label>
                      <label>Cor de destaque<input aria-label="Cor de destaque da legenda" type="color" value={selectedSubtitleStyle.highlightColor} onChange={(event) => updateSelectedSubtitleStyle({ highlightColor: event.target.value })} className="mt-1 h-9 w-full" /></label>
                      <label>Contorno<input aria-label="Contorno da legenda" type="range" min="0" max="8" value={selectedSubtitleStyle.outline} onChange={(event) => updateSelectedSubtitleStyle({ outline: Number(event.target.value) })} className="mt-2 w-full" /></label>
                      <label>Posição vertical (%)<input aria-label="Posição da legenda" type="range" min="10" max="92" value={selectedSubtitleStyle.position} onChange={(event) => updateSelectedSubtitleStyle({ position: Number(event.target.value) })} className="mt-2 w-full" /></label>
                      <label>Alinhamento<select aria-label="Alinhamento da legenda" value={selectedSubtitleStyle.align} onChange={(event) => updateSelectedSubtitleStyle({ align: event.target.value as SubtitleSegment['style']['align'] })} className="mt-1 w-full rounded bg-zinc-950 p-2"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
                    </div>
                    <div className="mt-3 flex gap-3 text-xs"><label><input type="checkbox" checked={selectedSubtitleStyle.shadow} onChange={(event) => updateSelectedSubtitleStyle({ shadow: event.target.checked })} /> Sombra</label><label><input type="checkbox" checked={selectedSubtitleStyle.background} onChange={(event) => updateSelectedSubtitleStyle({ background: event.target.checked })} /> Fundo</label></div>
                  </details>
                  <details className="rounded-lg border border-white/10 p-2">
                    <summary className="cursor-pointer text-xs font-black">Animação</summary>
                    <div className="mt-3 space-y-3 text-xs">
                      <label className="block">Efeito<select aria-label="Animação da legenda" value={selectedSubtitleStyle.animation} onChange={(event) => updateSelectedSubtitleStyle({ animation: event.target.value as SubtitleAnimation })} className="mt-1 w-full rounded bg-zinc-950 p-2">{SUBTITLE_ANIMATIONS.map((animation) => <option key={animation} value={animation}>{animation === 'none' ? 'Nenhuma' : animation === 'fade' ? 'Fade' : animation === 'pop' ? 'Pop' : animation === 'zoom' ? 'Zoom suave' : 'Slide discreto'}</option>)}</select></label>
                      <label className="block">Intensidade: {selectedSubtitleStyle.animationIntensity}%<input aria-label="Intensidade da animação" type="range" min="0" max="100" value={selectedSubtitleStyle.animationIntensity} onChange={(event) => updateSelectedSubtitleStyle({ animationIntensity: Number(event.target.value) })} className="mt-1 w-full" /></label>
                      <div className="grid grid-cols-2 gap-2"><label>Entrada (s)<input aria-label="Duração de entrada da legenda" type="number" min="0" max="2" step="0.05" value={selectedSubtitleStyle.enterDuration} onChange={(event) => updateSelectedSubtitleStyle({ enterDuration: Math.max(0, Math.min(2, Number(event.target.value))) })} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Saída (s)<input aria-label="Duração de saída da legenda" type="number" min="0" max="2" step="0.05" value={selectedSubtitleStyle.exitDuration} onChange={(event) => updateSelectedSubtitleStyle({ exitDuration: Math.max(0, Math.min(2, Number(event.target.value))) })} className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div>
                      <label className="block">Karaokê<select aria-label="Modo karaokê" value={selectedSubtitleStyle.karaokeMode} onChange={(event) => updateSelectedSubtitleStyle({ karaokeMode: event.target.value as SubtitleStyle['karaokeMode'] })} className="mt-1 w-full rounded bg-zinc-950 p-2"><option value="off">Desativado</option><option value="segment">Progressivo por segmento</option></select></label>
                      {selectedSubtitleStyle.karaokeMode === 'segment' && <p className="rounded bg-amber-400/10 p-2 text-[11px] leading-4 text-amber-100">O destaque progride entre o início e o fim reais do segmento. Não representa sincronização exata por palavra.</p>}
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={restoreSelectedSubtitleStyle} className="rounded border border-white/20 px-2 py-1 text-xs">Restaurar preset</button><button type="button" onClick={applySelectedSubtitleStyleToAll} disabled={subtitles.length < 2} className="rounded border border-sky-300/30 px-2 py-1 text-xs text-sky-100 disabled:opacity-40">Aplicar a todas</button></div>
                </div>}
                <div className="border-t border-white/10 pt-3"><label className="block text-xs font-bold">Legenda do post (separada do vídeo)</label>
                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  rows={7}
                  placeholder="O que voce esta pensando?"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
                /></div>
              </div>
            )}

            {activePanel === 'voice' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Voz</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {isRecordingVoice ? 'Gravando...' : voiceUrl ? 'Voz pronta para ouvir com o video' : 'Grave uma narracao.'}
                  </p>
                </div>

                {voiceMessage && (
                  <div className="rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-100">
                    {voiceMessage}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {isRecordingVoice ? (
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-black text-white transition hover:bg-red-400"
                    >
                      <Mic className="h-4 w-4" />
                      Parar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startVoiceRecording}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-400 px-3 py-2 text-sm font-black text-violet-950 transition hover:bg-violet-300"
                    >
                      <Mic className="h-4 w-4" />
                      {voiceUrl ? 'Regravar' : 'Gravar'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={playVoicePreview}
                    disabled={!voiceUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-sm font-black text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Play className="h-4 w-4" />
                    Ouvir
                  </button>

                  <button
                    type="button"
                    onClick={removeVoiceRecording}
                    disabled={!voiceUrl && !voiceBlob}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                </div>

                {voiceUrl && (
                  <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-4">
                    <audio ref={voicePreviewRef} src={voiceUrl} controls className="w-full" />

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black text-zinc-300">
                      <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                        <span className="block text-zinc-500">Duracao</span>
                        <span>{formatEditorTime(voiceDuration)}</span>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                        <span className="block text-zinc-500">Inicio</span>
                        <span>{formatEditorTime(voiceStartTime)}</span>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                        <span className="block text-zinc-500">Arquivo</span>
                        <span>{voiceBlob ? formatFileSize(voiceBlob.size) : '-'}</span>
                      </div>
                    </div>

                    <label className="block text-xs font-black text-zinc-400">
                      Inicio
                      <input
                        type="range"
                        min="0"
                        max={Math.max(timelineDuration - 0.1, 0)}
                        step="0.1"
                        value={voiceStartTime}
                        onChange={(event) => setVoiceStartTime(Number(event.target.value))}
                        className="mt-2 w-full accent-violet-400"
                      />
                    </label>

                    <label className="block text-xs font-black text-zinc-400">
                      Volume da voz
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={voiceVolume}
                        onChange={(event) => setVoiceVolume(Number(event.target.value))}
                        className="mt-2 w-full accent-violet-400"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
            {activePanel === 'add' && <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Mídia do projeto</p>
              {mediaImportEntries.filter((entry) => entry.status !== 'ready').map((entry) => (
                <div key={entry.id} data-import-status={entry.status} role="status" className={`rounded-md border px-2 py-1.5 text-[11px] ${entry.status === 'loading' ? 'border-sky-300/20 text-sky-200' : 'border-amber-300/20 text-amber-200'}`}>
                  <span className="block truncate font-semibold">{entry.name}</span>
                  <span>{entry.status === 'loading' ? 'Carregando arquivo…' : entry.status === 'unsupported' ? 'Formato não suportado' : 'Falha na importação'}{entry.detail ? ` · ${entry.detail}` : ''}</span>
                </div>
              ))}
              {libraryClips.length === 0 && !audioName && <p className="text-xs text-zinc-500">Importe vídeos, fotos ou áudio para começar.</p>}
              {libraryClips.map((clip) => (
                <div key={clip.id} className="space-y-1">
                <button data-media-id={clip.id} type="button" draggable={Boolean(clip.previewUrl) && !missingMediaRefs[clip.id] && !isRendering}
                  onDragStart={(event) => { libraryDragRef.current = clip.id; libraryDropHandledRef.current = false; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-entreus-library', clip.id) }}
                  onDragEnd={() => { libraryDragRef.current = null; setLibraryDropActive(false) }} onClick={() => {
                  if (excludedClipIds.includes(clip.id)) {
                    setExcludedClipIds((current) => current.filter((id) => id !== clip.id))
                    setSequenceOrder((current) => [...current, clip.id])
                  }
                  const positioned = timelineClips.find((item) => item.id === clip.id)
                  clearVisualSelection()
                  setActiveClipId(clip.id)
                  if (positioned) handleSeek(positioned.startTime)
                  setMobileLibraryOpen(false)
                }} className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${activeClipId === clip.id ? 'border-sky-300/50 bg-sky-400/15' : 'border-white/10 bg-white/[0.04] hover:bg-white/10'}`}>
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-zinc-900">{clip.previewUrl ? clip.type === 'image' ? <NextImage unoptimized src={clip.previewUrl} alt="" fill sizes="56px" className="object-cover" /> : <VideoFilmstrip src={clip.previewUrl} /> : <span className="grid h-full place-items-center text-[9px] text-amber-200">Ausente</span>}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{clip.name}</span><span className="text-[10px] text-zinc-500">{clip.type === 'video' ? 'Vídeo' : 'Foto'} · {formatEditorTime(clip.duration)}{mediaImportEntries.some((entry) => entry.id === clip.id && entry.status === 'ready') ? ' · Pronto' : ''}{excludedClipIds.includes(clip.id) ? ' · Adicionar' : ''}</span></span>
                </button>
                <button type="button" disabled={isRendering || !projectStorageReady} onClick={() => placeLibraryClip(clip.id)} className="min-h-8 w-full rounded border border-sky-300/25 px-2 text-[11px] text-sky-100 focus-visible:outline-2 focus-visible:outline-sky-200" aria-label={`Adicionar à timeline: ${clip.name}`}>{excludedClipIds.includes(clip.id) ? 'Adicionar à timeline' : 'Mover ao final da timeline'}</button>
                </div>
              ))}
              {imageOverlays.map((overlay) => <button key={overlay.id} type="button" data-media-id={overlay.id} onClick={() => { selectImageOverlay(overlay); setMobileLibraryOpen(false) }} className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-left text-xs hover:bg-white/10"><span className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-zinc-900">{overlay.url ? <NextImage unoptimized src={overlay.url} alt="" fill sizes="56px" className="object-cover" /> : <span className="grid h-full place-items-center text-[9px] text-amber-200">Ausente</span>}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{overlay.name}</span><span className="text-[10px] text-zinc-500">Sobreposição · {formatEditorTime(overlay.endTime - overlay.startTime)}{mediaImportEntries.some((entry) => entry.id === overlay.id && entry.status === 'ready') ? ' · Pronto' : ''}</span></span></button>)}
              {audioName && <button type="button" onClick={() => openEditorPanel('audio')} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-left text-xs"><Music className="h-5 w-5 shrink-0 text-emerald-300" /><span className="min-w-0 flex-1 truncate">{audioName}</span><span className="text-[10px] text-zinc-500">Áudio · {formatEditorTime(audioDuration)}{mediaImportEntries.some((entry) => entry.id === 'audio-track' && entry.status === 'ready') ? ' · Pronto' : ''}</span></button>}
            </div>}
          </div>
        </aside>
        {!workspaceLayout.libraryOpen && <button type="button" onClick={() => setWorkspaceLayout((current) => ({ ...current, libraryOpen: true }))} aria-label="Abrir biblioteca" title="Abrir biblioteca" className="hidden w-7 shrink-0 items-start justify-center border-r border-white/10 bg-[#151622] pt-4 text-sky-200 hover:bg-sky-500/15 focus-visible:outline-2 focus-visible:outline-sky-300 xl:flex"><PanelLeftOpen className="h-4 w-4" /></button>}
        {workspaceLayout.libraryOpen && <div role="separator" aria-label="Redimensionar biblioteca" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={560} aria-valuenow={workspaceLayout.libraryWidth} tabIndex={0} onPointerDown={(event) => beginWorkspaceResize('library', event)} onPointerMove={moveWorkspaceDivider} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={(event) => resizeWorkspaceWithKeyboard('library', event)} className="group relative hidden w-2 shrink-0 touch-none cursor-col-resize bg-[#11131f] focus-visible:outline-2 focus-visible:outline-sky-300 xl:block"><span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/10 transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-400" /></div>}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_25%,rgba(54,86,164,0.18),transparent_55%),#10111c] xl:min-w-[320px]">

          <nav aria-label="Layout do workspace" className="absolute left-2 top-2 z-[69] flex items-center gap-1 rounded-lg border border-white/10 bg-[#11131f]/85 px-1 py-0.5 text-[10px] font-bold text-zinc-300 shadow-lg backdrop-blur sm:left-4">
            <button type="button" onClick={() => { setMobileLibraryOpen(true); setWorkspaceLayout((current) => ({ ...current, libraryOpen: true })) }} className="grid h-7 w-8 shrink-0 place-items-center rounded-md hover:bg-white/10 xl:hidden" aria-label="Abrir biblioteca" title="Abrir biblioteca"><PanelLeftOpen className="h-4 w-4" /></button>
            <button type="button" onClick={() => setWorkspaceLayout((current) => ({ ...current, previewOpen: !current.previewOpen }))} className="grid h-7 w-8 shrink-0 place-items-center rounded-md hover:bg-white/10" aria-label={workspaceLayout.previewOpen ? 'Recolher prévia' : 'Abrir prévia'} title={workspaceLayout.previewOpen ? 'Recolher prévia' : 'Abrir prévia'}>{workspaceLayout.previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            {hasEditorMedia && <button type="button" onClick={() => setWorkspaceLayout((current) => ({ ...current, timelineOpen: !current.timelineOpen }))} className="grid h-7 w-8 shrink-0 place-items-center rounded-md hover:bg-white/10" aria-label={workspaceLayout.timelineOpen ? 'Recolher timeline' : 'Abrir timeline'} title={workspaceLayout.timelineOpen ? 'Recolher timeline' : 'Abrir timeline'}>{workspaceLayout.timelineOpen ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}</button>}
            {hasEditorMedia && <button type="button" onClick={() => toggleWorkspaceFocus('preview')} aria-pressed={workspaceFocus === 'preview'} className={`hidden h-7 shrink-0 rounded-md px-2 hover:bg-white/10 sm:block ${workspaceFocus === 'preview' ? 'bg-sky-400/20 text-sky-100' : ''}`} title="Ampliar prévia" aria-label="Ampliar prévia">Prévia</button>}
            {hasEditorMedia && <button type="button" onClick={() => toggleWorkspaceFocus('timeline')} aria-pressed={workspaceFocus === 'timeline'} className={`hidden h-7 shrink-0 rounded-md px-2 hover:bg-white/10 sm:block ${workspaceFocus === 'timeline' ? 'bg-sky-400/20 text-sky-100' : ''}`} title="Ampliar timeline" aria-label="Ampliar timeline">Timeline</button>}
            <button type="button" onClick={restoreWorkspaceLayout} className="ml-auto grid h-7 w-8 shrink-0 place-items-center rounded-md text-sky-200 hover:bg-sky-400/10" aria-label="Restaurar layout padrão" title="Restaurar layout padrão"><RotateCcw className="h-4 w-4" /></button>
          </nav>

          {localDraftMessage && (
            <div className="relative z-[65] border-b border-sky-300/15 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 sm:px-5">
              {localDraftMessage}
            </div>
          )}

          <div data-testid="editor-preview" className={`relative z-0 min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto px-2 pb-2 pt-12 ${workspaceLayout.previewOpen ? 'flex' : 'hidden'}`}>
            <div style={{ containerType: hasEditorMedia ? 'size' : undefined }} className={`relative isolate mx-auto flex w-full max-w-[56rem] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(92,110,230,0.28),transparent_55%),#070810] shadow-2xl shadow-black/50 ${hasEditorMedia ? 'h-full min-h-0 rounded-[1.5rem] border border-white/10 p-2 ring-1 ring-white/5 sm:rounded-[2rem] sm:p-4' : 'rounded-[1.5rem] border border-white/10'}`}>
            {editorMode === 'video' && (videoFile || extraVideos.length > 0) ? (
              <div
                className={`relative mx-auto h-full w-auto max-w-full overflow-hidden rounded-[1.1rem] bg-black shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-1 ring-white/15 ${canvasSize.height > canvasSize.width ? 'max-w-[24rem]' : 'max-w-[52rem]'}`}
                style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}`, width: `min(100cqw, ${canvasSize.width / canvasSize.height * 100}cqh)`, height: `min(100cqh, ${canvasSize.height / canvasSize.width * 100}cqw)` }}
              >
                <video
                  ref={videoRef}
                  src={activeVideoClip?.previewUrl || undefined}
                  playsInline
                  muted={false}
                  onLoadedMetadata={handleLoadedMetadata}
                  onError={() => {
                    const source = activeVideoClip?.id === 'base-video' ? videoFile : extraVideos.find((clip) => clip.id === activeVideoClip?.id)?.file
                    if (source && activeVideoClip) updateMediaImport(activeVideoClip.id, source.name, 'error', 'Falha ao ler ou decodificar o vídeo.')
                    setIsPlaying(false)
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onEnded={handleVideoEnded}
                  className={`relative h-full w-full transition duration-300 ${sequencePhotoPreview ? 'opacity-0' : 'opacity-100'} ${activeVideoClip && !colorAdjustments[activeVideoClip.id] ? selectedFilter.className : ''}`}
                  style={{ objectFit: frameMode === 'fill' ? 'cover' : 'contain', zIndex: LAYER_ORDER.video, filter: activeColorStyle(activeVideoClip?.id) }}
                />
                {outgoingTransitionClip?.type === 'video' && (
                  <video ref={outgoingVideoRef} src={outgoingTransitionClip.previewUrl} playsInline preload="auto"
                    className={`pointer-events-none absolute inset-0 h-full w-full ${!colorAdjustments[outgoingTransitionClip.id] ? selectedFilter.className : ''}`}
                    style={{ objectFit: frameMode === 'fill' ? 'cover' : 'contain', opacity: junctionTransitions[activeSequenceClip?.id || '']?.type === 'dissolve' ? 1 - transitionProgress : transitionProgress < 0.5 ? 1 : 0, zIndex: LAYER_ORDER.video, filter: activeColorStyle(outgoingTransitionClip.id) }} />
                )}
                {outgoingTransitionClip?.type === 'image' && (
                  <NextImage unoptimized fill sizes="(max-width: 768px) 100vw, 896px" src={outgoingTransitionClip.previewUrl}
                    alt={outgoingTransitionClip.name} className={`pointer-events-none absolute inset-0 h-full w-full ${!colorAdjustments[outgoingTransitionClip.id] ? selectedFilter.className : ''}`}
                    style={{ objectFit: frameMode === 'fill' ? 'cover' : 'contain', opacity: junctionTransitions[activeSequenceClip?.id || '']?.type === 'dissolve' ? 1 - transitionProgress : transitionProgress < 0.5 ? 1 : 0, zIndex: LAYER_ORDER.video, filter: activeColorStyle(outgoingTransitionClip.id) }} />
                )}
                {outgoingTransitionClip && junctionTransitions[activeSequenceClip?.id || '']?.type === 'dip-black' && (
                  <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 1 - Math.abs(2 * transitionProgress - 1), zIndex: LAYER_ORDER.video }} />
                )}
                {sequencePhotoPreview?.previewUrl && (
                  <NextImage unoptimized fill sizes="(max-width: 768px) 100vw, 896px"
                    src={sequencePhotoPreview.previewUrl}
                    alt={sequencePhotoPreview.file.name}
                    className={`absolute inset-0 z-[5] h-full w-full bg-black ${activePhotoClip && !colorAdjustments[activePhotoClip.id] ? selectedFilter.className : ''}`}
                    style={{ objectFit: frameMode === 'fill' ? 'cover' : 'contain', filter: activeColorStyle(activePhotoClip?.id) }}
                  />
                )}
                {videoOverlays.map((overlay) => <video
                  key={overlay.id}
                  ref={(element) => { if (element) videoOverlayElementsRef.current.set(overlay.id, element); else videoOverlayElementsRef.current.delete(overlay.id) }}
                  src={overlay.url || undefined}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    const sourceTime = videoOverlaySourceTime(overlay, currentTime)
                    if (sourceTime !== null) event.currentTarget.currentTime = sourceTime
                  }}
                  onLoadedData={() => drawCanvas()}
                  onSeeked={() => drawCanvas()}
                  onTimeUpdate={() => { if (isPlaying) drawCanvas() }}
                  className="pointer-events-none absolute object-fill opacity-0"
                  style={{
                    left: `${overlay.x / canvasSize.width * 100}%`,
                    top: `${overlay.y / canvasSize.height * 100}%`,
                    width: `${overlay.width / canvasSize.width * 100}%`,
                    height: `${overlay.height / canvasSize.height * 100}%`,
                    transform: `rotate(${overlay.rotation}deg)`,
                    display: videoOverlaySourceTime(overlay, currentTime) === null ? 'none' : 'block',
                    zIndex: LAYER_ORDER.video + 1,
                  }}
                />)}
                {missingMedia.length > 0 && <div className="pointer-events-none absolute inset-x-3 top-3 z-[60] rounded-lg bg-amber-950/90 p-2 text-center text-xs font-bold text-amber-100">Mídia original ausente — reassocie na biblioteca para conferir a prévia.</div>}
                {renderSubtitlePreview()}
                {activeSequenceClip && !outgoingTransitionClip && activeSequenceClip.transition !== 'none' && currentTime - activeSequenceClip.startTime < 0.45 && activeSequenceClip.order > 0 && (
                  <div className={`pointer-events-none absolute inset-0 z-[35] ${activeSequenceClip.transition === 'slide' ? 'bg-sky-300/25' : 'bg-black'}`} style={{ opacity: Math.max(0, 1 - (currentTime - activeSequenceClip.startTime) / 0.45) * (activeSequenceClip.transition === 'dissolve' ? 0.45 : 1), transform: activeSequenceClip.transition === 'slide' ? `translateX(${-100 * Math.min(1, (currentTime - activeSequenceClip.startTime) / 0.45)}%)` : undefined }} />
                )}
                <canvas
                  ref={canvasRef}
                  data-editor-preview-surface
                  tabIndex={0}
                  aria-label="Prévia do vídeo. Use Tab para focar e as setas para mover a camada selecionada."
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onPointerDown={(event) => { event.currentTarget.focus({ preventScroll: true }); handlePointerDown(event) }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onLostPointerCapture={handlePointerCancel}
                  className="absolute inset-0 h-full w-full touch-none cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                  style={{ zIndex: LAYER_ORDER.text }}
                />
                {activeOverlay && controlsVisible && (
                  <div
                    className="absolute inset-x-3 bottom-3 z-[75] rounded-2xl border border-sky-300/25 bg-black/75 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl xl:hidden"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editableText}
                        onChange={(event) => updateActiveOverlayText(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-black text-white outline-none placeholder:text-zinc-500 focus:border-sky-300"
                        aria-label="Editar texto selecionado"
                      />
                      <input
                        type="color"
                        value={editableTextColor}
                        onChange={(event) => updateActiveOverlayStyle('color', event.target.value)}
                        className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                        aria-label="Cor do texto"
                      />
                      <button
                        type="button"
                        onClick={() => updateActiveOverlayStyle('fontSize', Math.max(18, editableFontSize - 4))}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Diminuir texto"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveOverlayStyle('fontSize', Math.min(120, editableFontSize + 4))}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Aumentar texto"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={removeActiveOverlay}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 text-red-100"
                        aria-label="Remover texto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                      {TEXT_FONT_OPTIONS.map((fontOption) => (
                        <button
                          key={fontOption.key}
                          type="button"
                          onClick={() => updateActiveOverlayStyle('fontKey', fontOption.key)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
                            editableFontKey === fontOption.key
                              ? 'border-sky-200 bg-sky-500 text-white'
                              : 'border-white/10 bg-white/5 text-zinc-300'
                          }`}
                          style={{ fontFamily: fontOption.family }}
                        >
                          {fontOption.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
                      {TEXT_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateActiveOverlayStyle('color', color)}
                          className={`h-8 w-8 shrink-0 rounded-full border transition ${
                            editableTextColor.toLowerCase() === color.toLowerCase()
                              ? 'border-white ring-2 ring-sky-300'
                              : 'border-white/20'
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Cor ${color}`}
                        />
                      ))}
                      <span className="mx-1 h-7 w-px shrink-0 bg-white/10" />
                      {TEXT_BACKGROUND_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => applyTextBackgroundPreset(preset)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
                            editableBackgroundEnabled === preset.enabled &&
                            (!preset.enabled || editableBackgroundColor.toLowerCase() === preset.color.toLowerCase())
                              ? 'border-sky-200 bg-sky-500 text-white'
                              : 'border-white/10 bg-white/5 text-zinc-300'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      {editableBackgroundEnabled && (
                        <label className="ml-1 flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-zinc-300">
                          Fundo
                          <input
                            type="range"
                            min="0.2"
                            max="0.9"
                            step="0.05"
                            value={editableBackgroundOpacity}
                            onChange={(event) => updateActiveOverlayStyle('backgroundOpacity', Number(event.target.value))}
                            className="w-16 accent-sky-400"
                            aria-label="Opacidade do fundo"
                          />
                        </label>
                      )}
                      <span className="mx-1 h-7 w-px shrink-0 bg-white/10" />
                      {(['left', 'center', 'right'] as CanvasTextAlign[]).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => updateActiveOverlayStyle('textAlign', align)}
                          className={`h-8 shrink-0 rounded-full border px-3 text-[11px] font-black transition ${
                            editableTextAlign === align
                              ? 'border-sky-200 bg-sky-500 text-white'
                              : 'border-white/10 bg-white/5 text-zinc-300'
                          }`}
                        >
                          {align === 'left' ? 'Esq' : align === 'center' ? 'Centro' : 'Dir'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeSticker && controlsVisible && !activeOverlay && (
                  <div
                    className="absolute inset-x-3 bottom-3 z-[75] rounded-2xl border border-fuchsia-300/25 bg-black/75 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/20 text-2xl">
                        {activeSticker.value}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-black text-fuchsia-50">
                        Arraste no video. Tempo na timeline.
                      </span>
                      <button
                        type="button"
                        onClick={() => updateActiveStickerStyle('size', Math.max(28, activeSticker.size - 10))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Diminuir figurinha"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveStickerStyle('size', Math.min(220, activeSticker.size + 10))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Aumentar figurinha"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveStickerStyle('rotation', clamp(activeSticker.rotation - 15, -45, 45))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-black text-white"
                        aria-label="Girar figurinha para esquerda"
                      >
                        -15
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveStickerStyle('rotation', clamp(activeSticker.rotation + 15, -45, 45))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-black text-white"
                        aria-label="Girar figurinha para direita"
                      >
                        +15
                      </button>
                      <button
                        type="button"
                        onClick={removeActiveSticker}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 text-red-100"
                        aria-label="Remover figurinha"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
                {activeImageOverlay && controlsVisible && !activeOverlay && !activeSticker && (
                  <div
                    className="absolute inset-x-3 bottom-3 z-[75] rounded-2xl border border-amber-300/25 bg-black/75 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl xl:hidden"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-100">
                        <ImageIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-black text-amber-50">
                        Arraste no video. Tempo na timeline.
                      </span>
                      <button
                        type="button"
                        onClick={() => updateActiveImageSize(Math.max(32, activeImageOverlay.width - 24))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Diminuir imagem"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveImageSize(Math.min(canvasSize.width, activeImageOverlay.width + 24))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white"
                        aria-label="Aumentar imagem"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveImageRotation(normalizeImageAngle(activeImageOverlay.rotation - 15))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-black text-white"
                        aria-label="Girar imagem para esquerda"
                      >
                        -15
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveImageRotation(normalizeImageAngle(activeImageOverlay.rotation + 15))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-black text-white"
                        aria-label="Girar imagem para direita"
                      >
                        +15
                      </button>
                      <button
                        type="button"
                        onClick={removeActiveImageOverlay}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 text-red-100"
                        aria-label="Remover imagem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : editorMode === 'photos' && activePhotoSlide ? (
              <div
                className="relative mx-auto flex h-full w-auto max-w-full items-center justify-center bg-black"
                style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}`, width: `min(100cqw, ${canvasSize.width / canvasSize.height * 100}cqh)`, height: `min(100cqh, ${canvasSize.height / canvasSize.width * 100}cqw)` }}
              >
                {activePhotoSlide.previewUrl ? <NextImage unoptimized width={canvasSize.width} height={canvasSize.height}
                  src={activePhotoSlide.previewUrl}
                  alt={activePhotoSlide.file.name}
                  className={`h-full w-full ${!colorAdjustments[activePhotoSlide.id] ? selectedFilter.className : ''}`}
                  style={{ objectFit: frameMode === 'fill' ? 'cover' : 'contain', filter: activeColorStyle(activePhotoSlide.id) }}
                /> : <p className="p-4 text-center text-xs text-amber-100">Foto original ausente: {activePhotoSlide.file.name}</p>}
                {renderSubtitlePreview()}
                <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white ring-1 ring-white/10">
                  {activePhotoSlide.order + 1} / {photoSlides.length}
                </div>
                <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white ring-1 ring-white/10">
                  {formatEditorTime(photoSlidesDuration)}
                  {audioName ? ' + audio' : ''}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[24rem] w-full flex-col items-center justify-center px-6 text-center text-zinc-400 sm:min-h-[32rem]">
                <div className="grid h-20 w-20 place-items-center rounded-[1.5rem] bg-gradient-to-br from-sky-400 via-blue-600 to-violet-600 text-white shadow-xl shadow-blue-500/20">
                  <Video className="h-9 w-9" />
                </div>
                <p className="mt-5 text-xl font-black text-white">Comece sua criação</p>
                <div className="mt-5 flex w-full max-w-xs gap-2">
                <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-3 text-xs font-black text-zinc-950 transition hover:bg-sky-100 sm:text-sm">
                  <Video className="h-4 w-4" /> Vídeo
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.m4v"
                    multiple
                    onChange={handleVideoChange}
                    className="sr-only"
                  />
                </label>
                <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/20 sm:text-sm">
                  <ImageIcon className="h-4 w-4" /> Fotos
                  <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple onChange={handlePhotoSlidesChange} className="sr-only" />
                </label>
                </div>
              </div>
            )}
                {audioClips.map((clip) => <AudioClipPreview key={clip.id} clip={clip} time={currentTime} playing={isPlaying && !isRendering} duration={timelineDuration} scale={mixScale} />)}
                <audio
                  ref={audioRef}
                  src={audioUrl || undefined}
                  preload="metadata"
                  onLoadedMetadata={() => {
                    const nextDuration = audioRef.current?.duration || 0
                    setAudioDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
                    if (audioFile && Number.isFinite(nextDuration) && nextDuration > 0) updateMediaImport('audio-track', audioFile.name, 'ready')
                    syncBackgroundMusic(currentTime)
                    if (isPlaying) void playBackgroundMusic()
                  }}
                  onError={() => {
                    if (audioFile) updateMediaImport('audio-track', audioFile.name, 'error', 'Falha ao ler ou decodificar o áudio.')
                    setAudioMessage('Não foi possível reproduzir este áudio.')
                  }}
                  className="hidden"
                />
                <audio
                  ref={voicePlaybackRef}
                  src={voiceUrl || undefined}
                  preload="metadata"
                  onLoadedMetadata={() => {
                    syncVoiceTrack(currentTime)
                    if (isPlaying) syncPreviewAudioTracks(currentTime, true)
                  }}
                  className="hidden"
                />
            </div>
          </div>

          {hasEditorMedia && (
            <div aria-label="Controles da prévia" className="z-30 shrink-0 border-t border-white/10 bg-[#11131f] px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
                <button type="button" onClick={() => void togglePlayback()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'} aria-keyshortcuts="Space" title={isPlaying ? 'Pausar' : 'Reproduzir'}>
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                </button>
                <span className="shrink-0 font-mono text-[11px] font-bold text-white" aria-label="Tempo atual e duração">{formatEditorTime(currentTime)} <span className="text-zinc-500">/ {formatEditorTime(timelineDuration)}</span></span>
                <button type="button" onClick={() => toggleTrackMute('video')} aria-label={videoVolume > 0 ? 'Silenciar vídeo' : 'Ativar som do vídeo'} title={videoVolume > 0 ? 'Silenciar vídeo' : 'Ativar som do vídeo'} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-300 hover:bg-white/10">{videoVolume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
                <input type="range" min="0" max="1" step="0.05" value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} aria-label="Volume do vídeo" title="Volume do vídeo" className="hidden w-14 shrink-0 accent-sky-400 sm:block" />
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => openEditorPanel('add')} className="grid h-8 w-8 place-items-center rounded-lg text-sky-200 hover:bg-sky-400/15" aria-label="Adicionar mídia" title="Adicionar mídia"><Plus className="h-4 w-4" /></button>
                  <span title={selectedVideoCanSplit ? 'Dividir clipe no playhead' : splitUnavailableReason}><button type="button" onClick={splitSelectedVideo} disabled={!selectedVideoCanSplit} aria-description={selectedVideoCanSplit ? undefined : splitUnavailableReason} aria-keyshortcuts="S" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Dividir clipe no playhead"><Scissors className="h-4 w-4" /></button></span>
                  <button type="button" onClick={() => setTimelineExpanded((current) => !current)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-200 hover:bg-white/10" aria-label={timelineExpanded ? 'Recolher camadas' : 'Mostrar camadas'} title={timelineExpanded ? 'Recolher camadas' : 'Mostrar camadas'}><PanelBottomOpen className="h-4 w-4" /></button>
                  <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-400" title="Zoom da timeline"><span className="hidden sm:inline">Zoom</span><input type="range" min="0.5" max="3" step="0.25" value={timelineZoom} onChange={(event) => setTimelineZoom(Number(event.target.value))} aria-label="Zoom horizontal da timeline" className="w-14 accent-sky-400 sm:w-20" /></label>
                </div>
              </div>
              <input type="range" min="0" max={timelineDuration} step="0.05" value={currentTime} onChange={(event) => handleSeek(Number(event.target.value))} aria-label="Linha do tempo do video" title="Progresso do vídeo" className="mt-1 block h-4 w-full cursor-pointer accent-sky-400" />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-zinc-300" aria-label="Formato do projeto">
                <label className="flex items-center gap-1">Proporção
                  <select aria-label="Proporção do projeto" value={aspectPreset} onChange={(event) => changeAspectPreset(event.target.value as VideoAspectPreset)} disabled={isRendering} className="rounded-md border border-white/15 bg-zinc-900 px-2 py-1 text-white focus-visible:outline-2 focus-visible:outline-sky-300">
                    {VIDEO_ASPECT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
                <div role="group" aria-label="Enquadramento" className="flex overflow-hidden rounded-md border border-white/15">
                  {(['fit', 'fill'] as const).map((mode) => <button key={mode} type="button" onClick={() => setFrameMode(mode)} disabled={isRendering} aria-label={`Enquadramento ${mode === 'fit' ? 'Fit' : 'Fill'}`} aria-pressed={frameMode === mode} className={`px-2 py-1 focus-visible:outline-2 focus-visible:outline-sky-300 ${frameMode === mode ? 'bg-sky-300 text-sky-950' : 'bg-zinc-900 text-zinc-200 hover:bg-white/10'}`}>{mode === 'fit' ? 'Fit' : 'Fill'}</button>)}
                </div>
                <span aria-label="Resolução do projeto" className="font-mono text-zinc-400">{canvasSize.width} × {canvasSize.height}</span>
              </div>
            </div>
          )}
          {(isRendering || renderMessage) && (
            <div className="border-t border-blue-300/15 bg-blue-500/10 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-3 text-xs font-black text-blue-100">
                <span>{renderMessage || 'Renderizando...'}</span>
                <span>{renderProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-blue-300 transition-[width]"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              {compressionStats && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-black text-sky-50">
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
                    <span className="block text-zinc-500">Render</span>
                    <span>{formatFileSize(compressionStats.originalBytes)}</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
                    <span className="block text-zinc-500">Envio</span>
                    <span>{formatFileSize(compressionStats.optimizedBytes)}</span>
                  </div>
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2 py-2 text-emerald-100">
                    <span className="block text-emerald-100/60">{compressionStats.profile}</span>
                    <span>
                      {compressionStats.usedOptimizedFile
                        ? `-${getReductionPercent(compressionStats.originalBytes, compressionStats.optimizedBytes)}%`
                        : 'padrao'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {hasEditorMedia && !workspaceLayout.propertiesOpen && <button type="button" onClick={() => setWorkspaceLayout((current) => ({ ...current, propertiesOpen: true }))} aria-label="Abrir propriedades" title="Abrir propriedades" className="hidden w-7 shrink-0 items-start justify-center border-l border-white/10 bg-[#151622] pt-4 text-sky-200 hover:bg-sky-500/15 focus-visible:outline-2 focus-visible:outline-sky-300 xl:flex"><PanelRightOpen className="h-4 w-4" /></button>}
        {hasEditorMedia && workspaceLayout.propertiesOpen && <div role="separator" aria-label="Redimensionar propriedades" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={560} aria-valuenow={workspaceLayout.propertiesWidth} tabIndex={0} onPointerDown={(event) => beginWorkspaceResize('properties', event)} onPointerMove={moveWorkspaceDivider} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={(event) => resizeWorkspaceWithKeyboard('properties', event)} className="group relative hidden w-2 shrink-0 touch-none cursor-col-resize bg-[#11131f] focus-visible:outline-2 focus-visible:outline-sky-300 xl:block"><span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/10 transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-400" /></div>}
        {hasEditorMedia && (
        <aside
          aria-label="Propriedades contextuais"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={`fixed inset-x-0 ${isDownloadMode ? 'bottom-0' : 'bottom-16'} z-[90] flex shrink-0 flex-col overflow-hidden rounded-t-[1.5rem] border-t border-white/10 bg-[#151622]/95 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-xl xl:static xl:z-30 xl:min-w-[280px] xl:max-h-none xl:max-w-[560px] xl:w-[var(--panel-width)] xl:shrink xl:rounded-none xl:border-l xl:border-t-0 xl:bg-[#151622] xl:shadow-none xl:ring-0 ${workspaceLayout.propertiesOpen ? '' : 'xl:hidden'} ${!isToolSheetOpen || activePanel === 'text' ? 'max-h-[5.5rem] xl:max-h-none' : 'max-h-[55dvh] sm:max-h-[58dvh] xl:max-h-none'}`}
          style={{ '--panel-width': `${workspaceLayout.propertiesWidth}px` } as CSSProperties}
        >
          <div className="hidden shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 xl:flex">
            <h2 className="text-sm font-black">Propriedades</h2>
            <button type="button" onClick={() => setWorkspaceLayout((current) => ({ ...current, propertiesOpen: false }))} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10" aria-label="Recolher propriedades" title="Recolher propriedades"><PanelRightClose className="h-4 w-4" /></button>
          </div>
          <div className="hidden min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-xs xl:block">
            {activeVisualLayerId && <div className="space-y-2 rounded-lg border border-sky-300/20 bg-sky-500/5 p-2">
              <p className="font-bold text-sky-100">Ordem da camada · {activeVisualLayerIndex + 1} de {visualLayers.length}</p>
              <div className="grid grid-cols-2 gap-1">
                {(['front', 'back', 'top', 'bottom'] as const).map((direction) => <button key={direction} type="button" disabled={direction === 'front' || direction === 'top' ? activeVisualLayerIndex >= visualLayers.length - 1 : activeVisualLayerIndex <= 0} onClick={() => setVisualLayerOrder(moveVisualLayer(visualLayers, visualLayerOrder, activeVisualLayerId, direction))} aria-label={({ front: 'Trazer para frente', back: 'Enviar para trás', top: 'Trazer ao topo', bottom: 'Enviar ao fundo' })[direction]} className="rounded-md bg-white/10 px-2 py-1.5 text-left font-semibold disabled:opacity-35">{({ front: 'Frente', back: 'Trás', top: 'Topo', bottom: 'Fundo' })[direction]}</button>)}
              </div>
            </div>}
            {activeOverlay ? (
              <>
                <p className="font-bold text-sky-200">Texto selecionado</p>
                <input aria-label="Conteúdo do texto selecionado" value={activeOverlay.text} onChange={(event) => updateActiveOverlayText(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-white" />
                <label className="block font-semibold text-zinc-300">Tamanho do texto: {activeOverlay.fontSize}px<input type="range" min="18" max="120" value={activeOverlay.fontSize} onChange={(event) => updateActiveOverlayStyle('fontSize', Number(event.target.value))} aria-label="Tamanho do texto selecionado" className="mt-2 w-full accent-sky-400" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-zinc-300">Largura da caixa<input type="number" min="40" max={canvasSize.width} step="1" value={Math.round(activeOverlay.width || 80)} onChange={(event) => updateActiveOverlayBox('width', event.currentTarget.valueAsNumber)} aria-label="Largura da caixa de texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                  <label className="text-zinc-300">Altura da caixa<input type="number" min={Math.max(32, activeOverlay.fontSize + 24)} max={canvasSize.height} step="1" value={Math.round(activeOverlay.height || activeOverlay.fontSize + 24)} onChange={(event) => updateActiveOverlayBox('height', event.currentTarget.valueAsNumber)} aria-label="Altura da caixa de texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                </div>
                <label className="block font-semibold text-zinc-300">Ângulo do texto (°)
                  <input type="number" min="-180" max="180" step="1" value={Number((activeOverlay.rotation || 0).toFixed(1))} onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber
                    if (Number.isFinite(value)) setOverlays((current) => current.map((overlay) => overlay.id === activeOverlay.id ? { ...overlay, rotation: normalizeImageAngle(value) } : overlay))
                  }} aria-label="Ângulo do texto selecionado" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" />
                </label>
                <label className="block font-semibold text-zinc-300">Fonte
                  <select aria-label="Fonte do texto selecionado" value={editableFontKey} onChange={(event) => updateActiveOverlayStyle('fontKey', event.target.value as TextFontKey)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-white">
                    {TEXT_FONT_OPTIONS.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 font-semibold text-zinc-300">Cor <input type="color" aria-label="Cor do texto nas propriedades" value={editableTextColor} onChange={(event) => updateActiveOverlayStyle('color', event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                <div className="flex flex-wrap gap-1" aria-label="Alinhamento do texto">
                  {(['left', 'center', 'right'] as CanvasTextAlign[]).map((align) => <button key={align} type="button" aria-pressed={editableTextAlign === align} onClick={() => updateActiveOverlayStyle('textAlign', align)} className={`rounded-md px-2 py-1 ${editableTextAlign === align ? 'bg-sky-500 text-white' : 'bg-white/10 text-zinc-300'}`}>{align === 'left' ? 'Esquerda' : align === 'center' ? 'Centro' : 'Direita'}</button>)}
                </div>
                <div className="flex flex-wrap gap-1" aria-label="Fundo do texto">
                  {TEXT_BACKGROUND_PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => applyTextBackgroundPreset(preset)} aria-pressed={editableBackgroundEnabled === preset.enabled && (!preset.enabled || editableBackgroundColor.toLowerCase() === preset.color.toLowerCase())} className="rounded-md bg-white/10 px-2 py-1 text-zinc-200">{preset.label}</button>)}
                </div>
                {editableBackgroundEnabled && <label className="block text-zinc-300">Opacidade do fundo<input type="range" min="0.2" max="0.9" step="0.05" value={editableBackgroundOpacity} onChange={(event) => updateActiveOverlayStyle('backgroundOpacity', Number(event.target.value))} aria-label="Opacidade do fundo nas propriedades" className="mt-1 w-full accent-sky-400" /></label>}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-zinc-300">Posição X<input type="number" min="0" max={canvasSize.width} step="1" value={Math.round(activeOverlay.x)} onChange={(event) => updateActiveOverlayPosition('x', event.currentTarget.valueAsNumber)} aria-label="Posição X do texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                  <label className="text-zinc-300">Posição Y<input type="number" min="0" max={canvasSize.height} step="1" value={Math.round(activeOverlay.y)} onChange={(event) => updateActiveOverlayPosition('y', event.currentTarget.valueAsNumber)} aria-label="Posição Y do texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-zinc-300">Entrada (s)<input type="number" min="0" max={Math.max(activeOverlay.endTime - MIN_TIMELINE_ITEM_DURATION, 0)} step="0.1" value={Number(activeOverlay.startTime.toFixed(1))} onChange={(event) => updateActiveOverlayTiming('startTime', event.currentTarget.valueAsNumber)} aria-label="Entrada do texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                  <label className="text-zinc-300">Saída (s)<input type="number" min={activeOverlay.startTime + MIN_TIMELINE_ITEM_DURATION} max={timelineDuration} step="0.1" value={Number(activeOverlay.endTime.toFixed(1))} onChange={(event) => updateActiveOverlayTiming('endTime', event.currentTarget.valueAsNumber)} aria-label="Saída do texto" className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950 p-2 text-white" /></label>
                </div>
                <button type="button" onClick={removeActiveOverlay} className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 text-red-100"><Trash2 className="h-3 w-3" />Remover texto</button>
              </>
            ) : activeSticker ? (
              <>
                <p className="font-bold text-sky-200">Figurinha {stickerIsAnimated(activeSticker) ? 'animada' : 'estatica'} selecionada</p>
                <p className="text-zinc-400">{activeSticker.startTime.toFixed(1)}s – {activeSticker.endTime.toFixed(1)}s</p>
                <label className="block text-zinc-300">Tamanho<input aria-label="Tamanho da figurinha" type="range" min="24" max="300" value={activeSticker.size} onChange={(event) => updateActiveStickerStyle('size', Number(event.target.value))} className="mt-1 w-full accent-sky-400" /></label>
                <label className="block text-zinc-300">Rotacao<input aria-label="Rotacao da figurinha" type="range" min="-180" max="180" value={activeSticker.rotation} onChange={(event) => updateActiveStickerStyle('rotation', Number(event.target.value))} className="mt-1 w-full accent-sky-400" /></label>
                <label className="block text-zinc-300">Opacidade<input aria-label="Opacidade da figurinha nas propriedades" type="range" min="0.1" max="1" step="0.05" value={activeSticker.opacity ?? 1} onChange={(event) => updateActiveStickerStyle('opacity', Number(event.target.value))} className="mt-1 w-full accent-sky-400" /></label>
                <div className="grid grid-cols-2 gap-2"><label>Entrada (s)<input type="number" step="0.1" min="0" max={timelineDuration} value={Number(activeSticker.startTime.toFixed(1))} onChange={(event) => updateActiveStickerTiming('startTime', Number(event.target.value))} aria-label="Entrada da figurinha" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Saída (s)<input type="number" step="0.1" min="0" max={timelineDuration} value={Number(activeSticker.endTime.toFixed(1))} onChange={(event) => updateActiveStickerTiming('endTime', Number(event.target.value))} aria-label="Saída da figurinha" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div>
                <button type="button" onClick={removeActiveSticker} className="rounded bg-red-500/15 px-2 py-1 text-red-100">Remover figurinha</button>
              </>
            ) : activeVideoOverlay ? (
              <>
                <p className="font-bold text-sky-200">Vídeo sobreposto</p>
                <p className="truncate text-zinc-300">{activeVideoOverlay.name}</p>
                <p className="text-zinc-400">Áudio da camada silenciado · corte {activeVideoOverlay.trimStart.toFixed(1)}s–{activeVideoOverlay.trimEnd.toFixed(1)}s</p>
                <label className="block text-zinc-300">Largura<input type="range" min="20" max={canvasSize.width} value={activeVideoOverlay.width} onChange={(event) => {
                  const width = Number(event.target.value)
                  setVideoOverlays((current) => current.map((overlay) => overlay.id === activeVideoOverlay.id ? { ...overlay, width, height: width * overlay.height / overlay.width } : overlay))
                }} aria-label="Largura do vídeo sobreposto" className="mt-1 w-full accent-sky-400" /></label>
                <label className="block text-zinc-300">Rotação<input type="number" min="-180" max="180" value={activeVideoOverlay.rotation} onChange={(event) => {
                  const rotation = Number(event.target.value)
                  if (Number.isFinite(rotation)) setVideoOverlays((current) => current.map((overlay) => overlay.id === activeVideoOverlay.id ? { ...overlay, rotation: normalizeImageAngle(rotation) } : overlay))
                }} aria-label="Rotação do vídeo sobreposto" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label>
                <div className="grid grid-cols-2 gap-2"><label>Entrada (s)<input type="number" step="0.1" min="0" max={activeVideoOverlay.endTime - MIN_TIMELINE_ITEM_DURATION} value={Number(activeVideoOverlay.startTime.toFixed(1))} onChange={(event) => updateTimelineLayerTiming('video', activeVideoOverlay.id, Number(event.target.value), activeVideoOverlay.endTime)} aria-label="Entrada do vídeo sobreposto" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Saída (s)<input type="number" step="0.1" min={activeVideoOverlay.startTime + MIN_TIMELINE_ITEM_DURATION} max={timelineDuration} value={Number(activeVideoOverlay.endTime.toFixed(1))} onChange={(event) => updateTimelineLayerTiming('video', activeVideoOverlay.id, activeVideoOverlay.startTime, Number(event.target.value))} aria-label="Saída do vídeo sobreposto" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div>
                <button type="button" onClick={() => {
                  setVideoOverlays((current) => current.filter((overlay) => overlay.id !== activeVideoOverlay.id))
                  videoOverlayElementsRef.current.get(activeVideoOverlay.id)?.pause()
                  URL.revokeObjectURL(activeVideoOverlay.url)
                  setActiveVideoOverlayId(null)
                }} className="rounded bg-red-500/15 px-2 py-1 text-red-100">Remover vídeo sobreposto</button>
              </>
            ) : activeImageOverlay ? (
              <><p className="font-bold text-sky-200">Imagem selecionada</p><p className="truncate text-zinc-300">{activeImageOverlay.name}</p><label className="block text-zinc-300">Largura<input aria-label="Largura da imagem" type="range" min="20" max={canvasSize.width} value={activeImageOverlay.width} onChange={(event) => updateActiveImageSize(Number(event.target.value))} className="mt-1 w-full accent-sky-400" /></label><div className="grid grid-cols-2 gap-2"><label>Entrada (s)<input type="number" step="0.1" min="0" max={timelineDuration} value={Number(activeImageOverlay.startTime.toFixed(1))} onChange={(event) => updateActiveImageTiming('startTime', Number(event.target.value))} aria-label="Entrada da imagem" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Saída (s)<input type="number" step="0.1" min="0" max={timelineDuration} value={Number(activeImageOverlay.endTime.toFixed(1))} onChange={(event) => updateActiveImageTiming('endTime', Number(event.target.value))} aria-label="Saída da imagem" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div><button type="button" onClick={removeActiveImageOverlay} className="rounded bg-red-500/15 px-2 py-1 text-red-100">Remover imagem</button></>
            ) : activePanel === 'audio' && audioName ? (
              <><p className="font-bold text-sky-200">Música selecionada</p><p className="truncate text-zinc-300">{audioName}</p><label className="block text-zinc-300">Volume<input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} aria-label="Volume da música nas propriedades" className="mt-2 w-full accent-sky-400" /></label><div className="grid grid-cols-2 gap-2"><label>Início (s)<input type="number" min="0" max={timelineDuration} step="0.1" value={Number(musicStartTime.toFixed(1))} onChange={(event) => setMusicStartTime(clamp(Number(event.target.value), 0, timelineDuration))} aria-label="Início da música" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><label>Corte (s)<input type="number" min="0" max={audioDuration} step="0.1" value={Number(musicTrimStart.toFixed(1))} onChange={(event) => setMusicTrimStart(clamp(Number(event.target.value), 0, audioDuration))} aria-label="Início do trecho musical" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label></div><button type="button" onClick={removeAudioTrack} className="rounded bg-red-500/15 px-2 py-1 text-red-100">Remover música</button></>
            ) : activePanel === 'voice' && voiceUrl ? (
              <><p className="font-bold text-sky-200">Voz selecionada</p><label className="block text-zinc-300">Início (s)<input type="number" min="0" max={timelineDuration} step="0.1" value={Number(voiceStartTime.toFixed(1))} onChange={(event) => setVoiceStartTime(clamp(Number(event.target.value), 0, timelineDuration))} aria-label="Início da voz" className="mt-1 w-full rounded bg-zinc-950 p-2" /></label><button type="button" onClick={removeVoiceRecording} className="rounded bg-red-500/15 px-2 py-1 text-red-100">Remover voz</button></>
            ) : selectedClip ? (
              <>
                <p className="font-bold text-sky-200">{selectedClip.type === 'video' ? 'Vídeo selecionado' : 'Foto selecionada'}</p>
                <p className="break-words font-semibold text-white">{selectedClip.name}</p>
                <p className="text-zinc-400">Duração: {formatEditorTime(selectedClip.duration)}</p>
                {selectedClip.type === 'video' && <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-zinc-300">Início do corte<input aria-label="Início do corte" type="range" min="0" max={Math.max((selectedClip.trimEnd || selectedClip.sourceDuration || 1) - 0.5, 0)} step="0.1" value={selectedClip.trimStart || 0} onChange={(event) => updateSelectedVideoTrim('start', Number(event.target.value))} className="mt-1 w-full accent-sky-300" /><span>{(selectedClip.trimStart || 0).toFixed(1)}s</span></label>
                    <label className="text-zinc-300">Fim do corte<input aria-label="Fim do corte" type="range" min={Math.min((selectedClip.trimStart || 0) + 0.5, selectedClip.sourceDuration || 1)} max={selectedClip.sourceDuration || 1} step="0.1" value={selectedClip.trimEnd || 0} onChange={(event) => updateSelectedVideoTrim('end', Number(event.target.value))} className="mt-1 w-full accent-sky-300" /><span>{(selectedClip.trimEnd || 0).toFixed(1)}s</span></label>
                  </div>
                  <label className="block text-zinc-300">Volume<input type="range" min="0" max="1" step="0.05" value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} aria-label="Volume do clipe nas propriedades" className="mt-2 w-full accent-sky-400" /></label>
                </>}
                {selectedClip.type === 'image' && <div className="flex gap-1" aria-label="Duração da foto">{[2, 3, 5, 8].map((seconds) => <button key={seconds} type="button" onClick={() => updatePhotoSlideDuration(selectedClip.id, seconds)} className={`flex-1 rounded-md py-1 ${Math.abs(selectedClip.duration - seconds) < 0.1 ? 'bg-sky-500' : 'bg-white/10'}`}>{seconds}s</button>)}</div>}
                <div className="flex gap-1"><button type="button" aria-label="Mover clipe para esquerda" disabled={selectedClip.order === 0} onClick={() => setSequenceOrder(moveClip(timelineClips.map((clip) => clip.id), selectedClip.id, selectedClip.order - 1))} className="rounded-md bg-white/10 p-2 disabled:opacity-30"><ArrowLeft className="h-4 w-4" /></button><button type="button" aria-label="Mover clipe para direita" disabled={selectedClip.order === timelineClips.length - 1} onClick={() => setSequenceOrder(moveClip(timelineClips.map((clip) => clip.id), selectedClip.id, selectedClip.order + 1))} className="rounded-md bg-white/10 p-2 disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button><button type="button" aria-label="Remover clipe da timeline" onClick={removeSelectedClip} className="rounded-md bg-red-500/15 p-2 text-red-100" title="Remover clipe da timeline"><Trash2 className="h-4 w-4" /></button></div>
                {selectedPreviousClip && <button type="button" onClick={() => openEditorPanel('transitions')} className="rounded-md bg-sky-500/20 px-2 py-1 text-sky-100">Editar junção com {selectedPreviousClip.name}</button>}
              </>
            ) : <p className="text-zinc-400">Selecione um clipe ou elemento para ajustar suas propriedades.</p>}
          </div>
          <div className="xl:hidden"><EditorToolDock active={activeTool} onSelect={selectTool} /></div>
        </aside>
        )}
      </div>
          {hasEditorMedia && (
            <>
            {workspaceLayout.timelineOpen && <div role="separator" aria-label="Redimensionar timeline" aria-orientation="horizontal" aria-valuemin={120} aria-valuemax={700} aria-valuenow={workspaceLayout.timelineHeight} tabIndex={0} onPointerDown={(event) => beginWorkspaceResize('timeline', event)} onPointerMove={moveWorkspaceDivider} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={(event) => resizeWorkspaceWithKeyboard('timeline', event)} className="group relative z-30 h-4 shrink-0 touch-none cursor-row-resize bg-[#11131f] focus-visible:outline-2 focus-visible:outline-sky-300"><span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10 transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-400" /><span aria-hidden="true" className="absolute left-1/2 top-1/2 h-1.5 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/50 bg-sky-300/35 transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-400" /></div>}
            <div
              data-editor-timeline
              onDragOver={(event) => { if (libraryDragRef.current && !isRendering) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setLibraryDropActive(true) } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLibraryDropActive(false) }}
              onDrop={(event) => {
                if (!libraryDragRef.current || libraryDropHandledRef.current) return
                event.preventDefault(); event.stopPropagation(); libraryDropHandledRef.current = true
                const target = (event.target as HTMLElement).closest<HTMLElement>('[data-clip-id]')
                const id = libraryDragRef.current
                if (target?.dataset.clipId !== id) placeLibraryClip(id, target?.dataset.clipId)
                libraryDragRef.current = null; setLibraryDropActive(false)
              }}
              role="region"
              aria-label="Timeline do vídeo. Setas horizontais navegam no tempo e setas verticais selecionam camadas."
              tabIndex={0}
              className={`relative z-20 min-h-0 min-w-0 flex-col overflow-hidden border-t border-white/10 bg-[#11131e]/95 px-2 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-2 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-300 sm:px-3 xl:pb-2 ${workspaceLayout.timelineOpen ? 'flex' : 'hidden'} ${workspaceLayout.previewOpen ? 'shrink-0' : 'flex-1'}`}
              style={workspaceLayout.previewOpen ? { height: workspaceLayout.timelineCustomized ? `${workspaceLayout.timelineHeight}px` : 'min(240px, 32%)', maxHeight: 'calc(100% - min(340px, 55%) - 16px)' } : undefined}
            >
                <p role="status" className={`shrink-0 rounded px-2 py-1 text-[11px] ${libraryDropActive ? 'bg-sky-300 font-bold text-slate-950' : 'text-sky-100'}`}>{libraryDropActive ? 'Solte sobre um clipe para posicionar antes dele, ou no espaço livre para adicionar ao final.' : libraryDropMessage || 'Arraste da biblioteca: sobre um clipe insere antes; no espaço livre, ao final. Clipes já presentes são movidos.'}</p>
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#090b14] p-1.5 shadow-inner shadow-black">
                <div className="flex min-h-0 min-w-0 w-full flex-1 items-start gap-2 overflow-auto pb-1">
                   <div className="sticky left-0 z-10 grid w-[2.5rem] shrink-0 gap-1 bg-[#090b14] pr-1 text-[9px] font-black text-zinc-500 sm:w-16 sm:text-[10px]">
                    <span className="flex h-7 items-center justify-end text-[9px] text-zinc-500">Faixas</span>
                    {timelineTracks.filter((track) => track.visible).map((track) => (
                      <span
                        key={track.label}
                        className={`mt-1 flex items-center justify-end gap-1 rounded-lg pr-1 transition ${
                          track.active
                            ? 'bg-white/10 text-white ring-1 ring-sky-300/20'
                            : 'text-zinc-500'
                        }`}
                        style={{ height: `${track.height}px` }}
                        title={track.label}
                      >
                        <span className="inline-flex">{track.icon}</span>
                        <span className="hidden truncate sm:inline">{track.label}</span>
                      </span>
                    ))}
                  </div>

                  <div data-timeline-canvas onLostPointerCapture={handleTimelineLayerDragEnd} className="relative min-w-[20rem] shrink-0" style={{ width: `max(100%, ${timelineWidthPx}px)` }}>
                    <div
                      data-testid="timeline-playhead"
                      className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_18px_rgba(125,211,252,0.75)]"
                      style={{ left: `${currentTime * timelinePixelsPerSecond}px` }}
                    />
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="Régua temporal"
                      aria-valuemin={0}
                      aria-valuemax={timelineDuration}
                      aria-valuenow={currentTime}
                      aria-valuetext={formatEditorTime(currentTime)}
                      onPointerDown={startTimelineSeek}
                      onPointerMove={moveTimelineSeek}
                      onPointerUp={endTimelineSeek}
                      onPointerCancel={endTimelineSeek}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
                        event.preventDefault()
                        handleSeek(event.key === 'Home' ? 0 : event.key === 'End' ? timelineDuration : seekByKeyboard(currentTime, timelineDuration, event.key === 'ArrowRight' ? 1 : -1, event.shiftKey))
                      }}
                      className="sticky top-0 z-30 mb-1 h-7 touch-none cursor-ew-resize border-b border-white/10 bg-[#090b14] text-[10px] font-black text-zinc-400 focus-visible:outline-2 focus-visible:outline-sky-300"
                    >
                      <span aria-hidden="true" className="pointer-events-none absolute top-0 z-10 h-4 w-3 -translate-x-1/2 rounded-b bg-sky-200 shadow-[0_0_8px_rgba(125,211,252,0.7)]" style={{ left: `${currentTime * timelinePixelsPerSecond}px` }} />
                      {timelineTicks.map((second) => (
                        <span
                          key={second}
                          className="pointer-events-none absolute top-0 h-full -translate-x-px border-l border-white/20 pl-1 text-left"
                          style={{ left: `${getTimelineLeft(second)}px` }}
                        >
                          {formatTimelineTick(second)}
                        </span>
                      ))}
                    </div>

                    {subtitles.length > 0 && <div data-timeline-track data-testid="subtitle-track" className="relative mt-1 rounded-lg border border-violet-300/20 bg-violet-500/10" style={{ height: `${layerTrackHeight(subtitles.length)}px` }}>
                      {subtitles.map((segment, index) => <div key={segment.id} data-testid="subtitle-segment" role="button" tabIndex={0} aria-pressed={segment.id === activeSubtitleId} aria-label={`Legenda ${index + 1}: ${segment.text}`} onClick={() => { setActiveSubtitleId(segment.id); setActivePanel('caption'); handleSeek(segment.startTime) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveSubtitleId(segment.id); setActivePanel('caption'); handleSeek(segment.startTime) } }} onPointerDown={(event) => handleTimelineLayerDragStart(event, 'subtitle', segment.id, 'move', segment.startTime, segment.endTime)} onPointerMove={handleTimelineLayerDragMove} onPointerUp={handleTimelineLayerDragEnd} onPointerCancel={handleTimelineLayerDragEnd} className={`absolute flex h-7 touch-none items-center overflow-hidden rounded-md border px-4 text-[10px] font-bold ${segment.id === activeSubtitleId ? 'border-violet-200 bg-violet-500/60 text-white' : 'border-violet-300/30 bg-violet-600/35 text-violet-50'}`} style={{ left: `${getTimelineLeft(segment.startTime)}px`, top: `${index * 32 + 4}px`, width: `${getTimelineWidth(segment.startTime, segment.endTime, 7)}px` }}>
                        <button type="button" aria-label={`Ajustar início da legenda ${index + 1}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => handleTimelineLayerDragStart(event, 'subtitle', segment.id, 'trim-start', segment.startTime, segment.endTime)} onPointerMove={handleTimelineLayerDragMove} onPointerUp={handleTimelineLayerDragEnd} onPointerCancel={handleTimelineLayerDragEnd} className="absolute inset-y-0 left-0 w-3 cursor-ew-resize border-r border-white/40" />
                        <span className="truncate">{segment.text}</span>
                        <button type="button" aria-label={`Ajustar fim da legenda ${index + 1}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => handleTimelineLayerDragStart(event, 'subtitle', segment.id, 'trim-end', segment.startTime, segment.endTime)} onPointerMove={handleTimelineLayerDragMove} onPointerUp={handleTimelineLayerDragEnd} onPointerCancel={handleTimelineLayerDragEnd} className="absolute inset-y-0 right-0 w-3 cursor-ew-resize border-l border-white/40" />
                      </div>)}
                    </div>}
                    <div data-timeline-track className={`${overlays.length ? 'block' : 'hidden'} relative mt-1 rounded-lg border border-sky-300/15 bg-sky-500/10`} style={{ height: `${layerTrackHeight(overlays.length)}px` }}>
                      {editorMode === 'video' && overlays.length > 0 ? (
                        overlays.map((overlay, index) => (
                          <div
                            key={overlay.id}
                            data-testid="timeline-text-layer"
                            data-editor-layer-id={overlay.id}
                            role="button"
                            tabIndex={0}
                            aria-pressed={overlay.id === activeOverlayId}
                            onClick={() => selectOverlay(overlay)}
                            onKeyDown={(event) => {
                              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault()
                                selectOverlay(overlay)
                              }
                            }}
                            onPointerDown={(event) => handleTimelineLayerDragStart(event, 'text', overlay.id, 'move', overlay.startTime, overlay.endTime)}
                            onPointerMove={handleTimelineLayerDragMove}
                            onPointerUp={handleTimelineLayerDragEnd}
                            onPointerCancel={handleTimelineLayerDragEnd}
                            className={`absolute top-1 h-8 min-w-10 cursor-grab touch-none rounded-md px-3 text-left text-[10px] font-black transition active:cursor-grabbing sm:h-6 sm:min-w-8 sm:px-2 ${
                              overlay.id === activeOverlayId
                                ? 'bg-white text-black ring-2 ring-sky-300'
                                : 'bg-sky-300/75 text-sky-950 hover:bg-sky-200'
                            } ${timelineDragTarget?.startsWith(`text:${overlay.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-sky-500/25 ring-2 ring-sky-200' : ''} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200`}
                            style={{
                              left: `${getTimelineLeft(overlay.startTime)}px`,
                              top: `${index * 32 + 4}px`,
                              width: `${getTimelineWidth(overlay.startTime, overlay.endTime, 7)}px`,
                              zIndex: overlay.id === activeOverlayId ? 100 : visualLayers.findIndex((layer) => layer.id === overlay.id) + 1,
                            }}
                            aria-label={`Selecionar ${getOverlayLabel(overlay, index)}`}
                          >
                            <button
                              type="button"
                              aria-label={`Ajustar entrada de ${getOverlayLabel(overlay, index)}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'text', overlay.id, 'trim-start', overlay.startTime, overlay.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 left-0 z-20 flex w-10 -translate-x-3 cursor-ew-resize touch-none items-center justify-start rounded-l-md sm:w-4 sm:-translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-l-md border-r border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                            {getTimelineDragFeedback('text', overlay.id) && (
                              <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-200/30 bg-black/85 px-2 py-1 text-[10px] font-black text-sky-50 shadow-lg">
                                {getTimelineDragFeedback('text', overlay.id)}
                              </span>
                            )}
                            <span className="flex h-full items-center gap-1 truncate">
                              <Type className="h-3 w-3 shrink-0" />
                              <span className="truncate">{getOverlayLabel(overlay, index)}</span>
                            </span>
                            <span className="pointer-events-none absolute inset-x-4 bottom-0.5 h-0.5 rounded-full bg-sky-950/20" />
                            <button
                              type="button"
                              aria-label={`Ajustar saida de ${getOverlayLabel(overlay, index)}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'text', overlay.id, 'trim-end', overlay.startTime, overlay.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 right-0 z-20 flex w-10 translate-x-3 cursor-ew-resize touch-none items-center justify-end rounded-r-md sm:w-4 sm:translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-r-md border-l border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('text')}
                          className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-sky-300/20 bg-sky-500/10 px-2 text-[10px] font-black text-sky-100"
                        >
                          <Plus className="h-3 w-3" />
                          Texto
                        </button>
                      )}
                    </div>

                    {activeOverlay && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-sky-300/20 bg-sky-500/15 px-2 text-[10px] font-black text-sky-50 xl:hidden">
                        <span className="mr-1 shrink-0">Texto {activeOverlay.startTime.toFixed(1)}s-{activeOverlay.endTime.toFixed(1)}s</span>
                        <button
                          type="button"
                          onClick={() => nudgeActiveOverlayTiming('startTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveOverlayTiming('startTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada +
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveOverlayTiming('endTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveOverlayTiming('endTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida +
                        </button>
                        <button
                          type="button"
                          onClick={removeActiveOverlay}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Remover
                        </button>
                      </div>
                    )}

                    <div data-timeline-track className={`${timelineExpanded && stickers.length ? 'block' : 'hidden'} relative mt-1 rounded-lg border border-fuchsia-300/15 bg-fuchsia-500/10`} style={{ height: `${layerTrackHeight(stickers.length)}px` }}>
                      {editorMode === 'video' && stickers.length > 0 ? (
                        stickers.map((sticker, index) => (
                          <div
                            key={sticker.id}
                            data-editor-layer-id={sticker.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Selecionar figurinha ${sticker.value}`}
                            aria-pressed={sticker.id === activeStickerId}
                            onClick={() => selectSticker(sticker)}
                            onKeyDown={(event) => {
                              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault()
                                selectSticker(sticker)
                              }
                            }}
                            onPointerDown={(event) => handleTimelineLayerDragStart(event, 'sticker', sticker.id, 'move', sticker.startTime, sticker.endTime)}
                            onPointerMove={handleTimelineLayerDragMove}
                            onPointerUp={handleTimelineLayerDragEnd}
                            onPointerCancel={handleTimelineLayerDragEnd}
                            className={`absolute top-1 flex h-8 min-w-10 cursor-grab touch-none items-center gap-1 rounded-md px-3 text-left text-[10px] font-black transition active:cursor-grabbing sm:h-6 sm:min-w-8 sm:px-2 ${
                              sticker.id === activeStickerId
                                ? 'bg-white text-black ring-2 ring-fuchsia-300'
                                : 'bg-fuchsia-300/80 text-fuchsia-950 hover:bg-fuchsia-200'
                            } ${timelineDragTarget?.startsWith(`sticker:${sticker.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-fuchsia-500/25 ring-2 ring-fuchsia-200' : ''} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200`}
                            style={{
                              left: `${getTimelineLeft(sticker.startTime)}px`,
                              top: `${index * 32 + 4}px`,
                              width: `${getTimelineWidth(sticker.startTime, sticker.endTime, 7)}px`,
                              zIndex: sticker.id === activeStickerId ? 100 : visualLayers.findIndex((layer) => layer.id === sticker.id) + 1,
                            }}
                          >
                            <button
                              type="button"
                              aria-label="Ajustar entrada da figurinha"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'sticker', sticker.id, 'trim-start', sticker.startTime, sticker.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 left-0 z-20 flex w-10 -translate-x-3 cursor-ew-resize touch-none items-center justify-start rounded-l-md sm:w-4 sm:-translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-l-md border-r border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                            {getTimelineDragFeedback('sticker', sticker.id) && (
                              <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-fuchsia-200/30 bg-black/85 px-2 py-1 text-[10px] font-black text-fuchsia-50 shadow-lg">
                                {getTimelineDragFeedback('sticker', sticker.id)}
                              </span>
                            )}
                            <span className="text-sm leading-none">{sticker.value}</span>
                            <span className="truncate">Figurinha</span>
                            <span className="pointer-events-none absolute inset-x-4 bottom-0.5 h-0.5 rounded-full bg-fuchsia-950/20" />
                            <button
                              type="button"
                              aria-label="Ajustar saida da figurinha"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'sticker', sticker.id, 'trim-end', sticker.startTime, sticker.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 right-0 z-20 flex w-10 translate-x-3 cursor-ew-resize touch-none items-center justify-end rounded-r-md sm:w-4 sm:translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-r-md border-l border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('sticker')}
                          className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-fuchsia-300/20 bg-fuchsia-500/10 px-2 text-[10px] font-black text-fuchsia-100"
                        >
                          <Plus className="h-3 w-3" />
                          Adicionar figurinha
                        </button>
                      )}
                    </div>

                    {activeSticker && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/15 px-2 text-[10px] font-black text-fuchsia-50 xl:hidden">
                        <span className="mr-1 shrink-0">{activeSticker.value} {activeSticker.startTime.toFixed(1)}s-{activeSticker.endTime.toFixed(1)}s</span>
                        <button
                          type="button"
                          onClick={() => nudgeActiveStickerTiming('startTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveStickerTiming('startTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada +
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveStickerTiming('endTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveStickerTiming('endTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida +
                        </button>
                        <button
                          type="button"
                          onClick={removeActiveSticker}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Remover
                        </button>
                      </div>
                    )}

                    {videoOverlays.length > 0 && <div data-timeline-track aria-label="Faixa de vídeos sobrepostos" className={`${timelineExpanded ? 'block' : 'hidden'} relative mt-1 rounded-lg border border-sky-300/20 bg-sky-500/10`} style={{ height: `${layerTrackHeight(videoOverlays.length)}px` }}>
                      {videoOverlays.map((overlay, index) => <div
                        key={overlay.id}
                        data-editor-layer-id={overlay.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={overlay.id === activeVideoOverlayId}
                        aria-label={`Vídeo sobreposto ${overlay.name}`}
                        onClick={() => selectVideoOverlay(overlay)}
                        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectVideoOverlay(overlay) } }}
                        onPointerDown={(event) => handleTimelineLayerDragStart(event, 'video', overlay.id, 'move', overlay.startTime, overlay.endTime)}
                        onPointerMove={handleTimelineLayerDragMove}
                        onPointerUp={handleTimelineLayerDragEnd}
                        onPointerCancel={handleTimelineLayerDragEnd}
                        className={`absolute top-1 h-8 min-w-10 cursor-grab touch-none rounded-md px-3 text-left text-[10px] font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 sm:h-6 ${overlay.id === activeVideoOverlayId ? 'bg-white text-black ring-2 ring-sky-300' : 'bg-sky-300/80 text-sky-950'}`}
                        style={{ left: `${getTimelineLeft(overlay.startTime)}px`, top: `${index * 32 + 4}px`, width: `${getTimelineWidth(overlay.startTime, overlay.endTime, 8)}px`, zIndex: overlay.id === activeVideoOverlayId ? 100 : visualLayers.findIndex((layer) => layer.id === overlay.id) + 1 }}
                      >
                        <button type="button" aria-label={`Ajustar entrada do vídeo ${overlay.name}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => handleTimelineLayerDragStart(event, 'video', overlay.id, 'trim-start', overlay.startTime, overlay.endTime)} onPointerMove={handleTimelineLayerDragMove} onPointerUp={handleTimelineLayerDragEnd} onPointerCancel={handleTimelineLayerDragEnd} className="absolute inset-y-0 left-0 z-20 w-4 cursor-ew-resize touch-none rounded-l-md border-r border-white/60 bg-white/40" />
                        <span className="block truncate px-2">{overlay.name}</span>
                        <button type="button" aria-label={`Ajustar saída do vídeo ${overlay.name}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => handleTimelineLayerDragStart(event, 'video', overlay.id, 'trim-end', overlay.startTime, overlay.endTime)} onPointerMove={handleTimelineLayerDragMove} onPointerUp={handleTimelineLayerDragEnd} onPointerCancel={handleTimelineLayerDragEnd} className="absolute inset-y-0 right-0 z-20 w-4 cursor-ew-resize touch-none rounded-r-md border-l border-white/60 bg-white/40" />
                      </div>)}
                    </div>}
                    <div data-timeline-track className={`${timelineExpanded && imageOverlays.length ? 'block' : 'hidden'} relative mt-1 rounded-lg border border-amber-300/15 bg-amber-500/10`} style={{ height: `${layerTrackHeight(imageOverlays.length)}px` }}>
                      {editorMode === 'video' && imageOverlays.length > 0 ? (
                        imageOverlays.map((overlay, index) => (
                          <div
                            key={overlay.id}
                            data-testid="timeline-image-layer"
                            data-editor-layer-id={overlay.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Selecionar imagem ${overlay.name}`}
                            aria-pressed={overlay.id === activeImageId}
                            onClick={() => selectImageOverlay(overlay)}
                            onKeyDown={(event) => {
                              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault()
                                selectImageOverlay(overlay)
                              }
                            }}
                            onPointerDown={(event) => handleTimelineLayerDragStart(event, 'image', overlay.id, 'move', overlay.startTime, overlay.endTime)}
                            onPointerMove={handleTimelineLayerDragMove}
                            onPointerUp={handleTimelineLayerDragEnd}
                            onPointerCancel={handleTimelineLayerDragEnd}
                            className={`absolute top-1 h-8 min-w-10 cursor-grab touch-none rounded-md px-3 text-left text-[10px] font-black transition active:cursor-grabbing sm:h-6 sm:min-w-8 sm:px-2 ${
                              overlay.id === activeImageId
                                ? 'bg-white text-black ring-2 ring-amber-300'
                                : 'bg-amber-300/80 text-amber-950 hover:bg-amber-200'
                            } ${timelineDragTarget?.startsWith(`image:${overlay.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-amber-500/25 ring-2 ring-amber-200' : ''} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200`}
                            style={{
                              left: `${getTimelineLeft(overlay.startTime)}px`,
                              top: `${index * 32 + 4}px`,
                              width: `${getTimelineWidth(overlay.startTime, overlay.endTime, 8)}px`,
                              zIndex: overlay.id === activeImageId ? 100 : visualLayers.findIndex((layer) => layer.id === overlay.id) + 1,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Ajustar entrada de ${overlay.name}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'image', overlay.id, 'trim-start', overlay.startTime, overlay.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 left-0 z-20 flex w-10 -translate-x-3 cursor-ew-resize touch-none items-center justify-start rounded-l-md sm:w-4 sm:-translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-l-md border-r border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                            {getTimelineDragFeedback('image', overlay.id) && (
                              <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200/30 bg-black/85 px-2 py-1 text-[10px] font-black text-amber-50 shadow-lg">
                                {getTimelineDragFeedback('image', overlay.id)}
                              </span>
                            )}
                            <span className="flex h-full items-center gap-1 truncate">
                              <ImageIcon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{overlay.name}</span>
                            </span>
                            <span className="pointer-events-none absolute inset-x-4 bottom-0.5 h-0.5 rounded-full bg-amber-950/20" />
                            <button
                              type="button"
                              aria-label={`Ajustar saida de ${overlay.name}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleTimelineLayerDragStart(event, 'image', overlay.id, 'trim-end', overlay.startTime, overlay.endTime)}
                              onPointerMove={handleTimelineLayerDragMove}
                              onPointerUp={handleTimelineLayerDragEnd}
                              onPointerCancel={handleTimelineLayerDragEnd}
                              className="absolute inset-y-0 right-0 z-20 flex w-10 translate-x-3 cursor-ew-resize touch-none items-center justify-end rounded-r-md sm:w-4 sm:translate-x-1"
                            >
                              <span className="pointer-events-none h-full w-4 rounded-r-md border-l border-white/50 bg-white/45 shadow-sm sm:w-full" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <label className="absolute left-2 top-1 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-amber-300/20 bg-amber-500/10 px-2 text-[10px] font-black text-amber-100">
                          <Plus className="h-3 w-3" />
                          Adicionar imagem
                          <input
                            type="file"
                            accept="image/*,.png,.jpg,.jpeg,.webp"
                            onChange={handleImageChange}
                            className="sr-only"
                          />
                        </label>
                      )}
                    </div>

                    {activeImageOverlay && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-amber-300/20 bg-amber-500/15 px-2 text-[10px] font-black text-amber-50 xl:hidden">
                        <span className="mr-1 max-w-28 shrink-0 truncate">{activeImageOverlay.name}</span>
                        <span className="mr-1 shrink-0">{activeImageOverlay.startTime.toFixed(1)}s-{activeImageOverlay.endTime.toFixed(1)}s</span>
                        <button
                          type="button"
                          onClick={() => nudgeActiveImageTiming('startTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveImageTiming('startTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Entrada +
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveImageTiming('endTime', -0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeActiveImageTiming('endTime', 0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Saida +
                        </button>
                        <button
                          type="button"
                          onClick={removeActiveImageOverlay}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Remover
                        </button>
                      </div>
                    )}

                    <div data-timeline-track className="relative mt-1 h-14 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 sm:h-16">
                      {timelineClips.length > 0 ? (
                        <div className="relative h-full p-1">
                          {timelineClips.map((clip, index) => (
                            <TimelineClipCard
                              key={clip.id}
                              clip={clip}
                              index={index}
                              editorMode={editorMode}
                              pixelsPerSecond={timelinePixelsPerSecond}
                              active={clip.id === activeClipId}
                              dragging={clipDragTarget === clip.id}
                              onSelect={clickTimelineClip}
                              onDragStart={beginClipDrag}
                              onDragMove={moveClipDrag}
                              onDragEnd={endClipDrag}
                              onDragCancel={cancelClipDrag}
                              onTrimStart={beginClipTrim}
                              onTrimMove={moveClipTrim}
                              onTrimEnd={endClipTrim}
                              onTrimCancel={cancelClipTrim}
                              onTrimKey={keyClipTrim}
                            />
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            openEditorPanel('effects')
                          }}
                          className={`grid h-full w-full grid-cols-12 gap-1 p-1 text-left transition ${
                            activePanel === 'effects' ? 'ring-2 ring-sky-300/60' : ''
                          }`}
                        >
                          {timelineBlocks.map((item) => (
                            <span
                              key={item}
                              className="relative overflow-hidden rounded-md bg-zinc-800"
                              aria-label={`Trecho do video ${item + 1}`}
                            >
                              <video
                                src={videoUrl}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover opacity-60"
                              />
                              <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/30" />
                            </span>
                          ))}
                        </button>
                      )}
                    </div>

                    {selectedClip && (
                      <div className="mt-2 space-y-2 rounded-2xl border border-sky-300/20 bg-sky-500/5 p-2 text-xs text-white xl:hidden">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-bold">{selectedClip.name}</span>
                          <span className="rounded-lg bg-white/10 px-2 py-1 font-bold">{formatEditorTime(selectedClip.duration)}</span>
                          <button type="button" aria-label="Mover clipe para esquerda" disabled={selectedClip.order === 0} onClick={() => setSequenceOrder(moveClip(timelineClips.map((clip) => clip.id), selectedClip.id, selectedClip.order - 1))} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 disabled:opacity-30"><ArrowLeft className="h-4 w-4" /></button>
                          <button type="button" aria-label="Mover clipe para direita" disabled={selectedClip.order === timelineClips.length - 1} onClick={() => setSequenceOrder(moveClip(timelineClips.map((clip) => clip.id), selectedClip.id, selectedClip.order + 1))} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
                          {selectedClip.type === 'image' && <button type="button" aria-label="Remover foto" onClick={() => removePhotoSlide(selectedClip.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/20 text-red-200"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                        {selectedClip.type === 'image' ? (
                          <div className="flex items-center gap-2" aria-label="Duração da foto">
                            {[2, 3, 5, 8].map((seconds) => <button key={seconds} type="button" onClick={() => updatePhotoSlideDuration(selectedClip.id, seconds)} className={`h-9 flex-1 rounded-xl font-bold ${Math.abs(selectedClip.duration - seconds) < 0.1 ? 'bg-sky-300 text-zinc-950' : 'bg-white/10'}`}>{seconds}s</button>)}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block font-semibold">Início {formatEditorTime(selectedClip.trimStart || 0)}
                              <input aria-label="Início do corte" type="range" min="0" max={Math.max((selectedClip.trimEnd || selectedClip.sourceDuration || 1) - 0.5, 0)} step="0.1" value={selectedClip.trimStart || 0} onChange={(event) => updateSelectedVideoTrim('start', Number(event.target.value))} className="mt-1 w-full accent-sky-300" />
                            </label>
                            <label className="block font-semibold">Fim {formatEditorTime(selectedClip.trimEnd || 0)}
                              <input aria-label="Fim do corte" type="range" min={Math.min((selectedClip.trimStart || 0) + 0.5, selectedClip.sourceDuration || 1)} max={selectedClip.sourceDuration || 1} step="0.1" value={selectedClip.trimEnd || 0} onChange={(event) => updateSelectedVideoTrim('end', Number(event.target.value))} className="mt-1 w-full accent-sky-300" />
                            </label>
                          </div>
                        )}
                        {selectedPreviousClip && <button type="button" onClick={() => openEditorPanel('transitions')} className="min-h-9 rounded-lg bg-sky-300/20 px-3 py-1.5 text-[10px] font-bold text-sky-100">Junção: {selectedJunction ? selectedJunction.type === 'dissolve' ? 'Dissolver' : 'Pelo preto' : 'Corte'}</button>}
                      </div>
                    )}

                    <div className={`${timelineExpanded && voiceUrl ? 'block' : 'hidden'} relative mt-1 h-8 rounded-lg border border-violet-300/15 bg-violet-500/10`}>
                      {voiceUrl ? (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('voice')}
                          className={`absolute top-1 flex h-6 min-w-12 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[10px] font-black text-violet-950 ring-1 transition ${
                            activePanel === 'voice'
                              ? 'bg-white ring-2 ring-violet-300'
                              : 'bg-violet-300/85 ring-violet-200'
                          }`}
                          style={{
                            left: `${getTimelineLeft(voiceStartTime)}px`,
                            width: `${getTimelineWidth(voiceStartTime, voiceTimelineEnd, 10)}px`,
                          }}
                        >
                          <Mic className="h-3 w-3 shrink-0" />
                          <span className="truncate">Voz {formatEditorTime(voiceDuration)}</span>
                          <span className="pointer-events-none absolute inset-x-7 bottom-0.5 flex h-2 items-end gap-0.5 opacity-35">
                            {waveformBars.slice(0, 12).map((height, index) => (
                              <span
                                key={index}
                                className="w-0.5 rounded-full bg-violet-950"
                                style={{ height: `${height}%` }}
                              />
                            ))}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('voice')}
                          className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-violet-300/20 bg-violet-500/10 px-2 text-[10px] font-black text-violet-100"
                        >
                          <Mic className="h-3 w-3" />
                          Gravar voz
                        </button>
                      )}
                    </div>

                    {voiceUrl && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-violet-300/20 bg-violet-500/15 px-2 text-[10px] font-black text-violet-50 xl:hidden">
                        <span className="mr-1 shrink-0">Voz {formatEditorTime(voiceStartTime)}</span>
                        <button
                          type="button"
                          onClick={() => nudgeVoiceStart(-0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Inicio -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeVoiceStart(0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Inicio +
                        </button>
                        <button
                          type="button"
                          onClick={removeVoiceRecording}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Refazer
                        </button>
                      </div>
                    )}

                    {audioClips.map((clip) => <div key={clip.id} className="relative mt-1 h-8 rounded-lg border border-emerald-300/20 bg-emerald-500/10">
                      <button type="button" data-testid="timeline-audio-clip" data-audio-id={clip.id} data-editor-layer-id={clip.id} aria-label={`Selecionar áudio ${clip.media.name}`} aria-pressed={activeAudioClipId === clip.id}
                        disabled={isRendering} onClick={() => selectAdditionalAudio(clip.id)}
                        onPointerDown={(event) => { if (isRendering) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); audioClipDragRef.current = { id: clip.id, x: event.clientX, start: clip.startTime, secondsPerPixel: 1 / timelinePixelsPerSecond }; selectAdditionalAudio(clip.id) }}
                        onPointerMove={(event) => { const drag = audioClipDragRef.current; if (!drag || drag.id !== clip.id) return; const startTime = Math.round(clamp(drag.start + (event.clientX - drag.x) * drag.secondsPerPixel, 0, Math.max(0, timelineDuration - 0.05)) * 100) / 100; setAudioClips((current) => current.map((item) => item.id === clip.id ? { ...item, startTime } : item)) }}
                        onPointerUp={() => { audioClipDragRef.current = null }} onPointerCancel={() => { audioClipDragRef.current = null }} onLostPointerCapture={() => { audioClipDragRef.current = null }}
                        className={`absolute top-1 h-6 touch-none overflow-hidden rounded px-2 text-left text-[10px] font-bold ${activeAudioClipId === clip.id ? 'bg-white text-black' : 'bg-emerald-300 text-emerald-950'}`}
                        style={{ left: `${getTimelineLeft(clip.startTime)}px`, width: `${getTimelineWidth(clip.startTime, Math.min(timelineDuration, clip.startTime + clip.trimEnd - clip.trimStart), 10)}px` }}>
                        {clip.muted ? '🔇' : '♪'} {clip.media.name}
                      </button>
                    </div>)}
                    <div className={`${audioName ? 'block' : 'hidden'} relative mt-1 h-8 rounded-lg border border-emerald-300/15 bg-emerald-500/10`}>
                      {audioName ? (
                        <button
                          type="button"
                          data-testid="timeline-music-clip"
                          onClick={() => openEditorPanel('audio')}
                          className={`absolute top-1 flex h-6 min-w-14 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[10px] font-black text-emerald-950 ring-1 transition ${
                            activePanel === 'audio'
                              ? 'bg-white ring-2 ring-emerald-300'
                              : 'bg-emerald-300/85 ring-emerald-100'
                          }`}
                          style={{
                            left: `${getTimelineLeft(musicStartTime)}px`,
                            width: `${getTimelineWidth(musicStartTime, musicTimelineEnd, 10)}px`,
                          }}
                        >
                          <Music className="h-3 w-3 shrink-0" />
                          <span className="truncate">{audioName}</span>
                          <span className="ml-auto shrink-0 text-[9px] opacity-70">
                            {audioDuration > 0 ? `+${formatEditorTime(musicTrimStart)}` : formatEditorTime(timelineDuration)}
                          </span>
                          <span className="pointer-events-none absolute inset-x-8 bottom-0.5 flex h-2 items-end gap-0.5 opacity-35">
                            {waveformBars.map((height, index) => (
                              <span
                                key={index}
                                className="w-0.5 rounded-full bg-emerald-950"
                                style={{ height: `${height}%` }}
                              />
                            ))}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('audio')}
                          className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-emerald-300/20 bg-emerald-500/10 px-2 text-[10px] font-black text-emerald-100"
                        >
                          <Plus className="h-3 w-3" />
                          Adicionar musica
                        </button>
                      )}
                    </div>

                    {audioName && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-emerald-300/20 bg-emerald-500/15 px-2 text-[10px] font-black text-emerald-50 xl:hidden">
                        <span className="mr-1 max-w-24 shrink-0 truncate">{audioName}</span>
                        <button
                          type="button"
                          onClick={() => nudgeMusicStart(-0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Inicio -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeMusicStart(0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Inicio +
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeMusicTrim(-0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Trecho -
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeMusicTrim(0.25)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Trecho +
                        </button>
                        <button
                          type="button"
                          onClick={removeAudioTrack}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Remover
                        </button>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            </div>
            </>
          )}


        {isPublishStepOpen && hasEditorMedia && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:items-center sm:pb-4">
            <button
              type="button"
              onClick={() => {
                if (!isRendering) setIsPublishStepOpen(false)
              }}
              className="absolute inset-0 cursor-default"
              aria-label="Fechar etapa de publicacao"
            />

            <div className="relative z-[121] flex max-h-[calc(100dvh-6rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-950 text-white shadow-2xl shadow-black/50 ring-1 ring-sky-300/15 sm:max-h-[88dvh]">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-base font-black">{isDownloadMode ? 'Exportar MP4' : 'Publicar video'}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    {isDownloadMode ? 'Qualidade e download final' : 'Legenda, qualidade e confirmacao final'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublishStepOpen(false)}
                  disabled={isRendering}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                  aria-label="Voltar para edicao"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!isDownloadMode && (
                <label className="block">
                  <span className="text-xs font-black text-zinc-300">Descricao do post</span>
                  <textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    rows={5}
                    placeholder="Escreva uma legenda para o feed..."
                    className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-sky-300"
                  />
                </label>
                )}

                <div className={`${isDownloadMode ? '' : 'mt-4'} rounded-2xl border border-white/10 bg-black/30 p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-200">Qualidade do video</span>
                    {sourceMediaBytes > 0 && (
                      <span className="text-[11px] font-semibold text-zinc-500">
                        Original {formatFileSize(sourceMediaBytes)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1">
                    {compressionOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setCompressionPreset(option.id)}
                        disabled={isRendering}
                        className={`rounded-lg px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          compressionPreset === option.id
                            ? 'bg-sky-500 text-white'
                            : 'text-zinc-500 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="block truncate text-[11px] font-black">{option.label}</span>
                        <span className="mt-0.5 block truncate text-[9px] font-semibold opacity-70">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-black text-zinc-300">
                  <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-3">
                    <span className="block text-zinc-500">Duracao</span>
                    <span>{formatEditorTime(timelineDuration)}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-3">
                    <span className="block text-zinc-500">Camadas</span>
                    <span>{overlays.length + stickers.length + imageOverlays.length}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-3">
                    <span className="block text-zinc-500">Audio</span>
                    <span>{audioName || voiceUrl ? 'Sim' : 'Nao'}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-white/10 bg-zinc-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={renderFinalVideo}
                  disabled={!canPublish || isRendering}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {publishButtonLabel}
                </button>
                {isRendering && renderStage !== 'uploading' && renderStage !== 'done' && (
                  <button
                    type="button"
                    onClick={cancelExport}
                    className="mt-2 w-full rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-zinc-300 transition hover:border-white/40 hover:text-white"
                  >
                    Cancelar exportação
                  </button>
                )}
                {isDownloadMode && (
                  <p className="mt-2 text-center text-[11px] font-semibold leading-5 text-zinc-500">
                    O arquivo sera baixado no seu navegador. Nenhum post sera criado no feed.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
