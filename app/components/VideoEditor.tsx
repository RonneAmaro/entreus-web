'use client'

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import {
  ArrowLeft,
  Captions,
  Check,
  ImageIcon,
  Loader2,
  Mic,
  Move,
  Music,
  Play,
  Plus,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type VideoFilter = 'normal' | 'mono' | 'sepia' | 'warm'

type TextOverlay = {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  fontKey?: TextFontKey
  fontWeight?: number
  backgroundEnabled?: boolean
  backgroundColor?: string
  backgroundOpacity?: number
  backgroundRadius?: number
  textAlign?: CanvasTextAlign
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

type StickerOverlay = {
  id: string
  value: string
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

type EditorMode = 'video' | 'photos'
type EditorPanel = 'add' | 'text' | 'sticker' | 'image' | 'audio' | 'effects' | 'caption' | 'voice'
type DraggingLayer = { type: 'text' | 'sticker' | 'image'; id: string } | null
type TimelineEditableLayer = 'text' | 'sticker' | 'image'
type TimelineDragMode = 'move' | 'trim-start' | 'trim-end'
type TimelineDragState = {
  type: TimelineEditableLayer
  id: string
  mode: TimelineDragMode
  pointerId: number
  trackLeft: number
  trackWidth: number
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
type TextFontKey = 'system' | 'strong' | 'elegant' | 'condensed' | 'casual' | 'mono' | 'classic' | 'rounded'

type PhotoSlide = {
  id: string
  file: File
  previewUrl: string
  duration: number
  order: number
}

type TimelineClip = {
  id: string
  type: 'video' | 'image'
  name: string
  duration: number
  startTime: number
  endTime: number
  order: number
  previewUrl?: string
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
  overlay: ImageOverlay
  inputIndex: number
}

const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 42
const DEFAULT_TEXT_FONT_KEY: TextFontKey = 'system'
const DEFAULT_TEXT_BACKGROUND_COLOR = '#000000'
const DEFAULT_TEXT_BACKGROUND_OPACITY = 0.55
const DEFAULT_VIDEO_DURATION = 10
const MIN_TIMELINE_ITEM_DURATION = 0.5
const TIMELINE_DRAG_SNAP_SECONDS = 0.25
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`
const HEAVY_VIDEO_SIZE_BYTES = 30 * 1024 * 1024
const MAX_IMAGE_OVERLAY_SIZE_BYTES = 5 * 1024 * 1024
const MAX_PHOTO_SLIDE_SIZE_BYTES = 8 * 1024 * 1024
const MAX_PHOTO_SLIDES = 10
const DEFAULT_PHOTO_DURATION = 3
const PHOTO_VIDEO_WIDTH = 720
const PHOTO_VIDEO_HEIGHT = 1280
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const RENDERABLE_IMAGE_TYPES = ['image/png', 'image/jpeg']
const LAYER_ORDER = {
  video: 10,
  image: 20,
  sticker: 30,
  text: 40,
}
const STICKER_LIBRARY = ['⭐', '🔥', '❤️', '😂', '👏', '🎉', '💎', '🪙', '🏆', '✅', '⚠️', '➡️', '✨', '🚀', '👑']
const SHAPE_STICKERS = ['⬆️', '⬇️', '⬅️', '➡️', '⭕', '🔵', '🟣', '🔶']
const ENTREUS_STICKERS = ['🪙', '💎', '🏆', '✅']

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
    label: 'Normal',
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
    label: 'Warm',
    className: 'brightness-110 contrast-110 saturate-150',
    swatchClassName: 'bg-gradient-to-br from-orange-300 via-rose-500 to-purple-950',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function getVisualFilter(value: VideoFilter) {
  if (value === 'mono') return 'format=gray'
  if (value === 'sepia') {
    return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'
  }
  if (value === 'warm') return 'eq=brightness=0.04:contrast=1.08:saturation=1.35'
  return 'null'
}

function formatEditorTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'

  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voicePlaybackRef = useRef<HTMLAudioElement | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<BlobPart[]>([])
  const voiceStartedAtRef = useRef(0)
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timelineScrubRef = useRef<HTMLDivElement | null>(null)
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const pointerMovedRef = useRef(false)
  const pointerStartedOnOverlayRef = useRef(false)
  const draggingLayerRef = useRef<DraggingLayer>(null)
  const timelineDragRef = useRef<TimelineDragState | null>(null)
  const renderStageRef = useRef('idle')
  const renderLockRef = useRef(false)

  const [editorMode, setEditorMode] = useState<EditorMode>('video')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [baseVideoDuration, setBaseVideoDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceUrl, setVoiceUrl] = useState('')
  const [voiceDuration, setVoiceDuration] = useState(0)
  const [voiceStartTime, setVoiceStartTime] = useState(0)
  const [voiceVolume, setVoiceVolume] = useState(1)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1280, height: 720 })
  const [textValue, setTextValue] = useState('')
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR)
  const [overlays, setOverlays] = useState<TextOverlay[]>([])
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null)
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [stickers, setStickers] = useState<StickerOverlay[]>([])
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [currentTime, setCurrentTime] = useState(0)
  const currentTimeRef = useRef(0)
  const [filter, setFilter] = useState<VideoFilter>('normal')
  const [videoVolume, setVideoVolume] = useState(1)
  const [musicVolume, setMusicVolume] = useState(0.45)
  const [musicStartTime, setMusicStartTime] = useState(0)
  const [musicTrimStart, setMusicTrimStart] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioMessage, setAudioMessage] = useState('')
  const [musicVolumeTouched, setMusicVolumeTouched] = useState(false)
  const [caption, setCaption] = useState('')
  const [activePanel, setActivePanel] = useState<EditorPanel>('text')
  const [isReady, setIsReady] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderMessage, setRenderMessage] = useState('')
  const [compressionPreset, setCompressionPreset] = useState<CompressionPreset>('auto')
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null)
  const [isPublishStepOpen, setIsPublishStepOpen] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [timelineDragTarget, setTimelineDragTarget] = useState<string | null>(null)
  const [timelineDragPreview, setTimelineDragPreview] = useState<TimelineDragPreview>(null)
  const [imageMessage, setImageMessage] = useState('')
  const [photoSlides, setPhotoSlides] = useState<PhotoSlide[]>([])
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [photoTransition, setPhotoTransition] = useState<PhotoTransition>('fade')
  const [photoMessage, setPhotoMessage] = useState('')

  function setRenderStage(stage: string, message?: string) {
    renderStageRef.current = stage
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
    draggingLayerRef.current = null
    pointerMovedRef.current = false
    pointerStartedOnOverlayRef.current = false
  }

  function openEditorPanel(panel: EditorPanel, keepVisualSelection = false) {
    if (panel === 'text' && hasEditorMedia && !activeOverlayId) {
      addTextOverlay()
      return
    }

    if (!keepVisualSelection) {
      clearVisualSelection()
    }

    setActivePanel(panel)
  }

  function getDefaultLayerTiming() {
    const projectDuration = editorMode === 'photos' ? getPhotoSlidesDuration() : duration
    const safeDuration = Math.max(projectDuration, DEFAULT_VIDEO_DURATION)

    return { startTime: 0, endTime: safeDuration }
  }

  function getBaseClipOffset() {
    return editorMode === 'video' && videoFile ? baseVideoDuration : 0
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
    if (videoRef.current) videoRef.current.volume = videoVolume
  }, [videoVolume, videoUrl])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume
  }, [musicVolume, audioUrl])

  useEffect(() => {
    if (voicePlaybackRef.current) voicePlaybackRef.current.volume = voiceVolume
  }, [voiceVolume, voiceUrl])

  useEffect(() => {
    if (!voiceBlob || !audioFile || musicVolumeTouched) return

    setMusicVolume(0.45)
    setAudioMessage('Ajuste o volume para a narracao ficar clara.')
  }, [audioFile, musicVolumeTouched, voiceBlob])

  useEffect(() => {
    drawCanvas()
  }, [canvasSize, overlays, imageOverlays, stickers, activeOverlayId, activeImageId, activeStickerId, currentTime])

  useEffect(() => {
    imageOverlays.forEach((overlay) => {
      if (imageElementsRef.current.has(overlay.id)) return

      const image = new Image()
      image.onload = drawCanvas
      image.onerror = () => {
        URL.revokeObjectURL(overlay.url)
        imageElementsRef.current.delete(overlay.id)
        setImageOverlays((current) => current.filter((item) => item.id !== overlay.id))
        if (activeImageId === overlay.id) setActiveImageId(null)
        setImageMessage('Nao foi possivel carregar esta imagem. Use PNG ou JPG para garantir imagem no video final.')
      }
      image.src = overlay.url
      imageElementsRef.current.set(overlay.id, image)
    })

    Array.from(imageElementsRef.current.keys()).forEach((id) => {
      if (!imageOverlays.some((overlay) => overlay.id === id)) {
        imageElementsRef.current.delete(id)
      }
    })
  }, [imageOverlays])

  useEffect(() => {
    if (activeOverlayId && !overlays.some((overlay) => overlay.id === activeOverlayId)) {
      setActiveOverlayId(null)
    }
  }, [activeOverlayId, overlays])

  useEffect(() => {
    if (activeStickerId && !stickers.some((sticker) => sticker.id === activeStickerId)) {
      setActiveStickerId(null)
    }
  }, [activeStickerId, stickers])

  useEffect(() => {
    if (activeImageId && !imageOverlays.some((overlay) => overlay.id === activeImageId)) {
      setActiveImageId(null)
    }
  }, [activeImageId, imageOverlays])

  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  useEffect(() => {
    if (!isPlaying) return

    let animationFrame = 0

    function syncTime() {
      const video = videoRef.current

      if (video && currentTimeRef.current < baseVideoDuration) {
        setCurrentTime(video.currentTime)
        syncPreviewAudioTracks(video.currentTime, true)
      }

      animationFrame = window.requestAnimationFrame(syncTime)
    }

    animationFrame = window.requestAnimationFrame(syncTime)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [
    audioUrl,
    isPlaying,
    musicStartTime,
    musicVolume,
    baseVideoDuration,
    voiceDuration,
    voiceStartTime,
    voiceUrl,
    voiceVolume,
  ])

  useEffect(() => {
    if (!isPlaying || editorMode !== 'video' || photoSlides.length === 0 || currentTime < baseVideoDuration) return

    const startedAt = performance.now()
    const startedFrom = currentTime
    const timer = window.setInterval(() => {
      const nextTime = clamp(startedFrom + (performance.now() - startedAt) / 1000, baseVideoDuration, duration)
      setCurrentTime(nextTime)
      syncPreviewAudioTracks(nextTime, true)

      if (nextTime >= duration) {
        window.clearInterval(timer)
        setIsPlaying(false)
        pauseBackgroundMusic()
        syncPreviewAudioTracks(duration, false)
      }
    }, 80)

    return () => window.clearInterval(timer)
  }, [baseVideoDuration, currentTime, duration, editorMode, isPlaying, photoSlides.length])

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    imageElementsRef.current.clear()

    setEditorMode('video')
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setVideoName(file.name)
    setBaseVideoDuration(DEFAULT_VIDEO_DURATION)
    setOverlays([])
    setActiveOverlayId(null)
    setStickers([])
    setActiveStickerId(null)
    setImageOverlays([])
    setActiveImageId(null)
    photoSlides.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
    setPhotoSlides([])
    setActivePhotoId(null)
    setImageMessage('')
    setPhotoMessage('')
    setCompressionStats(null)
    setRenderMessage('')
    setIsPlaying(false)
    setCurrentTime(0)
    syncPreviewAudioTracks(0, false)
    setActivePanel('text')
  }

  function handlePhotoSlidesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setPhotoMessage('')

    const availableSlots = Math.max(MAX_PHOTO_SLIDES - photoSlides.length, 0)
    if (availableSlots <= 0) {
      setPhotoMessage(`Use no maximo ${MAX_PHOTO_SLIDES} fotos neste modo.`)
      event.target.value = ''
      return
    }

    const acceptedSlides: PhotoSlide[] = []

    for (const file of files.slice(0, availableSlots)) {
      if (!RENDERABLE_IMAGE_TYPES.includes(file.type)) {
        setPhotoMessage('Fotos em video aceitam PNG ou JPG neste MVP.')
        continue
      }

      if (file.size > MAX_PHOTO_SLIDE_SIZE_BYTES) {
        setPhotoMessage('Cada foto precisa ter ate 8 MB.')
        continue
      }

      acceptedSlides.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        duration: DEFAULT_PHOTO_DURATION,
        order: photoSlides.length + acceptedSlides.length,
      })
    }

    if (files.length > availableSlots) {
      setPhotoMessage(`Foram adicionadas ${availableSlots} fotos. O limite inicial e ${MAX_PHOTO_SLIDES}.`)
    }

    if (acceptedSlides.length > 0) {
      if (videoRef.current) videoRef.current.pause()
      setIsPlaying(false)
      const hasBaseVideo = editorMode === 'video' && Boolean(videoFile)

      if (!hasBaseVideo) {
        setEditorMode('photos')
        setVideoFile(null)
        if (videoUrl) URL.revokeObjectURL(videoUrl)
        setVideoUrl('')
        setVideoName('')
        setBaseVideoDuration(0)
        setOverlays([])
        setActiveOverlayId(null)
        setStickers([])
        setActiveStickerId(null)
        setImageOverlays((current) => {
          current.forEach((overlay) => URL.revokeObjectURL(overlay.url))
          return []
        })
        imageElementsRef.current.clear()
        setActiveImageId(null)
        setCanvasSize({ width: PHOTO_VIDEO_WIDTH, height: PHOTO_VIDEO_HEIGHT })
        setCurrentTime(0)
      } else {
        setPhotoMessage('Foto adicionada como clipe da sequencia.')
      }

      setPhotoSlides((current) => {
        const nextSlides = [...current, ...acceptedSlides]
        setDuration(hasBaseVideo ? getTimelineTotalDuration(nextSlides) : getPhotoSlidesDuration(nextSlides))
        return nextSlides
      })
      setActivePhotoId((current) => current || acceptedSlides[0]?.id || null)
    }

    event.target.value = ''
  }

  function handleAudioChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    audioRef.current?.pause()
    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setAudioName(file.name)
    setAudioDuration(0)
    setMusicStartTime(0)
    setMusicTrimStart(0)
    setAudioMessage('Musica adicionada')
    event.target.value = ''
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImageMessage('')

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setImageMessage('Use uma imagem PNG, JPG ou WebP.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_IMAGE_OVERLAY_SIZE_BYTES) {
      setImageMessage('Use uma imagem menor que 5 MB.')
      event.target.value = ''
      return
    }

    const imageUrl = URL.createObjectURL(file)
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

    const image = new Image()
    image.onload = () => {
      const aspectRatio = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1

      setImageOverlays((current) =>
        current.map((item) =>
          item.id === overlay.id
            ? {
                ...item,
                height: item.width / aspectRatio,
                y: clamp((canvasSize.height - item.width / aspectRatio) / 2, 0, canvasSize.height),
              }
            : item
        )
      )
      drawCanvas()
    }
    image.onerror = () => {
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
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActivePanel('image')
    event.target.value = ''
  }

  function removeAudioTrack() {
    const audio = audioRef.current

    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioFile(null)
    setAudioUrl('')
    setAudioName('')
    setAudioDuration(0)
    setMusicStartTime(0)
    setMusicTrimStart(0)
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
    audio.volume = musicVolume
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

  function clearEditorAfterPublish() {
    videoRef.current?.pause()
    audioRef.current?.pause()
    voicePlaybackRef.current?.pause()
    voicePreviewRef.current?.pause()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    photoSlides.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
    imageElementsRef.current.clear()

    setEditorMode('video')
    setVideoFile(null)
    setVideoUrl('')
    setVideoName('')
    setAudioFile(null)
    setAudioUrl('')
    setAudioName('')
    setVoiceBlob(null)
    setVoiceUrl('')
    setVoiceDuration(0)
    setVoiceStartTime(0)
    setVoiceVolume(1)
    setVoiceMessage('')
    setMusicStartTime(0)
    setMusicTrimStart(0)
    setAudioDuration(0)
    setOverlays([])
    setActiveOverlayId(null)
    setImageOverlays([])
    setActiveImageId(null)
    setPhotoSlides([])
    setActivePhotoId(null)
    setPhotoTransition('fade')
    setPhotoMessage('')
    setImageMessage('')
    setCaption('')
    setTextValue('')
    setCompressionStats(null)
    setIsPublishStepOpen(false)
    setRenderProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setActivePanel('text')
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return

    const nextBaseDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : DEFAULT_VIDEO_DURATION
    setCanvasSize({
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    })
    setBaseVideoDuration(nextBaseDuration)
    setDuration(nextBaseDuration + getPhotoSlidesDuration())
    setCurrentTime(video.currentTime || 0)
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return

    setCurrentTime(video.currentTime)
  }

  function handleSeek(value: number) {
    const video = videoRef.current
    const seekDuration = editorMode === 'photos' ? getPhotoSlidesDuration() : duration
    const nextTime = clamp(value, 0, seekDuration)

    if (video) {
      if (editorMode === 'video' && photoSlides.length > 0 && nextTime >= baseVideoDuration) {
        video.pause()
        video.currentTime = Math.max(baseVideoDuration - 0.05, 0)
      } else {
        video.currentTime = nextTime
      }
    }
    syncPreviewAudioTracks(nextTime, isPlaying)
    setCurrentTime(nextTime)
  }

  function seekFromTimelinePointer(event: PointerEvent<HTMLDivElement>) {
    if (timelineDuration <= 0) return

    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
    handleSeek(ratio * timelineDuration)
  }

  function handleTimelineScrubStart(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    if (isPlaying) {
      videoRef.current?.pause()
      pauseBackgroundMusic()
      setIsPlaying(false)
    }

    seekFromTimelinePointer(event)
  }

  function handleTimelineScrubMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.stopPropagation()
    seekFromTimelinePointer(event)
  }

  function handleTimelineScrubEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
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

    if (targetTime < musicStartTime) return musicTrimStart

    return (musicTrimStart + targetTime - musicStartTime) % audioDuration
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
      if (targetTime < musicStartTime) {
        if (!audio.paused) audio.pause()
        audio.currentTime = 0
      } else {
        const expectedAudioTime = getSyncedAudioTime(targetTime)
        if (Math.abs(audio.currentTime - expectedAudioTime) > 0.35) {
          audio.currentTime = expectedAudioTime
        }
        audio.volume = musicVolume
        audio.loop = true

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
      voice.volume = voiceVolume

      if (voice.paused) {
        voice.play().catch(() => {
          // Browser autoplay policies may block audio until the next user gesture.
        })
      }
    }
  }

  async function startPreviewPlayback() {
    const video = videoRef.current
    if (!video) {
      await playBackgroundMusic()
      return
    }

    if (editorMode === 'video' && photoSlides.length > 0 && currentTime >= baseVideoDuration) {
      syncPreviewAudioTracks(currentTime, true)
      setIsPlaying(true)
      return
    }

    syncPreviewAudioTracks(currentTime, true)
    await video.play()
    syncPreviewAudioTracks(video.currentTime, true)
    setIsPlaying(true)
  }

  async function playBackgroundMusic() {
    const audio = audioRef.current
    const video = videoRef.current
    if (!audio || !video || !audioUrl) return

    if (video.currentTime < musicStartTime) {
      audio.pause()
      audio.currentTime = musicTrimStart
      return
    }

    syncBackgroundMusic(video.currentTime)
    audio.loop = true
    audio.volume = musicVolume

    try {
      await audio.play()
    } catch {
      // Browser autoplay policies may block audio until the next user gesture.
    }
  }

  function pauseBackgroundMusic() {
    audioRef.current?.pause()
    voicePlaybackRef.current?.pause()
  }

  function drawCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.textBaseline = 'top'

    imageOverlays
      .filter((overlay) => currentTime >= overlay.startTime && currentTime <= overlay.endTime)
      .forEach((overlay) => {
        const image = imageElementsRef.current.get(overlay.id)
        if (!image || !image.complete) return

        context.save()
        context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
        context.rotate((overlay.rotation * Math.PI) / 180)
        context.drawImage(image, -overlay.width / 2, -overlay.height / 2, overlay.width, overlay.height)
        context.restore()

        if (overlay.id === activeImageId) {
          context.save()
          context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
          context.rotate((overlay.rotation * Math.PI) / 180)
          context.strokeStyle = 'rgba(251, 191, 36, 0.95)'
          context.lineWidth = 3
          context.setLineDash([10, 7])
          context.strokeRect(-overlay.width / 2 - 8, -overlay.height / 2 - 8, overlay.width + 16, overlay.height + 16)
          context.setLineDash([])
          context.fillStyle = 'rgba(251, 191, 36, 0.95)'
          context.fillRect(overlay.width / 2 - 8, overlay.height / 2 - 8, 18, 18)
          context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          context.lineWidth = 2
          context.strokeRect(overlay.width / 2 - 8, overlay.height / 2 - 8, 18, 18)
          context.restore()
        }
      })

    stickers
      .filter((sticker) => currentTime >= sticker.startTime && currentTime <= sticker.endTime)
      .forEach((sticker) => {
        context.save()
        context.translate(sticker.x, sticker.y)
        context.rotate((sticker.rotation * Math.PI) / 180)
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = `800 ${sticker.size}px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Inter, sans-serif`
        context.fillText(sticker.value, 0, 0)

        if (sticker.id === activeStickerId) {
          const boxSize = sticker.size * 1.25
          context.strokeStyle = 'rgba(217, 70, 239, 0.95)'
          context.lineWidth = 3
          context.setLineDash([9, 6])
          context.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize)
          context.setLineDash([])
          context.fillStyle = 'rgba(217, 70, 239, 0.95)'
          context.fillRect(boxSize / 2 - 8, boxSize / 2 - 8, 16, 16)
          context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          context.lineWidth = 2
          context.strokeRect(boxSize / 2 - 8, boxSize / 2 - 8, 16, 16)
        }

        context.restore()
      })

    overlays
      .filter((overlay) => currentTime >= overlay.startTime && currentTime <= overlay.endTime)
      .forEach((overlay) => {
      context.save()
      context.font = getTextFontCss(overlay)
      context.textAlign = overlay.textAlign || 'left'
      context.textBaseline = 'top'

      const textBox = getOverlayTextBox(context, overlay)

      if (overlay.backgroundEnabled) {
        context.fillStyle = getRgbaColor(
          overlay.backgroundColor || DEFAULT_TEXT_BACKGROUND_COLOR,
          overlay.backgroundOpacity ?? DEFAULT_TEXT_BACKGROUND_OPACITY
        )
        fillRoundedRect(
          context,
          textBox.x,
          textBox.y,
          textBox.width,
          textBox.height,
          overlay.backgroundRadius ?? 18
        )
      }

      context.fillStyle = 'rgba(0, 0, 0, 0.5)'
      context.fillText(overlay.text, overlay.x + 3, overlay.y + 3)
      context.fillStyle = overlay.color
      context.fillText(overlay.text, overlay.x, overlay.y)

      if (overlay.id === activeOverlayId) {
        const boxX = textBox.x - 2
        const boxY = textBox.y - 2
        const boxWidth = textBox.width + 4
        const boxHeight = textBox.height + 4

        context.strokeStyle = 'rgba(125, 211, 252, 0.95)'
        context.lineWidth = 3
        context.setLineDash([10, 7])
        context.strokeRect(boxX, boxY, boxWidth, boxHeight)
        context.setLineDash([])
        context.fillStyle = 'rgba(14, 165, 233, 0.95)'
        context.fillRect(boxX + boxWidth - 10, boxY + boxHeight - 10, 20, 20)
        context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        context.lineWidth = 2
        context.strokeRect(boxX + boxWidth - 10, boxY + boxHeight - 10, 20, 20)
      }
      context.restore()
      })
  }

  function addTextOverlay() {
    const cleanText = activeOverlayId ? 'Novo texto' : textValue.trim() || 'Novo texto'
    const timing = getDefaultLayerTiming()

    const overlay: TextOverlay = {
      id: crypto.randomUUID(),
      text: cleanText,
      x: canvasSize.width * 0.12,
      y: canvasSize.height * 0.12,
      fontSize,
      color: textColor,
      fontKey: DEFAULT_TEXT_FONT_KEY,
      fontWeight: getTextFontOption(DEFAULT_TEXT_FONT_KEY).weight,
      backgroundEnabled: false,
      backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
      backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
      backgroundRadius: 18,
      textAlign: 'left',
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

  function addSticker(value: string) {
    const timing = getDefaultLayerTiming()
    const sticker: StickerOverlay = {
      id: crypto.randomUUID(),
      value,
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

      if (
        point.x >= textBox.x - 4 &&
        point.x <= textBox.x + textBox.width + 4 &&
        point.y >= textBox.y - 4 &&
        point.y <= textBox.y + textBox.height + 4
      ) {
        return overlay
      }
    }

    return null
  }

  function findImageAtPoint(point: { x: number; y: number }) {
    for (const overlay of [...imageOverlays].reverse()) {
      if (currentTime < overlay.startTime || currentTime > overlay.endTime) continue

      if (
        point.x >= overlay.x - 10 &&
        point.x <= overlay.x + overlay.width + 10 &&
        point.y >= overlay.y - 10 &&
        point.y <= overlay.y + overlay.height + 10
      ) {
        return overlay
      }
    }

    return null
  }

  function findStickerAtPoint(point: { x: number; y: number }) {
    for (const sticker of [...stickers].reverse()) {
      if (currentTime < sticker.startTime || currentTime > sticker.endTime) continue

      const halfSize = sticker.size * 0.65
      if (
        point.x >= sticker.x - halfSize &&
        point.x <= sticker.x + halfSize &&
        point.y >= sticker.y - halfSize &&
        point.y <= sticker.y + halfSize
      ) {
        return sticker
      }
    }

    return null
  }

  function selectOverlay(overlay: TextOverlay) {
    setActiveOverlayId(overlay.id)
    setActiveStickerId(null)
    setActiveImageId(null)
    setActivePanel('text')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function selectSticker(sticker: StickerOverlay) {
    setActiveStickerId(sticker.id)
    setActiveOverlayId(null)
    setActiveImageId(null)
    setActivePanel('sticker')

    if (currentTime < sticker.startTime || currentTime > sticker.endTime) {
      handleSeek(sticker.startTime)
    }
  }

  function selectImageOverlay(overlay: ImageOverlay) {
    setActiveImageId(overlay.id)
    setActiveOverlayId(null)
    setActiveStickerId(null)
    setActivePanel('image')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const point = getCanvasPoint(event, canvas)
    const overlay = findOverlayAtPoint(point)
    const sticker = overlay ? null : findStickerAtPoint(point)
    const imageOverlay = overlay || sticker ? null : findImageAtPoint(point)

    if (!overlay && !sticker && !imageOverlay) {
      setActiveOverlayId(null)
      setActiveStickerId(null)
      setActiveImageId(null)
      pointerStartedOnOverlayRef.current = false
      pointerMovedRef.current = false
      draggingLayerRef.current = null
      return
    }

    pointerStartedOnOverlayRef.current = true
    pointerMovedRef.current = false
    canvas.setPointerCapture(event.pointerId)
    if (overlay) {
      draggingLayerRef.current = { type: 'text', id: overlay.id }
      setActiveOverlayId(overlay.id)
      setActiveStickerId(null)
      setActiveImageId(null)
      setActivePanel('text')
      setDragOffset({
        x: point.x - overlay.x,
        y: point.y - overlay.y,
      })
    } else if (sticker) {
      draggingLayerRef.current = { type: 'sticker', id: sticker.id }
      setActiveOverlayId(null)
      setActiveStickerId(sticker.id)
      setActiveImageId(null)
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
      setActivePanel('image')
      setDragOffset({
        x: point.x - imageOverlay.x,
        y: point.y - imageOverlay.y,
      })
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const draggingLayer = draggingLayerRef.current
    if (!draggingLayer) return

    const canvas = canvasRef.current
    if (!canvas || !canvas.hasPointerCapture(event.pointerId)) return

    const point = getCanvasPoint(event, canvas)
    pointerMovedRef.current = true

    if (draggingLayer.type === 'text') {
      setOverlays((current) =>
        current.map((overlay) => {
          if (overlay.id !== draggingLayer.id) return overlay

          return {
            ...overlay,
            x: clamp(point.x - dragOffset.x, 0, canvas.width),
            y: clamp(point.y - dragOffset.y, 0, canvas.height),
          }
        })
      )
      return
    }

    if (draggingLayer.type === 'sticker') {
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

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    if (!pointerStartedOnOverlayRef.current && !pointerMovedRef.current) {
      void togglePlayback()
    }

    pointerMovedRef.current = false
    pointerStartedOnOverlayRef.current = false
    draggingLayerRef.current = null
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      pauseBackgroundMusic()
      setIsPlaying(false)
    } else {
      await startPreviewPlayback()
    }
  }

  function handleVideoPlay() {
    setIsPlaying(true)
    syncPreviewAudioTracks(videoRef.current?.currentTime || 0, true)
  }

  function handleVideoPause() {
    setIsPlaying(false)
    pauseBackgroundMusic()
  }

  function handleVideoEnded() {
    if (editorMode === 'video' && photoSlides.length > 0) {
      const nextTime = baseVideoDuration
      setCurrentTime(nextTime)
      setIsPlaying(true)
      syncPreviewAudioTracks(nextTime, true)
      return
    }

    setIsPlaying(false)
    pauseBackgroundMusic()
    syncPreviewAudioTracks(0, false)
  }

  function updateActiveOverlayTiming(key: 'startTime' | 'endTime', value: number) {
    if (!activeOverlayId) return

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
        const nextWidth = clamp(width, 32, canvasSize.width)
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
              rotation,
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

  function snapTimelineTime(value: number) {
    return Math.round(value / TIMELINE_DRAG_SNAP_SECONDS) * TIMELINE_DRAG_SNAP_SECONDS
  }

  function updateTimelineLayerTiming(type: TimelineEditableLayer, id: string, startTime: number, endTime: number) {
    const timing = normalizeTimelineTiming(startTime, endTime)

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

    const secondsPerPixel = timelineDuration / Math.max(dragState.trackWidth, 1)
    const deltaSeconds = (clientX - dragState.startClientX) * secondsPerPixel
    const originalDuration = Math.max(
      dragState.initialEndTime - dragState.initialStartTime,
      MIN_TIMELINE_ITEM_DURATION,
    )
    let nextStart = dragState.initialStartTime
    let nextEnd = dragState.initialEndTime

    if (dragState.mode === 'trim-start') {
      nextStart = clamp(
        snapTimelineTime(dragState.initialStartTime + deltaSeconds),
        0,
        dragState.initialEndTime - MIN_TIMELINE_ITEM_DURATION,
      )
    } else if (dragState.mode === 'trim-end') {
      nextEnd = clamp(
        snapTimelineTime(dragState.initialEndTime + deltaSeconds),
        dragState.initialStartTime + MIN_TIMELINE_ITEM_DURATION,
        timelineDuration,
      )
    } else {
      nextStart = clamp(
        snapTimelineTime(dragState.initialStartTime + deltaSeconds),
        0,
        Math.max(timelineDuration - originalDuration, 0),
      )
      nextEnd = nextStart + originalDuration
    }

    const timing = normalizeTimelineTiming(nextStart, nextEnd)
    updateTimelineLayerTiming(dragState.type, dragState.id, timing.startTime, timing.endTime)
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
      trackWidth: trackRect.width,
      startClientX: event.clientX,
      initialStartTime: startTime,
      initialEndTime: endTime,
    }

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

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    applyTimelineDrag(event.clientX)
    timelineDragRef.current = null
    setTimelineDragTarget(null)
    setTimelineDragPreview(null)
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

  function updateActiveStickerStyle(key: 'size' | 'rotation', value: number) {
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
    const orderedSlides = [...photoSlides].sort((a, b) => a.order - b.order)
    const offset = getBaseClipOffset()
    const slideStart = orderedSlides
      .filter((slide) => slide.order < (orderedSlides.find((slide) => slide.id === slideId)?.order ?? 0))
      .reduce((total, slide) => total + slide.duration, offset)

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

  async function getFFmpeg() {
    if (ffmpegRef.current?.loaded) {
      setIsReady(true)
      logRenderContext('ffmpeg_already_loaded')
      return ffmpegRef.current
    }

    setRenderStage('ffmpeg_loading', 'Carregando motor de video...')

    const ffmpeg = new FFmpeg()
    ffmpegRef.current = ffmpeg

    ffmpeg.on('progress', ({ progress }) => {
      setRenderProgress(clamp(Math.round(progress * 100), 0, 100))
    })

    ffmpeg.on('log', ({ type, message }) => {
      console.info('[VideoEditor] FFmpeg:', { type, message })
    })

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    setIsReady(true)
    logRenderContext('ffmpeg_loaded')
    return ffmpeg
  }

  function getFriendlyRenderErrorMessage(error: unknown) {
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

  function buildStickerDrawFilters(includeStickers = true) {
    if (!includeStickers) return []

    return stickers.map((sticker) => {
      const placement = getStickerPlacement(sticker)
      const startTime = Number.isFinite(sticker.startTime) ? sticker.startTime : 0
      const endTime = Number.isFinite(sticker.endTime) ? sticker.endTime : duration

      return [
        'drawtext',
        `text='${escapeDrawTextValue(sticker.value)}'`,
        `x=${placement.x}`,
        `y=${placement.y}`,
        `fontsize=${placement.size}`,
        'fontcolor=white',
        'shadowcolor=black@0.5',
        'shadowx=2',
        'shadowy=2',
        `enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'`,
      ].join(':')
    })
  }

  function buildLayerDrawFilters(includeOutputFormat = true, includeStickers = true) {
    const filters = [
      ...buildStickerDrawFilters(includeStickers),
      ...buildTextDrawFilters(),
    ]

    if (includeOutputFormat) filters.push('format=yuv420p')
    return filters.join(',')
  }

  function buildVideoFilter(includeOutputFormat = true, includeStickers = true) {
    const filters = [
      getVisualFilter(filter),
      ...buildStickerDrawFilters(includeStickers),
      ...buildTextDrawFilters(),
    ]

    if (includeOutputFormat) filters.push('format=yuv420p')
    return filters.join(',')
  }

  function getRenderableImageOverlays() {
    return imageOverlays.filter((overlay) => RENDERABLE_IMAGE_TYPES.includes(overlay.file.type))
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

  function buildImageVideoFilter(
    renderImages: RenderImageInput[],
    includeTiming: boolean,
    includeStickers = true
  ) {
    const layerFilters = buildLayerDrawFilters(true, includeStickers)
    const filters = [`[0:v]${getVisualFilter(filter)}[vbase]`]
    let previousLabel = 'vbase'

    renderImages.forEach((renderImage, index) => {
      const placement = getImageOverlayPlacement(renderImage.overlay)
      const startTime = Number.isFinite(renderImage.overlay.startTime)
        ? renderImage.overlay.startTime
        : 0
      const endTime = Number.isFinite(renderImage.overlay.endTime)
        ? renderImage.overlay.endTime
        : duration
      const timing = includeTiming
        ? `:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'`
        : ''
      const imageLabel = `img${index}`
      const nextLabel = `vimg${index}`

      filters.push(`[${renderImage.inputIndex}:v]scale=${placement.width}:${placement.height}[${imageLabel}]`)
      filters.push(`[${previousLabel}][${imageLabel}]overlay=${placement.x}:${placement.y}${timing}[${nextLabel}]`)
      previousLabel = nextLabel
    })

    filters.push(`[${previousLabel}]${layerFilters}[v]`)

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
      filters.push(`[0:a]volume=${videoVolume.toFixed(2)}[a0]`)
      labels.push('[a0]')
    }

    if (musicInputIndex !== null) {
      const musicDelayMs = Math.max(Math.round(musicStartTime * 1000), 0)
      filters.push(
        `[${musicInputIndex}:a]atrim=start=${musicTrimStart.toFixed(3)}:duration=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${musicDelayMs}:all=1,volume=${musicVolume.toFixed(2)}[aMusic]`
      )
      labels.push('[aMusic]')
    }

    if (voiceInputIndex !== null) {
      const voiceDelayMs = Math.max(Math.round(voiceStartTime * 1000), 0)
      filters.push(
        `[${voiceInputIndex}:a]adelay=${voiceDelayMs}:all=1,atrim=0:${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${voiceVolume.toFixed(2)}[aVoice]`
      )
      labels.push('[aVoice]')
    }

    if (labels.length === 0) return filters
    if (labels.length === 1) return [...filters, `${labels[0]}anull[a]`]

    return [
      ...filters,
      `${labels.join('')}amix=inputs=${labels.length}:duration=${mixDuration}:dropout_transition=0[a]`,
    ]
  }

  function buildRenderArgs(
    inputVideoName: string,
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    renderImages: RenderImageInput[],
    includeImageTiming = true,
    includeStickers = true
  ) {
    const hasRenderImages = renderImages.length > 0

    if (inputVoiceName) {
      const inputArgs = [
        '-i',
        inputVideoName,
        ...(inputAudioName ? ['-stream_loop', '-1', '-i', inputAudioName] : []),
        ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
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
          ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
          '-filter_complex',
          `${videoFilter};[0:a]volume=${videoVolume.toFixed(2)}[a]`,
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
        `[0:v]${videoFilter}[v];[0:a]volume=${videoVolume.toFixed(2)}[a]`,
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

    const musicDelayMs = Math.max(Math.round(musicStartTime * 1000), 0)

    return [
      '-i',
      inputVideoName,
      '-stream_loop',
      '-1',
      '-i',
      inputAudioName,
      ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
      '-filter_complex',
      hasRenderImages
        ? [
            videoFilter,
            `[0:a]volume=${videoVolume.toFixed(2)}[a0]`,
            `[1:a]atrim=start=${musicTrimStart.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${musicDelayMs}:all=1,volume=${musicVolume.toFixed(2)}[a1]`,
            '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]',
          ].join(';')
        : [
            `[0:v]${videoFilter}[v]`,
            `[0:a]volume=${videoVolume.toFixed(2)}[a0]`,
            `[1:a]atrim=start=${musicTrimStart.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${musicDelayMs}:all=1,volume=${musicVolume.toFixed(2)}[a1]`,
            '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]',
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
        ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
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
          ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
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

    const musicDelayMs = Math.max(Math.round(musicStartTime * 1000), 0)

    return [
      '-i',
      inputVideoName,
      '-stream_loop',
      '-1',
      '-i',
      inputAudioName,
      ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
      '-filter_complex',
      hasRenderImages
        ? [
            videoFilter,
            `[1:a]atrim=start=${musicTrimStart.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${musicDelayMs}:all=1,volume=${musicVolume.toFixed(2)}[a]`,
          ].join(';')
        : [
            `[0:v]${videoFilter}[v]`,
            `[1:a]atrim=start=${musicTrimStart.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${musicDelayMs}:all=1,volume=${musicVolume.toFixed(2)}[a]`,
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

  async function optimizeRenderedVideo(ffmpeg: FFmpeg, renderedName: string, optimizedName: string) {
    const renderedData = await ffmpeg.readFile(renderedName)
    const renderedArray = readFfmpegBytes(renderedData)
    const profile = getCompressionProfile()
    const startedAt = performance.now()

    setRenderStage('optimizing', `Otimizando video (${profile.label})...`)
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
        elapsedMs: Math.round(performance.now() - startedAt),
      })

      return finalArray
    } catch (error) {
      console.warn('[VideoEditor] Compression failed, publishing standard render:', {
        error,
        sourceBytes: renderedArray.byteLength,
        chosenPreset: compressionPreset,
        profile: profile.label,
      })
      setRenderStage('optimizing_fallback', 'Nao foi possivel otimizar neste navegador. Tentando publicar com renderizacao padrao.')
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

  function getActivePhotoSlide() {
    const selectedSlide = photoSlides.find((slide) => slide.id === activePhotoId)
    if (selectedSlide && editorMode === 'photos') return selectedSlide

    let elapsed = 0
    const relativeTime = editorMode === 'video' && videoFile
      ? currentTime - baseVideoDuration
      : currentTime

    if (relativeTime < 0) return selectedSlide || null

    for (const slide of [...photoSlides].sort((a, b) => a.order - b.order)) {
      const start = elapsed
      const end = elapsed + slide.duration
      if (relativeTime >= start && relativeTime < end) return slide
      elapsed = end
    }

    return editorMode === 'video' && videoFile
      ? photoSlides[photoSlides.length - 1] || null
      : selectedSlide || photoSlides[photoSlides.length - 1] || null
  }

  function buildPhotoVideoFilter(slides: PhotoSlide[], useFade: boolean) {
    const slideFilters = slides.map((slide, index) => {
      const baseFilters = [
        `scale=${PHOTO_VIDEO_WIDTH}:${PHOTO_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${PHOTO_VIDEO_WIDTH}:${PHOTO_VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
        'setsar=1',
        'format=yuv420p',
      ]

      if (useFade && slide.duration > 0.8) {
        baseFilters.push('fade=t=in:st=0:d=0.25')
        baseFilters.push(`fade=t=out:st=${Math.max(slide.duration - 0.25, 0).toFixed(2)}:d=0.25`)
      }

      return `[${index}:v]${baseFilters.join(',')}[p${index}]`
    })

    if (slides.length === 1) {
      return [...slideFilters, '[p0]null[v]'].join(';')
    }

    const concatInputs = slides.map((_, index) => `[p${index}]`).join('')
    return [...slideFilters, `${concatInputs}concat=n=${slides.length}:v=1:a=0[v]`].join(';')
  }

  function buildPhotoRenderArgs(
    photoInputs: { name: string; slide: PhotoSlide }[],
    inputAudioName: string | null,
    inputVoiceName: string | null,
    voiceInputIndex: number | null,
    useFade: boolean
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
          buildPhotoVideoFilter(photoInputs.map((item) => item.slide), useFade),
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
      buildPhotoVideoFilter(photoInputs.map((item) => item.slide), useFade),
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
      `[0:v]${getVisualFilter(filter)},scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vclip0]`,
    ]

    photoInputs.forEach((item, index) => {
      filters.push(
        `[${item.inputIndex}:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vclip${index + 1}]`
      )
    })

    const concatInputs = Array.from({ length: photoInputs.length + 1 }, (_, index) => `[vclip${index}]`).join('')
    filters.push(`${concatInputs}concat=n=${photoInputs.length + 1}:v=1:a=0[vseq]`)

    let previousLabel = 'vseq'
    renderImages.forEach((renderImage, index) => {
      const placement = getImageOverlayPlacement(renderImage.overlay)
      const startTime = Number.isFinite(renderImage.overlay.startTime)
        ? renderImage.overlay.startTime
        : 0
      const endTime = Number.isFinite(renderImage.overlay.endTime)
        ? renderImage.overlay.endTime
        : duration
      const timing = includeImageTiming
        ? `:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'`
        : ''
      const imageLabel = `seqimg${index}`
      const nextLabel = `vseqimg${index}`

      filters.push(`[${renderImage.inputIndex}:v]scale=${placement.width}:${placement.height}[${imageLabel}]`)
      filters.push(`[${previousLabel}][${imageLabel}]overlay=${placement.x}:${placement.y}${timing}[${nextLabel}]`)
      previousLabel = nextLabel
    })

    filters.push(`[${previousLabel}]${buildLayerDrawFilters(true, includeStickers)}[v]`)

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
    includeStickers = true
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
      ...renderImages.flatMap((renderImage) => ['-i', renderImage.inputName]),
      ...(inputVoiceName ? ['-i', inputVoiceName] : []),
    ]
    const audioFilters = buildAudioMixFilters({
      totalDuration: duration,
      musicInputIndex: inputAudioName ? 1 + photoInputs.length : null,
      voiceInputIndex,
      includeOriginalAudio: true,
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

  function downloadOutputArray(outputArray: Uint8Array) {
    const outputBlob = getOutputBlob(outputArray)
    const downloadUrl = URL.createObjectURL(outputBlob)
    const downloadLink = document.createElement('a')

    downloadLink.href = downloadUrl
    downloadLink.download = 'entreus-lab-video.mp4'
    downloadLink.rel = 'noreferrer'
    document.body.appendChild(downloadLink)
    downloadLink.click()
    downloadLink.remove()

    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000)
    setRenderProgress(100)
    setRenderStage('done', 'Download iniciado. Se o download nao comecar, tente novamente.')
  }

  async function publishOutputArray(outputArray: Uint8Array) {
    const outputBlob = getOutputBlob(outputArray)

    setRenderStage('uploading', 'Enviando para a EntreUS...')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('Usuario nao autenticado.')
    }

    const filePath = `videos/${user.id}_${Date.now()}.mp4`
    const { error: uploadError } = await supabase.storage
      .from('posts')
      .upload(filePath, outputBlob, {
        cacheControl: '3600',
        contentType: 'video/mp4',
        upsert: false,
      })

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

    if (insertError) {
      throw insertError
    }

    setRenderProgress(100)
    setRenderStage('done', 'Publicado com sucesso!')
    clearEditorAfterPublish()
  }

  async function finishRenderedOutput(outputArray: Uint8Array) {
    if (isDownloadMode) {
      setRenderStage('downloading', 'Preparando download...')
      downloadOutputArray(outputArray)
      return
    }

    await publishOutputArray(outputArray)
  }

  async function renderPhotoVideo() {
    if (photoSlides.length === 0 || isRendering) return

    pauseBackgroundMusic()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setRenderStage('starting', isReady ? 'Preparando fotos...' : 'Carregando motor de video...')

    const orderedSlides = [...photoSlides].sort((a, b) => a.order - b.order)
    const photoInputs = orderedSlides.map((slide, index) => ({
      slide,
      name: `photo_slide_${index}.${getPhotoInputExtension(slide.file)}`,
    }))
    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const inputVoiceName = voiceBlob ? `voice_track.${getVoiceInputExtension(voiceBlob)}` : null
    const voiceInputIndex = inputVoiceName
      ? photoInputs.length + (inputAudioName ? 1 : 0)
      : null
    const outputName = 'entreus_output.mp4'
    const optimizedOutputName = 'entreus_output_optimized.mp4'
    const filesToClean = [
      ...photoInputs.map((item) => item.name),
      outputName,
      optimizedOutputName,
      ...(inputAudioName ? [inputAudioName] : []),
      ...(inputVoiceName ? [inputVoiceName] : []),
    ]

    try {
      const ffmpeg = await getFFmpeg()
      setDuration(getPhotoSlidesDuration(orderedSlides))
      setRenderStage('cleanup', 'Preparando fotos...')
      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setRenderStage('write_photos', 'Enviando fotos para o FFmpeg...')
      await Promise.all(
        photoInputs.map(async (item) => {
          await ffmpeg.writeFile(item.name, await fetchFile(item.slide.file))
        })
      )

      if (audioFile && inputAudioName) {
        setRenderStage('write_audio', 'Preparando audio...')
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      if (voiceBlob && inputVoiceName) {
        setRenderStage('write_voice', 'Preparando voz...')
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
      const renderArgs = buildPhotoRenderArgs(photoInputs, inputAudioName, inputVoiceName, voiceInputIndex, useFadeTransition)
      console.info('[VideoEditor] Photo FFmpeg command:', renderArgs.join(' '))
      setRenderStage('exec_photos', 'Renderizando fotos em video...')

      let exitCode = await ffmpeg.exec(renderArgs)

      if (exitCode !== 0 && useFadeTransition) {
        console.warn('[VideoEditor] Photo fade render failed:', { exitCode })
        setRenderStage('exec_photos_fallback', 'Tentando sem transicao...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const fallbackArgs = buildPhotoRenderArgs(photoInputs, inputAudioName, inputVoiceName, voiceInputIndex, false)
        console.info('[VideoEditor] Photo fallback command:', fallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(fallbackArgs)
      }

      if (exitCode !== 0) {
        throw new Error('PHOTO_RENDER_FAILED')
      }

      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName)
      await finishRenderedOutput(outputArray)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
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
      setRenderMessage('Nao foi possivel criar o video com fotos neste navegador. Tente menos fotos, imagens menores, outro navegador ou feche apps pesados.')
    } finally {
      setIsRendering(false)
    }
  }

  async function renderFinalVideo() {
    if (renderLockRef.current) return

    if (editorMode === 'photos') {
      renderLockRef.current = true
      try {
        await renderPhotoVideo()
      } finally {
        renderLockRef.current = false
      }
      return
    }

    if (!videoFile || isRendering) return

    renderLockRef.current = true
    pauseBackgroundMusic()
    videoRef.current?.pause()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setRenderStage('starting', isReady ? 'Preparando video...' : 'Carregando motor de video...')

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
    const renderImageInputs: RenderImageInput[] = renderableImageOverlays.map((overlay, index) => ({
      inputName: `image_overlay_${index}.${getImageRenderExtension(overlay.file)}`,
      overlay,
      inputIndex: imageInputStartIndex + index,
    }))
    const voiceInputIndex = inputVoiceName
      ? 1 + sequencePhotoInputs.length + (inputAudioName ? 1 : 0) + renderImageInputs.length
      : null
    const filesToClean = [
      inputVideoName,
      outputName,
      optimizedOutputName,
      ...sequencePhotoInputs.map((item) => item.name),
      ...(inputAudioName ? [inputAudioName] : []),
      ...(inputVoiceName ? [inputVoiceName] : []),
      ...renderImageInputs.map((renderImage) => renderImage.inputName),
    ]

    try {
      if (imageOverlays.some((overlay) => overlay.file.type === 'image/webp')) {
        setImageMessage('WebP aparece na previa, mas ainda nao entra no video final. Use PNG ou JPG.')
      }
      if (
        imageOverlays.some((overlay) => Math.abs(overlay.rotation) > 0) ||
        stickers.some((sticker) => Math.abs(sticker.rotation) > 0)
      ) {
        console.info('[VideoEditor] Rotation warning: rotation is preview-only for image/sticker final render.')
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
      const ffmpeg = await getFFmpeg()

      setRenderStage('cleanup', 'Preparando video...')
      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setRenderStage('write_video', 'Preparando video...')
      await ffmpeg.writeFile(inputVideoName, await fetchFile(videoFile))

      for (const photoInput of sequencePhotoInputs) {
        setRenderStage('write_sequence_photo', 'Preparando foto da timeline...')
        await ffmpeg.writeFile(photoInput.name, await fetchFile(photoInput.slide.file))
      }

      if (audioFile && inputAudioName) {
        setRenderStage('write_audio', 'Preparando audio...')
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      if (voiceBlob && inputVoiceName) {
        setRenderStage('write_voice', 'Preparando voz...')
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
        setRenderStage('write_image', 'Preparando imagem...')
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
        ? buildSequenceRenderArgs(inputVideoName, sequencePhotoInputs, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs)
        : buildRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs)
      console.info('[VideoEditor] FFmpeg command:', renderArgs.join(' '))
      setRenderStage('exec_primary', 'Renderizando versao final...')

      let exitCode = await ffmpeg.exec(renderArgs)

      if (exitCode !== 0 && renderImageInputs.length > 0) {
        console.warn('[VideoEditor] FFmpeg image timing render failed:', { exitCode })
        setRenderStage('exec_image_fallback', 'Ajustando imagem e tentando novamente...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const imageFallbackArgs = sequencePhotoInputs.length > 0
          ? buildSequenceRenderArgs(inputVideoName, sequencePhotoInputs, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, false)
          : buildRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, false)
        console.info('[VideoEditor] FFmpeg image fallback command:', imageFallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(imageFallbackArgs)
      }

      if (exitCode !== 0 && stickers.length > 0) {
        console.warn('[VideoEditor] FFmpeg sticker render failed, retrying without stickers:', {
          exitCode,
          stickers: stickers.length,
        })
        setRenderStage('exec_sticker_fallback', 'Ajustando figurinhas e tentando novamente...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const stickerFallbackArgs = sequencePhotoInputs.length > 0
          ? buildSequenceRenderArgs(
              inputVideoName,
              sequencePhotoInputs,
              inputAudioName,
              inputVoiceName,
              voiceInputIndex,
              renderImageInputs,
              false,
              false
            )
          : buildRenderArgs(
              inputVideoName,
              inputAudioName,
              inputVoiceName,
              voiceInputIndex,
              renderImageInputs,
              false,
              false
            )
        console.info('[VideoEditor] FFmpeg sticker fallback command:', stickerFallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(stickerFallbackArgs)
      }

      if (exitCode !== 0 && sequencePhotoInputs.length === 0) {
        console.warn('[VideoEditor] FFmpeg primary render failed:', { exitCode })
        setRenderStage('exec_fallback', 'Ajustando mixagem e tentando novamente...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const fallbackArgs = buildFallbackRenderArgs(inputVideoName, inputAudioName, inputVoiceName, voiceInputIndex, renderImageInputs, false, stickers.length === 0)
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

      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName)
      await finishRenderedOutput(outputArray)
      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
      console.error('[VideoEditor] Render failed:', {
        stage: renderStageRef.current,
        error,
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
      setRenderMessage(getFriendlyRenderErrorMessage(error))
    } finally {
      renderLockRef.current = false
      setIsRendering(false)
    }
  }

  const activeOverlay = overlays.find((overlay) => overlay.id === activeOverlayId)
  const activeImageOverlay = imageOverlays.find((overlay) => overlay.id === activeImageId)
  const activeSticker = stickers.find((sticker) => sticker.id === activeStickerId)
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
  const timelineBlocks = Array.from({ length: 12 }, (_, index) => index)
  const photoSlidesDuration = getPhotoSlidesDuration()
  const orderedPhotoSlides = [...photoSlides].sort((a, b) => a.order - b.order)
  const activePhotoSlide = getActivePhotoSlide()
  const hasAppendedPhotoClips = editorMode === 'video' && Boolean(videoFile) && photoSlides.length > 0
  const timelineClips: TimelineClip[] = [
    ...(editorMode === 'video' && videoFile
      ? [{
          id: 'base-video',
          type: 'video' as const,
          name: videoName || 'Video principal',
          duration: baseVideoDuration,
          startTime: 0,
          endTime: baseVideoDuration,
          order: 0,
          previewUrl: videoUrl,
        }]
      : []),
    ...orderedPhotoSlides.map((slide, index) => {
      const startTime = (editorMode === 'video' && videoFile ? baseVideoDuration : 0) +
        orderedPhotoSlides
          .slice(0, index)
          .reduce((total, item) => total + item.duration, 0)

      return {
        id: slide.id,
        type: 'image' as const,
        name: slide.file.name,
        duration: slide.duration,
        startTime,
        endTime: startTime + slide.duration,
        order: index + (editorMode === 'video' && videoFile ? 1 : 0),
        previewUrl: slide.previewUrl,
      }
    }),
  ]
  const sequencePhotoPreview = hasAppendedPhotoClips && currentTime >= baseVideoDuration
    ? activePhotoSlide
    : null
  const timelineDuration = editorMode === 'photos' ? photoSlidesDuration : duration
  const timelineProgressPercent = timelineDuration > 0 ? (currentTime / timelineDuration) * 100 : 0
  const hasEditorMedia = Boolean(videoUrl || photoSlides.length > 0)
  const canPublish = Boolean((editorMode === 'video' && videoFile) || (editorMode === 'photos' && photoSlides.length > 0))
  const controlsVisible = Boolean(hasEditorMedia && !isPlaying)
  const sourceMediaBytes = editorMode === 'video'
    ? (videoFile?.size || 0) + photoSlides.reduce((total, slide) => total + slide.file.size, 0)
    : photoSlides.reduce((total, slide) => total + slide.file.size, 0)
  const getTimelineLeft = (startTime: number) =>
    timelineDuration > 0 ? clamp((startTime / timelineDuration) * 100, 0, 96) : 0
  const getTimelineWidth = (startTime: number, endTime: number, minWidth = 8) =>
    timelineDuration > 0
      ? clamp(((endTime - startTime) / timelineDuration) * 100, minWidth, 100 - getTimelineLeft(startTime))
      : minWidth
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
    ? Math.min(musicStartTime + Math.max(audioDuration - musicTrimStart, 0), timelineDuration)
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
  const hasRotatedImageOverlay = imageOverlays.some((overlay) => Math.abs(overlay.rotation) > 0)
  const hasRotatedSticker = stickers.some((sticker) => Math.abs(sticker.rotation) > 0)
  const publishHints = [
    ...(isDownloadMode ? ['No Lab, o video final e baixado no navegador e nao cria post no feed. Em celulares, exportar pode demorar.'] : []),
    ...(hasAppendedPhotoClips ? ['Fotos na sequencia entram no render final; videos extras ainda ficam para uma etapa futura.'] : []),
    ...(hasWebPImageOverlay ? ['Dica: para publicar com imagem, use PNG ou JPG. WebP fica apenas na previa.'] : []),
    ...(hasRotatedImageOverlay || hasRotatedSticker
      ? ['Rotacao aparece no preview, mas pode nao sair no video final.']
      : []),
  ]
  const publishButtonLabel = isRendering
    ? renderMessage.toLowerCase().includes('download')
      ? 'Baixando...'
      : renderMessage.toLowerCase().includes('enviando') || renderMessage.toLowerCase().includes('publicando')
      ? isDownloadMode ? 'Exportando...' : 'Enviando...'
      : 'Renderizando...'
    : isDownloadMode
    ? 'Baixar video'
    : 'Publicar'
  const advanceButtonLabel = isRendering ? publishButtonLabel : isDownloadMode ? 'Exportar video' : 'Avancar'
  const selectedLayerTitle = activeOverlay
    ? 'Texto selecionado'
    : activeSticker
    ? 'Figurinha selecionada'
    : activeImageOverlay
    ? 'Imagem selecionada'
    : activePanel === 'audio'
    ? 'Audio selecionado'
    : activePanel === 'voice'
    ? 'Voz selecionada'
    : activePanel === 'effects'
    ? 'Video selecionado'
    : 'Editor'
  const toolButtons = [
    { id: 'text' as EditorPanel, label: 'Texto', icon: <Type className="h-5 w-5" /> },
    { id: 'audio' as EditorPanel, label: 'Audio', icon: <Music className="h-5 w-5" /> },
    { id: 'effects' as EditorPanel, label: 'Efeitos', icon: <SlidersHorizontal className="h-5 w-5" /> },
    ...(isDownloadMode ? [] : [{ id: 'caption' as EditorPanel, label: 'Legenda', icon: <Captions className="h-5 w-5" /> }]),
    { id: 'voice' as EditorPanel, label: 'Voz', icon: <Mic className="h-5 w-5" /> },
    { id: 'add' as EditorPanel, label: 'Adicionar', icon: <Plus className="h-5 w-5" /> },
  ]
  const timelineTracks = [
    { label: 'Texto', icon: <Type className="h-3 w-3" />, active: activePanel === 'text' || Boolean(activeOverlay) },
    { label: 'Figurinhas', icon: <Sparkles className="h-3 w-3" />, active: activePanel === 'sticker' || Boolean(activeSticker) },
    { label: 'Imagens', icon: <ImageIcon className="h-3 w-3" />, active: activePanel === 'image' || Boolean(activeImageOverlay) },
    { label: 'Video', icon: <Video className="h-3 w-3" />, active: activePanel === 'effects' },
    { label: 'Voz', icon: <Mic className="h-3 w-3" />, active: activePanel === 'voice' },
    { label: 'Musica', icon: <Music className="h-3 w-3" />, active: activePanel === 'audio' && Boolean(audioName) },
  ]
  const compressionOptions: { id: CompressionPreset; label: string; description: string }[] = [
    { id: 'auto', label: 'Automatica', description: 'Recomendada' },
    { id: 'light', label: 'Leve', description: 'Menor arquivo' },
    { id: 'high', label: 'Alta', description: 'Mais qualidade' },
  ]

  return (
    <section className="w-full overflow-hidden rounded-[1rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/40 ring-1 ring-sky-400/10 sm:rounded-[1.25rem]">
      <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col gap-0 lg:min-h-[82vh] lg:flex-row">
        <div className="relative flex min-w-0 flex-1 flex-col bg-zinc-950">
          <div className="relative z-[70] flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-base font-black leading-none sm:text-lg">
                  {editorMode === 'photos' ? 'Fotos em video' : videoName || 'Editar video'}
                </p>
                {hasEditorMedia && (
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {formatEditorTime(currentTime)} / {formatEditorTime(editorMode === 'photos' ? photoSlidesDuration : duration)}
                    <span className="mx-1 text-zinc-700">|</span>
                    <span className="text-sky-200/80">{selectedLayerTitle}</span>
                  </p>
                )}
              </div>
            </div>

            {hasEditorMedia && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleAdvanceToPublish}
                disabled={!canPublish || isRendering}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-sky-500 px-3 text-sm font-black text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
              >
                {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                <span>{advanceButtonLabel}</span>
              </button>
            </div>
            )}
          </div>

          <div className={`relative z-0 flex flex-1 items-center justify-center px-2 py-2 transition-all sm:px-5 sm:py-3 ${hasEditorMedia ? 'min-h-[min(52dvh,34rem)] sm:min-h-[30rem]' : 'min-h-[min(62dvh,34rem)] sm:min-h-[34rem]'}`}>
            <div className={`relative isolate w-full overflow-hidden bg-black shadow-2xl shadow-black/40 ${hasEditorMedia ? 'rounded-xl sm:rounded-[1.25rem]' : 'rounded-[1.25rem] border border-white/10'}`}>
            {editorMode === 'video' && videoUrl ? (
              <div
                className="relative mx-auto w-full max-h-[68vh]"
                style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
              >
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  muted={false}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onEnded={handleVideoEnded}
                  className={`relative h-full w-full object-contain transition duration-300 ${sequencePhotoPreview ? 'opacity-0' : 'opacity-100'} ${selectedFilter.className}`}
                  style={{ zIndex: LAYER_ORDER.video }}
                />
                {sequencePhotoPreview && (
                  <img
                    src={sequencePhotoPreview.previewUrl}
                    alt={sequencePhotoPreview.file.name}
                    className="absolute inset-0 z-[5] h-full w-full bg-black object-contain"
                  />
                )}
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="metadata"
                  loop
                  onLoadedMetadata={() => {
                    const nextDuration = audioRef.current?.duration || 0
                    setAudioDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
                    syncBackgroundMusic(currentTime)
                    if (isPlaying) void playBackgroundMusic()
                  }}
                  className="hidden"
                />
                <audio
                  ref={voicePlaybackRef}
                  src={voiceUrl}
                  preload="metadata"
                  onLoadedMetadata={() => {
                    syncVoiceTrack(currentTime)
                    if (isPlaying) syncPreviewAudioTracks(currentTime, true)
                  }}
                  className="hidden"
                />
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute inset-0 h-full w-full touch-none cursor-move"
                  style={{ zIndex: LAYER_ORDER.text }}
                />
                {!isPlaying && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 z-[60] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-2xl ring-1 ring-white/25 backdrop-blur-md transition duration-200 sm:h-20 sm:w-20"
                    aria-hidden="true"
                  >
                    <Play className="ml-1 h-8 w-8 fill-current sm:h-9 sm:w-9" />
                  </div>
                )}
                {activeOverlay && controlsVisible && (
                  <div
                    className="absolute inset-x-3 bottom-3 z-[75] rounded-2xl border border-sky-300/25 bg-black/75 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl"
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
                    className="absolute inset-x-3 bottom-3 z-[75] rounded-2xl border border-amber-300/25 bg-black/75 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl"
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
                        onClick={() => updateActiveImageRotation(clamp(activeImageOverlay.rotation - 15, -45, 45))}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-black text-white"
                        aria-label="Girar imagem para esquerda"
                      >
                        -15
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveImageRotation(clamp(activeImageOverlay.rotation + 15, -45, 45))}
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
                className="relative mx-auto flex w-full max-w-[24rem] items-center justify-center bg-black sm:max-h-[68vh]"
                style={{ aspectRatio: `${PHOTO_VIDEO_WIDTH} / ${PHOTO_VIDEO_HEIGHT}` }}
              >
                <img
                  src={activePhotoSlide.previewUrl}
                  alt={activePhotoSlide.file.name}
                  className="h-full w-full object-contain"
                />
                <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white ring-1 ring-white/10">
                  {activePhotoSlide.order + 1} / {photoSlides.length}
                </div>
                <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-xs font-black text-white ring-1 ring-white/10">
                  {formatEditorTime(photoSlidesDuration)}
                  {audioName ? ' + audio' : ''}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[24rem] flex-col items-center justify-center px-6 text-center text-zinc-400 sm:min-h-[32rem]">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-300/25 bg-blue-500/10 text-blue-100">
                  <Video className="h-7 w-7" />
                </div>
                <p className="mt-4 text-xl font-black text-white">Selecione um video</p>
                <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50">
                  <Upload className="h-4 w-4" />
                  Escolher arquivo
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.m4v"
                    onChange={handleVideoChange}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
            </div>
          </div>

          {hasEditorMedia && (
            <div
              className={`relative z-20 shrink-0 border-t border-white/10 bg-black/85 px-3 pt-3 transition-all duration-300 sm:px-5 lg:pb-3 ${
                activePanel === 'text' ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]' : 'pb-3'
              } ${
                controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -mb-48 translate-y-6 opacity-0'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-zinc-400">
                <span>{formatEditorTime(currentTime)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTimelineExpanded((current) => !current)}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-zinc-300 transition hover:bg-white/10"
                  >
                    {timelineExpanded ? 'Compactar' : 'Camadas'}
                  </button>
                  <span className="text-zinc-600">{formatEditorTime(timelineDuration)}</span>
                </div>
              </div>

              {publishHints.length > 0 && (
                <div className="mb-2 grid gap-1 rounded-xl border border-amber-300/15 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100">
                  {publishHints.map((hint) => (
                    <span key={hint}>{hint}</span>
                  ))}
                </div>
              )}

              <div className="relative rounded-xl border border-white/10 bg-zinc-950/95 p-2 shadow-inner shadow-black sm:rounded-2xl">
                <div
                  ref={timelineScrubRef}
                  onPointerDown={handleTimelineScrubStart}
                  onPointerMove={handleTimelineScrubMove}
                  onPointerUp={handleTimelineScrubEnd}
                  onPointerCancel={handleTimelineScrubEnd}
                  className="mb-2 h-9 touch-none cursor-ew-resize rounded-xl border border-sky-300/15 bg-black/35 p-1.5"
                  aria-label="Arrastar linha do tempo"
                >
                  <div className="relative h-full rounded-lg bg-white/10">
                    <div
                      className="absolute inset-y-0 left-0 rounded-lg bg-sky-400/45"
                      style={{ width: `${timelineProgressPercent}%` }}
                    />
                    <div
                      className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100 shadow-[0_0_18px_rgba(125,211,252,0.85)]"
                      style={{ left: `${timelineProgressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto scroll-smooth pb-1">
                  <div className="sticky left-0 z-10 grid w-[4.75rem] shrink-0 gap-1 bg-zinc-950/95 pr-1 text-[9px] font-black text-zinc-500 sm:w-20 sm:text-[10px]">
                    <button
                      type="button"
                      onClick={() => openEditorPanel('add')}
                      className="flex h-7 items-center justify-center rounded-lg bg-sky-500 text-white"
                      aria-label="Adicionar midia"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {timelineTracks.map((track) => (
                      <span
                        key={track.label}
                        className={`flex h-8 items-center justify-end gap-1 rounded-lg pr-1 transition ${
                          track.active
                            ? 'bg-white/10 text-white ring-1 ring-sky-300/20'
                            : 'text-zinc-500'
                        }`}
                        title={track.label}
                      >
                        <span className="hidden sm:inline">{track.icon}</span>
                        <span className="truncate">{track.label}</span>
                      </span>
                    ))}
                  </div>

                  <div className="relative min-w-[38rem] flex-1 sm:min-w-[48rem]">
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_18px_rgba(125,211,252,0.75)]"
                      style={{ left: `${timelineProgressPercent}%` }}
                    />
                    <div
                      className="pointer-events-none absolute top-0 z-20 h-3 w-3 -translate-x-1/2 rounded-full bg-sky-200"
                      style={{ left: `${timelineProgressPercent}%` }}
                    />
                    <div className="mb-1 grid h-7 grid-cols-12 gap-1 px-1 text-[10px] font-black text-zinc-600">
                      {timelineBlocks.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleSeek((timelineDuration / timelineBlocks.length) * item)}
                          className="border-l border-white/10 pl-1 text-left"
                        >
                          {formatEditorTime((timelineDuration / timelineBlocks.length) * item)}
                        </button>
                      ))}
                    </div>

                    <div data-timeline-track className="relative mt-1 h-10 rounded-lg border border-sky-300/15 bg-sky-500/10 sm:h-8">
                      {editorMode === 'video' && overlays.length > 0 ? (
                        overlays.map((overlay, index) => (
                          <div
                            key={overlay.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectOverlay(overlay)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
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
                            } ${timelineDragTarget?.startsWith(`text:${overlay.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-sky-500/25 ring-2 ring-sky-200' : ''}`}
                            style={{
                              left: `${getTimelineLeft(overlay.startTime)}%`,
                              width: `${getTimelineWidth(overlay.startTime, overlay.endTime, 7)}%`,
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
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-sky-300/20 bg-sky-500/15 px-2 text-[10px] font-black text-sky-50">
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

                    <div data-timeline-track className={`${timelineExpanded ? 'block' : 'hidden sm:block'} relative mt-1 h-10 rounded-lg border border-fuchsia-300/15 bg-fuchsia-500/10 sm:h-8`}>
                      {editorMode === 'video' && stickers.length > 0 ? (
                        stickers.map((sticker) => (
                          <div
                            key={sticker.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectSticker(sticker)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
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
                            } ${timelineDragTarget?.startsWith(`sticker:${sticker.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-fuchsia-500/25 ring-2 ring-fuchsia-200' : ''}`}
                            style={{
                              left: `${getTimelineLeft(sticker.startTime)}%`,
                              width: `${getTimelineWidth(sticker.startTime, sticker.endTime, 7)}%`,
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
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/15 px-2 text-[10px] font-black text-fuchsia-50">
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

                    <div data-timeline-track className={`${timelineExpanded ? 'block' : 'hidden sm:block'} relative mt-1 h-10 rounded-lg border border-amber-300/15 bg-amber-500/10 sm:h-8`}>
                      {editorMode === 'video' && imageOverlays.length > 0 ? (
                        imageOverlays.map((overlay) => (
                          <div
                            key={overlay.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectImageOverlay(overlay)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
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
                            } ${timelineDragTarget?.startsWith(`image:${overlay.id}:`) ? 'z-30 scale-[1.03] shadow-lg shadow-amber-500/25 ring-2 ring-amber-200' : ''}`}
                            style={{
                              left: `${getTimelineLeft(overlay.startTime)}%`,
                              width: `${getTimelineWidth(overlay.startTime, overlay.endTime, 8)}%`,
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
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-amber-300/20 bg-amber-500/15 px-2 text-[10px] font-black text-amber-50">
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

                    <div className="relative mt-1 h-8 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                      {timelineClips.length > 0 ? (
                        <div className="relative h-full p-1">
                          {timelineClips.map((clip, index) => (
                            <div
                              key={clip.id}
                              className="absolute top-1 h-6 min-w-10"
                              style={{
                                left: `${getTimelineLeft(clip.startTime)}%`,
                                width: `${getTimelineWidth(clip.startTime, clip.endTime, 8)}%`,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (clip.type === 'image') {
                                    selectPhotoSlide(clip.id)
                                  } else {
                                    setActivePhotoId(null)
                                    handleSeek(0)
                                    openEditorPanel('effects')
                                  }
                                }}
                                className={`relative h-full w-full overflow-hidden rounded-md border text-left ${
                                  clip.type === 'image' && clip.id === activePhotoId
                                    ? 'border-white bg-sky-300 text-black ring-2 ring-sky-300'
                                    : clip.type === 'video' && activePanel === 'effects'
                                    ? 'border-sky-300/70 bg-zinc-800 text-white ring-2 ring-sky-300/50'
                                    : 'border-white/10 bg-zinc-800 text-white'
                                }`}
                              >
                                {clip.type === 'image' && clip.previewUrl ? (
                                  <img src={clip.previewUrl} alt="" className="h-full w-full object-cover opacity-80" />
                                ) : (
                                  <span className="absolute inset-0 grid grid-cols-4 gap-0.5 p-0.5">
                                    {Array.from({ length: 4 }, (_, item) => (
                                      <span key={item} className="rounded-sm bg-zinc-700/80" />
                                    ))}
                                  </span>
                                )}
                                <span className="absolute left-1 top-0.5 rounded bg-black/60 px-1 text-[9px] font-black text-white">
                                  {clip.type === 'video' ? 'Video' : editorMode === 'photos' ? index + 1 : index}
                                </span>
                                <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[9px] font-black text-white">
                                  {Math.round(clip.duration)}s
                                </span>
                              </button>
                            </div>
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

                    {activePhotoId && (
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 px-2 text-[10px] font-black text-zinc-100">
                        <span className="mr-1 shrink-0">Foto-clipe</span>
                        <button
                          type="button"
                          onClick={() => updatePhotoSlideDuration(activePhotoId, (photoSlides.find((slide) => slide.id === activePhotoId)?.duration || DEFAULT_PHOTO_DURATION) - 1)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Duracao -
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePhotoSlideDuration(activePhotoId, (photoSlides.find((slide) => slide.id === activePhotoId)?.duration || DEFAULT_PHOTO_DURATION) + 1)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Duracao +
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhotoSlide(activePhotoId, -1)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Antes
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhotoSlide(activePhotoId, 1)}
                          className="h-6 shrink-0 rounded-md border border-white/10 bg-black/20 px-2"
                        >
                          Depois
                        </button>
                        <button
                          type="button"
                          onClick={() => removePhotoSlide(activePhotoId)}
                          className="h-6 shrink-0 rounded-md border border-red-300/25 bg-red-500/15 px-2 text-red-100"
                        >
                          Remover
                        </button>
                      </div>
                    )}

                    <div className={`${timelineExpanded ? 'block' : 'hidden sm:block'} relative mt-1 h-8 rounded-lg border border-violet-300/15 bg-violet-500/10`}>
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
                            left: `${getTimelineLeft(voiceStartTime)}%`,
                            width: `${getTimelineWidth(voiceStartTime, voiceTimelineEnd, 10)}%`,
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
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-violet-300/20 bg-violet-500/15 px-2 text-[10px] font-black text-violet-50">
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

                    <div className={`${timelineExpanded ? 'block' : 'hidden sm:block'} relative mt-1 h-8 rounded-lg border border-emerald-300/15 bg-emerald-500/10`}>
                      {audioName ? (
                        <button
                          type="button"
                          onClick={() => openEditorPanel('audio')}
                          className={`absolute top-1 flex h-6 min-w-14 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[10px] font-black text-emerald-950 ring-1 transition ${
                            activePanel === 'audio'
                              ? 'bg-white ring-2 ring-emerald-300'
                              : 'bg-emerald-300/85 ring-emerald-100'
                          }`}
                          style={{
                            left: `${getTimelineLeft(musicStartTime)}%`,
                            width: `${getTimelineWidth(musicStartTime, musicTimelineEnd, 10)}%`,
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
                      <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-lg border border-emerald-300/20 bg-emerald-500/15 px-2 text-[10px] font-black text-emerald-50">
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

                <input
                  type="range"
                  min="0"
                  max={timelineDuration}
                  step="0.05"
                  value={currentTime}
                  onChange={(event) => handleSeek(Number(event.target.value))}
                  className="mt-2 w-full accent-sky-500"
                  aria-label="Linha do tempo do video"
                />
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

        {hasEditorMedia && (
        <aside
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={`fixed inset-x-0 bottom-16 z-[90] flex shrink-0 flex-col rounded-t-[1.25rem] border-t border-white/10 bg-black/95 shadow-2xl shadow-black/50 ring-1 ring-white/10 transition-all duration-300 lg:static lg:z-30 lg:max-h-none lg:w-[22rem] lg:rounded-none lg:border-l lg:border-t-0 lg:bg-black/80 lg:shadow-none lg:ring-0 ${
            activePanel === 'text' ? 'max-h-[4.75rem] sm:max-h-[5.25rem]' : 'max-h-[48dvh] sm:max-h-[52dvh]'
          } ${
            controlsVisible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-full opacity-0 lg:translate-x-8 lg:translate-y-0'
          }`}
        >
          <div className="relative z-[91] grid grid-cols-6 gap-1 border-b border-white/10 p-2 lg:z-auto lg:grid-cols-3">
            {toolButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  openEditorPanel(item.id, item.id === activePanel)
                }}
                className={`relative z-[92] flex min-h-12 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black transition sm:min-h-14 sm:px-2 sm:text-[11px] ${
                  activePanel === item.id
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/30'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-100'
                }`}
              >
                {item.icon}
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            ))}
          </div>

          <div className={`relative z-[91] min-h-0 flex-1 overflow-y-auto p-3 sm:z-auto sm:p-4 ${activePanel === 'text' ? 'hidden lg:block' : ''}`}>
            {activePanel === 'add' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Adicionar</h3>
                  <p className="mt-1 text-sm text-zinc-500">{editorMode === 'photos' ? 'Fotos em video' : 'Midias do editor'}</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex min-h-16 cursor-pointer touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-amber-300/20 bg-amber-500/10 px-2 text-xs font-black text-amber-50 transition hover:bg-amber-500/20">
                    <ImageIcon className="h-5 w-5" />
                    Imagem
                    <input
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.webp"
                      onChange={handleImageChange}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => openEditorPanel('sticker')}
                    className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-2 text-xs font-black text-fuchsia-50 transition hover:bg-fuchsia-500/20"
                  >
                    <Sparkles className="h-5 w-5" />
                    Figurinhas
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditorPanel('sticker')}
                    className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-violet-300/20 bg-violet-500/10 px-2 text-xs font-black text-violet-50 transition hover:bg-violet-500/20"
                  >
                    <span className="text-xl leading-none">😂</span>
                    Emojis
                  </button>
                  <button
                    type="button"
                    onClick={() => addSticker('➡️')}
                    className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-blue-300/20 bg-blue-500/10 px-2 text-xs font-black text-blue-50 transition hover:bg-blue-500/20"
                  >
                    <span className="text-xl leading-none">➡️</span>
                    Formas
                  </button>
                  <button
                    type="button"
                    onClick={() => addSticker('🪙')}
                    className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-yellow-300/20 bg-yellow-500/10 px-2 text-xs font-black text-yellow-50 transition hover:bg-yellow-500/20"
                  >
                    <span className="text-xl leading-none">🪙</span>
                    Selos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoMessage('Clipes de video extras chegam em breve. Neste pacote, adicione fotos como clipes da sequencia.')}
                    className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-black text-zinc-200 transition hover:bg-white/10"
                  >
                    <Plus className="h-5 w-5" />
                    Clipe
                  </button>
                </div>

                <div className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-zinc-300">Elementos rapidos</span>
                    <button
                      type="button"
                      onClick={() => openEditorPanel('text')}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-sky-300/20 bg-sky-500/10 px-2 text-[11px] font-black text-sky-100"
                    >
                      <Type className="h-3 w-3" />
                      Texto
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[...SHAPE_STICKERS, ...ENTREUS_STICKERS].map((sticker, index) => (
                      <button
                        key={`${sticker}-${index}`}
                        type="button"
                        onClick={() => addSticker(sticker)}
                        className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl transition hover:bg-white/10 active:scale-95"
                        aria-label={`Adicionar elemento ${sticker}`}
                      >
                        {sticker}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-sky-300/30 bg-sky-500/10 px-4 py-4 transition hover:bg-sky-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sky-100">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">
                      {videoFile ? 'Adicionar foto como clipe' : 'Criar com fotos'}
                    </span>
                    <span className="block truncate text-xs text-sky-100/60">
                      {videoFile ? 'Entra depois do video na timeline' : `PNG/JPG, ate ${MAX_PHOTO_SLIDES} fotos`}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    multiple
                    onChange={handlePhotoSlidesChange}
                    className="sr-only"
                  />
                </label>

                {photoMessage && (
                  <div className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                    {photoMessage}
                  </div>
                )}

                {photoSlides.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
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
                          <span className="flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-900">
                            <img src={slide.previewUrl} alt="" className="h-full w-full object-cover" />
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

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue-300/30 bg-blue-500/10 px-4 py-4 transition hover:bg-blue-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-100">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">Selecionar video</span>
                    <span className="block truncate text-xs text-blue-100/60">MP4, MOV, WebM</span>
                  </span>
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.m4v"
                    onChange={handleVideoChange}
                    className="sr-only"
                  />
                </label>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-amber-300/30 bg-amber-500/10 px-4 py-4 transition hover:bg-amber-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-100">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">
                      {activeImageOverlay ? 'Adicionar/trocar imagem' : 'Adicionar imagem'}
                    </span>
                    <span className="block truncate text-xs text-amber-100/60">PNG, JPG, WebP ate 5 MB</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp"
                    onChange={handleImageChange}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {activePanel === 'text' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black">Texto</h3>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {activeOverlay ? 'Editando camada selecionada' : 'Nova camada de texto'}
                    </p>
                  </div>
                  {activeOverlay && (
                    <button
                      type="button"
                      onClick={removeActiveOverlay}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/10 text-red-100 transition hover:bg-red-500/20"
                      aria-label="Remover texto selecionado"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <label className="block">
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

                <label className="block">
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

                <label className="block">
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
                  <div className="rounded-xl border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100">
                    Tempo do texto agora fica na camada Texto da timeline. Selecione o bloco e ajuste entrada/saida ali.
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

                <div className="grid grid-cols-5 gap-2">
                  {STICKER_LIBRARY.map((sticker) => (
                    <button
                      key={sticker}
                      type="button"
                      onClick={() => addSticker(sticker)}
                      className="flex aspect-square items-center justify-center rounded-2xl border border-fuchsia-300/15 bg-fuchsia-500/10 text-3xl transition hover:border-fuchsia-200/40 hover:bg-fuchsia-500/20 active:scale-95"
                      aria-label={`Adicionar figurinha ${sticker}`}
                    >
                      {sticker}
                    </button>
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
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            sticker.id === activeStickerId
                              ? 'border-fuchsia-300/60 bg-fuchsia-500/15 text-fuchsia-50'
                              : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20'
                          }`}
                        >
                          <span className="text-xl leading-none">{sticker.value}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black">Figurinha</span>
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

                    <p className="mt-2 rounded-lg border border-fuchsia-200/15 bg-black/20 px-3 py-2 text-[11px] font-semibold text-fuchsia-100/70">
                      Rotacao aparece no preview, mas pode nao sair no video final.
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
                  <span>WebP e rotacao podem ficar apenas no preview.</span>
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
                        min="-45"
                        max="45"
                        value={activeImageOverlay.rotation}
                        onChange={(event) => updateActiveImageRotation(Number(event.target.value))}
                        className="mt-2 w-full accent-amber-300"
                      />
                    </label>

                    <p className="mt-2 rounded-lg border border-amber-200/15 bg-black/20 px-3 py-2 text-[11px] font-semibold text-amber-100/70">
                      Rotacao aparece no preview, mas pode nao sair no video final.
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
                <div>
                  <h3 className="text-base font-black">Audio</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {audioName ? 'Musica selecionada' : 'Troque musica, inicio e volumes.'}
                  </p>
                </div>

                {audioMessage && (
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100">
                    {audioMessage}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-emerald-300/30 bg-emerald-500/10 px-4 py-4 transition hover:bg-emerald-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">
                      {audioName ? 'Trocar musica' : 'Selecionar musica'}
                    </span>
                    <span className="block truncate text-xs text-emerald-100/60">MP3, WAV, M4A</span>
                  </span>
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                    onChange={handleAudioChange}
                    className="sr-only"
                  />
                </label>

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
                    max={Math.max(audioDuration - 0.1, 0)}
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
                  <p className="mt-1 text-[11px] font-semibold text-zinc-600">
                    Use para pular introducoes e comecar no meio da faixa.
                  </p>
                </label>
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
                    onClick={() => setFilter(item.value)}
                    className={`rounded-2xl border p-2 text-left transition ${
                      filter === item.value
                        ? 'border-blue-300/50 bg-blue-500/15 text-blue-50'
                        : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-blue-300/25'
                    }`}
                  >
                    <span className={`block h-12 rounded-xl ${item.swatchClassName}`} />
                    <span className="mt-2 block text-xs font-black">{item.label}</span>
                  </button>
                ))}
                </div>
              </div>
            )}

            {activePanel === 'caption' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Legenda</h3>
                  <p className="mt-1 text-sm text-zinc-500">Texto do post.</p>
                </div>

                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  rows={7}
                  placeholder="O que voce esta pensando?"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
                />
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
          </div>

          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              onClick={handleAdvanceToPublish}
              disabled={!canPublish || isRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {advanceButtonLabel}
            </button>
          </div>
        </aside>
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
                  <p className="text-base font-black">{isDownloadMode ? 'Exportar video' : 'Publicar video'}</p>
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
