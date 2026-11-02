import type { FFmpeg } from '@ffmpeg/ffmpeg'

const CORE_VERSION = '0.12.10'
const CORE_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`
const LOCAL_TEST_PATH = '/__entreus_ffmpeg_local/'
const blobUrlsByInstance = new WeakMap<FFmpeg, string[]>()
// Includes core download and WASM initialization. Rendering itself has no time limit.
export const FFMPEG_LOAD_TIMEOUT_MS = process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG === '1'
  ? 10_000
  : 90_000

export class FfmpegLoadTimeoutError extends Error {
  constructor() {
    super('O motor de video demorou para carregar. Tente novamente.')
    this.name = 'FfmpegLoadTimeoutError'
  }
}

function revokeConfigBlobUrls(config: { coreURL: string; wasmURL: string }) {
  for (const url of [config.coreURL, config.wasmURL]) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
}

export function releaseFfmpegLoadAssets(ffmpeg: FFmpeg) {
  for (const url of blobUrlsByInstance.get(ffmpeg) ?? []) URL.revokeObjectURL(url)
  blobUrlsByInstance.delete(ffmpeg)
}

export async function loadFfmpegWithTimeout(ffmpeg: FFmpeg, signal?: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const loadController = new AbortController()
  const abortError = () => new DOMException('Carregamento cancelado.', 'AbortError')
  let removeAbortListener: () => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return
    if (signal.aborted) {
      loadController.abort()
      reject(abortError())
      return
    }
    const onAbort = () => {
      reject(abortError())
      loadController.abort()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true
      reject(new FfmpegLoadTimeoutError())
      loadController.abort()
    }, FFMPEG_LOAD_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      (async () => {
        const config = await getFfmpegLoadConfig(loadController.signal)
        if (expired || signal?.aborted) {
          revokeConfigBlobUrls(config)
          throw expired ? new FfmpegLoadTimeoutError() : abortError()
        }
        blobUrlsByInstance.set(ffmpeg, [config.coreURL, config.wasmURL].filter((url) => url.startsWith('blob:')))
        await ffmpeg.load(config, { signal: loadController.signal })
      })(),
      timeout,
      aborted,
    ])
  } catch (error) {
    ffmpeg.terminate()
    releaseFfmpegLoadAssets(ffmpeg)
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    removeAbortListener()
  }
}

async function fetchCoreBlobURL(url: string, mimeType: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`FFmpeg core HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (signal?.aborted) throw new DOMException('Carregamento cancelado.', 'AbortError')
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

export async function getFfmpegLoadConfig(signal?: AbortSignal) {
  if (
    (process.env.NODE_ENV === 'development' ||
      (process.env.NODE_ENV === 'production' && window.location.origin === 'http://127.0.0.1:3100')) &&
    process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG === '1' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
  ) {
    // Only the local test runner serves these URLs. No core files live in the app.
    const base = new URL(LOCAL_TEST_PATH, window.location.origin).href
    return {
      classWorkerURL: `${base}worker.js`,
      coreURL: `${base}ffmpeg-core.js`,
      wasmURL: `${base}ffmpeg-core.wasm`,
    }
  }

  const coreURL = await fetchCoreBlobURL(`${CORE_CDN_BASE}/ffmpeg-core.js`, 'text/javascript', signal)
  try {
    return {
      coreURL,
      wasmURL: await fetchCoreBlobURL(`${CORE_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm', signal),
    }
  } catch (error) {
    URL.revokeObjectURL(coreURL)
    throw error
  }
}
