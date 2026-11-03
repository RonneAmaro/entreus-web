import { loadMusicAsset } from './music-storage'
import { verifyLibraryFile, type SavedLibraryAsset } from './audio-library'
import { RHYTHM_MAX_PCM_BYTES, RHYTHM_MAX_RATE, RHYTHM_MAX_SECONDS, type RhythmOptions, type RhythmResult } from './rhythm-analysis'
import type { RhythmWorkerRequest, RhythmWorkerResponse } from './rhythm-worker'

export const RHYTHM_MAX_FILE_BYTES = 10 * 1024 * 1024
export const RHYTHM_MAX_ESTIMATED_BYTES = 100 * 1024 * 1024
export type RhythmErrorCode = 'cancelled' | 'unavailable' | 'invalid' | 'limit' | 'decode' | 'worker' | 'timeout'
export class RhythmError extends Error {
  constructor(public readonly code: RhythmErrorCode, message: string) { super(message); this.name = 'RhythmError' }
}

// Decoded stereo plus a transferable copy, compressed input, and fixed overhead.
export function estimateRhythmMemory(duration: number, rate = RHYTHM_MAX_RATE, channels = 2, fileBytes = 0): number {
  if (![duration, rate, channels, fileBytes].every(Number.isFinite) || duration <= 0 || rate <= 0 || channels < 1 || fileBytes < 0) return Infinity
  return Math.ceil(duration * rate * channels * 4 * 2 + fileBytes + 4 * 1024 * 1024)
}

type Dependencies = {
  load: typeof loadMusicAsset
  verify: typeof verifyLibraryFile
  metadata: (file: File, signal: AbortSignal) => Promise<number>
  context: () => AudioContext
  worker: () => Worker
}
function metadata(file: File, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(), url = URL.createObjectURL(file)
    const timer = setTimeout(() => finish(new RhythmError('timeout', 'Tempo de leitura dos metadados excedido.')), 10000)
    const finish = (error?: Error, duration?: number) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort); audio.onloadedmetadata = null; audio.onerror = null
      audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url)
      if (error) reject(error); else resolve(duration!)
    }
    const abort = () => finish(new RhythmError('cancelled', 'Análise cancelada.'))
    audio.onloadedmetadata = () => finish(undefined, audio.duration)
    audio.onerror = () => finish(new RhythmError('decode', 'Metadados de áudio indisponíveis.'))
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); else audio.src = url
  })
}
const defaults: Dependencies = {
  load: loadMusicAsset, verify: verifyLibraryFile, metadata,
  context: () => new AudioContext(),
  // Next's webpack worker bootstrap assigns _N_E in a non-strict script.
  // A module worker forces strict mode and fails before processing messages.
  worker: () => new Worker(new URL('./rhythm-worker.ts', import.meta.url), { name: 'entreus-rhythm' }),
}

export function createRhythmAnalyzer(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides }
  let active: AbortController | null = null
  let serial = 0
  function cancel() { active?.abort(); active = null }
  async function analyze(projectId: string, asset: SavedLibraryAsset, options: RhythmOptions = {}, signal?: AbortSignal): Promise<RhythmResult> {
    cancel(); const controller = new AbortController(); active = controller; const id = ++serial
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort()
    let context: AudioContext | undefined
    let worker: Worker | undefined
    const check = () => { if (controller.signal.aborted) throw new RhythmError('cancelled', 'Análise cancelada.') }
    try {
      check()
      if (!projectId || !asset.assetId || asset.category !== 'music') throw new RhythmError('invalid', 'Música inválida.')
      if (!Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > RHYTHM_MAX_SECONDS) throw new RhythmError('limit', 'Duração indisponível ou superior a 60 segundos.')
      const file = await deps.load(projectId, asset.assetId); check()
      if (!file) throw new RhythmError('unavailable', 'Música local indisponível.')
      if (!file.size || file.size > RHYTHM_MAX_FILE_BYTES) throw new RhythmError('limit', 'Arquivo excede 10 MiB.')
      if (!/\.(mp3|wav)$/i.test(file.name)) throw new RhythmError('invalid', 'Formato de áudio não suportado.')
      if (!await deps.verify({ ...asset, file })) throw new RhythmError('invalid', 'Arquivo de música alterado.')
      check()
      const duration = await deps.metadata(file, controller.signal); check()
      if (!Number.isFinite(duration) || duration <= 0 || duration > RHYTHM_MAX_SECONDS || Math.abs(duration - asset.duration) > 0.25) throw new RhythmError('limit', 'Duração de áudio inválida ou inconsistente.')
      if (estimateRhythmMemory(duration, RHYTHM_MAX_RATE, 2, file.size) > RHYTHM_MAX_ESTIMATED_BYTES) throw new RhythmError('limit', 'Memória estimada excede o limite.')
      try { context = deps.context() } catch { throw new RhythmError('unavailable', 'Web Audio indisponível.') }
      const bytes = await file.arrayBuffer(); check()
      let decoded: AudioBuffer
      try { decoded = await context.decodeAudioData(bytes) } catch { check(); throw new RhythmError('decode', 'Não foi possível decodificar o áudio.') }
      check()
      if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || !Number.isInteger(decoded.sampleRate) || decoded.sampleRate < 1000 || decoded.sampleRate > RHYTHM_MAX_RATE
        || !Number.isInteger(decoded.length) || decoded.length <= 0 || decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2 || decoded.duration > RHYTHM_MAX_SECONDS
        || Math.abs(decoded.duration - duration) > 0.25 || decoded.length * decoded.numberOfChannels * 4 > RHYTHM_MAX_PCM_BYTES
        || estimateRhythmMemory(decoded.duration, decoded.sampleRate, decoded.numberOfChannels, file.size) > RHYTHM_MAX_ESTIMATED_BYTES) throw new RhythmError('limit', 'Áudio decodificado excede os limites.')
      try { worker = deps.worker() } catch { throw new RhythmError('worker', 'Worker de análise indisponível.') }
      const currentWorker = worker
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => new Float32Array(decoded.getChannelData(index)).buffer)
      const request: RhythmWorkerRequest = { id, channels, sampleRate: decoded.sampleRate, options }
      return await new Promise<RhythmResult>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new RhythmError('timeout', 'Tempo de análise excedido.')), 15000)
        const onAbort = () => finish(new RhythmError('cancelled', 'Análise cancelada.'))
        let done = false
        function finish(error?: RhythmError, result?: RhythmResult) {
          if (done) return; done = true; clearTimeout(timeout); controller.signal.removeEventListener('abort', onAbort)
          currentWorker.onmessage = null; currentWorker.onerror = null; currentWorker.onmessageerror = null
          if (error) reject(error); else resolve(result!)
        }
        currentWorker.onmessage = (event: MessageEvent<RhythmWorkerResponse>) => {
          if (event.data.id !== id) return
          if ('error' in event.data) finish(new RhythmError('worker', event.data.error)); else finish(undefined, event.data.result)
        }
        currentWorker.onerror = () => finish(new RhythmError('worker', 'Falha no worker de análise.'))
        currentWorker.onmessageerror = () => finish(new RhythmError('worker', 'Mensagem inválida do worker.'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort(); else { try { currentWorker.postMessage(request, channels) } catch { finish(new RhythmError('worker', 'Falha ao enviar áudio ao worker.')) } }
      })
    } finally {
      worker?.terminate()
      if (context) await context.close().catch(() => {})
      signal?.removeEventListener('abort', abort)
      if (active === controller) active = null
    }
  }
  return { analyze, cancel }
}
