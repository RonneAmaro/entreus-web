import {
  SCREEN_RECORDER_MIME_TYPE_CANDIDATES,
  buildScreenRecordingFileName,
  getSupportedRecordingMimeType,
  type MediaRecorderSupportProbe,
} from './screen-recorder-formats'

export {
  SCREEN_RECORDER_MIME_TYPE_CANDIDATES,
  buildScreenRecordingFileName,
  getRecordingExtension,
  getSupportedRecordingMimeType,
  isMp4MimeType,
} from './screen-recorder-formats'

export const SCREEN_RECORDER_CANVAS_FPS = 30
export const SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE =
  'Seu navegador não liberou gravação composta por canvas. A tela será gravada sem webcam ou marcações embutidas.'

export const SCREEN_RECORDER_MAX_CANVAS_SIZE = {
  width: 1920,
  height: 1080,
}

export const SCREEN_RECORDER_DEFAULT_CANVAS_SIZE = {
  width: 1280,
  height: 720,
}

export const SCREEN_RECORDER_WEBCAM_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const

export type ScreenRecorderWebcamPosition = (typeof SCREEN_RECORDER_WEBCAM_POSITIONS)[number]

export type ScreenRecorderSize = {
  width: number
  height: number
}

export type ScreenRecorderRect = ScreenRecorderSize & {
  x: number
  y: number
}

export type ScreenRecorderOverlayLayout = ScreenRecorderRect

export type ScreenRecorderPoint = {
  x: number
  y: number
}

export type ScreenRecorderOverlayConstraints = Partial<ScreenRecorderSize> & {
  maxWidth?: number
  maxHeight?: number
}

export const SCREEN_RECORDER_DEFAULT_WEBCAM_LAYOUT: ScreenRecorderOverlayLayout = {
  x: 0.74,
  y: 0.72,
  width: 0.22,
  height: 0.22,
}

export const SCREEN_RECORDER_DEFAULT_TOOLBAR_LAYOUT: ScreenRecorderOverlayLayout = {
  x: 0.03,
  y: 0.18,
  width: 0.08,
  height: 0.58,
}

export const SCREEN_RECORDER_WEBCAM_LAYOUT_CONSTRAINTS: Required<ScreenRecorderOverlayConstraints> = {
  width: 0.12,
  height: 0.12,
  maxWidth: 0.48,
  maxHeight: 0.56,
}

export const SCREEN_RECORDER_TOOLBAR_LAYOUT_CONSTRAINTS: Required<ScreenRecorderOverlayConstraints> = {
  width: 0.06,
  height: 0.36,
  maxWidth: 0.18,
  maxHeight: 0.78,
}

type MediaDevicesProbe = {
  getDisplayMedia?: unknown
  getUserMedia?: unknown
}

type CanvasProbe = {
  captureStream?: unknown
}

export type ScreenRecorderEnvironment = {
  navigator?: {
    mediaDevices?: MediaDevicesProbe | null
  } | null
  MediaRecorder?: MediaRecorderSupportProbe | null
  canvas?: CanvasProbe | null
}

export type ScreenRecorderSupport = {
  hasMediaDevices: boolean
  hasDisplayMedia: boolean
  hasUserMedia: boolean
  hasMediaRecorder: boolean
  hasCanvasCapture: boolean
  isCompositeSupported: boolean
  isSupported: boolean
  missing: string[]
}

function getDefaultScreenRecorderEnvironment(): ScreenRecorderEnvironment {
  const root = globalThis as typeof globalThis & {
    MediaRecorder?: MediaRecorderSupportProbe
    navigator?: {
      mediaDevices?: MediaDevicesProbe | null
    }
    document?: {
      createElement?: (tagName: string) => CanvasProbe
    }
  }
  const canvas = root.document?.createElement?.('canvas') || null

  return {
    navigator: root.navigator || null,
    MediaRecorder: root.MediaRecorder || null,
    canvas,
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
  const hasCanvasCapture = isFunction(environment.canvas?.captureStream)
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
    hasCanvasCapture,
    isCompositeSupported: hasDisplayMedia && hasMediaRecorder && hasCanvasCapture,
    isSupported: missing.length === 0,
    missing,
  }
}

