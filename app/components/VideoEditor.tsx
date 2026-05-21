'use client'

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { Loader2, Move, Music, Plus, Rocket, Type, Upload, Video, X } from 'lucide-react'

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

type CanvasSize = {
  width: number
  height: number
}

const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 42
const DEFAULT_VIDEO_DURATION = 10
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`

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

export default function VideoEditor() {
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [currentTime, setCurrentTime] = useState(0)
  const [filter, setFilter] = useState<VideoFilter>('normal')
  const [videoVolume, setVideoVolume] = useState(1)
  const [musicVolume, setMusicVolume] = useState(0.45)
  const [isReady, setIsReady] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderMessage, setRenderMessage] = useState('')

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
  }, [canvasSize, overlays, activeOverlayId, currentTime])

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

    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setVideoName(file.name)
    setOverlays([])
    setActiveOverlayId(null)
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
        context.strokeStyle = 'rgba(96, 165, 250, 0.95)'
        context.lineWidth = 3
        context.strokeRect(
          overlay.x - 8,
          overlay.y - 8,
          metrics.width + 16,
          overlay.fontSize + 16
        )
      }
      })
  }

  function addTextOverlay() {
    const cleanText = textValue.trim()
    if (!cleanText) return

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
    setTextValue('')
  }

  function findOverlayAtPoint(point: { x: number; y: number }) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!context) return null

    for (const overlay of [...overlays].reverse()) {
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

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const point = getCanvasPoint(event, canvas)
    const overlay = findOverlayAtPoint(point)

    if (!overlay) {
      setActiveOverlayId(null)
      return
    }

    canvas.setPointerCapture(event.pointerId)
    setActiveOverlayId(overlay.id)
    setDragOffset({
      x: point.x - overlay.x,
      y: point.y - overlay.y,
    })
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!activeOverlayId) return

    const canvas = canvasRef.current
    if (!canvas || !canvas.hasPointerCapture(event.pointerId)) return

    const point = getCanvasPoint(event, canvas)

    setOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== activeOverlayId) return overlay

        return {
          ...overlay,
          x: clamp(point.x - dragOffset.x, 0, canvas.width),
          y: clamp(point.y - dragOffset.y, 0, canvas.height),
        }
      })
    )
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
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

  function exportCurrentFrame() {
    const video = videoRef.current
    const overlayCanvas = canvasRef.current
    if (!video || !overlayCanvas) return

    const output = document.createElement('canvas')
    output.width = overlayCanvas.width
    output.height = overlayCanvas.height

    const context = output.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, output.width, output.height)
    context.drawImage(overlayCanvas, 0, 0)

    const link = document.createElement('a')
    link.href = output.toDataURL('image/png')
    link.download = 'entreus-video-frame.png'
    link.click()
  }

  async function getFFmpeg() {
    if (ffmpegRef.current?.loaded) {
      setIsReady(true)
      return ffmpegRef.current
    }

    setRenderMessage('Carregando motor de video...')

    const ffmpeg = new FFmpeg()
    ffmpegRef.current = ffmpeg

    ffmpeg.on('progress', ({ progress }) => {
      setRenderProgress(clamp(Math.round(progress * 100), 0, 100))
    })

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    setIsReady(true)
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
    setRenderMessage(isReady ? 'Preparando arquivos...' : 'Carregando motor de video...')

    const inputVideoName = `input.${getFileExtension(videoFile.name, 'mp4')}`
    const inputAudioName = audioFile ? `music.${getFileExtension(audioFile.name, 'mp3')}` : null
    const outputName = 'entreus_output.mp4'
    const filesToClean = [inputVideoName, outputName, ...(inputAudioName ? [inputAudioName] : [])]

    try {
      const ffmpeg = await getFFmpeg()

      await cleanupFfmpegFiles(ffmpeg, filesToClean)

      setRenderMessage('Enviando arquivos para o FFmpeg...')
      await ffmpeg.writeFile(inputVideoName, await fetchFile(videoFile))

      if (audioFile && inputAudioName) {
        await ffmpeg.writeFile(inputAudioName, await fetchFile(audioFile))
      }

      setRenderMessage('Renderizando video final...')

      let exitCode = await ffmpeg.exec(buildRenderArgs(inputVideoName, inputAudioName))

      if (exitCode !== 0) {
        setRenderMessage('Ajustando mixagem e tentando novamente...')
        await cleanupFfmpegFiles(ffmpeg, [outputName])
        exitCode = await ffmpeg.exec(buildFallbackRenderArgs(inputVideoName, inputAudioName))
      }

      if (exitCode !== 0) {
        throw new Error('FFmpeg retornou erro ao renderizar o video.')
      }

      setRenderMessage('Preparando download...')
      const outputData = await ffmpeg.readFile(outputName)
      const outputBytes =
        typeof outputData === 'string'
          ? new TextEncoder().encode(outputData)
          : outputData
      const outputArray = new Uint8Array(outputBytes)
      const outputBlob = new Blob([outputArray.buffer], { type: 'video/mp4' })
      const outputUrl = URL.createObjectURL(outputBlob)
      const link = document.createElement('a')
      link.href = outputUrl
      link.download = outputName
      link.click()
      URL.revokeObjectURL(outputUrl)
      setRenderProgress(100)
      setRenderMessage('Video renderizado com sucesso.')

      await cleanupFfmpegFiles(ffmpeg, filesToClean)
    } catch (error) {
      console.error('Erro ao renderizar video final:', error)
      setRenderMessage('Nao foi possivel renderizar o video final neste navegador.')
    } finally {
      setIsRendering(false)
    }
  }

  const activeOverlay = overlays.find((overlay) => overlay.id === activeOverlayId)
  const selectedFilter = videoFilters.find((item) => item.value === filter) || videoFilters[0]
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <section className="w-full rounded-[2rem] border border-white/10 bg-zinc-950 p-4 text-white shadow-2xl shadow-black/30 ring-1 ring-white/5 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
                Video Studio
              </p>
              <h2 className="mt-1 text-2xl font-black">Editor de texto em video</h2>
            </div>

            {videoUrl && (
              <button
                type="button"
                onClick={togglePlayback}
                className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
              >
                {isPlaying ? 'Pausar' : 'Reproduzir'}
              </button>
            )}
          </div>

          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
            {videoUrl ? (
              <div
                className="relative mx-auto w-full max-h-[70vh]"
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
              </div>
            ) : (
              <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 text-center text-zinc-400">
                <Video className="h-12 w-12 text-blue-200" />
                <p className="mt-4 text-lg font-black text-white">Carregue um video para comecar</p>
                <p className="mt-2 max-w-md text-sm leading-6">
                  O canvas aparece sobre o player e o texto pode ser arrastado diretamente no preview.
                </p>
              </div>
            )}
          </div>

          {videoName && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-500">
                <span className="truncate">
                  Arquivo: <span className="text-zinc-300">{videoName}</span>
                </span>
                <span className="shrink-0 text-zinc-400">
                  {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max={duration}
                step="0.05"
                value={currentTime}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="mt-2 w-full accent-blue-500"
                aria-label="Linha do tempo do video"
              />
            </div>
          )}
        </div>

        <aside className="rounded-[1.5rem] border border-white/10 bg-black/45 p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-300/30 bg-blue-500/10 px-4 py-6 text-center transition hover:bg-blue-500/15">
            <Upload className="h-7 w-7 text-blue-200" />
            <span className="mt-3 text-sm font-black">Selecionar video</span>
            <span className="mt-1 text-xs text-blue-100/70">MP4, MOV, WebM e formatos suportados pelo navegador</span>
            <input
              type="file"
              accept="video/*,.mp4,.mov,.webm,.m4v"
              onChange={handleVideoChange}
              className="sr-only"
            />
          </label>

          <div className="mt-5 space-y-4">
            <section className="rounded-2xl border border-white/10 bg-zinc-950 p-3">
              <div className="flex items-center gap-2 font-black text-zinc-200">
                <Music className="h-4 w-4 text-blue-200" />
                Trilha Sonora
              </div>

              <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/30 bg-emerald-500/10 px-4 py-5 text-center transition hover:bg-emerald-500/15">
                <Upload className="h-6 w-6 text-emerald-200" />
                <span className="mt-2 text-sm font-black">Selecionar musica</span>
                <span className="mt-1 text-xs text-emerald-100/70">MP3, WAV, M4A e formatos suportados pelo navegador</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                  onChange={handleAudioChange}
                  className="sr-only"
                />
              </label>

              {audioName && (
                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3">
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

              <label className="mt-4 block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-zinc-300">Volume do Video Original</span>
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

              <label className="mt-4 block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-zinc-300">Volume da Musica de Fundo</span>
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
            </section>

            <div>
              <span className="text-sm font-black text-zinc-200">Filtro visual</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
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

            <label className="block">
              <span className="text-sm font-black text-zinc-200">Texto</span>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  placeholder="Digite uma frase"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
                />
                <button
                  type="button"
                  onClick={addTextOverlay}
                  disabled={!textValue.trim()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Adicionar texto"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-black text-zinc-200">Tamanho da fonte</span>
              <input
                type="range"
                min="18"
                max="120"
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="mt-3 w-full accent-blue-500"
              />
              <span className="mt-1 block text-xs font-semibold text-zinc-500">{fontSize}px</span>
            </label>

            <label className="block">
              <span className="text-sm font-black text-zinc-200">Cor</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(event) => setTextColor(event.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                />
                <span className="text-sm font-semibold text-zinc-400">{textColor.toUpperCase()}</span>
              </div>
            </label>

            {activeOverlay && (
              <div className="rounded-2xl border border-blue-300/20 bg-blue-500/10 p-3 text-sm text-blue-50">
                <div className="flex items-center gap-2 font-black">
                  <Move className="h-4 w-4" />
                  Texto selecionado
                </div>
                <p className="mt-2 break-words text-blue-100/80">{activeOverlay.text}</p>
                <p className="mt-2 text-xs text-blue-100/60">
                  X {Math.round(activeOverlay.x)} / Y {Math.round(activeOverlay.y)}
                </p>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black text-blue-100">
                    <span>Timeline do texto</span>
                    <span>{activeOverlay.startTime.toFixed(1)}s - {activeOverlay.endTime.toFixed(1)}s</span>
                  </div>

                  <div className="relative mb-4 h-2 rounded-full bg-white/10">
                    <div
                      className="absolute top-0 h-full rounded-full bg-emerald-400"
                      style={{
                        left: `${duration > 0 ? (activeOverlay.startTime / duration) * 100 : 0}%`,
                        width: `${duration > 0 ? ((activeOverlay.endTime - activeOverlay.startTime) / duration) * 100 : 0}%`,
                      }}
                    />
                    <div
                      className="absolute -top-1 h-4 w-1 rounded-full bg-blue-200"
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>

                  <label className="block">
                    <span className="text-xs font-bold text-blue-100/70">Entrada</span>
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
                    <span className="text-xs font-bold text-blue-100/70">Saida</span>
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
              </div>
            )}

            <button
              type="button"
              onClick={renderFinalVideo}
              disabled={!videoFile || isRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Renderizar Video Final
            </button>

            {(isRendering || renderMessage) && (
              <div className="rounded-2xl border border-blue-300/20 bg-blue-500/10 p-3">
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
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-3 text-xs leading-5 text-zinc-500">
              <div className="mb-1 flex items-center gap-2 font-black text-zinc-300">
                <Type className="h-4 w-4" />
                Dica
              </div>
              Clique no texto no preview e arraste para reposicionar. O botao salvar exporta o frame atual com o overlay.
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
