import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
  resolveVideoUploadLimit,
  type VideoUploadEntitlement,
} from '@/lib/media/upload-limits'

export const UPLOAD_MEGABYTE = 1024 * 1024

export const UPLOAD_CONTEXTS = [
  'post_image',
  'post_video',
  'message_image',
  'message_video',
  'message_audio',
  'profile_avatar',
  'profile_banner',
  'payment_proof',
  'age_document',
  'age_selfie',
  'parental_selfie',
  'meet_attachment',
] as const

export type UploadContext = (typeof UPLOAD_CONTEXTS)[number]
export type UploadCategory = 'image' | 'video' | 'audio' | 'document' | 'mixed_document'

export type UploadPolicy = Readonly<{
  context: UploadContext
  category: UploadCategory
  maxBytes: number
  allowedMimes: readonly string[]
  allowedExtensions: readonly string[]
  magicBytesRequired: boolean
  mayBePublic: boolean
}>

const uploadContextSet = new Set<string>(UPLOAD_CONTEXTS)
const profileMimes = ['image/jpeg', 'image/png', 'image/webp'] as const
const profileExtensions = ['jpg', 'jpeg', 'png', 'webp'] as const
const messageVideoMimes = [...ALLOWED_VIDEO_MIME_TYPES, 'video/ogg'] as const
const messageVideoExtensions = [...ALLOWED_VIDEO_EXTENSIONS, 'ogv', 'ogg'] as const
const audioMimes = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav'] as const
const audioExtensions = ['webm', 'ogg', 'mp3', 'm4a', 'mp4', 'wav'] as const
const proofMimes = ['image/png', 'image/jpeg', 'application/pdf'] as const
const proofExtensions = ['png', 'jpg', 'jpeg', 'pdf'] as const
const documentMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
const documentExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'] as const
const meetMimes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const
const meetExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt', 'docx', 'xlsx', 'pptx'] as const

const policies: Readonly<Record<UploadContext, UploadPolicy>> = Object.freeze({
  post_image: policy('post_image', 'image', IMAGE_UPLOAD_MAX_SIZE_BYTES, ALLOWED_IMAGE_MIME_TYPES, ALLOWED_IMAGE_EXTENSIONS, true),
  post_video: policy('post_video', 'video', VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES, ALLOWED_VIDEO_MIME_TYPES, ALLOWED_VIDEO_EXTENSIONS, true),
  message_image: policy('message_image', 'image', 50 * UPLOAD_MEGABYTE, ALLOWED_IMAGE_MIME_TYPES, ALLOWED_IMAGE_EXTENSIONS, false),
  message_video: policy('message_video', 'video', 50 * UPLOAD_MEGABYTE, messageVideoMimes, messageVideoExtensions, false),
  message_audio: policy('message_audio', 'audio', 50 * UPLOAD_MEGABYTE, audioMimes, audioExtensions, false),
  profile_avatar: policy('profile_avatar', 'image', IMAGE_UPLOAD_MAX_SIZE_BYTES, profileMimes, profileExtensions, true),
  profile_banner: policy('profile_banner', 'image', 10 * UPLOAD_MEGABYTE, profileMimes, profileExtensions, true),
  payment_proof: policy('payment_proof', 'mixed_document', 10 * UPLOAD_MEGABYTE, proofMimes, proofExtensions, false),
  age_document: policy('age_document', 'mixed_document', 5 * UPLOAD_MEGABYTE, documentMimes, documentExtensions, false),
  age_selfie: policy('age_selfie', 'image', 5 * UPLOAD_MEGABYTE, profileMimes, profileExtensions, false),
  parental_selfie: policy('parental_selfie', 'image', 5 * UPLOAD_MEGABYTE, profileMimes, profileExtensions, false),
  meet_attachment: policy('meet_attachment', 'document', 5 * UPLOAD_MEGABYTE, meetMimes, meetExtensions, false),
})

function policy(
  context: UploadContext,
  category: UploadCategory,
  maxBytes: number,
  allowedMimes: readonly string[],
  allowedExtensions: readonly string[],
  mayBePublic: boolean,
): UploadPolicy {
  return Object.freeze({
    context,
    category,
    maxBytes,
    allowedMimes,
    allowedExtensions,
    magicBytesRequired: true,
    mayBePublic,
  })
}

export function isUploadContext(value: unknown): value is UploadContext {
  return typeof value === 'string' && uploadContextSet.has(value)
}

export function getUploadPolicy(context: UploadContext, entitlement?: VideoUploadEntitlement): UploadPolicy
export function getUploadPolicy(context: unknown, entitlement?: VideoUploadEntitlement): UploadPolicy | null
export function getUploadPolicy(context: unknown, entitlement?: VideoUploadEntitlement): UploadPolicy | null {
  if (!isUploadContext(context)) return null

  const selectedPolicy = policies[context]
  if (context !== 'post_video' || !entitlement) return selectedPolicy

  return Object.freeze({
    ...selectedPolicy,
    maxBytes: resolveVideoUploadLimit(entitlement).maxSizeBytes,
  })
}
