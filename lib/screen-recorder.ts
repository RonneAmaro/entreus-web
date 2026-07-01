export const SCREEN_RECORDER_MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
]

type MediaRecorderSupportProbe = {
  isTypeSupported?: (mimeType: string) => boolean
}

type MediaDevicesProbe = {
  getDisplayMedia?: unknown
  getUserMedia?: unknown
}

export type ScreenRecorderEnvironment = {
  navigator?: {
    mediaDevices?: MediaDevicesProbe | null
  } | null
  MediaRecorder?: MediaRecorderSupportProbe | null
}

export type ScreenRecorderSupport = {
  hasMediaDevices: boolean
  hasDisplayMedia: boolean
  hasUserMedia: boolean
  hasMediaRecorder: boolean
  isSupported: boolean
  missing: string[]
}

function getDefaultScreenRecorderEnvironment(): ScreenRecorderEnvironment {
  const root = globalThis as typeof globalThis & {
    MediaRecorder?: MediaRecorderSupportProbe
    navigator?: {
      mediaDevices?: MediaDevicesProbe | null
    }
  }

  return {
    navigator: root.navigator || null,
    MediaRecorder: root.MediaRecorder || null,
  }
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

export function getScreenRecorderSupport(
  environment: ScreenRecorderEnvironment = getDefaultScreenRecorderEnvironment(),
): ScreenRecorderSupport {
  const mediaDevices = environment.navigator?.mediaDevices
  const hasMediaDevices = Boolean(mediaDevices)
  const hasDisplayMedia = isFunction(mediaDevices?.getDisplayMedia)
  const hasUserMedia = isFunction(mediaDevices?.getUserMedia)
  const hasMediaRecorder = Boolean(environment.MediaRecorder)
  const missing = [
    ...(!hasMediaDevices ? ['mediaDevices'] : []),
    ...(!hasDisplayMedia ? ['getDisplayMedia'] : []),
    ...(!hasUserMedia ? ['getUserMedia'] : []),
    ...(!hasMediaRecorder ? ['MediaRecorder'] : []),
  ]

  return {
    hasMediaDevices,
    hasDisplayMedia,
    hasUserMedia,
    hasMediaRecorder,
    isSupported: missing.length === 0,
    missing,
  }
}

export function getBestScreenRecorderMimeType(
  mediaRecorder: MediaRecorderSupportProbe | null | undefined = getDefaultScreenRecorderEnvironment().MediaRecorder,
  candidates = SCREEN_RECORDER_MIME_TYPE_CANDIDATES,
) {
  if (!mediaRecorder?.isTypeSupported) return ''

  for (const mimeType of candidates) {
    try {
      if (mediaRecorder.isTypeSupported(mimeType)) return mimeType
    } catch {
      continue
    }
  }

  return ''
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function formatRecordingDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${padDatePart(hours)}:${padDatePart(minutes)}:${padDatePart(seconds)}`
  }

  return `${padDatePart(minutes)}:${padDatePart(seconds)}`
}

export function createScreenRecordingFileName(date = new Date()) {
  const year = date.getFullYear()
  const month = padDatePart(date.getMonth() + 1)
  const day = padDatePart(date.getDate())
  const hours = padDatePart(date.getHours())
  const minutes = padDatePart(date.getMinutes())

  return `entreus-gravacao-tela-${year}-${month}-${day}-${hours}-${minutes}.webm`
}

function getErrorName(error: unknown) {
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name?: unknown }).name || '')
  }

  return ''
}

export function getScreenRecorderErrorMessage(error: unknown) {
  const name = getErrorName(error)

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permissão negada. Autorize a captura de tela, microfone ou webcam no navegador para gravar.'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhuma tela, microfone ou webcam disponível foi encontrada para esta gravação.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'O navegador não conseguiu acessar a fonte selecionada. Feche outro app que esteja usando câmera, microfone ou tela e tente de novo.'
  }

  if (name === 'AbortError') {
    return 'A seleção da tela foi cancelada antes de iniciar a gravação.'
  }

  if (name === 'SecurityError') {
    return 'O navegador bloqueou a captura por uma regra de segurança desta página ou dispositivo.'
  }

  return 'Não foi possível iniciar ou concluir a gravação agora. Verifique as permissões do navegador e tente novamente.'
}
