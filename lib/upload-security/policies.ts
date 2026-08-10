import {
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
  resolveVideoUploadLimit,
  type VideoUploadEntitlement,
} from '@/lib/media/upload-limits'

export const UPLOAD_MEGABYTE = 1024 * 1024

export type UploadContext =
  | 'post_image'
  | 'post_video'
  | 'message_image'
  | 'message_video'
  | 'message_audio'
  | 'profile_avatar'
  | 'profile_banner'
  | 'payment_proof'
  | 'age_document'
  | 'age_selfie'
  | 'parental_selfie'
  | 'meet_attachment'

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

const imageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const
const profileMimes = ['image/jpeg', 'image/png', 'image/webp'] as const
const profileExtensions = ['jpg', 'jpeg', 'png', 'webp'] as const
const videoMimes = ['video/mp4', 'video/webm', 'video/quicktime'] as const
const videoExtensions = ['mp4', 'webm', 'mov'] as const
const messageVideoMimes = [...videoMimes, 'video/ogg'] as const
const messageVideoExtensions = [...videoExtensions, 'ogv', 'ogg'] as const
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

const policies: Record<UploadContext, UploadPolicy> = {
  post_image: { context: 'post_image', category: 'image', maxBytes: IMAGE_UPLOAD_MAX_SIZE_BYTES, allowedMimes: imageMimes, allowedExtensions: imageExtensions, magicBytesRequired: true, mayBePublic: true },
  post_video: { context: 'post_video', category: 'video', maxBytes: VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES, allowedMimes: videoMimes, allowedExtensions: videoExtensions, magicBytesRequired: true, mayBePublic: true },
  message_image: { context: 'message_image', category: 'image', maxBytes: 50 * UPLOAD_MEGABYTE, allowedMimes: imageMimes, allowedExtensions: imageExtensions, magicBytesRequired: true, mayBePublic: false },
  message_video: { context: 'message_video', category: 'video', maxBytes: 50 * UPLOAD_MEGABYTE, allowedMimes: messageVideoMimes, allowedExtensions: messageVideoExtensions, magicBytesRequired: true, mayBePublic: false },
  message_audio: { context: 'message_audio', category: 'audio', maxBytes: 50 * UPLOAD_MEGABYTE, allowedMimes: audioMimes, allowedExtensions: audioExtensions, magicBytesRequired: true, mayBePublic: false },
  profile_avatar: { context: 'profile_avatar', category: 'image', maxBytes: 5 * UPLOAD_MEGABYTE, allowedMimes: profileMimes, allowedExtensions: profileExtensions, magicBytesRequired: true, mayBePublic: true },
  profile_banner: { context: 'profile_banner', category: 'image', maxBytes: 10 * UPLOAD_MEGABYTE, allowedMimes: profileMimes, allowedExtensions: profileExtensions, magicBytesRequired: true, mayBePublic: true },
  payment_proof: { context: 'payment_proof', category: 'mixed_document', maxBytes: 10 * UPLOAD_MEGABYTE, allowedMimes: proofMimes, allowedExtensions: proofExtensions, magicBytesRequired: true, mayBePublic: false },
  age_document: { context: 'age_document', category: 'mixed_document', maxBytes: 5 * UPLOAD_MEGABYTE, allowedMimes: documentMimes, allowedExtensions: documentExtensions, magicBytesRequired: true, mayBePublic: false },
  age_selfie: { context: 'age_selfie', category: 'image', maxBytes: 5 * UPLOAD_MEGABYTE, allowedMimes: profileMimes, allowedExtensions: profileExtensions, magicBytesRequired: true, mayBePublic: false },
  parental_selfie: { context: 'parental_selfie', category: 'image', maxBytes: 5 * UPLOAD_MEGABYTE, allowedMimes: profileMimes, allowedExtensions: profileExtensions, magicBytesRequired: true, mayBePublic: false },
  meet_attachment: { context: 'meet_attachment', category: 'document', maxBytes: 5 * UPLOAD_MEGABYTE, allowedMimes: meetMimes, allowedExtensions: meetExtensions, magicBytesRequired: true, mayBePublic: false },
}

export function getUploadPolicy(context: UploadContext, entitlement?: VideoUploadEntitlement): UploadPolicy {
  const policy = policies[context]
  if (context !== 'post_video' || !entitlement) return policy
  return { ...policy, maxBytes: resolveVideoUploadLimit(entitlement).maxSizeBytes }
}

export const UPLOAD_CONTEXTS = Object.freeze(Object.keys(policies) as UploadContext[])
