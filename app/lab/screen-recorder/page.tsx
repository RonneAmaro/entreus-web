'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eraser,
  ExternalLink,
  Mic,
  Monitor,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Video,
  Volume2,
} from 'lucide-react'
import {
  createScreenRecordingFileName,
  formatRecordingDuration,
  getBestScreenRecorderMimeType,
  getScreenRecorderErrorMessage,
  getScreenRecorderSupport,
  type ScreenRecorderSupport,
} from '@/lib/screen-recorder'
import {
  clearOldLocalVideoDrafts,
  getLocalVideoDraftTargetUrl,
  isLocalVideoDraftStorageAvailable,
  saveLocalVideoDraft,
  SCREEN_RECORDER_DRAFT_SOURCE,
} from '@/lib/local-video-drafts'

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error'

const MARKER_COLORS = ['#f97316', '#22c55e', '#38bdf8', '#ffffff']

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export default function LabScreenRecorderPage() {
  const screenPreviewRef = useRef<HTMLVideoElement | null>(null)
  const webcamPreviewRef = useRef<HTMLVideoElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([])
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
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null)
  const [webcamPreviewStream, setWebcamPreviewStream] = useState<MediaStream | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingFileName, setRecordingFileName] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [editorMessage, setEditorMessage] = useState('')

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

  function cleanupStreams() {
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

  function buildRecorderStream(displayStream: MediaStream, microphoneStream: MediaStream | null) {
    const videoTracks = displayStream.getVideoTracks()
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
    setStatus('requesting')
    setRecordingBlob(null)
    setRecordingUrl('')
    setRecordingFileName('')
    setCanPauseResume(false)
    setElapsedMs(0)
    chunksRef.current = []

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
      setScreenPreviewStream(displayStream)

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
      setWebcamPreviewStream(cameraStream)

      const recorderStream = buildRecorderStream(displayStream, microphoneStream)
      recorderStreamRef.current = recorderStream

      const mimeType = getBestScreenRecorderMimeType(window.MediaRecorder)
      const recorder = mimeType ? new MediaRecorder(recorderStream, { mimeType }) : new MediaRecorder(recorderStream)
      const nextFileName = createScreenRecordingFileName()

      mediaRecorderRef.current = recorder
      setCanPauseResume(typeof recorder.pause === 'function' && typeof recorder.resume === 'function')
      setRecordingFileName(nextFileName)

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
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        cleanupStreams()

        if (blob.size <= 0) {
          setStatus('error')
          setErrorMessage('A gravação terminou sem dados. Tente selecionar outra tela ou aba.')
          return
        }

        setElapsedMs(getCurrentElapsedMs())
        setRecordingBlob(blob)
        setRecordingUrl(URL.createObjectURL(blob))
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
    setErrorMessage('')
    setNoticeMessage('')
    setEditorMessage('')
    setRecordingBlob(null)
    setRecordingUrl('')
    setRecordingFileName('')
    setElapsedMs(0)
    chunksRef.current = []
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
        name: recordingFileName || createScreenRecordingFileName(),
      })
      window.location.assign(getLocalVideoDraftTargetUrl(SCREEN_RECORDER_DRAFT_SOURCE))
    } catch {
      setEditorMessage('Não foi possível abrir direto no editor. Baixe o vídeo e importe manualmente.')
    }
  }

  const isBusy = status === 'requesting'
  const isRecording = status === 'recording' || status === 'paused'
  const canStart = Boolean(support?.isSupported) && !isBusy && !isRecording
  const canPause = status === 'recording' && canPauseResume
  const canResume = status === 'paused' && canPauseResume

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
                  <span className="block text-xs text-zinc-500">Preview local nesta versão</span>
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
                  disabled
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-zinc-500"
                >
                  <PenLine className="h-4 w-4" />
                  Caneta
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-zinc-500"
                >
                  <Eraser className="h-4 w-4" />
                  Limpar
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                {MARKER_COLORS.map((color) => (
                  <span
                    key={color}
                    className="h-6 w-6 rounded-full border border-white/20 opacity-50"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">Marcações na tela entram no próximo pacote.</p>
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

            {(errorMessage || noticeMessage || editorMessage || isRecording) && (
              <div className="mt-3 grid gap-2 text-sm">
                {isRecording && (
                  <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 font-semibold text-amber-100">
                    Não feche esta aba antes de parar e baixar a gravação.
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
              </div>
            )}

            {recordingBlob && recordingUrl && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-3">
                <a
                  href={recordingUrl}
                  download={recordingFileName || createScreenRecordingFileName()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
                >
                  <Download className="h-4 w-4" />
                  Baixar vídeo
                </a>
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
