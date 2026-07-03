'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eraser,
  ExternalLink,
  Circle,
  GripVertical,
  Loader2,
  Maximize2,
  Mic,
  Monitor,
  MousePointer2,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Type,
  Undo2,
  Video,
  Volume2,
} from 'lucide-react'
import {
  SCREEN_RECORDER_DEFAULT_ANNOTATION_TOOL,
  SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE,
  SCREEN_RECORDER_CANVAS_FPS,
  SCREEN_RECORDER_DEFAULT_TOOLBAR_LAYOUT,
  SCREEN_RECORDER_DEFAULT_WEBCAM_LAYOUT,
  SCREEN_RECORDER_MINIMIZED_CAPTURE_WARNING,
  SCREEN_RECORDER_PRE_RECORDING_VISIBILITY_TIP,
  SCREEN_RECORDER_SIMPLE_CAPTURE_TIP,
  SCREEN_RECORDER_TOOLBAR_LAYOUT_CONSTRAINTS,
  SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
  buildScreenRecordingFileName,
  clampScreenRecorderOverlayLayout,
  createScreenRecordingFileName,
  formatRecordingDuration,
  getBestScreenRecorderMimeType,
  getScreenRecorderCanvasSize,
  getScreenRecorderContainRect,
  getScreenRecorderErrorMessage,
  getScreenRecorderOverlayRect,
  getScreenRecorderSupport,
  getScreenRecorderCompositeLoopDelayMs,
  isScreenRecorderPageHidden,
  isMp4MimeType,
  isScreenRecorderDrawingTool,
  normalizeScreenRecorderPoint,
  normalizeScreenRecorderWebcamShape,
  shouldUseScreenRecorderCompositeMode,
  type ScreenRecorderAnnotationTool,
  type ScreenRecorderOverlayLayout,
  type ScreenRecorderPoint,
  type ScreenRecorderSize,
  type ScreenRecorderSupport,
  type ScreenRecorderWebcamShape,
} from '@/lib/screen-recorder'
import {
  clearOldLocalVideoDrafts,
  getLocalVideoDraftTargetUrl,
  isLocalVideoDraftStorageAvailable,
  saveLocalVideoDraft,
  SCREEN_RECORDER_DRAFT_SOURCE,
} from '@/lib/local-video-drafts'
import {
  canAttemptVideoMp4Export,
  exportVideoToMp4,
} from '@/lib/media/video-compression'

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error'
type OverlayTarget = 'webcam' | 'toolbar'
type OverlayAction = 'move' | 'resize'

type PenAnnotation = {
  id: string
  type: 'pen'
  color: string
  width: number
  points: ScreenRecorderPoint[]
}

type ShapeAnnotation = {
  id: string
  type: 'circle' | 'rectangle'
  color: string
  width: number
  start: ScreenRecorderPoint
  end: ScreenRecorderPoint
}

type TextAnnotation = {
  id: string
  type: 'text'
  color: string
  width: number
  point: ScreenRecorderPoint
  text: string
}

type DrawingAnnotation = PenAnnotation | ShapeAnnotation | TextAnnotation

type OverlayInteraction = {
  target: OverlayTarget
  action: OverlayAction
  pointerId: number
  startClientX: number
  startClientY: number
  startLayout: ScreenRecorderOverlayLayout
}

type StoredOverlaySettings = {
  webcamLayout?: Partial<ScreenRecorderOverlayLayout>
  toolbarLayout?: Partial<ScreenRecorderOverlayLayout>
  webcamShape?: ScreenRecorderWebcamShape
}

const MARKER_COLORS = [
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Amarelo', value: '#facc15' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#38bdf8' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Preto', value: '#020617' },
]
const MARKER_WIDTH_MIN = 3
const MARKER_WIDTH_MAX = 18
const MARKER_WIDTH_DEFAULT = 9
const OVERLAY_SETTINGS_STORAGE_KEY = 'entreus:screen-recorder-overlays:v1'

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function getScreenRecorderNow() {
  return Date.now()
}

function getStoredOverlaySettings(): StoredOverlaySettings {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(OVERLAY_SETTINGS_STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as StoredOverlaySettings : {}
  } catch {
    return {}
  }
}

function getInitialWebcamLayout() {
  const stored = getStoredOverlaySettings()
  const shape = normalizeScreenRecorderWebcamShape(stored.webcamShape)

  return normalizeWebcamLayoutForShape(
    stored.webcamLayout || SCREEN_RECORDER_DEFAULT_WEBCAM_LAYOUT,
    shape,
  )
}

function getInitialToolbarLayout() {
  const stored = getStoredOverlaySettings()

  return clampScreenRecorderOverlayLayout(
    stored.toolbarLayout || SCREEN_RECORDER_DEFAULT_TOOLBAR_LAYOUT,
    SCREEN_RECORDER_TOOLBAR_LAYOUT_CONSTRAINTS,
  )
}

function getInitialWebcamShape(): ScreenRecorderWebcamShape {
  const stored = getStoredOverlaySettings()

  return normalizeScreenRecorderWebcamShape(stored.webcamShape)
}

function normalizeWebcamLayoutForShape(
  layout: Partial<ScreenRecorderOverlayLayout> | null | undefined,
  shape: ScreenRecorderWebcamShape,
): ScreenRecorderOverlayLayout {
  const safeLayout = clampScreenRecorderOverlayLayout(layout, SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS)

  if (shape !== 'circle') return safeLayout

  const size = Math.min(
    Math.max(safeLayout.width, safeLayout.height),
    SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS.maxWidth,
    SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS.maxHeight,
  )

  return clampScreenRecorderOverlayLayout(
    { ...safeLayout, width: size, height: size },
    SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
  )
}

