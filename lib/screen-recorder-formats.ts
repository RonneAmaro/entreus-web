export const SCREEN_RECORDER_MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=h264,aac',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export type MediaRecorderSupportProbe = {
  isTypeSupported?: (mimeType: string) => boolean
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function isMp4MimeType(mimeType: unknown) {
  return typeof mimeType === 'string' && mimeType.trim().toLowerCase().startsWith('video/mp4')
}

export function getRecordingExtension(mimeType: unknown) {
  if (isMp4MimeType(mimeType)) return 'mp4'

  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.toLowerCase() : ''
  if (normalizedMimeType.includes('webm')) return 'webm'

  return 'webm'
}

export function getSupportedRecordingMimeType(
  mediaRecorder: MediaRecorderSupportProbe | null | undefined,
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

export function buildScreenRecordingFileName(date = new Date(), mimeType: unknown = 'video/webm') {
  const year = date.getFullYear()
  const month = padDatePart(date.getMonth() + 1)
  const day = padDatePart(date.getDate())
  const hours = padDatePart(date.getHours())
  const minutes = padDatePart(date.getMinutes())
  const extension = getRecordingExtension(mimeType)

  return `entreus-gravacao-tela-${year}-${month}-${day}-${hours}-${minutes}.${extension}`
}
