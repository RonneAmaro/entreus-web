import type { FFmpeg } from '@ffmpeg/ffmpeg'
import {
  BYTES_PER_MEGABYTE,
  UPLOAD_EXTENSION_BY_MIME_TYPE,
  getAllowedUploadContentType,
  getUploadFileExtension,
  isAllowedVideoMimeType,
} from '@/lib/media/upload-limits'

export type VideoCompressionResult =
  | {
      ok: true
      file: File
      originalSize: number
      compressedSize: number
      savedBytes: number
      savedPercent: number
      message?: string
    }
  | {
      ok: false
      reason: 'unsupported' | 'failed' | 'not_smaller'
      message: string
    }

export type VideoCompressionSavings = {
  originalSize: number
  compressedSize: number
  savedBytes: number
  savedPercent: number
}

export type VideoCompressionStage = 'preparing' | 'compressing' | 'fallback'

export type VideoCompressionOptions = {
  targetMaxSizeBytes?: number
  onStage?: (stage: VideoCompressionStage) => void
}

type FfmpegRuntime = {
  ffmpeg: FFmpeg
  fetchFile: typeof import('@ffmpeg/util').fetchFile
}

const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`
const OUTPUT_MIME_TYPE = 'video/mp4'
const MAX_OUTPUT_DIMENSION = 720
const VIDEO_BITRATE = '1400k'
const AUDIO_BITRATE = '96k'
const FALLBACK_MAX_OUTPUT_DIMENSION = 480
const FALLBACK_VIDEO_BITRATE = '850k'
const FALLBACK_AUDIO_BITRATE = '80k'
const DESKTOP_COMPRESSION_MAX_INPUT_BYTES = 120 * BYTES_PER_MEGABYTE
const MOBILE_COMPRESSION_MAX_INPUT_BYTES = 80 * BYTES_PER_MEGABYTE

let ffmpegRuntimePromise: Promise<FfmpegRuntime> | null = null
let compressionQueue = Promise.resolve()

export function canAttemptVideoCompression(file: File): boolean {
  if (typeof window === 'undefined') return false
  if (typeof File === 'undefined' || !(file instanceof File)) return false
  if (typeof WebAssembly === 'undefined') return false
  if (typeof Worker === 'undefined') return false
  if (typeof Blob === 'undefined') return false
  if (typeof URL === 'undefined') return false
  if (file.size <= 0 || file.size > getVideoCompressionInputLimitBytes()) return false

  const contentType = getAllowedUploadContentType(file.type, file.name)

  return Boolean(contentType && isAllowedVideoMimeType(contentType))
}

export function getVideoCompressionInputLimitBytes() {
  if (typeof navigator === 'undefined') return DESKTOP_COMPRESSION_MAX_INPUT_BYTES

  const userAgent = navigator.userAgent || ''
  const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)

  return isMobileBrowser
    ? MOBILE_COMPRESSION_MAX_INPUT_BYTES
    : DESKTOP_COMPRESSION_MAX_INPUT_BYTES
}

export function getVideoCompressionSavings(
  originalSize: number,
  compressedSize: number,
): VideoCompressionSavings | null {
  if (!Number.isFinite(originalSize) || !Number.isFinite(compressedSize)) return null

  const normalizedOriginalSize = Math.max(0, Math.round(originalSize))
  const normalizedCompressedSize = Math.max(0, Math.round(compressedSize))

  if (normalizedOriginalSize <= 0 || normalizedCompressedSize <= 0) return null
  if (normalizedCompressedSize >= normalizedOriginalSize) return null

  const savedBytes = normalizedOriginalSize - normalizedCompressedSize
  const savedPercent = Math.min(
    99,
    Math.max(1, Math.round((savedBytes / normalizedOriginalSize) * 100)),
  )

  return {
    originalSize: normalizedOriginalSize,
    compressedSize: normalizedCompressedSize,
    savedBytes,
    savedPercent,
  }
}

export async function compressVideoForPost(
  file: File,
  options: VideoCompressionOptions = {},
): Promise<VideoCompressionResult> {
  if (!canAttemptVideoCompression(file)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Seu navegador nao permitiu otimizar o video automaticamente.',
    }
  }

  reportCompressionStage(options, 'preparing')
  return enqueueCompression(() => runFfmpegCompression(file, options))
}

function enqueueCompression<T>(task: () => Promise<T>) {
  const nextTask = compressionQueue.then(task, task)
  compressionQueue = nextTask.then(
    () => undefined,
    () => undefined,
  )

  return nextTask
}

async function getFfmpegRuntime(): Promise<FfmpegRuntime> {
  if (!ffmpegRuntimePromise) {
    ffmpegRuntimePromise = loadFfmpegRuntime().catch((error) => {
      ffmpegRuntimePromise = null
      throw error
    })
  }

  return ffmpegRuntimePromise
}

async function loadFfmpegRuntime(): Promise<FfmpegRuntime> {
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ])

  const ffmpeg = new FFmpeg()

  ffmpeg.on('log', ({ type, message }) => {
    console.info('[PostVideoCompression] FFmpeg:', { type, message })
  })

  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  return { ffmpeg, fetchFile }
}

async function runFfmpegCompression(
  file: File,
  options: VideoCompressionOptions,
): Promise<VideoCompressionResult> {
  const { ffmpeg, fetchFile } = await getFfmpegRuntime()
  const inputName = `post-input-${Date.now()}-${Math.random().toString(36).slice(2)}.${getInputExtension(file)}`
  const outputName = `post-output-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  const fallbackOutputName = `post-output-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`

  try {
    await cleanupFfmpegFiles(ffmpeg, [inputName, outputName, fallbackOutputName])
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    reportCompressionStage(options, 'compressing')
    const exitCode = await ffmpeg.exec(buildCompressionArgs(inputName, outputName, 'balanced'))

    if (exitCode !== 0) {
      throw new Error('FFmpeg retornou erro ao otimizar o video.')
    }

    let compressedFile = await readCompressedFile(ffmpeg, outputName, file.name)
    const targetMaxSizeBytes = normalizeTargetMaxSize(options.targetMaxSizeBytes)

    if (targetMaxSizeBytes && compressedFile.size > targetMaxSizeBytes) {
      reportCompressionStage(options, 'fallback')
      const fallbackExitCode = await ffmpeg.exec(
        buildCompressionArgs(inputName, fallbackOutputName, 'fallback'),
      )

      if (fallbackExitCode === 0) {
        try {
          const fallbackFile = await readCompressedFile(ffmpeg, fallbackOutputName, file.name)

          if (fallbackFile.size < compressedFile.size) {
            compressedFile = fallbackFile
          }
        } catch {
          // The usable 720p output remains available if the fallback cannot be read.
        }
      }
    }
    const savings = getVideoCompressionSavings(file.size, compressedFile.size)

    if (!savings) {
      return {
        ok: false,
        reason: 'not_smaller',
        message: 'A otimizacao nao reduziu o tamanho do video.',
      }
    }

    return {
      ok: true,
      file: compressedFile,
      originalSize: savings.originalSize,
      compressedSize: savings.compressedSize,
      savedBytes: savings.savedBytes,
      savedPercent: savings.savedPercent,
      message: 'Video otimizado para publicar mais rapido.',
    }
  } catch {
    console.warn('[PostVideoCompression] Falha ao otimizar video.')

    return {
      ok: false,
      reason: 'failed',
      message: 'Nao foi possivel otimizar o video, mas ele ainda pode ser enviado se estiver dentro dos limites.',
    }
  } finally {
    await cleanupFfmpegFiles(ffmpeg, [inputName, outputName, fallbackOutputName])
  }
}

