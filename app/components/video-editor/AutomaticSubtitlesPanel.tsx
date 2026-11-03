'use client'

import { Captions, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  filterWhisperSegmentsByAudio,
  isWhisperSilence,
  whisperSegmentsToSubtitles,
  type PreparedWhisperAudio,
  type WhisperTranscriptSegment,
} from '@/lib/video-editor/transcription'
import {
  createWhisperWorker,
  resolveWhisperAssets,
  WHISPER_INITIAL_DOWNLOAD_BYTES,
  WHISPER_MAX_DURATION_SECONDS,
  type WhisperWorkerMessage,
  type WhisperWorkerSession,
  type WhisperWorkerStage,
} from '@/lib/video-editor/whisper-runtime'
import type { SubtitleSegment } from '@/lib/video-editor/subtitles'

type PanelState = 'idle' | 'confirm' | 'running' | 'review' | 'silent' | 'cancelled' | 'error'
type ProgressStage = 'preparing-audio' | WhisperWorkerStage

type AutomaticSubtitlesPanelProps = {
  canTranscribe: boolean
  projectId: string
  firstOrder: number
  timelineDuration: number
  sourceDescription: string
  prepareAudio: (signal: AbortSignal) => Promise<PreparedWhisperAudio>
  onConfirm: (segments: SubtitleSegment[]) => void
}

const STAGE_LABELS: Record<ProgressStage, string> = {
  'preparing-audio': 'Preparando o áudio localmente…',
  'loading-runtime': 'Verificando o motor local…',
  'loading-model': 'Carregando o modelo Whisper Tiny…',
  'initializing-model': 'Inicializando o modelo…',
  transcribing: 'Transcrevendo no seu dispositivo…',
  'cleaning-up': 'Liberando memória…',
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Não foi possível gerar as legendas automaticamente.'
}

