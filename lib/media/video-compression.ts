import type { FFmpeg } from '@ffmpeg/ffmpeg'
import {
  UPLOAD_EXTENSION_BY_MIME_TYPE,
  VIDEO_UPLOAD_MAX_SIZE_BYTES,
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
      message?: string
    }
  | {
      ok: false
      reason: 'unsupported' | 'failed' | 'not_smaller'
      message: string
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

let ffmpegRuntimePromise: Promise<FfmpegRuntime> | null = null
let compressionQueue = Promise.resolve()

export function canAttemptVideoCompression(file: File): boolean {
  if (typeof window === 'undefined') return false
  if (typeof File === 'undefined' || !(file instanceof File)) return false
  if (typeof WebAssembly === 'undefined') return false
  if (typeof Worker === 'undefined') return false
  if (typeof Blob === 'undefined') return false
  if (typeof URL === 'undefined') return false
  if (file.size <= 0 || file.size > VIDEO_UPLOAD_MAX_SIZE_BYTES) return false

  const contentType = getAllowedUploadContentType(file.type, file.name)

  return Boolean(contentType && isAllowedVideoMimeType(contentType))
}

export async function compressVideoForPost(file: File): Promise<VideoCompressionResult> {
  if (!canAttemptVideoCompression(file)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Seu navegador nao permitiu otimizar o video automaticamente.',
    }
  }

  return enqueueCompression(() => runFfmpegCompression(file))
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

async function runFfmpegCompression(file: File): Promise<VideoCompressionResult> {
  const { ffmpeg, fetchFile } = await getFfmpegRuntime()
  const inputName = `post-input-${Date.now()}-${Math.random().toString(36).slice(2)}.${getInputExtension(file)}`
  const outputName = `post-output-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`

  try {
    await cleanupFfmpegFiles(ffmpeg, [inputName, outputName])
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    const exitCode = await ffmpeg.exec(buildCompressionArgs(inputName, outputName))

    if (exitCode !== 0) {
      throw new Error('FFmpeg retornou erro ao otimizar o video.')
    }

    const compressedData = await ffmpeg.readFile(outputName)
    const compressedBytes = readFfmpegBytes(compressedData)

    if (compressedBytes.byteLength <= 0) {
      throw new Error('FFmpeg gerou um video vazio.')
    }

    if (compressedBytes.byteLength >= file.size) {
      return {
        ok: false,
        reason: 'not_smaller',
        message: 'A otimizacao nao reduziu o tamanho do video.',
      }
    }

    const compressedBlob = new Blob([compressedBytes as BlobPart], { type: OUTPUT_MIME_TYPE })
    const compressedFile = new File([compressedBlob], getOptimizedFileName(file.name), {
      type: OUTPUT_MIME_TYPE,
      lastModified: Date.now(),
    })

    return {
      ok: true,
      file: compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      message: 'Video otimizado para publicar mais rapido.',
    }
  } catch (error) {
    console.warn('[PostVideoCompression] Falha ao otimizar video:', {
      error,
      name: file.name,
      type: file.type,
      size: file.size,
    })

    return {
      ok: false,
      reason: 'failed',
      message: 'Nao foi possivel otimizar o video, mas ele ainda pode ser enviado se estiver dentro dos limites.',
    }
  } finally {
    await cleanupFfmpegFiles(ffmpeg, [inputName, outputName])
  }
}

function buildCompressionArgs(inputName: string, outputName: string) {
  const scaleFilter = [
    'scale=',
    `'if(gt(iw,ih),min(iw,${MAX_OUTPUT_DIMENSION}),-2)'`,
    ':',
    `'if(gt(iw,ih),-2,min(ih,${MAX_OUTPUT_DIMENSION}))'`,
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
    '28',
    '-maxrate',
    VIDEO_BITRATE,
    '-bufsize',
    `${Number.parseInt(VIDEO_BITRATE, 10) * 2}k`,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    AUDIO_BITRATE,
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
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
