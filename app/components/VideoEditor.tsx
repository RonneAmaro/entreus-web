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
  startTime: number
  endTime: number
}

type ImageOverlay = {
  id: string
  url: string
  name: string
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
}

type CanvasSize = {
  width: number
  height: number
}

type EditorPanel = 'add' | 'text' | 'image' | 'audio' | 'effects' | 'caption' | 'voice'
type DraggingLayer = { type: 'text' | 'image'; id: string } | null

type CompressionProfile = {
  label: '720p' | '480p'
  maxWidth: number
  maxHeight: number
  videoBitrate: string
  audioBitrate: string
}

type CompressionStats = {
  originalBytes: number
  optimizedBytes: number
  profile: CompressionProfile['label']
}

const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 42
const DEFAULT_VIDEO_DURATION = 10
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`
const HEAVY_VIDEO_SIZE_BYTES = 30 * 1024 * 1024
const MAX_IMAGE_OVERLAY_SIZE_BYTES = 5 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const COMPRESSION_PROFILES: Record<CompressionProfile['label'], CompressionProfile> = {
  '720p': {
    label: '720p',
    maxWidth: 1280,
    maxHeight: 720,
    videoBitrate: '1500k',
    audioBitrate: '128k',
  },
  '480p': {
    label: '480p',
    maxWidth: 854,
    maxHeight: 480,
    videoBitrate: '850k',
    audioBitrate: '96k',
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

export default function VideoEditor() {
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const pointerMovedRef = useRef(false)
  const pointerStartedOnOverlayRef = useRef(false)
  const draggingLayerRef = useRef<DraggingLayer>(null)
  const renderStageRef = useRef('idle')

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1280, height: 720 })
  const [textValue, setTextValue] = useState('')
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR)
  const [overlays, setOverlays] = useState<TextOverlay[]>([])
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null)
  const [imageOverlays, setImageOverlays] = useState<ImageOverlay[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [currentTime, setCurrentTime] = useState(0)
  const [filter, setFilter] = useState<VideoFilter>('normal')
  const [videoVolume, setVideoVolume] = useState(1)
  const [musicVolume, setMusicVolume] = useState(0.45)
  const [caption, setCaption] = useState('')
  const [activePanel, setActivePanel] = useState<EditorPanel>('text')
  const [isReady, setIsReady] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderMessage, setRenderMessage] = useState('')
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null)
  const [imageMessage, setImageMessage] = useState('')

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
    if (videoRef.current) videoRef.current.volume = videoVolume
  }, [videoVolume, videoUrl])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume
  }, [musicVolume, audioUrl])

  useEffect(() => {
    drawCanvas()
  }, [canvasSize, overlays, imageOverlays, activeOverlayId, activeImageId, currentTime])

  useEffect(() => {
    imageOverlays.forEach((overlay) => {
      if (imageElementsRef.current.has(overlay.id)) return

      const image = new Image()
      image.onload = drawCanvas
      image.onerror = () => {
        imageElementsRef.current.delete(overlay.id)
        setImageOverlays((current) => current.filter((item) => item.id !== overlay.id))
        if (activeImageId === overlay.id) setActiveImageId(null)
        setImageMessage('Nao foi possivel carregar esta imagem. Tente PNG, JPG ou WebP menor que 5 MB.')
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
    if (!isPlaying) return

    let animationFrame = 0

    function syncTime() {
      const video = videoRef.current
      const audio = audioRef.current

      if (video) {
        setCurrentTime(video.currentTime)

        if (audio && audioUrl && !audio.paused) {
          const expectedAudioTime = getSyncedAudioTime(video.currentTime)
          if (Math.abs(audio.currentTime - expectedAudioTime) > 0.35) {
            audio.currentTime = expectedAudioTime
          }
        }
      }

      animationFrame = window.requestAnimationFrame(syncTime)
    }

    animationFrame = window.requestAnimationFrame(syncTime)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [audioUrl, isPlaying])

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    imageElementsRef.current.clear()

    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setVideoName(file.name)
    setOverlays([])
    setActiveOverlayId(null)
    setImageOverlays([])
    setActiveImageId(null)
    setImageMessage('')
    setCompressionStats(null)
    setIsPlaying(false)
    setCurrentTime(0)
    syncBackgroundMusic(0)
  }

  function handleAudioChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setAudioName(file.name)
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
    const overlay: ImageOverlay = {
      id: crypto.randomUUID(),
      url: imageUrl,
      name: file.name,
      x: canvasSize.width * 0.18,
      y: canvasSize.height * 0.18,
      width: Math.min(canvasSize.width * 0.28, 280),
      height: Math.min(canvasSize.height * 0.28, 280),
      startTime: clamp(currentTime, 0, duration),
      endTime: clamp(currentTime + 3, 0, duration),
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
      setImageMessage('Nao foi possivel carregar esta imagem. Tente outro arquivo.')
    }
    image.src = imageUrl
    imageElementsRef.current.set(overlay.id, image)

    setImageOverlays((current) => [...current, overlay])
    setActiveImageId(overlay.id)
    setActiveOverlayId(null)
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
  }

  function clearEditorAfterPublish() {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    imageOverlays.forEach((overlay) => URL.revokeObjectURL(overlay.url))
    imageElementsRef.current.clear()

    setVideoFile(null)
    setVideoUrl('')
    setVideoName('')
    setAudioFile(null)
    setAudioUrl('')
    setAudioName('')
    setOverlays([])
    setActiveOverlayId(null)
    setImageOverlays([])
    setActiveImageId(null)
    setImageMessage('')
    setCaption('')
    setTextValue('')
    setCompressionStats(null)
    setCurrentTime(0)
    setIsPlaying(false)
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return

    setCanvasSize({
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    })
    setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : DEFAULT_VIDEO_DURATION)
    setCurrentTime(video.currentTime || 0)
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return

    setCurrentTime(video.currentTime)
  }

  function handleSeek(value: number) {
    const video = videoRef.current
    const nextTime = clamp(value, 0, duration)

    if (video) video.currentTime = nextTime
    syncBackgroundMusic(nextTime)
    setCurrentTime(nextTime)
  }

  function getSyncedAudioTime(targetTime: number) {
    const audio = audioRef.current
    const audioDuration = audio?.duration || 0

    if (!audio || !Number.isFinite(audioDuration) || audioDuration <= 0) {
      return 0
    }

    return targetTime % audioDuration
  }

  function syncBackgroundMusic(targetTime: number) {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = getSyncedAudioTime(targetTime)
  }

  async function playBackgroundMusic() {
    const audio = audioRef.current
    const video = videoRef.current
    if (!audio || !video || !audioUrl) return

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

        context.drawImage(image, overlay.x, overlay.y, overlay.width, overlay.height)

        if (overlay.id === activeImageId) {
          context.save()
          context.strokeStyle = 'rgba(251, 191, 36, 0.95)'
          context.lineWidth = 3
          context.setLineDash([10, 7])
          context.strokeRect(overlay.x - 8, overlay.y - 8, overlay.width + 16, overlay.height + 16)
          context.setLineDash([])
          context.fillStyle = 'rgba(251, 191, 36, 0.95)'
          context.fillRect(overlay.x + overlay.width - 8, overlay.y + overlay.height - 8, 18, 18)
          context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          context.lineWidth = 2
          context.strokeRect(overlay.x + overlay.width - 8, overlay.y + overlay.height - 8, 18, 18)
          context.restore()
        }
      })

    overlays
      .filter((overlay) => currentTime >= overlay.startTime && currentTime <= overlay.endTime)
      .forEach((overlay) => {
      context.font = `800 ${overlay.fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`
      context.fillStyle = 'rgba(0, 0, 0, 0.5)'
      context.fillText(overlay.text, overlay.x + 3, overlay.y + 3)
      context.fillStyle = overlay.color
      context.fillText(overlay.text, overlay.x, overlay.y)

      if (overlay.id === activeOverlayId) {
        const metrics = context.measureText(overlay.text)
        const boxX = overlay.x - 10
        const boxY = overlay.y - 10
        const boxWidth = metrics.width + 20
        const boxHeight = overlay.fontSize + 20

        context.save()
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
        context.restore()
      }
      })
  }

  function addTextOverlay() {
    const cleanText = activeOverlayId ? 'Novo texto' : textValue.trim() || 'Novo texto'

    const overlay: TextOverlay = {
      id: crypto.randomUUID(),
      text: cleanText,
      x: canvasSize.width * 0.12,
      y: canvasSize.height * 0.12,
      fontSize,
      color: textColor,
      startTime: clamp(currentTime, 0, duration),
      endTime: clamp(currentTime + 3, 0, duration),
    }

    setOverlays((current) => [...current, overlay])
    setActiveOverlayId(overlay.id)
    setActiveImageId(null)
    setActivePanel('text')
    setTextValue(cleanText)
  }

  function findOverlayAtPoint(point: { x: number; y: number }) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!context) return null

    for (const overlay of [...overlays].reverse()) {
      if (currentTime < overlay.startTime || currentTime > overlay.endTime) continue

      context.font = `800 ${overlay.fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`
      const width = context.measureText(overlay.text).width
      const height = overlay.fontSize

      if (
        point.x >= overlay.x - 10 &&
        point.x <= overlay.x + width + 10 &&
        point.y >= overlay.y - 10 &&
        point.y <= overlay.y + height + 10
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

  function selectOverlay(overlay: TextOverlay) {
    setActiveOverlayId(overlay.id)
    setActiveImageId(null)
    setActivePanel('text')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function selectImageOverlay(overlay: ImageOverlay) {
    setActiveImageId(overlay.id)
    setActiveOverlayId(null)
    setActivePanel('image')

    if (currentTime < overlay.startTime || currentTime > overlay.endTime) {
      handleSeek(overlay.startTime)
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const point = getCanvasPoint(event, canvas)
    const imageOverlay = findImageAtPoint(point)
    const overlay = imageOverlay ? null : findOverlayAtPoint(point)

    if (!overlay && !imageOverlay) {
      setActiveOverlayId(null)
      setActiveImageId(null)
      pointerStartedOnOverlayRef.current = false
      pointerMovedRef.current = false
      draggingLayerRef.current = null
      return
    }

    pointerStartedOnOverlayRef.current = true
    pointerMovedRef.current = false
    canvas.setPointerCapture(event.pointerId)
    if (imageOverlay) {
      draggingLayerRef.current = { type: 'image', id: imageOverlay.id }
      setActiveOverlayId(null)
      setActiveImageId(imageOverlay.id)
      setActivePanel('image')
      setDragOffset({
        x: point.x - imageOverlay.x,
        y: point.y - imageOverlay.y,
      })
    } else if (overlay) {
      draggingLayerRef.current = { type: 'text', id: overlay.id }
      setActiveOverlayId(overlay.id)
      setActiveImageId(null)
      setActivePanel('text')
      setDragOffset({
        x: point.x - overlay.x,
        y: point.y - overlay.y,
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

    if (video.paused) {
      await video.play()
      await playBackgroundMusic()
      setIsPlaying(true)
    } else {
      video.pause()
      pauseBackgroundMusic()
      setIsPlaying(false)
    }
  }

  function handleVideoPlay() {
    setIsPlaying(true)
    void playBackgroundMusic()
  }

  function handleVideoPause() {
    setIsPlaying(false)
    pauseBackgroundMusic()
  }

  function handleVideoEnded() {
    setIsPlaying(false)
    pauseBackgroundMusic()
    syncBackgroundMusic(0)
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
            startTime: Math.min(nextValue, overlay.endTime),
          }
        }

        return {
          ...overlay,
          endTime: Math.max(nextValue, overlay.startTime),
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
            startTime: Math.min(nextValue, overlay.endTime),
          }
        }

        return {
          ...overlay,
          endTime: Math.max(nextValue, overlay.startTime),
        }
      })
    )
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

  function updateActiveOverlayStyle(key: 'fontSize' | 'color', value: number | string) {
    if (!activeOverlayId) {
      if (key === 'fontSize') setFontSize(Number(value))
      if (key === 'color') setTextColor(String(value))
      return
    }

    setOverlays((current) =>
      current.map((overlay) =>
        overlay.id === activeOverlayId
          ? {
              ...overlay,
              [key]: key === 'fontSize' ? Number(value) : String(value),
            }
          : overlay
      )
    )
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

  function buildVideoFilter() {
    const filters = [getVisualFilter(filter)]

    overlays.forEach((overlay) => {
      filters.push(
        [
          'drawtext',
          `text='${escapeDrawTextValue(overlay.text)}'`,
          `x=${Math.round(overlay.x)}`,
          `y=${Math.round(overlay.y)}`,
          `fontsize=${Math.round(overlay.fontSize)}`,
          `fontcolor=${getFfmpegColor(overlay.color)}`,
          'shadowcolor=black@0.55',
          'shadowx=3',
          'shadowy=3',
          `enable='between(t,${overlay.startTime.toFixed(3)},${overlay.endTime.toFixed(3)})'`,
        ].join(':')
      )
    })

    filters.push('format=yuv420p')
    return filters.join(',')
  }

  function buildRenderArgs(inputVideoName: string, inputAudioName: string | null) {
    const videoFilter = buildVideoFilter()

    if (!inputAudioName) {
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

    return [
      '-i',
      inputVideoName,
      '-stream_loop',
      '-1',
      '-i',
      inputAudioName,
      '-filter_complex',
      [
        `[0:v]${videoFilter}[v]`,
        `[0:a]volume=${videoVolume.toFixed(2)}[a0]`,
        `[1:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume.toFixed(2)}[a1]`,
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

  function buildFallbackRenderArgs(inputVideoName: string, inputAudioName: string | null) {
    const videoFilter = buildVideoFilter()

    if (!inputAudioName) {
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
      '-filter_complex',
      [
        `[0:v]${videoFilter}[v]`,
        `[1:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume.toFixed(2)}[a]`,
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
    return shouldPreferCompactCompression()
      ? COMPRESSION_PROFILES['480p']
      : COMPRESSION_PROFILES['720p']
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

    setRenderStage('optimizing', `Otimizando video em ${profile.label}...`)
    console.info('[VideoEditor] Compression start:', {
      sourceBytes: renderedArray.byteLength,
      profile: profile.label,
      maxWidth: profile.maxWidth,
      maxHeight: profile.maxHeight,
      videoBitrate: profile.videoBitrate,
      audioBitrate: profile.audioBitrate,
    })

    await cleanupFfmpegFiles(ffmpeg, [optimizedName])

    const compressionArgs = buildCompressionArgs(renderedName, optimizedName, profile)
    console.info('[VideoEditor] FFmpeg compression command:', compressionArgs.join(' '))
    const exitCode = await ffmpeg.exec(compressionArgs)

    if (exitCode !== 0) {
      throw new Error('FFmpeg retornou erro ao otimizar o video.')
    }

    const optimizedData = await ffmpeg.readFile(optimizedName)
    const optimizedArray = readFfmpegBytes(optimizedData)
    const finalArray = optimizedArray.byteLength < renderedArray.byteLength
      ? optimizedArray
      : renderedArray

    setCompressionStats({
      originalBytes: renderedArray.byteLength,
      optimizedBytes: finalArray.byteLength,
      profile: profile.label,
    })

    console.info('[VideoEditor] Compression done:', {
      sourceBytes: renderedArray.byteLength,
      optimizedBytes: optimizedArray.byteLength,
      uploadedBytes: finalArray.byteLength,
      reductionPercent: getReductionPercent(renderedArray.byteLength, finalArray.byteLength),
      usedOptimizedFile: optimizedArray.byteLength < renderedArray.byteLength,
      profile: profile.label,
    })

    return finalArray
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

  async function renderFinalVideo() {
    if (!videoFile || isRendering) return

    pauseBackgroundMusic()
    videoRef.current?.pause()
    setIsPlaying(false)
    setIsRendering(true)
    setRenderProgress(0)
    setCompressionStats(null)
    setRenderStage('starting', isReady ? 'Preparando video...' : 'Carregando motor de video...')

    const inputVideoName = `input.${getFileExtension(videoFile.name, 'mp4')}`
    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const outputName = 'entreus_output.mp4'
    const optimizedOutputName = 'entreus_output_optimized.mp4'
    const filesToClean = [inputVideoName, outputName, optimizedOutputName, ...(inputAudioName ? [inputAudioName] : [])]

    try {
      logRenderContext('start', {
        inputVideoName,
        inputAudioName,
        canvasSize,
      })
      const ffmpeg = await getFFmpeg()

      setRenderStage('cleanup', 'Preparando video...')
      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setRenderStage('write_video', 'Preparando video...')
      await ffmpeg.writeFile(inputVideoName, await fetchFile(videoFile))

      if (audioFile && inputAudioName) {
        setRenderStage('write_audio', 'Preparando audio...')
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      const renderArgs = buildRenderArgs(inputVideoName, inputAudioName)
      console.info('[VideoEditor] FFmpeg command:', renderArgs.join(' '))
      setRenderStage('exec_primary', 'Renderizando versao final...')

      let exitCode = await ffmpeg.exec(renderArgs)

      if (exitCode !== 0) {
        console.warn('[VideoEditor] FFmpeg primary render failed:', { exitCode })
        setRenderStage('exec_fallback', 'Ajustando mixagem e tentando novamente...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        const fallbackArgs = buildFallbackRenderArgs(inputVideoName, inputAudioName)
        console.info('[VideoEditor] FFmpeg fallback command:', fallbackArgs.join(' '))
        exitCode = await ffmpeg.exec(fallbackArgs)
      }

      if (exitCode !== 0) {
        throw new Error('FFmpeg retornou erro ao renderizar o video.')
      }

      const outputArray = await optimizeRenderedVideo(ffmpeg, outputName, optimizedOutputName)
      const outputBlob = new Blob([outputArray.buffer], { type: 'video/mp4' })

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
        duration,
        canvasSize,
      })
      const failedDuringOptimization = renderStageRef.current === 'optimizing'
      setRenderMessage(
        failedDuringOptimization
          ? 'Nao foi possivel otimizar este video neste navegador. Tente novamente com um video menor.'
          : 'Nao foi possivel renderizar neste navegador. Tente um video menor ou outro navegador.'
      )
    } finally {
      setIsRendering(false)
    }
  }

  const activeOverlay = overlays.find((overlay) => overlay.id === activeOverlayId)
  const activeImageOverlay = imageOverlays.find((overlay) => overlay.id === activeImageId)
  const selectedFilter = videoFilters.find((item) => item.value === filter) || videoFilters[0]
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const editableText = activeOverlay ? activeOverlay.text : textValue
  const editableFontSize = activeOverlay ? activeOverlay.fontSize : fontSize
  const editableTextColor = activeOverlay ? activeOverlay.color : textColor
  const timelineBlocks = Array.from({ length: 12 }, (_, index) => index)
  const controlsVisible = Boolean(videoUrl && !isPlaying)
  const activeTimelineWidth = activeOverlay && duration > 0
    ? ((activeOverlay.endTime - activeOverlay.startTime) / duration) * 100
    : 0
  const activeImageTimelineWidth = activeImageOverlay && duration > 0
    ? ((activeImageOverlay.endTime - activeImageOverlay.startTime) / duration) * 100
    : 0
  const toolButtons = [
    { id: 'text' as EditorPanel, label: 'Texto', icon: <Type className="h-5 w-5" /> },
    { id: 'image' as EditorPanel, label: 'Imagem', icon: <ImageIcon className="h-5 w-5" /> },
    { id: 'audio' as EditorPanel, label: 'Audio', icon: <Music className="h-5 w-5" /> },
    { id: 'effects' as EditorPanel, label: 'Efeitos', icon: <SlidersHorizontal className="h-5 w-5" /> },
    { id: 'caption' as EditorPanel, label: 'Legenda', icon: <Captions className="h-5 w-5" /> },
    { id: 'voice' as EditorPanel, label: 'Voz', icon: <Mic className="h-5 w-5" /> },
    { id: 'add' as EditorPanel, label: 'Adicionar', icon: <Plus className="h-5 w-5" /> },
  ]

  return (
    <section className="w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/40 ring-1 ring-sky-400/10">
      <div className="flex flex-col gap-0 lg:min-h-[82vh] lg:flex-row">
        <div className="relative flex min-w-0 flex-1 flex-col bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-5">
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
                  {videoName || 'Editar video'}
                </p>
                {videoUrl && (
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {formatEditorTime(currentTime)} / {formatEditorTime(duration)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={renderFinalVideo}
                disabled={!videoFile || isRendering}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-sky-500 px-3 text-sm font-black text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
              >
                {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                <span className="hidden sm:inline">Publicar</span>
              </button>
            </div>
          </div>

          <div className={`flex flex-1 items-center justify-center px-2 py-3 transition-all sm:px-5 ${videoUrl ? 'min-h-[19rem] sm:min-h-[30rem]' : 'min-h-[24rem] sm:min-h-[34rem]'}`}>
            <div className={`relative w-full overflow-hidden bg-black shadow-2xl shadow-black/40 ${videoUrl ? 'rounded-xl sm:rounded-[1.25rem]' : 'rounded-[1.25rem] border border-white/10'}`}>
            {videoUrl ? (
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
                  className={`h-full w-full object-contain transition duration-300 ${selectedFilter.className}`}
                />
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="metadata"
                  loop
                  onLoadedMetadata={() => {
                    syncBackgroundMusic(currentTime)
                    if (isPlaying) void playBackgroundMusic()
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
                />
                {!isPlaying && (
                  <button
                    type="button"
                    onClick={togglePlayback}
                    className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-blue-500/80"
                    aria-label="Reproduzir video"
                  >
                    <Play className="ml-1 h-9 w-9 fill-current" />
                  </button>
                )}
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

          {videoUrl && (
            <div
              className={`shrink-0 border-t border-white/10 bg-black/85 px-3 py-3 transition-all duration-300 sm:px-5 ${
                controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -mb-48 translate-y-6 opacity-0'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-zinc-400">
                <span>{formatEditorTime(currentTime)}</span>
                <span className="text-zinc-600">{formatEditorTime(duration)}</span>
              </div>

              <div className="relative rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-inner shadow-black">
                <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-[calc(100%-1rem)] w-0.5 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_18px_rgba(125,211,252,0.75)]" />
                <div className="pointer-events-none absolute left-1/2 top-1 z-20 h-3 w-3 -translate-x-1/2 rounded-full bg-sky-200" />

                <div className="flex gap-2 overflow-x-auto scroll-smooth pb-1">
                  <div className="sticky left-0 z-10 grid w-16 shrink-0 gap-1 bg-zinc-950/95 pr-1 text-[10px] font-black text-zinc-500">
                    <button
                      type="button"
                      onClick={() => setActivePanel('add')}
                      className="flex h-7 items-center justify-center rounded-lg bg-sky-500 text-white"
                      aria-label="Adicionar midia"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {['Video', 'Texto', 'Imagem', 'Audio', 'Voz'].map((track) => (
                      <span key={track} className="flex h-8 items-center justify-end pr-1">
                        {track}
                      </span>
                    ))}
                  </div>

                  <div className="min-w-[42rem] flex-1">
                    <div className="mb-1 grid h-7 grid-cols-12 gap-1 px-1 text-[10px] font-black text-zinc-600">
                      {timelineBlocks.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleSeek((duration / timelineBlocks.length) * item)}
                          className="border-l border-white/10 pl-1 text-left"
                        >
                          {formatEditorTime((duration / timelineBlocks.length) * item)}
                        </button>
                      ))}
                    </div>

                    <div className="relative h-8 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                      <div className="grid h-full grid-cols-12 gap-1 p-1">
                        {timelineBlocks.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => handleSeek((duration / timelineBlocks.length) * item)}
                            className="relative overflow-hidden rounded-md bg-zinc-800"
                            aria-label={`Ir para bloco ${item + 1}`}
                          >
                            <video
                              src={videoUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover opacity-60"
                            />
                            <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/30" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="relative mt-1 h-8 rounded-lg border border-sky-300/15 bg-sky-500/10">
                      {overlays.map((overlay, index) => (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => selectOverlay(overlay)}
                          className={`absolute top-1 h-6 min-w-8 rounded-md px-2 text-left text-[10px] font-black transition ${
                            overlay.id === activeOverlayId
                              ? 'bg-white text-black ring-2 ring-sky-300'
                              : 'bg-sky-300/75 text-sky-950 hover:bg-sky-200'
                          }`}
                          style={{
                            left: `${duration > 0 ? (overlay.startTime / duration) * 100 : 0}%`,
                            width: `${duration > 0 ? Math.max(((overlay.endTime - overlay.startTime) / duration) * 100, 7) : 7}%`,
                          }}
                          aria-label={`Selecionar ${getOverlayLabel(overlay, index)}`}
                        >
                          <span className="block truncate">{getOverlayLabel(overlay, index)}</span>
                        </button>
                      ))}
                    </div>

                    <div className="relative mt-1 h-8 rounded-lg border border-amber-300/15 bg-amber-500/10">
                      {imageOverlays.length === 0 ? (
                        <label className="absolute left-2 top-1 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-amber-300/20 bg-amber-500/10 px-2 text-[10px] font-black text-amber-100">
                          <Plus className="h-3 w-3" />
                          Imagem
                          <input
                            type="file"
                            accept="image/*,.png,.jpg,.jpeg,.webp"
                            onChange={handleImageChange}
                            className="sr-only"
                          />
                        </label>
                      ) : (
                        imageOverlays.map((overlay) => (
                          <button
                            key={overlay.id}
                            type="button"
                            onClick={() => selectImageOverlay(overlay)}
                            className={`absolute top-1 h-6 min-w-8 rounded-md px-2 text-left text-[10px] font-black transition ${
                              overlay.id === activeImageId
                                ? 'bg-white text-black ring-2 ring-amber-300'
                                : 'bg-amber-300/80 text-amber-950 hover:bg-amber-200'
                            }`}
                            style={{
                              left: `${duration > 0 ? (overlay.startTime / duration) * 100 : 0}%`,
                              width: `${duration > 0 ? Math.max(((overlay.endTime - overlay.startTime) / duration) * 100, 8) : 8}%`,
                            }}
                          >
                            <span className="block truncate">{overlay.name}</span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="relative mt-1 h-8 rounded-lg border border-emerald-300/15 bg-emerald-500/10">
                      {audioName ? (
                        <button
                          type="button"
                          onClick={() => setActivePanel('audio')}
                          className="absolute inset-x-1 top-1 flex h-6 items-center gap-2 rounded-md bg-emerald-300/80 px-2 text-left text-[10px] font-black text-emerald-950"
                        >
                          <Music className="h-3 w-3 shrink-0" />
                          <span className="truncate">{audioName}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActivePanel('audio')}
                          className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-emerald-300/20 bg-emerald-500/10 px-2 text-[10px] font-black text-emerald-100"
                        >
                          <Plus className="h-3 w-3" />
                          Audio
                        </button>
                      )}
                    </div>

                    <div className="relative mt-1 h-8 rounded-lg border border-violet-300/15 bg-violet-500/10">
                      <button
                        type="button"
                        onClick={() => setActivePanel('voice')}
                        className="absolute left-2 top-1 inline-flex h-6 items-center gap-1 rounded-md border border-violet-300/20 bg-violet-500/10 px-2 text-[10px] font-black text-violet-100"
                      >
                        <Mic className="h-3 w-3" />
                        Voz
                      </button>
                    </div>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max={duration}
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
                    <span className="block text-zinc-500">Original</span>
                    <span>{formatFileSize(compressionStats.originalBytes)}</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
                    <span className="block text-zinc-500">Otimizado</span>
                    <span>{formatFileSize(compressionStats.optimizedBytes)}</span>
                  </div>
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2 py-2 text-emerald-100">
                    <span className="block text-emerald-100/60">{compressionStats.profile}</span>
                    <span>-{getReductionPercent(compressionStats.originalBytes, compressionStats.optimizedBytes)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {videoUrl && (
        <aside
          className={`fixed inset-x-0 bottom-16 z-30 flex max-h-[56dvh] shrink-0 flex-col rounded-t-[1.25rem] border-t border-white/10 bg-black/95 shadow-2xl shadow-black/50 ring-1 ring-white/10 transition-all duration-300 lg:static lg:max-h-none lg:w-[22rem] lg:rounded-none lg:border-l lg:border-t-0 lg:bg-black/80 lg:shadow-none lg:ring-0 ${
            controlsVisible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-full opacity-0 lg:translate-x-8 lg:translate-y-0'
          }`}
        >
          <div className="grid grid-cols-4 gap-1 border-b border-white/10 p-2 sm:grid-cols-7 lg:grid-cols-3">
            {toolButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePanel(item.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-black transition ${
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

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activePanel === 'add' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black">Adicionar</h3>
                  <p className="mt-1 text-sm text-zinc-500">Troque ou selecione o video.</p>
                </div>

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
                  <div className="rounded-xl border border-sky-300/20 bg-sky-500/10 p-3 text-sm text-sky-50">
                    <div className="flex items-center justify-between gap-3 font-black">
                      <span className="inline-flex items-center gap-2">
                        <Move className="h-4 w-4" />
                        Selecionado
                      </span>
                      <span className="text-xs text-sky-100/60">
                        X {Math.round(activeOverlay.x)} / Y {Math.round(activeOverlay.y)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black text-sky-100">
                        <span>Tempo</span>
                        <span>{activeOverlay.startTime.toFixed(1)}s - {activeOverlay.endTime.toFixed(1)}s</span>
                      </div>

                      <div className="relative mb-4 h-2 rounded-full bg-white/10">
                        <div
                          className="absolute top-0 h-full rounded-full bg-emerald-400"
                          style={{
                            left: `${duration > 0 ? (activeOverlay.startTime / duration) * 100 : 0}%`,
                            width: `${activeTimelineWidth}%`,
                          }}
                        />
                        <div
                          className="absolute -top-1 h-4 w-1 rounded-full bg-sky-200"
                          style={{ left: `${progressPercent}%` }}
                        />
                      </div>

                      <label className="block">
                        <span className="text-xs font-bold text-sky-100/70">Entrada</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeOverlay.startTime}
                          onChange={(event) => updateActiveOverlayTiming('startTime', Number(event.target.value))}
                          className="mt-2 w-full accent-emerald-400"
                        />
                      </label>

                      <label className="mt-3 block">
                        <span className="text-xs font-bold text-sky-100/70">Saida</span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.05"
                          value={activeOverlay.endTime}
                          onChange={(event) => updateActiveOverlayTiming('endTime', Number(event.target.value))}
                          className="mt-2 w-full accent-emerald-400"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={removeActiveOverlay}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover texto
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
                      {activeImageOverlay ? 'Figurinha selecionada' : 'Adicionar figurinha'}
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

                <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                  Figurinhas aparecem na previa. A inclusao no video final sera ativada em breve.
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
                  <p className="mt-1 text-sm text-zinc-500">Musica e volumes.</p>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-emerald-300/30 bg-emerald-500/10 px-4 py-4 transition hover:bg-emerald-500/15">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">Selecionar musica</span>
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
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/70">Musica</p>
                        <p className="mt-1 truncate text-sm font-semibold text-emerald-50">{audioName}</p>
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
                    onChange={(event) => setMusicVolume(Number(event.target.value))}
                    disabled={!audioUrl}
                    className="mt-2 w-full accent-emerald-400 disabled:opacity-40"
                  />
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
                  <p className="mt-1 text-sm text-zinc-500">Em breve.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm text-zinc-400">
                  Grave narrações em uma proxima versao. O editor atual preserva audio original e musica.
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              onClick={renderFinalVideo}
              disabled={!videoFile || isRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {isRendering ? 'Publicando...' : 'Avancar'}
            </button>
          </div>
        </aside>
        )}
      </div>
    </section>
  )
}