async function readCompressedFile(ffmpeg: FFmpeg, outputName: string, originalFileName: string) {
  const compressedData = await ffmpeg.readFile(outputName)
  const compressedBytes = readFfmpegBytes(compressedData)

  if (compressedBytes.byteLength <= 0) {
    throw new Error('FFmpeg gerou um video vazio.')
  }

  const compressedBlob = new Blob([compressedBytes as BlobPart], { type: OUTPUT_MIME_TYPE })
  return new File([compressedBlob], getOptimizedFileName(originalFileName), {
    type: OUTPUT_MIME_TYPE,
    lastModified: Date.now(),
  })
}

function buildCompressionArgs(
  inputName: string,
  outputName: string,
  preset: 'balanced' | 'fallback',
) {
  const maxDimension = preset === 'fallback' ? FALLBACK_MAX_OUTPUT_DIMENSION : MAX_OUTPUT_DIMENSION
  const videoBitrate = preset === 'fallback' ? FALLBACK_VIDEO_BITRATE : VIDEO_BITRATE
  const audioBitrate = preset === 'fallback' ? FALLBACK_AUDIO_BITRATE : AUDIO_BITRATE
  const scaleFilter = [
    'scale=',
    `'if(gt(iw,ih),min(iw,${maxDimension}),-2)'`,
    ':',
    `'if(gt(iw,ih),-2,min(ih,${maxDimension}))'`,
  ].join('')

  return [
    '-y',
    '-i',
    inputName,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    scaleFilter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    preset === 'fallback' ? '30' : '28',
    '-maxrate',
    videoBitrate,
    '-bufsize',
    `${Number.parseInt(videoBitrate, 10) * 2}k`,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    audioBitrate,
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outputName,
  ]
}

function normalizeTargetMaxSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) return null
  return Math.round(value)
}

function reportCompressionStage(options: VideoCompressionOptions, stage: VideoCompressionStage) {
  try {
    options.onStage?.(stage)
  } catch {
    // UI callbacks must not interrupt the compression task.
  }
}

function readFfmpegBytes(outputData: Awaited<ReturnType<FFmpeg['readFile']>>) {
  const outputBytes =
    typeof outputData === 'string'
      ? new TextEncoder().encode(outputData)
      : outputData

  return new Uint8Array(outputBytes)
}

async function cleanupFfmpegFiles(ffmpeg: FFmpeg, paths: string[]) {
  await Promise.all(
    paths.map(async (path) => {
      try {
        await ffmpeg.deleteFile(path)
      } catch {
        // Missing virtual files are expected after failed attempts or first-run cleanup.
      }
    }),
  )
}

function getInputExtension(file: File) {
  const contentType = getAllowedUploadContentType(file.type, file.name)

  return (
    (contentType && UPLOAD_EXTENSION_BY_MIME_TYPE[contentType]) ||
    getUploadFileExtension(file.name) ||
    'mp4'
  )
}

function getOptimizedFileName(fileName: string) {
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return `${baseName || 'video'}-otimizado.mp4`
}