export default function LabScreenRecorderPage() {
  const previewStageRef = useRef<HTMLDivElement | null>(null)
  const screenPreviewRef = useRef<HTMLVideoElement | null>(null)
  const webcamPreviewRef = useRef<HTMLVideoElement | null>(null)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const screenSourceVideoRef = useRef<HTMLVideoElement | null>(null)
  const webcamSourceVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const compositeFrameTimeoutRef = useRef<number | null>(null)
  const isCompositeLoopRunningRef = useRef(false)
  const wasPageHiddenDuringRecordingRef = useRef(false)
  const annotationsRef = useRef<DrawingAnnotation[]>([])
  const activeAnnotationRef = useRef<DrawingAnnotation | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const pausedAtRef = useRef(0)
  const pausedDurationRef = useRef(0)
  const overlayInteractionRef = useRef<OverlayInteraction | null>(null)

  const [support, setSupport] = useState<ScreenRecorderSupport | null>(() => {
    if (typeof window === 'undefined') return null

    return getScreenRecorderSupport({
      navigator: window.navigator,
      MediaRecorder: window.MediaRecorder,
    })
  })
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [canPauseResume, setCanPauseResume] = useState(false)
  const [useMicrophone, setUseMicrophone] = useState(true)
  const [useWebcam, setUseWebcam] = useState(false)
  const [captureScreenAudio, setCaptureScreenAudio] = useState(true)
  const [isCompositeMode, setIsCompositeMode] = useState(true)
  const [canvasSize, setCanvasSize] = useState<ScreenRecorderSize>({ width: 1280, height: 720 })
  const [webcamOverlayLayout, setWebcamOverlayLayout] = useState<ScreenRecorderOverlayLayout>(getInitialWebcamLayout)
  const [annotationToolbarLayout, setAnnotationToolbarLayout] = useState<ScreenRecorderOverlayLayout>(getInitialToolbarLayout)
  const [webcamShape, setWebcamShape] = useState<ScreenRecorderWebcamShape>(getInitialWebcamShape)
  const [selectedAnnotationTool, setSelectedAnnotationTool] = useState<ScreenRecorderAnnotationTool>(
    SCREEN_RECORDER_DEFAULT_ANNOTATION_TOOL,
  )
  const [isPenOptionsOpen, setIsPenOptionsOpen] = useState(false)
  const [selectedMarkerColor, setSelectedMarkerColor] = useState(MARKER_COLORS[0].value)
  const [selectedMarkerWidth, setSelectedMarkerWidth] = useState(MARKER_WIDTH_DEFAULT)
  const [annotationCount, setAnnotationCount] = useState(0)
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null)
  const [webcamPreviewStream, setWebcamPreviewStream] = useState<MediaStream | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingFileName, setRecordingFileName] = useState('')
  const [recordingMimeType, setRecordingMimeType] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [visibilityWarningMessage, setVisibilityWarningMessage] = useState('')
  const [editorMessage, setEditorMessage] = useState('')
  const [mp4ExportMessage, setMp4ExportMessage] = useState('')
  const [isExportingMp4, setIsExportingMp4] = useState(false)

  useEffect(() => {
    const video = screenPreviewRef.current
    if (!video) return

    video.srcObject = screenPreviewStream
    if (screenPreviewStream) {
      void video.play().catch(() => undefined)
    }

    return () => {
      if (video.srcObject === screenPreviewStream) {
        video.srcObject = null
      }
    }
  }, [screenPreviewStream])

  useEffect(() => {
    const video = webcamPreviewRef.current
    if (!video) return

    video.srcObject = webcamPreviewStream
    if (webcamPreviewStream) {
      void video.play().catch(() => undefined)
    }

    return () => {
      if (video.srcObject === webcamPreviewStream) {
        video.srcObject = null
      }
    }
  }, [webcamPreviewStream])

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    }
  }, [recordingUrl])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      stopCompositeLoop()

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }

      stopStream(screenStreamRef.current)
      stopStream(micStreamRef.current)
      stopStream(webcamStreamRef.current)
      stopStream(recorderStreamRef.current)
      audioSourceNodesRef.current.forEach((node) => node.disconnect())
      void audioContextRef.current?.close()
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OVERLAY_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          webcamLayout: webcamOverlayLayout,
          toolbarLayout: annotationToolbarLayout,
          webcamShape,
        } satisfies StoredOverlaySettings),
      )
    } catch {
      // Local storage is optional; the recorder still works with in-memory state.
    }
  }, [annotationToolbarLayout, webcamOverlayLayout, webcamShape])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isCompositeLoopRunningRef.current) {
        drawCompositeFrame()
        startCompositeLoop()
      }

      const isRecordingNow = status === 'recording' || status === 'paused'
      if (!isRecordingNow) return

      if (isCurrentPageHidden()) {
        wasPageHiddenDuringRecordingRef.current = true
        return
      }

      if (wasPageHiddenDuringRecordingRef.current) {
        setVisibilityWarningMessage(SCREEN_RECORDER_MINIMIZED_CAPTURE_WARNING)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  })

  function clearTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function appendNoticeMessage(message: string) {
    setNoticeMessage((current) => current ? `${current} ${message}` : message)
  }

  function isCurrentPageHidden() {
    if (typeof document === 'undefined') return false

    return isScreenRecorderPageHidden({
      hidden: document.hidden,
      visibilityState: document.visibilityState,
    })
  }

  function getCurrentElapsedMs() {
    if (!startedAtRef.current) return 0

    const now = pausedAtRef.current || getScreenRecorderNow()
    return Math.max(0, now - startedAtRef.current - pausedDurationRef.current)
  }

  function syncElapsedTime() {
    setElapsedMs(getCurrentElapsedMs())
  }

  function startTimer() {
    clearTimer()
    syncElapsedTime()
    timerRef.current = window.setInterval(syncElapsedTime, 250)
  }

  function stopCompositeLoop() {
    isCompositeLoopRunningRef.current = false

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (compositeFrameTimeoutRef.current) {
      window.clearTimeout(compositeFrameTimeoutRef.current)
      compositeFrameTimeoutRef.current = null
    }
  }

  function detachSourceVideo(video: HTMLVideoElement | null) {
    if (!video) return

    video.pause()
    video.srcObject = null
    video.removeAttribute('src')
  }

  async function prepareSourceVideo(stream: MediaStream) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    await new Promise<void>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve()
        return
      }

      const timeout = window.setTimeout(resolve, 1200)
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout)
        resolve()
      }
    })

    await video.play().catch(() => undefined)
    return video
  }

  function addRoundedRectPath(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) {
    const safeRadius = Math.min(radius, width / 2, height / 2)

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
  }

  function drawVideoCover(
    context: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const sourceWidth = video.videoWidth || width
    const sourceHeight = video.videoHeight || height
    const sourceAspectRatio = sourceWidth / sourceHeight
    const targetAspectRatio = width / height
    let sx = 0
    let sy = 0
    let sw = sourceWidth
    let sh = sourceHeight

    if (sourceAspectRatio > targetAspectRatio) {
      sw = sourceHeight * targetAspectRatio
      sx = (sourceWidth - sw) / 2
    } else {
      sh = sourceWidth / targetAspectRatio
      sy = (sourceHeight - sh) / 2
    }

    context.drawImage(video, sx, sy, sw, sh, x, y, width, height)
  }

  function addWebcamOverlayPath(context: CanvasRenderingContext2D, rect: ScreenRecorderSize & { x: number; y: number }) {
    if (webcamShape === 'circle') {
      const radius = Math.min(rect.width, rect.height) / 2
      context.beginPath()
      context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, radius, 0, Math.PI * 2)
      context.closePath()
      return
    }

    addRoundedRectPath(context, rect.x, rect.y, rect.width, rect.height, Math.round(rect.width * 0.08))
  }

  function drawPenAnnotation(
    context: CanvasRenderingContext2D,
    annotation: PenAnnotation,
    width: number,
    height: number,
  ) {
    if (annotation.points.length === 0) return

    context.save()
    context.strokeStyle = annotation.color
    context.fillStyle = annotation.color
    context.lineWidth = annotation.width
    context.lineCap = 'round'
    context.lineJoin = 'round'

    if (annotation.points.length === 1) {
      const point = annotation.points[0]
      context.beginPath()
      context.arc(point.x * width, point.y * height, annotation.width / 2, 0, Math.PI * 2)
      context.fill()
      context.restore()
      return
    }

    context.beginPath()
    annotation.points.forEach((point, index) => {
      const x = point.x * width
      const y = point.y * height

      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })
    context.stroke()
    context.restore()
  }

  function drawShapeAnnotation(
    context: CanvasRenderingContext2D,
    annotation: ShapeAnnotation,
    width: number,
    height: number,
  ) {
    const startX = annotation.start.x * width
    const startY = annotation.start.y * height
    const endX = annotation.end.x * width
    const endY = annotation.end.y * height
    const left = Math.min(startX, endX)
    const top = Math.min(startY, endY)
    const shapeWidth = Math.abs(endX - startX)
    const shapeHeight = Math.abs(endY - startY)

    context.save()
    context.strokeStyle = annotation.color
    context.lineWidth = annotation.width
    context.lineCap = 'round'
    context.lineJoin = 'round'

    if (annotation.type === 'rectangle') {
      context.strokeRect(left, top, shapeWidth, shapeHeight)
    } else {
      context.beginPath()
      context.ellipse(
        left + shapeWidth / 2,
        top + shapeHeight / 2,
        Math.max(1, shapeWidth / 2),
        Math.max(1, shapeHeight / 2),
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }

    context.restore()
  }

  function drawTextAnnotation(
    context: CanvasRenderingContext2D,
    annotation: TextAnnotation,
    width: number,
    height: number,
  ) {
    const x = annotation.point.x * width
    const y = annotation.point.y * height
    const fontSize = Math.max(18, annotation.width * 3)

    context.save()
    context.font = `700 ${fontSize}px sans-serif`
    context.textBaseline = 'top'
    context.lineJoin = 'round'
    context.lineWidth = Math.max(3, annotation.width / 2)
    context.strokeStyle = 'rgba(0, 0, 0, 0.72)'
    context.fillStyle = annotation.color
    context.strokeText(annotation.text, x, y)
    context.fillText(annotation.text, x, y)
    context.restore()
  }

  function drawAnnotations(context: CanvasRenderingContext2D, width: number, height: number) {
    for (const annotation of annotationsRef.current) {
      if (annotation.type === 'pen') {
        drawPenAnnotation(context, annotation, width, height)
      } else if (annotation.type === 'text') {
        drawTextAnnotation(context, annotation, width, height)
      } else {
        drawShapeAnnotation(context, annotation, width, height)
      }
    }
  }

  function drawCompositeFrame() {
    const canvas = compositeCanvasRef.current
    const context = canvas?.getContext('2d')
    const screenVideo = screenSourceVideoRef.current

    if (!canvas || !context || !screenVideo) return

    const width = canvas.width
    const height = canvas.height
    context.fillStyle = '#020617'
    context.fillRect(0, 0, width, height)

    if (screenVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const screenRect = getScreenRecorderContainRect(
        {
          width: screenVideo.videoWidth || width,
          height: screenVideo.videoHeight || height,
        },
        { width, height },
      )
      context.drawImage(screenVideo, screenRect.x, screenRect.y, screenRect.width, screenRect.height)
    }

    const webcamVideo = webcamSourceVideoRef.current
    if (useWebcam && webcamVideo && webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const webcamRect = getScreenRecorderOverlayRect(
        getWebcamLayoutForSize({ width, height }),
        { width, height },
        SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
      )

      context.save()
      context.shadowColor = 'rgba(0, 0, 0, 0.55)'
      context.shadowBlur = Math.max(10, Math.round(width * 0.012))
      addWebcamOverlayPath(context, webcamRect)
      context.fillStyle = '#000000'
      context.fill()
      context.clip()
      drawVideoCover(context, webcamVideo, webcamRect.x, webcamRect.y, webcamRect.width, webcamRect.height)
      context.restore()

      context.save()
      context.strokeStyle = 'rgba(255, 255, 255, 0.72)'
      context.lineWidth = Math.max(2, Math.round(width * 0.0015))
      addWebcamOverlayPath(context, webcamRect)
      context.stroke()
      context.restore()
    }

    drawAnnotations(context, width, height)
  }

  function startCompositeLoop() {
    stopCompositeLoop()
    isCompositeLoopRunningRef.current = true

    const renderFrame = () => {
      animationFrameRef.current = null
      compositeFrameTimeoutRef.current = null
      if (!isCompositeLoopRunningRef.current) return

      drawCompositeFrame()

      if (isCurrentPageHidden()) {
        compositeFrameTimeoutRef.current = window.setTimeout(
          renderFrame,
          getScreenRecorderCompositeLoopDelayMs(true),
        )
        return
      }

      animationFrameRef.current = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()
  }

  function clearAnnotations() {
    annotationsRef.current = []
    activeAnnotationRef.current = null
    activePointerIdRef.current = null
    setAnnotationCount(0)
  }

  function getSelectedMarkerWidth() {
    return Math.min(Math.max(selectedMarkerWidth, MARKER_WIDTH_MIN), MARKER_WIDTH_MAX)
  }

  function getWebcamLayoutForSize(size: ScreenRecorderSize, layout = webcamOverlayLayout) {
    const safeLayout = clampScreenRecorderOverlayLayout(layout, SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS)

    if (webcamShape !== 'circle') return safeLayout

    const currentPixelWidth = safeLayout.width * size.width
    const currentPixelHeight = safeLayout.height * size.height
    const minPixelSize = Math.max(96, Math.min(size.width, size.height) * 0.12)
    const maxPixelSize = Math.min(size.width * SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS.maxWidth, size.height * SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS.maxHeight)
    const pixelSize = Math.min(Math.max(Math.max(currentPixelWidth, currentPixelHeight), minPixelSize), maxPixelSize)

    return clampScreenRecorderOverlayLayout(
      {
        ...safeLayout,
        width: pixelSize / size.width,
        height: pixelSize / size.height,
      },
      SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
    )
  }

  function getPreviewStageSize() {
    const rect = previewStageRef.current?.getBoundingClientRect()

    if (!rect || rect.width <= 0 || rect.height <= 0) return null

    return {
      width: rect.width,
      height: rect.height,
    }
  }

  function getOverlayLayout(target: OverlayTarget) {
    return target === 'webcam' ? webcamOverlayLayout : annotationToolbarLayout
  }

  function setOverlayLayout(target: OverlayTarget, layout: Partial<ScreenRecorderOverlayLayout>) {
    if (target === 'webcam') {
      setWebcamOverlayLayout((current) => {
        const nextLayout = clampScreenRecorderOverlayLayout(
          { ...current, ...layout },
          SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
        )
        const stageSize = getPreviewStageSize()

        return stageSize ? getWebcamLayoutForSize(stageSize, nextLayout) : nextLayout
      })
      return
    }

    setAnnotationToolbarLayout((current) => clampScreenRecorderOverlayLayout(
      { ...current, ...layout },
      SCREEN_RECORDER_TOOLBAR_LAYOUT_CONSTRAINTS,
    ))
  }

  function startOverlayInteraction(
    event: PointerEvent<HTMLElement>,
    target: OverlayTarget,
    action: OverlayAction,
  ) {
    const stageSize = getPreviewStageSize()
    if (!stageSize) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    overlayInteractionRef.current = {
      target,
      action,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayout: target === 'webcam'
        ? getWebcamLayoutForSize(stageSize, getOverlayLayout(target))
        : getOverlayLayout(target),
    }
  }

  function updateOverlayInteraction(event: PointerEvent<HTMLElement>) {
    const interaction = overlayInteractionRef.current
    const stageSize = getPreviewStageSize()
    if (!interaction || interaction.pointerId !== event.pointerId || !stageSize) return

    event.preventDefault()
    event.stopPropagation()

    const deltaX = event.clientX - interaction.startClientX
    const deltaY = event.clientY - interaction.startClientY

    if (interaction.action === 'move') {
      setOverlayLayout(interaction.target, {
        ...interaction.startLayout,
        x: interaction.startLayout.x + deltaX / stageSize.width,
        y: interaction.startLayout.y + deltaY / stageSize.height,
      })
      return
    }

    if (interaction.target !== 'webcam') return

    if (webcamShape === 'circle') {
      const startPixelSize = Math.max(
        interaction.startLayout.width * stageSize.width,
        interaction.startLayout.height * stageSize.height,
      )
      const nextPixelSize = Math.max(96, startPixelSize + Math.max(deltaX, deltaY))
      setOverlayLayout('webcam', {
        ...interaction.startLayout,
        width: nextPixelSize / stageSize.width,
        height: nextPixelSize / stageSize.height,
      })
      return
    }

    setOverlayLayout('webcam', {
      ...interaction.startLayout,
      width: interaction.startLayout.width + deltaX / stageSize.width,
      height: interaction.startLayout.height + deltaY / stageSize.height,
    })
  }

  function finishOverlayInteraction(event: PointerEvent<HTMLElement>) {
    const interaction = overlayInteractionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    const pointerTarget = event.target instanceof HTMLElement ? event.target : event.currentTarget
    if (pointerTarget.hasPointerCapture(event.pointerId)) {
      pointerTarget.releasePointerCapture(event.pointerId)
    } else if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    overlayInteractionRef.current = null
  }

  function updateWebcamShape(nextShape: ScreenRecorderWebcamShape) {
    setWebcamShape(nextShape)
    setWebcamOverlayLayout((current) => {
      const stageSize = getPreviewStageSize()
      const safeLayout = normalizeWebcamLayoutForShape(current, nextShape)

      if (!stageSize || nextShape !== 'circle') return safeLayout

      const pixelSize = Math.max(safeLayout.width * stageSize.width, safeLayout.height * stageSize.height)
      return clampScreenRecorderOverlayLayout(
        {
          ...safeLayout,
          width: pixelSize / stageSize.width,
          height: pixelSize / stageSize.height,
        },
        SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS,
      )
    })
  }

  function resetOverlayLayouts() {
    setWebcamOverlayLayout(normalizeWebcamLayoutForShape(SCREEN_RECORDER_DEFAULT_WEBCAM_LAYOUT, webcamShape))
    setAnnotationToolbarLayout(clampScreenRecorderOverlayLayout(
      SCREEN_RECORDER_DEFAULT_TOOLBAR_LAYOUT,
      SCREEN_RECORDER_TOOLBAR_LAYOUT_CONSTRAINTS,
    ))
    setSelectedAnnotationTool(SCREEN_RECORDER_DEFAULT_ANNOTATION_TOOL)
    setIsPenOptionsOpen(false)
  }

  function cleanupStreams() {
    stopCompositeLoop()
    detachSourceVideo(screenSourceVideoRef.current)
    detachSourceVideo(webcamSourceVideoRef.current)
    screenSourceVideoRef.current = null
    webcamSourceVideoRef.current = null
    stopStream(screenStreamRef.current)
    stopStream(micStreamRef.current)
    stopStream(webcamStreamRef.current)
    stopStream(recorderStreamRef.current)
    mediaRecorderRef.current = null
    screenStreamRef.current = null
    micStreamRef.current = null
    webcamStreamRef.current = null
    recorderStreamRef.current = null
    setScreenPreviewStream(null)
    setWebcamPreviewStream(null)
    audioSourceNodesRef.current.forEach((node) => node.disconnect())
    audioSourceNodesRef.current = []
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }

  function buildRecorderStream(
    visualStream: MediaStream,
    displayStream: MediaStream,
    microphoneStream: MediaStream | null,
  ) {
    const videoTracks = visualStream.getVideoTracks()
    const audioTracks = [
      ...displayStream.getAudioTracks(),
      ...(microphoneStream ? microphoneStream.getAudioTracks() : []),
    ]

    if (audioTracks.length <= 1) {
      return new MediaStream([...videoTracks, ...audioTracks])
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextConstructor) {
      appendNoticeMessage('Seu navegador não conseguiu misturar os áudios. A gravação usará apenas uma fonte de áudio.')
      return new MediaStream([...videoTracks, audioTracks[0]])
    }

    const audioContext = new AudioContextConstructor()
    const destination = audioContext.createMediaStreamDestination()
    const sourceNodes = audioTracks.map((track) => {
      const sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]))
      sourceNode.connect(destination)
      return sourceNode
    })

    audioContextRef.current = audioContext
    audioSourceNodesRef.current = sourceNodes

    return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()])
  }

  async function buildVisualRecorderStream(displayStream: MediaStream, cameraStream: MediaStream | null) {
    const shouldUseComposite = shouldUseScreenRecorderCompositeMode({
      hasWebcam: Boolean(cameraStream),
      annotationTool: selectedAnnotationTool,
      annotationCount: annotationsRef.current.length,
    })

    if (!shouldUseComposite) {
      setIsCompositeMode(false)
      setScreenPreviewStream(displayStream)
      setWebcamPreviewStream(null)
      appendNoticeMessage(SCREEN_RECORDER_SIMPLE_CAPTURE_TIP)
      return displayStream
    }

    const canvas = compositeCanvasRef.current

    if (!canvas || typeof canvas.captureStream !== 'function') {
      setIsCompositeMode(false)
      appendNoticeMessage(SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE)
      setScreenPreviewStream(displayStream)
      setWebcamPreviewStream(cameraStream)
      return displayStream
    }

    setIsCompositeMode(true)
    setScreenPreviewStream(null)
    setWebcamPreviewStream(null)

    const screenVideo = await prepareSourceVideo(displayStream)
    screenSourceVideoRef.current = screenVideo

    if (cameraStream) {
      webcamSourceVideoRef.current = await prepareSourceVideo(cameraStream)
    }

    const trackSettings = displayStream.getVideoTracks()[0]?.getSettings()
    const nextCanvasSize = getScreenRecorderCanvasSize({
      width: screenVideo.videoWidth || trackSettings?.width || 1280,
      height: screenVideo.videoHeight || trackSettings?.height || 720,
    })

    canvas.width = nextCanvasSize.width
    canvas.height = nextCanvasSize.height
    setCanvasSize(nextCanvasSize)
    drawCompositeFrame()
    startCompositeLoop()

    appendNoticeMessage(
      'Modo composto ativo: webcam e marcações aparecem no vídeo final na posição atual do preview. A webcam não fica por cima do Windows; ela é embutida na gravação.',
    )

    return canvas.captureStream(SCREEN_RECORDER_CANVAS_FPS)
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }

    clearTimer()
    cleanupStreams()
  }

  async function requestOptionalMediaStream({
    enabled,
    constraints,
    unavailableMessage,
    failureMessage,
  }: {
    enabled: boolean
    constraints: MediaStreamConstraints
    unavailableMessage: string
    failureMessage: string
  }) {
    if (!enabled) return null

    if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
      appendNoticeMessage(unavailableMessage)
      return null
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      appendNoticeMessage(failureMessage)
      return null
    }
  }

  async function startRecording() {
    if (status === 'recording' || status === 'paused' || status === 'requesting') return

    setErrorMessage('')
    setNoticeMessage('')
    setVisibilityWarningMessage('')
    setEditorMessage('')
    setMp4ExportMessage('')
    setStatus('requesting')
    setRecordingBlob(null)
    setRecordingUrl('')
    setRecordingFileName('')
    setRecordingMimeType('')
    setIsExportingMp4(false)
    setCanPauseResume(false)
    setIsCompositeMode(true)
    setElapsedMs(0)
    wasPageHiddenDuringRecordingRef.current = false
    chunksRef.current = []
    clearAnnotations()

    const currentSupport = getScreenRecorderSupport({
      navigator: window.navigator,
      MediaRecorder: window.MediaRecorder,
    })
    setSupport(currentSupport)

    if (!currentSupport.isSupported) {
      setStatus('error')
      setErrorMessage('Este navegador ainda não oferece suporte completo para gravação de tela local.')
      return
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: captureScreenAudio,
      })
      if (displayStream.getVideoTracks().length === 0) {
        throw new DOMException('Nenhuma faixa de vídeo foi selecionada.', 'NotFoundError')
      }
      screenStreamRef.current = displayStream

      const microphoneStream = await requestOptionalMediaStream({
        enabled: useMicrophone,
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        },
        unavailableMessage: 'Microfone indisponível neste navegador; a gravação continuará sem microfone.',
        failureMessage: 'Microfone bloqueado ou indisponível; a gravação continuará sem microfone.',
      })
      micStreamRef.current = microphoneStream
      if (useMicrophone && !microphoneStream) {
        setUseMicrophone(false)
      }

      const cameraStream = await requestOptionalMediaStream({
        enabled: useWebcam,
        constraints: {
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
        },
        unavailableMessage: 'Webcam indisponível neste navegador; a gravação continuará sem webcam.',
        failureMessage: 'Webcam bloqueada ou indisponível; a gravação continuará sem webcam.',
      })
      webcamStreamRef.current = cameraStream
      if (useWebcam && !cameraStream) {
        setUseWebcam(false)
      }

      const visualStream = await buildVisualRecorderStream(displayStream, cameraStream)
      const recorderStream = buildRecorderStream(visualStream, displayStream, microphoneStream)
      recorderStreamRef.current = recorderStream

      const mimeType = getBestScreenRecorderMimeType(window.MediaRecorder)
      const recorder = mimeType ? new MediaRecorder(recorderStream, { mimeType }) : new MediaRecorder(recorderStream)
      const activeMimeType = recorder.mimeType || mimeType
      const nextFileName = buildScreenRecordingFileName(new Date(), activeMimeType || 'video/webm')

      mediaRecorderRef.current = recorder
      setCanPauseResume(typeof recorder.pause === 'function' && typeof recorder.resume === 'function')
      setRecordingFileName(nextFileName)
      setRecordingMimeType(activeMimeType)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event) => {
        const recorderError = 'error' in event ? event.error : event
        setErrorMessage(getScreenRecorderErrorMessage(recorderError))
      }

      recorder.onstop = () => {
        clearTimer()
        const finalMimeType = recorder.mimeType || mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: finalMimeType })
        const finalFileName = buildScreenRecordingFileName(new Date(), finalMimeType)
        cleanupStreams()

        if (blob.size <= 0) {
          setStatus('error')
          setErrorMessage('A gravação terminou sem dados. Tente selecionar outra tela ou aba.')
          return
        }

        setElapsedMs(getCurrentElapsedMs())
        setRecordingBlob(blob)
        setRecordingUrl(URL.createObjectURL(blob))
        setRecordingMimeType(finalMimeType)
        setRecordingFileName(finalFileName)
        setStatus('stopped')
        setNoticeMessage('Gravação pronta para visualizar, baixar ou abrir no editor local.')
      }

      displayStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', stopRecording, { once: true })
      })

      startedAtRef.current = getScreenRecorderNow()
      pausedAtRef.current = 0
      pausedDurationRef.current = 0
      recorder.start(1000)
      setStatus('recording')
      startTimer()
    } catch (error) {
      clearTimer()
      cleanupStreams()
      mediaRecorderRef.current = null
      chunksRef.current = []
      setStatus('error')
      setCanPauseResume(false)
      setErrorMessage(getScreenRecorderErrorMessage(error))
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording' || typeof recorder.pause !== 'function') return

    recorder.pause()
    pausedAtRef.current = getScreenRecorderNow()
    setStatus('paused')
    syncElapsedTime()
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'paused' || typeof recorder.resume !== 'function') return

    pausedDurationRef.current += pausedAtRef.current ? getScreenRecorderNow() - pausedAtRef.current : 0
    pausedAtRef.current = 0
    recorder.resume()
    setStatus('recording')
    syncElapsedTime()
  }

  function resetRecording() {
    stopRecording()
    setStatus('idle')
    setCanPauseResume(false)
    setIsCompositeMode(true)
    setErrorMessage('')
    setNoticeMessage('')
    setVisibilityWarningMessage('')
    setEditorMessage('')
    setMp4ExportMessage('')
    setIsExportingMp4(false)
    setRecordingBlob(null)
    setRecordingUrl('')
    setRecordingFileName('')
    setRecordingMimeType('')
    setElapsedMs(0)
    wasPageHiddenDuringRecordingRef.current = false
    chunksRef.current = []
    clearAnnotations()
  }

  function addAnnotation(annotation: DrawingAnnotation) {
    annotationsRef.current = [...annotationsRef.current, annotation]
    setAnnotationCount(annotationsRef.current.length)
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!isScreenRecorderDrawingTool(selectedAnnotationTool) || !isCompositeMode || !isRecording) return

    const point = normalizeScreenRecorderPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())

    if (selectedAnnotationTool === 'text') {
      event.preventDefault()
      const text = window.prompt('Texto da marcação')?.trim()
      if (!text) return

      addAnnotation({
        id: crypto.randomUUID(),
        type: 'text',
        color: selectedMarkerColor,
        width: getSelectedMarkerWidth(),
        point,
        text,
      })
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const annotation: DrawingAnnotation = selectedAnnotationTool === 'pen'
      ? {
          id: crypto.randomUUID(),
          type: 'pen',
          color: selectedMarkerColor,
          width: getSelectedMarkerWidth(),
          points: [point],
        }
      : {
          id: crypto.randomUUID(),
          type: selectedAnnotationTool,
          color: selectedMarkerColor,
          width: getSelectedMarkerWidth(),
          start: point,
          end: point,
        }

    annotationsRef.current = [...annotationsRef.current, annotation]
    activeAnnotationRef.current = annotation
    activePointerIdRef.current = event.pointerId
    setAnnotationCount(annotationsRef.current.length)
  }

  function continueDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const annotation = activeAnnotationRef.current
    if (activePointerIdRef.current !== event.pointerId || !annotation) return

    event.preventDefault()
    const point = normalizeScreenRecorderPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())

    if (annotation.type === 'pen') {
      const points = annotation.points
      const previousPoint = points[points.length - 1]

      if (previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.002) {
        return
      }

      annotation.points = [...points, point]
      return
    }

    if (annotation.type === 'circle' || annotation.type === 'rectangle') {
      annotation.end = point
    }
  }

  function finishDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) return

    event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activeAnnotationRef.current = null
    activePointerIdRef.current = null
    setAnnotationCount(annotationsRef.current.length)
  }

  function undoLastAnnotation() {
    annotationsRef.current = annotationsRef.current.slice(0, -1)
    activeAnnotationRef.current = null
    activePointerIdRef.current = null
    setAnnotationCount(annotationsRef.current.length)
  }

  async function openInVideoEditor() {
    if (!recordingBlob) return

    if (!isLocalVideoDraftStorageAvailable()) {
      setEditorMessage('Este navegador não liberou IndexedDB. Baixe o vídeo e importe manualmente no editor.')
      return
    }

    try {
      setEditorMessage('Guardando a gravação localmente para abrir no editor...')
      await clearOldLocalVideoDrafts()
      await saveLocalVideoDraft({
        source: SCREEN_RECORDER_DRAFT_SOURCE,
        blob: recordingBlob,
        name: recordingFileName || createScreenRecordingFileName(new Date(), recordingMimeType || recordingBlob.type),
      })
      window.location.assign(getLocalVideoDraftTargetUrl(SCREEN_RECORDER_DRAFT_SOURCE))
    } catch {
      setEditorMessage('Não foi possível abrir direto no editor. Baixe o vídeo e importe manualmente.')
    }
  }

  async function exportRecordingAsMp4() {
    if (!recordingBlob || isExportingMp4) return
    if (typeof File === 'undefined') {
      setMp4ExportMessage('Este navegador nao conseguiu preparar a conversao para MP4. Use Baixar WebM como fallback.')
      return
    }

    const sourceMimeType = recordingMimeType || recordingBlob.type || 'video/webm'
    const sourceName = recordingFileName || buildScreenRecordingFileName(new Date(), sourceMimeType)
    const sourceFile = new File([recordingBlob], sourceName, { type: sourceMimeType })
    const outputFileName = buildScreenRecordingFileName(new Date(), 'video/mp4')

    if (!canAttemptVideoMp4Export(sourceFile)) {
      setMp4ExportMessage('Este navegador nao conseguiu converter para MP4 agora. Use Baixar WebM ou abra no editor.')
      return
    }

    setIsExportingMp4(true)
    setMp4ExportMessage('Convertendo para MP4... A conversao pode demorar em videos longos.')

    try {
      const result = await exportVideoToMp4(sourceFile, {
        outputFileName,
        onStage: (stage) => {
          setMp4ExportMessage(
            stage === 'preparing'
              ? 'Preparando conversao para MP4...'
              : 'Convertendo para MP4... A conversao pode demorar em videos longos.',
          )
        },
      })

      if (!result.ok) {
        setMp4ExportMessage(result.message)
        return
      }

      const downloadUrl = URL.createObjectURL(result.file)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = result.file.name
      downloadLink.rel = 'noreferrer'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000)
      setMp4ExportMessage('MP4 exportado. Se o download nao comecar, tente novamente.')
    } catch {
      setMp4ExportMessage('Nao foi possivel converter para MP4 neste navegador. Baixe o WebM como fallback.')
    } finally {
      setIsExportingMp4(false)
    }
  }

  const isBusy = status === 'requesting'
  const isRecording = status === 'recording' || status === 'paused'
  const canStart = Boolean(support?.isSupported) && !isBusy && !isRecording
  const canPause = status === 'recording' && canPauseResume
  const canResume = status === 'paused' && canPauseResume
  const isRecordingMp4 = isMp4MimeType(recordingMimeType || recordingBlob?.type)
  const recordingDownloadLabel = isRecordingMp4 ? 'Baixar MP4' : 'Baixar WebM'
  const hasOverlayRecordingIntent = shouldUseScreenRecorderCompositeMode({
    hasWebcam: useWebcam,
    annotationTool: selectedAnnotationTool,
    annotationCount,
  })
  const visibleWebcamLayout = getWebcamLayoutForSize(canvasSize)
  const webcamOverlayStyle = {
    left: `${visibleWebcamLayout.x * 100}%`,
    top: `${visibleWebcamLayout.y * 100}%`,
    width: `${visibleWebcamLayout.width * 100}%`,
    height: `${visibleWebcamLayout.height * 100}%`,
  }
  const toolbarOverlayStyle = {
    left: `${annotationToolbarLayout.x * 100}%`,
    top: `${annotationToolbarLayout.y * 100}%`,
    width: `${annotationToolbarLayout.width * 100}%`,
    height: `${annotationToolbarLayout.height * 100}%`,
  }
  const webcamShapeClassName = webcamShape === 'circle' ? 'rounded-full' : 'rounded-2xl'
  const annotationToolButtons = [
    { tool: 'cursor', label: 'Mover/cursor', icon: MousePointer2 },
    { tool: 'pen', label: 'Lápis', icon: PenLine },
    { tool: 'text', label: 'Texto', icon: Type },
    { tool: 'circle', label: 'Círculo', icon: Circle },
    { tool: 'rectangle', label: 'Retângulo', icon: Square },
  ] satisfies { tool: ScreenRecorderAnnotationTool; label: string; icon: typeof MousePointer2 }[]
  const penOptionsPlacementClassName = annotationToolbarLayout.y > 0.58 ? 'bottom-full mb-2' : 'top-full mt-2'
  const penOptionsAlignClassName = annotationToolbarLayout.x > 0.42 ? 'right-0' : 'left-10'
  const markerWidthPreviewStyle = {
    height: `${Math.max(2, Math.round(selectedMarkerWidth / 2))}px`,
    width: `${Math.max(18, selectedMarkerWidth * 2)}px`,
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-3 py-5 text-white sm:px-5">
      <section className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/lab"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-100 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            EntreUS Lab
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            100% local
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white/10 bg-black p-5 shadow-2xl shadow-black/40 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-300">EntreUS Lab</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Gravador de Tela</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                Grave sua tela com microfone, webcam e baixe o vídeo direto no seu computador.
                Nada é enviado para os servidores da EntreUS.
              </p>
            </div>

            <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300 sm:min-w-72">
              <span className="font-black text-white">Privacidade</span>
              <span>As permissões são controladas pelo navegador.</span>
              <span>Ao fechar a aba antes de baixar, a gravação pode ser perdida.</span>
              <span>Gravações longas podem consumir memória do computador.</span>
            </div>
          </div>
        </div>

        {support && !support.isSupported && (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Este navegador não suporta todos os recursos necessários para gravar tela localmente.
                Tente usar Chrome, Edge ou outro navegador com suporte a MediaRecorder e captura de tela.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <aside className="space-y-4 rounded-[1.25rem] border border-white/10 bg-black p-4">
            <div>
              <h2 className="text-lg font-black">Captura</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Escolha as fontes antes de iniciar. O áudio da tela depende do navegador e da tela ou aba selecionada.
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Mic className="h-5 w-5 shrink-0 text-cyan-200" />
                <span className="min-w-0">
                  <span className="block text-sm font-black">Usar microfone</span>
                  <span className="block text-xs text-zinc-500">Solicitado somente se ativado</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={useMicrophone}
                disabled={isBusy || isRecording}
                onChange={(event) => setUseMicrophone(event.target.checked)}
                className="h-5 w-5 accent-cyan-400"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Video className="h-5 w-5 shrink-0 text-emerald-200" />
                <span className="min-w-0">
                  <span className="block text-sm font-black">Usar webcam</span>
                  <span className="block text-xs text-zinc-500">Embutida no vídeo final</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={useWebcam}
                disabled={isBusy || isRecording}
                onChange={(event) => setUseWebcam(event.target.checked)}
                className="h-5 w-5 accent-emerald-400"
              />
            </label>

            {useWebcam && (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4">
                <span className="text-sm font-black text-emerald-100">Webcam flutuante</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { id: 'rounded' as const, label: 'Retangular', icon: Square },
                    { id: 'circle' as const, label: 'Redonda', icon: Circle },
                  ].map((option) => {
                    const Icon = option.icon

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => updateWebcamShape(option.id)}
                        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-black transition ${
                          webcamShape === option.id
                            ? 'border-emerald-200 bg-emerald-300 text-zinc-950'
                            : 'border-white/10 bg-white/5 text-emerald-100 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={resetOverlayLayouts}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-emerald-100 transition hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reposicionar overlays
                </button>
                <p className="mt-3 text-xs leading-5 text-emerald-100/70">
                  Arraste a webcam no preview e use o canto inferior para redimensionar.
                </p>
              </div>
            )}

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Volume2 className="h-5 w-5 shrink-0 text-amber-200" />
                <span className="min-w-0">
                  <span className="block text-sm font-black">Áudio da tela/aba</span>
                  <span className="block text-xs text-zinc-500">Quando o navegador oferecer</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={captureScreenAudio}
                disabled={isBusy || isRecording}
                onChange={(event) => setCaptureScreenAudio(event.target.checked)}
                className="h-5 w-5 accent-amber-300"
              />
            </label>

            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-black text-zinc-200">
                <PenLine className="h-4 w-4" />
                Marcações flutuantes
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Use a barra compacta sobre o preview para cursor, lápis, texto, círculo, retângulo, desfazer e limpar.
                Ela também pode ser arrastada para perto do ponto que você estiver gravando.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-zinc-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {selectedAnnotationTool === 'cursor' ? 'Cursor ativo' : 'Marcação ativa'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {annotationCount} marcações
                </span>
              </div>
            </div>

            <p className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 px-4 py-3 text-xs leading-5 text-cyan-100/80">
              Dica: para gravações com webcam e marcações, mantenha o EntreUS aberto. Se minimizar a janela, o navegador pode congelar a parte visual.
            </p>

            <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-zinc-300">
              No navegador, os overlays aparecem no preview e no vídeo final. Para overlays por cima de qualquer janela do Windows, será necessário o futuro EntreUS Recorder Desktop.
            </p>

            <p className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-100/80">
              {SCREEN_RECORDER_SIMPLE_CAPTURE_TIP}
            </p>

            <div className="grid gap-2">
              {!isRecording && hasOverlayRecordingIntent && (
                <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs font-semibold leading-5 text-amber-100">
                  {SCREEN_RECORDER_PRE_RECORDING_VISIBILITY_TIP}
                </p>
              )}

              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={!canStart}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cyan-400 px-5 text-sm font-black text-zinc-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-5 w-5" />
                  {isBusy ? 'Aguardando permissão...' : 'Iniciar gravação'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-red-500 px-5 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-400"
                >
                  <Square className="h-5 w-5 fill-current" />
                  Parar gravação
                </button>
              )}

              {canPause && (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-black text-white transition hover:bg-white/10"
                >
                  <Pause className="h-4 w-4" />
                  Pausar
                </button>
              )}

              {canResume && (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-black text-white transition hover:bg-white/10"
                >
                  <Play className="h-4 w-4" />
                  Continuar
                </button>
              )}
            </div>
          </aside>

          <section className="min-w-0 rounded-[1.25rem] border border-white/10 bg-black p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-3 w-3 rounded-full ${
                    status === 'recording'
                      ? 'animate-pulse bg-red-400'
                      : status === 'paused'
                      ? 'bg-amber-300'
                      : status === 'stopped'
                      ? 'bg-emerald-300'
                      : 'bg-zinc-600'
                  }`}
                />
                <span className="text-sm font-black">
                  {status === 'recording'
                    ? 'Gravando'
                    : status === 'paused'
                    ? 'Pausado'
                    : status === 'stopped'
                    ? 'Gravação pronta'
                    : status === 'requesting'
                    ? 'Aguardando escolha da tela'
                    : 'Pronto para gravar'}
                </span>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black tabular-nums text-cyan-100">
                {formatRecordingDuration(elapsedMs)}
              </span>
            </div>

            <div
              ref={previewStageRef}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
              onPointerMove={updateOverlayInteraction}
              onPointerUp={finishOverlayInteraction}
              onPointerCancel={finishOverlayInteraction}
            >
              {isRecording || isBusy ? (
                <div className="relative flex min-h-[22rem] items-center justify-center sm:min-h-[30rem]">
                  {isCompositeMode ? (
                    <canvas
                      ref={compositeCanvasRef}
                      onPointerDown={startDrawing}
                      onPointerMove={continueDrawing}
                      onPointerUp={finishDrawing}
                      onPointerCancel={finishDrawing}
                      onPointerLeave={finishDrawing}
                      className={`h-full max-h-[70vh] w-full touch-none object-contain ${
                        isScreenRecorderDrawingTool(selectedAnnotationTool) ? 'cursor-crosshair' : 'cursor-default'
                      }`}
                      style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}
                      aria-label="Preview composto da gravação"
                    />
                  ) : (
                    <>
                      <video
                        ref={screenPreviewRef}
                        muted
                        playsInline
                        className="h-full max-h-[70vh] w-full object-contain"
                      />
                    </>
                  )}
                </div>
              ) : recordingUrl ? (
                <video src={recordingUrl} controls className="h-full max-h-[70vh] min-h-[22rem] w-full bg-black object-contain" />
              ) : (
                <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 text-center text-zinc-400 sm:min-h-[30rem]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-500/10 text-cyan-100">
                    <Monitor className="h-8 w-8" />
                  </div>
                  <p className="mt-4 text-xl font-black text-white">Escolha uma tela, janela ou aba</p>
                  <p className="mt-2 max-w-md text-sm leading-6">
                    O vídeo final será criado no navegador. Nenhum arquivo é enviado para API, Supabase, R2 ou servidor.
                  </p>
                </div>
              )}

              {!recordingUrl && (!isRecording || isCompositeMode) && (
                <>
                  <div
                    className="absolute z-20 flex min-h-12 items-center gap-1.5 overflow-visible rounded-2xl border border-white/15 bg-zinc-950/90 p-1.5 shadow-2xl shadow-black/50 ring-1 ring-black/40 backdrop-blur"
                    style={toolbarOverlayStyle}
                  >
                    <button
                      type="button"
                      onPointerDown={(event) => startOverlayInteraction(event, 'toolbar', 'move')}
                      className="inline-flex h-9 w-8 shrink-0 cursor-grab items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 active:cursor-grabbing"
                      aria-label="Mover barra de marcacoes"
                      title="Mover barra de marcacoes"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {annotationToolButtons.map((button) => {
                        const Icon = button.icon
                        const isActive = selectedAnnotationTool === button.tool

                        return (
                          <button
                            key={button.tool}
                            type="button"
                            onClick={() => {
                              if (button.tool === 'pen') {
                                setSelectedAnnotationTool('pen')
                                setIsPenOptionsOpen((current) => selectedAnnotationTool === 'pen' ? !current : true)
                                return
                              }

                              setSelectedAnnotationTool(button.tool)
                              setIsPenOptionsOpen(false)
                            }}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                              isActive
                                ? 'border-cyan-200 bg-cyan-300 text-zinc-950'
                                : 'border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10'
                            }`}
                            aria-label={button.label}
                            aria-pressed={isActive}
                            title={button.label}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        )
                      })}

                      <span className="mx-0.5 h-7 w-px bg-white/10" />

                      <button
                        type="button"
                        onClick={undoLastAnnotation}
                        disabled={annotationCount === 0}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Desfazer ultima marcacao"
                        title="Desfazer ultima marcacao"
                      >
                        <Undo2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={clearAnnotations}
                        disabled={annotationCount === 0}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Limpar marcacoes"
                        title="Limpar marcacoes"
                      >
                        <Eraser className="h-4 w-4" />
                      </button>
                    </div>

                    {isPenOptionsOpen && selectedAnnotationTool === 'pen' && (
                      <div
                        className={`absolute ${penOptionsPlacementClassName} ${penOptionsAlignClassName} w-56 rounded-2xl border border-white/15 bg-zinc-950/95 p-3 shadow-2xl shadow-black/50 ring-1 ring-black/40 backdrop-blur`}
                      >
                        <div className="grid grid-cols-6 gap-1.5">
                          {MARKER_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => setSelectedMarkerColor(color.value)}
                              className={`h-7 w-7 rounded-full border transition ${
                                selectedMarkerColor === color.value
                                  ? 'scale-110 border-white ring-2 ring-cyan-300'
                                  : 'border-white/25 hover:scale-105'
                              }`}
                              style={{ backgroundColor: color.value }}
                              aria-label={`Cor ${color.label}`}
                              title={color.label}
                            />
                          ))}
                        </div>

                        <div className="mt-3 grid gap-2">
                          <div className="flex h-7 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-100">
                            <span className="rounded-full bg-current" style={markerWidthPreviewStyle} />
                          </div>
                          <input
                            type="range"
                            min={MARKER_WIDTH_MIN}
                            max={MARKER_WIDTH_MAX}
                            value={selectedMarkerWidth}
                            onChange={(event) => setSelectedMarkerWidth(Number(event.target.value))}
                            className="w-full accent-cyan-300"
                            aria-label="Espessura do lápis"
                            title="Espessura do lápis"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {useWebcam && (
                    <div
                      className={`absolute z-10 overflow-hidden border border-white/60 shadow-2xl shadow-black/60 ring-1 ring-black/40 ${webcamShapeClassName} ${
                        isCompositeMode && (isRecording || isBusy) ? 'bg-transparent' : 'bg-black/70'
                      }`}
                      style={webcamOverlayStyle}
                      onPointerDown={(event) => startOverlayInteraction(event, 'webcam', 'move')}
                      title="Arraste para mover a webcam"
                    >
                      {!isCompositeMode && webcamPreviewStream ? (
                        <video
                          ref={webcamPreviewRef}
                          muted
                          playsInline
                          className={`h-full w-full object-cover ${webcamShapeClassName}`}
                        />
                      ) : !isRecording && !isBusy ? (
                        <div className={`flex h-full w-full items-center justify-center ${webcamShapeClassName}`}>
                          <Video className="h-8 w-8 text-emerald-100/80" />
                        </div>
                      ) : null}

                      <div className="pointer-events-none absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/80 backdrop-blur">
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                      <button
                        type="button"
                        onPointerDown={(event) => startOverlayInteraction(event, 'webcam', 'resize')}
                        className="absolute bottom-1.5 right-1.5 inline-flex h-8 w-8 cursor-nwse-resize items-center justify-center rounded-full border border-white/25 bg-black/60 text-white transition hover:bg-black/80"
                        aria-label="Redimensionar webcam"
                        title="Redimensionar webcam"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {(errorMessage || noticeMessage || visibilityWarningMessage || editorMessage || mp4ExportMessage || isRecording) && (
              <div className="mt-3 grid gap-2 text-sm">
                {isRecording && (
                  <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 font-semibold text-amber-100">
                    Não feche esta aba antes de parar e baixar a gravação.
                  </p>
                )}
                {visibilityWarningMessage && (
                  <p className="rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 font-semibold text-amber-100">
                    {visibilityWarningMessage}
                  </p>
                )}
                {isRecording && isCompositeMode && (
                  <p className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 font-semibold text-cyan-100">
                    Webcam e marcações aparecem no vídeo final quando o modo composto está ativo, usando posição e tamanho atuais. A webcam não fica por cima do Windows como app nativo; ela é embutida na gravação.
                  </p>
                )}
                {errorMessage && (
                  <p className="rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 font-semibold text-red-100">
                    {errorMessage}
                  </p>
                )}
                {noticeMessage && (
                  <p className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-100">
                    {noticeMessage}
                  </p>
                )}
                {editorMessage && (
                  <p className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 font-semibold text-sky-100">
                    {editorMessage}
                  </p>
                )}
                {mp4ExportMessage && (
                  <p className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 font-semibold text-cyan-100">
                    {mp4ExportMessage}
                  </p>
                )}
              </div>
            )}

            {recordingBlob && recordingUrl && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-3">
                <div className="text-xs leading-5 text-zinc-400 sm:col-span-3">
                  <p>MP4 tem melhor compatibilidade com players, celulares e editores.</p>
                  {!isRecordingMp4 && <p>WebM e o formato nativo de alguns navegadores.</p>}
                </div>
                <a
                  href={recordingUrl}
                  download={recordingFileName || createScreenRecordingFileName(new Date(), recordingMimeType || recordingBlob.type)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
                >
                  <Download className="h-4 w-4" />
                  <span>{recordingDownloadLabel}</span>
                  <span className="hidden">
                  Baixar vídeo
                  </span>
                </a>
                {!isRecordingMp4 && (
                  <button
                    type="button"
                    onClick={exportRecordingAsMp4}
                    disabled={isExportingMp4}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isExportingMp4 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {isExportingMp4 ? 'Convertendo...' : 'Exportar MP4'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={openInVideoEditor}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-sky-300/25 bg-sky-500/10 px-4 text-sm font-black text-sky-100 transition hover:bg-sky-500/20"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir no editor
                </button>
                <button
                  type="button"
                  onClick={resetRecording}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-black text-white transition hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Gravar novamente
                </button>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
