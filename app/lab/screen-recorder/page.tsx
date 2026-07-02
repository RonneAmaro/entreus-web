'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eraser,
  ExternalLink,
  Loader2,
  Mic,
  Monitor,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Undo2,
  Video,
  Volume2,
} from 'lucide-react'
import {
  SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE,
  SCREEN_RECORDER_CANVAS_FPS,
  buildScreenRecordingFileName,
  createScreenRecordingFileName,
  formatRecordingDuration,
  getBestScreenRecorderMimeType,
  getScreenRecorderCanvasSize,
  getScreenRecorderContainRect,
  getScreenRecorderErrorMessage,
  getScreenRecorderSupport,
  getWebcamOverlayRect,
  isMp4MimeType,
  normalizeScreenRecorderPoint,
  type ScreenRecorderPoint,
  type ScreenRecorderSize,
  type ScreenRecorderSupport,
  type ScreenRecorderWebcamPosition,
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
type MarkerSize = 'thin' | 'medium' | 'thick'

type DrawingStroke = {
  id: string
  color: string
  width: number
  points: ScreenRecorderPoint[]
}

const MARKER_COLORS = [
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Amarelo', value: '#facc15' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#38bdf8' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Preto', value: '#020617' },
]
const MARKER_SIZES: { id: MarkerSize; label: string; width: number }[] = [
  { id: 'thin', label: 'Fina', width: 5 },
  { id: 'medium', label: 'Média', width: 9 },
  { id: 'thick', label: 'Grossa', width: 15 },
]
const WEBCAM_POSITION_OPTIONS: { id: ScreenRecorderWebcamPosition; label: string }[] = [
  { id: 'bottom-right', label: 'Inf. direita' },
  { id: 'bottom-left', label: 'Inf. esquerda' },
  { id: 'top-right', label: 'Sup. direita' },
  { id: 'top-left', label: 'Sup. esquerda' },
]

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export default function LabScreenRecorderPage() {
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
  const strokesRef = useRef<DrawingStroke[]>([])
  const activeStrokeRef = useRef<DrawingStroke | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const pausedAtRef = useRef(0)
  const pausedDurationRef = useRef(0)

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
  const [webcamPosition, setWebcamPosition] = useState<ScreenRecorderWebcamPosition>('bottom-right')
  const [penEnabled, setPenEnabled] = useState(false)
  const [selectedMarkerColor, setSelectedMarkerColor] = useState(MARKER_COLORS[0].value)
  const [selectedMarkerSize, setSelectedMarkerSize] = useState<MarkerSize>('medium')
  const [strokeCount, setStrokeCount] = useState(0)
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null)
  const [webcamPreviewStream, setWebcamPreviewStream] = useState<MediaStream | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingFileName, setRecordingFileName] = useState('')
  const [recordingMimeType, setRecordingMimeType] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
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

  function clearTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function getCurrentElapsedMs() {
    if (!startedAtRef.current) return 0

    const now = pausedAtRef.current || Date.now()
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
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
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

  function drawStrokes(context: CanvasRenderingContext2D, width: number, height: number) {
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 0) continue

      context.save()
      context.strokeStyle = stroke.color
      context.fillStyle = stroke.color
      context.lineWidth = stroke.width
      context.lineCap = 'round'
      context.lineJoin = 'round'

      if (stroke.points.length === 1) {
        const point = stroke.points[0]
        context.beginPath()
        context.arc(point.x * width, point.y * height, stroke.width / 2, 0, Math.PI * 2)
        context.fill()
        context.restore()
        continue
      }

      context.beginPath()
      stroke.points.forEach((point, index) => {
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
      const webcamRect = getWebcamOverlayRect({
        canvasSize: { width, height },
        position: webcamPosition,
        aspectRatio: webcamVideo.videoWidth && webcamVideo.videoHeight
          ? webcamVideo.videoWidth / webcamVideo.videoHeight
          : 16 / 9,
      })

      context.save()
      context.shadowColor = 'rgba(0, 0, 0, 0.55)'
      context.shadowBlur = Math.max(10, Math.round(width * 0.012))
      addRoundedRectPath(context, webcamRect.x, webcamRect.y, webcamRect.width, webcamRect.height, Math.round(webcamRect.width * 0.08))
      context.fillStyle = '#000000'
      context.fill()
      context.clip()
      drawVideoCover(context, webcamVideo, webcamRect.x, webcamRect.y, webcamRect.width, webcamRect.height)
      context.restore()

      context.save()
      context.strokeStyle = 'rgba(255, 255, 255, 0.72)'
      context.lineWidth = Math.max(2, Math.round(width * 0.0015))
      addRoundedRectPath(context, webcamRect.x, webcamRect.y, webcamRect.width, webcamRect.height, Math.round(webcamRect.width * 0.08))
      context.stroke()
      context.restore()
    }

    drawStrokes(context, width, height)
  }

  function startCompositeLoop() {
    stopCompositeLoop()

    const renderFrame = () => {
      drawCompositeFrame()
      animationFrameRef.current = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()
  }

  function clearDrawingStrokes() {
    strokesRef.current = []
    activeStrokeRef.current = null
    activePointerIdRef.current = null
    setStrokeCount(0)
  }

  function getSelectedMarkerWidth() {
    return MARKER_SIZES.find((size) => size.id === selectedMarkerSize)?.width || 9
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
      setNoticeMessage('Seu navegador não conseguiu misturar os áudios. A gravação usará apenas uma fonte de áudio.')
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
    const canvas = compositeCanvasRef.current

    if (!canvas || typeof canvas.captureStream !== 'function') {
      setIsCompositeMode(false)
      setNoticeMessage(SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE)
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

    setNoticeMessage(
      'Modo composto ativo: webcam e marcações aparecem no vídeo final. A webcam não fica por cima do Windows; ela é embutida na gravação.',
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

  async function startRecording() {
    if (status === 'recording' || status === 'paused' || status === 'requesting') return

    setErrorMessage('')
    setNoticeMessage('')
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
    chunksRef.current = []
    clearDrawingStrokes()

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
      screenStreamRef.current = displayStream

      const microphoneStream = useMicrophone
        ? await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
        : null
      micStreamRef.current = microphoneStream

      const cameraStream = useWebcam
        ? await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
            },
          })
        : null
      webcamStreamRef.current = cameraStream

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
        setErrorMessage(getScreenRecorderErrorMessage(event))
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

      startedAtRef.current = Date.now()
      pausedAtRef.current = 0
      pausedDurationRef.current = 0
      recorder.start(1000)
      setStatus('recording')
      startTimer()
    } catch (error) {
      clearTimer()
      cleanupStreams()
      setStatus('error')
      setCanPauseResume(false)
      setErrorMessage(getScreenRecorderErrorMessage(error))
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording' || typeof recorder.pause !== 'function') return

    recorder.pause()
    pausedAtRef.current = Date.now()
    setStatus('paused')
    syncElapsedTime()
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'paused' || typeof recorder.resume !== 'function') return

    pausedDurationRef.current += pausedAtRef.current ? Date.now() - pausedAtRef.current : 0
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
    setEditorMessage('')
    setMp4ExportMessage('')
    setIsExportingMp4(false)
    setRecordingBlob(null)
    setRecordingUrl('')
    setRecordingFileName('')
    setRecordingMimeType('')
    setElapsedMs(0)
    chunksRef.current = []
    clearDrawingStrokes()
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!penEnabled || !isCompositeMode || !isRecording) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = normalizeScreenRecorderPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    const stroke: DrawingStroke = {
      id: crypto.randomUUID(),
      color: selectedMarkerColor,
      width: getSelectedMarkerWidth(),
      points: [point],
    }

    strokesRef.current = [...strokesRef.current, stroke]
    activeStrokeRef.current = stroke
    activePointerIdRef.current = event.pointerId
    setStrokeCount(strokesRef.current.length)
  }

  function continueDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return

    event.preventDefault()
    const point = normalizeScreenRecorderPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    const points = activeStrokeRef.current.points
    const previousPoint = points[points.length - 1]

    if (previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.002) {
      return
    }

    activeStrokeRef.current.points = [...points, point]
  }

  function finishDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) return

    event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activeStrokeRef.current = null
    activePointerIdRef.current = null
    setStrokeCount(strokesRef.current.length)
  }

  function undoLastStroke() {
    strokesRef.current = strokesRef.current.slice(0, -1)
    activeStrokeRef.current = null
    activePointerIdRef.current = null
    setStrokeCount(strokesRef.current.length)
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
                <span className="text-sm font-black text-emerald-100">Posição da webcam</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {WEBCAM_POSITION_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isBusy || isRecording}
                      onClick={() => setWebcamPosition(option.id)}
                      className={`h-9 rounded-full border px-3 text-xs font-black transition ${
                        webcamPosition === option.id
                          ? 'border-emerald-200 bg-emerald-300 text-zinc-950'
                          : 'border-white/10 bg-white/5 text-emerald-100 hover:bg-white/10'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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
                Marcações
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPenEnabled((current) => !current)}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-black transition ${
                    penEnabled
                      ? 'border-cyan-200 bg-cyan-300 text-zinc-950'
                      : 'border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10'
                  }`}
                >
                  <PenLine className="h-4 w-4" />
                  {penEnabled ? 'Caneta ligada' : 'Caneta'}
                </button>
                <button
                  type="button"
                  onClick={undoLastStroke}
                  disabled={strokeCount === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" />
                  Desfazer
                </button>
                <button
                  type="button"
                  onClick={clearDrawingStrokes}
                  disabled={strokeCount === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Eraser className="h-4 w-4" />
                  Limpar
                </button>
              </div>
              <div className="mt-3 flex gap-2">
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
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {MARKER_SIZES.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setSelectedMarkerSize(size.id)}
                    className={`h-8 rounded-full border px-2 text-xs font-black transition ${
                      selectedMarkerSize === size.id
                        ? 'border-cyan-200 bg-cyan-300 text-zinc-950'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Desenhe sobre o preview composto durante a gravação para embutir as marcações no vídeo final.
              </p>
            </div>

            <div className="grid gap-2">
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

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
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
                        penEnabled ? 'cursor-crosshair' : 'cursor-default'
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
                      {useWebcam && webcamPreviewStream && (
                        <video
                          ref={webcamPreviewRef}
                          muted
                          playsInline
                          className="absolute bottom-4 right-4 h-28 w-40 rounded-2xl border border-white/20 bg-black object-cover shadow-2xl shadow-black sm:h-36 sm:w-56"
                        />
                      )}
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
            </div>

            {(errorMessage || noticeMessage || editorMessage || mp4ExportMessage || isRecording) && (
              <div className="mt-3 grid gap-2 text-sm">
                {isRecording && (
                  <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 font-semibold text-amber-100">
                    Não feche esta aba antes de parar e baixar a gravação.
                  </p>
                )}
                {isRecording && isCompositeMode && (
                  <p className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 font-semibold text-cyan-100">
                    Webcam e marcações aparecem no vídeo final quando o modo composto está ativo. A webcam não fica por cima do Windows como app nativo; ela é embutida na gravação.
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