export default function AutomaticSubtitlesPanel({
  canTranscribe,
  projectId,
  firstOrder,
  timelineDuration,
  sourceDescription,
  prepareAudio,
  onConfirm,
}: AutomaticSubtitlesPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [stage, setStage] = useState<ProgressStage>('preparing-audio')
  const [segments, setSegments] = useState<WhisperTranscriptSegment[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [cacheMessage, setCacheMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<WhisperWorkerSession | null>(null)
  const runRef = useRef(0)
  const runningRef = useRef(false)

  function disposeSession() {
    sessionRef.current?.dispose()
    sessionRef.current = null
  }

  function cancel() {
    runRef.current += 1
    runningRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    disposeSession()
    setPanelState('cancelled')
    setCacheMessage('')
  }

  useEffect(() => () => {
    runRef.current += 1
    runningRef.current = false
    abortRef.current?.abort()
    sessionRef.current?.dispose()
  }, [])

  async function generate() {
    if (runningRef.current) return
    runningRef.current = true
    const run = runRef.current + 1
    runRef.current = run
    const controller = new AbortController()
    abortRef.current = controller
    setPanelState('running')
    setStage('preparing-audio')
    setErrorMessage('')
    setCacheMessage('')
    setSegments([])

    try {
      if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function' || typeof Worker !== 'function') {
        throw new Error('O navegador não oferece o isolamento necessário para executar o Whisper local.')
      }
      const prepared = await prepareAudio(controller.signal)
      if (run !== runRef.current) return
      if (isWhisperSilence(prepared.pcm)) {
        setPanelState('silent')
        return
      }

      setStage('loading-runtime')
      const assets = resolveWhisperAssets()
      const session = await createWhisperWorker(assets, controller.signal)
      if (run !== runRef.current) {
        session.dispose()
        return
      }
      sessionRef.current = session
      setCacheMessage(session.runtimeCacheHit ? 'Motor local reutilizado do cache.' : '')

      const result = await new Promise<WhisperTranscriptSegment[]>((resolve, reject) => {
        const { worker } = session
        worker.onerror = (event) => reject(new Error(event.message || 'O Worker local do Whisper falhou.'))
        worker.onmessage = (event: MessageEvent<WhisperWorkerMessage>) => {
          const message = event.data
          if (message.taskId !== String(run)) return
          if (message.type === 'stage') {
            setStage(message.stage)
            if (message.stage === 'loading-model' && message.cacheHit) {
              setCacheMessage('Modelo Whisper Tiny reutilizado do cache local.')
            }
            return
          }
          if (message.type === 'error') reject(new Error(message.message))
          if (message.type === 'result') resolve(message.segments)
        }
        const workerPcm = prepared.pcm.slice()
        worker.postMessage({
          type: 'start',
          taskId: String(run),
          pcm: workerPcm.buffer,
          sampleCount: workerPcm.length,
          language: 'pt',
          threads: 1,
          assets,
          runtimeCacheHit: session.runtimeCacheHit,
        }, [workerPcm.buffer])
      })
      if (run !== runRef.current) return
      const audibleSegments = filterWhisperSegmentsByAudio(result, prepared.pcm)
      setSegments(audibleSegments)
      setPanelState(audibleSegments.length ? 'review' : 'silent')
    } catch (error) {
      if (controller.signal.aborted || run !== runRef.current) return
      setErrorMessage(readableError(error))
      setPanelState('error')
    } finally {
      if (run === runRef.current) {
        runningRef.current = false
        abortRef.current = null
        disposeSession()
      }
    }
  }

  function confirmSegments() {
    try {
      const generated = whisperSegmentsToSubtitles(segments, projectId, firstOrder)
      onConfirm(generated)
      setSegments([])
      setPanelState('idle')
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(readableError(error))
      setPanelState('error')
    }
  }

  function reset() {
    runningRef.current = false
    setSegments([])
    setErrorMessage('')
    setCacheMessage('')
    setPanelState('idle')
  }

  return (
    <section className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-3" aria-label="Legendas automáticas locais">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-sky-400/15 p-2 text-sky-200"><Captions className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Whisper Tiny local</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Gera uma versão revisável a partir de {sourceDescription}. Nada é enviado para uma API.</p>
        </div>
      </div>

      {panelState === 'idle' && (
        <button
          type="button"
          onClick={() => setPanelState('confirm')}
          disabled={!canTranscribe || timelineDuration > WHISPER_MAX_DURATION_SECONDS}
          className="mt-3 w-full rounded-xl bg-sky-400 px-3 py-2.5 text-sm font-black text-sky-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Gerar legendas automaticamente
        </button>
      )}

      {panelState === 'idle' && !canTranscribe && <p className="mt-2 text-xs text-amber-200">Adicione uma mídia com áudio à timeline.</p>}
      {panelState === 'idle' && timelineDuration > WHISPER_MAX_DURATION_SECONDS && <p className="mt-2 text-xs text-amber-200">Nesta versão, a timeline precisa ter no máximo 2 minutos.</p>}

      {panelState === 'confirm' && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-zinc-950/80 p-3 text-xs leading-5 text-zinc-300">
          <div className="flex items-center gap-2 font-black text-emerald-200"><ShieldCheck className="h-4 w-4" /> Confirme o processamento local</div>
          <p>O navegador baixará cerca de {formatBytes(WHISPER_INITIAL_DOWNLOAD_BYTES)} uma vez e guardará os artefatos verificados no cache. O áudio permanece neste dispositivo.</p>
          <p>A transcrição usa CPU e cerca de 650 MB de memória durante a execução; em computadores modestos, pode levar alguns minutos. Limite atual: 2 minutos.</p>
          <p>Motor e modelo de código aberto: <a className="underline" href="https://github.com/ggerganov/whisper.cpp/blob/master/LICENSE" target="_blank" rel="noreferrer">whisper.cpp (MIT)</a> e <a className="underline" href="https://github.com/openai/whisper/blob/main/LICENSE" target="_blank" rel="noreferrer">Whisper (MIT)</a>.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void generate()} className="flex-1 rounded-lg bg-sky-400 px-3 py-2 font-black text-sky-950">Baixar e continuar</button>
            <button type="button" onClick={reset} className="rounded-lg border border-white/20 px-3 py-2 font-bold">Agora não</button>
          </div>
        </div>
      )}

      {panelState === 'running' && (
        <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/80 p-3" aria-live="polite">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-100"><Loader2 className="h-4 w-4 animate-spin" /> {STAGE_LABELS[stage]}</div>
          {cacheMessage && <p className="mt-2 text-[11px] text-emerald-200">{cacheMessage}</p>}
          <p className="mt-2 text-[11px] text-zinc-500">O progresso exibido representa etapas reais; o Whisper não informa porcentagem durante a inferência.</p>
          <button type="button" onClick={cancel} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-300/40 px-3 py-2 text-xs font-bold text-red-200"><X className="h-3.5 w-3.5" /> Cancelar</button>
        </div>
      )}

      {panelState === 'review' && (
        <div className="mt-3 space-y-3" data-testid="whisper-review">
          <p className="text-xs font-bold text-emerald-200">Transcrição pronta. Revise antes de adicionar à timeline.</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {segments.map((segment, index) => (
              <div key={`${index}-${segment.startTime}`} className="rounded-xl border border-white/10 bg-zinc-950/80 p-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <label className="text-[10px] text-zinc-400">Início<input aria-label={`Início da transcrição ${index + 1}`} type="number" min="0" step="0.01" value={segment.startTime} onChange={(event) => { const value = event.currentTarget.valueAsNumber; setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: value } : item)) }} className="mt-1 w-full rounded bg-black p-1.5 text-xs text-white" /></label>
                  <label className="text-[10px] text-zinc-400">Fim<input aria-label={`Fim da transcrição ${index + 1}`} type="number" min="0" step="0.01" value={segment.endTime} onChange={(event) => { const value = event.currentTarget.valueAsNumber; setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: value } : item)) }} className="mt-1 w-full rounded bg-black p-1.5 text-xs text-white" /></label>
                  <button type="button" aria-label={`Remover transcrição ${index + 1}`} onClick={() => setSegments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="self-end rounded p-2 text-red-200"><X className="h-4 w-4" /></button>
                </div>
                <textarea aria-label={`Texto da transcrição ${index + 1}`} value={segment.text} onChange={(event) => { const value = event.currentTarget.value; setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: value } : item)) }} rows={2} className="mt-2 w-full rounded bg-black p-2 text-xs text-white" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmSegments} disabled={!segments.length} className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-40">Confirmar e adicionar</button>
            <button type="button" onClick={reset} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold">Descartar</button>
          </div>
        </div>
      )}

      {panelState === 'silent' && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100"><p>Nenhuma fala audível foi encontrada. Nenhuma legenda foi criada.</p><button type="button" onClick={reset} className="mt-2 rounded border border-amber-200/30 px-3 py-1.5 font-bold">Fechar</button></div>}
      {panelState === 'cancelled' && <div className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-zinc-300"><p>Transcrição cancelada. O Worker e a memória temporária foram liberados.</p><button type="button" onClick={reset} className="mt-2 rounded border border-white/20 px-3 py-1.5 font-bold">Tentar novamente</button></div>}
      {panelState === 'error' && <div className="mt-3 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-xs text-red-100" role="alert"><p>{errorMessage}</p><button type="button" onClick={reset} className="mt-2 rounded border border-red-200/30 px-3 py-1.5 font-bold">Tentar novamente</button></div>}
    </section>
  )
}