export function getBestScreenRecorderMimeType(
  mediaRecorder: MediaRecorderSupportProbe | null | undefined = getDefaultScreenRecorderEnvironment().MediaRecorder,
  candidates = SCREEN_RECORDER_MIME_TYPE_CANDIDATES,
) {
  return getSupportedRecordingMimeType(mediaRecorder, candidates)
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

export function createScreenRecordingFileName(date = new Date(), mimeType: unknown = 'video/webm') {
  return buildScreenRecordingFileName(date, mimeType)
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function makeEven(value: number) {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

export function getScreenRecorderCanvasSize(
  sourceSize: Partial<ScreenRecorderSize> | null | undefined,
  maxSize: ScreenRecorderSize = SCREEN_RECORDER_MAX_CANVAS_SIZE,
): ScreenRecorderSize {
  const sourceWidth = Number(sourceSize?.width)
  const sourceHeight = Number(sourceSize?.height)

  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return SCREEN_RECORDER_DEFAULT_CANVAS_SIZE
  }

  const maxWidth = Number.isFinite(maxSize.width) && maxSize.width > 0 ? maxSize.width : SCREEN_RECORDER_MAX_CANVAS_SIZE.width
  const maxHeight = Number.isFinite(maxSize.height) && maxSize.height > 0 ? maxSize.height : SCREEN_RECORDER_MAX_CANVAS_SIZE.height
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)

  return {
    width: makeEven(sourceWidth * scale),
    height: makeEven(sourceHeight * scale),
  }
}

export function getScreenRecorderContainRect(sourceSize: ScreenRecorderSize, targetSize: ScreenRecorderSize): ScreenRecorderRect {
  if (sourceSize.width <= 0 || sourceSize.height <= 0 || targetSize.width <= 0 || targetSize.height <= 0) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, targetSize.width),
      height: Math.max(1, targetSize.height),
    }
  }

  const scale = Math.min(targetSize.width / sourceSize.width, targetSize.height / sourceSize.height)
  const width = Math.round(sourceSize.width * scale)
  const height = Math.round(sourceSize.height * scale)

  return {
    x: Math.round((targetSize.width - width) / 2),
    y: Math.round((targetSize.height - height) / 2),
    width,
    height,
  }
}

export function getWebcamOverlayRect({
  canvasSize,
  position = 'bottom-right',
  aspectRatio = 16 / 9,
}: {
  canvasSize: ScreenRecorderSize
  position?: ScreenRecorderWebcamPosition
  aspectRatio?: number
}): ScreenRecorderRect {
  const canvasWidth = Math.max(1, Math.round(canvasSize.width))
  const canvasHeight = Math.max(1, Math.round(canvasSize.height))
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9
  const margin = clampNumber(Math.round(Math.min(canvasWidth, canvasHeight) * 0.035), 12, 72)
  const maxWidth = Math.max(1, canvasWidth - margin * 2)
  const maxHeight = Math.max(1, canvasHeight - margin * 2)
  const preferredWidth = Math.round(canvasWidth * 0.2)
  const minWidth = Math.min(maxWidth, Math.max(120, Math.round(canvasWidth * 0.12)))
  let width = clampNumber(preferredWidth, minWidth, Math.min(maxWidth, Math.round(canvasWidth * 0.34)))
  let height = Math.round(width / safeAspectRatio)

  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * safeAspectRatio)
  }

  const top = position.startsWith('top')
  const left = position.endsWith('left')

  return {
    x: left ? margin : canvasWidth - width - margin,
    y: top ? margin : canvasHeight - height - margin,
    width,
    height,
  }
}

export function clampScreenRecorderOverlayLayout(
  layout: Partial<ScreenRecorderOverlayLayout> | null | undefined,
  constraints: ScreenRecorderOverlayConstraints = {},
): ScreenRecorderOverlayLayout {
  const minWidth = clampNumber(Number(constraints.width ?? 0.06), 0.01, 1)
  const minHeight = clampNumber(Number(constraints.height ?? 0.06), 0.01, 1)
  const maxWidth = clampNumber(Number(constraints.maxWidth ?? 1), minWidth, 1)
  const maxHeight = clampNumber(Number(constraints.maxHeight ?? 1), minHeight, 1)
  const width = clampNumber(Number(layout?.width), minWidth, maxWidth)
  const height = clampNumber(Number(layout?.height), minHeight, maxHeight)

  return {
    x: clampNumber(Number(layout?.x), 0, 1 - width),
    y: clampNumber(Number(layout?.y), 0, 1 - height),
    width,
    height,
  }
}

export function getScreenRecorderOverlayRect(
  layout: Partial<ScreenRecorderOverlayLayout> | null | undefined,
  canvasSize: ScreenRecorderSize,
  constraints: ScreenRecorderOverlayConstraints = {},
): ScreenRecorderRect {
  const canvasWidth = Math.max(1, Math.round(canvasSize.width))
  const canvasHeight = Math.max(1, Math.round(canvasSize.height))
  const safeLayout = clampScreenRecorderOverlayLayout(layout, constraints)

  return {
    x: Math.round(safeLayout.x * canvasWidth),
    y: Math.round(safeLayout.y * canvasHeight),
    width: Math.max(1, Math.round(safeLayout.width * canvasWidth)),
    height: Math.max(1, Math.round(safeLayout.height * canvasHeight)),
  }
}

export function normalizeScreenRecorderPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): ScreenRecorderPoint {
  const width = rect.width > 0 ? rect.width : 1
  const height = rect.height > 0 ? rect.height : 1

  return {
    x: clampNumber((clientX - rect.left) / width, 0, 1),
    y: clampNumber((clientY - rect.top) / height, 0, 1),
  }
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
