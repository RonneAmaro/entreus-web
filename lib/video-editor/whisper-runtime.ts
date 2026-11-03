import type { WhisperTranscriptSegment } from '@/lib/video-editor/transcription'

export const WHISPER_RUNTIME_URL = 'https://ggml.ai/whisper.cpp/main.js'
export const WHISPER_RUNTIME_SHA256 = '11ffd6ca6345033d319c14855309ece7aa21d59b02fad70f9eab4c2311e08b9f'
export const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin'
export const WHISPER_MODEL_SHA256 = 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'
export const WHISPER_MODEL_BYTES = 77_691_713
export const WHISPER_INITIAL_DOWNLOAD_BYTES = 79_502_304
export const WHISPER_MAX_DURATION_SECONDS = 120
export const WHISPER_WORKER_PATH = '/workers/whisper-runtime-worker.js'

const WHISPER_CACHE_NAME = 'entreus-whisper-tiny-v1'
const RUNTIME_PLACEHOLDER = '/*__ENTREUS_WHISPER_RUNTIME__*/'

export type WhisperAssetConfig = {
  runtimeUrl: string
  runtimeSha256: string
  modelUrl: string
  modelSha256: string
}

export type WhisperWorkerStartMessage = {
  type: 'start'
  taskId: string
  pcm: ArrayBuffer
  sampleCount: number
  language: 'pt'
  threads: number
  assets: WhisperAssetConfig
  runtimeCacheHit: boolean
}

export type WhisperWorkerStage = 'loading-runtime' | 'loading-model' | 'initializing-model' | 'transcribing' | 'cleaning-up'

export type WhisperWorkerMessage =
  | { type: 'stage'; taskId: string; stage: WhisperWorkerStage; cacheHit?: boolean; wasmHeapBytes?: number | null }
  | { type: 'result'; taskId: string; segments: WhisperTranscriptSegment[]; elapsedMs: number; wasmHeapBytes: number | null; rawOutput: string }
  | { type: 'error'; taskId: string; message: string }

export type WhisperWorkerSession = {
  worker: Worker
  runtimeCacheHit: boolean
  dispose: () => void
}

declare global {
  interface Window {
    __ENTREUS_WHISPER_TEST_ASSETS__?: WhisperAssetConfig
  }
}

export function resolveWhisperAssets(): WhisperAssetConfig {
  if (typeof window !== 'undefined' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
    const testAssets = window.__ENTREUS_WHISPER_TEST_ASSETS__
    if (testAssets) return testAssets
  }
  return {
    runtimeUrl: WHISPER_RUNTIME_URL,
    runtimeSha256: WHISPER_RUNTIME_SHA256,
    modelUrl: WHISPER_MODEL_URL,
    modelSha256: WHISPER_MODEL_SHA256,
  }
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function fetchVerifiedRuntime(assets: WhisperAssetConfig, signal?: AbortSignal) {
  const cache = 'caches' in window ? await caches.open(WHISPER_CACHE_NAME) : null
  let response = cache ? await cache.match(assets.runtimeUrl) : undefined
  const cacheHit = Boolean(response)

  if (!response) {
    response = await fetch(assets.runtimeUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal,
    })
  }
  if (!response.ok) {
    throw new Error(`Falha ao carregar o motor local do Whisper (HTTP ${response.status}).`)
  }

  const bytes = await response.arrayBuffer()
  const actualHash = await sha256Hex(bytes)
  if (signal?.aborted) throw new DOMException('Transcrição cancelada.', 'AbortError')
  if (actualHash !== assets.runtimeSha256) {
    if (cache) await cache.delete(assets.runtimeUrl)
    throw new Error('A verificação de integridade do motor local do Whisper falhou.')
  }

  if (!cacheHit && cache) {
    await cache.put(assets.runtimeUrl, new Response(bytes, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
    }))
  }
  return { bytes, cacheHit }
}

export async function createWhisperWorker(assets = resolveWhisperAssets(), signal?: AbortSignal): Promise<WhisperWorkerSession> {
  const [{ bytes, cacheHit }, templateResponse] = await Promise.all([
    fetchVerifiedRuntime(assets, signal),
    fetch(WHISPER_WORKER_PATH, { cache: 'no-store', signal }),
  ])
  if (!templateResponse.ok) {
    throw new Error(`Falha ao preparar o Worker local do Whisper (HTTP ${templateResponse.status}).`)
  }

  const template = await templateResponse.text()
  if (signal?.aborted) throw new DOMException('Transcrição cancelada.', 'AbortError')
  if (!template.includes(RUNTIME_PLACEHOLDER)) {
    throw new Error('O template do Worker local do Whisper é incompatível com esta versão.')
  }

  const markerIndex = template.indexOf(RUNTIME_PLACEHOLDER)
  const blobUrl = URL.createObjectURL(new Blob([
    template.slice(0, markerIndex),
    bytes,
    template.slice(markerIndex + RUNTIME_PLACEHOLDER.length),
  ], { type: 'text/javascript' }))
  try {
    const worker = new Worker(blobUrl, { name: 'entreus-whisper-tiny' })
    return {
      worker,
      runtimeCacheHit: cacheHit,
      dispose() {
        worker.terminate()
        URL.revokeObjectURL(blobUrl)
      },
    }
  } catch (error) {
    URL.revokeObjectURL(blobUrl)
    throw error
  }
}
