import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client, type HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { ownsProfileMediaStorageKey, type ProfileMediaType } from '@/lib/profile-media-moderation'

export const PROFILE_MEDIA_EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const
const PROFILE_MEDIA_MAX_BYTES: Record<ProfileMediaType, number> = { avatar: 5 * 1024 * 1024, banner: 10 * 1024 * 1024 }
export type AllowedProfileMediaMime = keyof typeof PROFILE_MEDIA_EXTENSION_BY_MIME
export type ApprovedProfileMediaKey = { userId: string; objectId: string; extension: 'jpg' | 'png' | 'webp'; key: string }
const APPROVED_PROFILE_MEDIA_KEY_PATTERN = /^profile-media\/public\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/

function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID; const accessKeyId = process.env.R2_ACCESS_KEY_ID; const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } })
}

export function isProfileMediaR2Configured() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME)
}

export function isMissingR2ObjectError(error: unknown) {
  const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null
  if (value?.name === 'NoSuchKey' || value?.Code === 'NoSuchKey') return true
  if (value?.name !== 'NotFound') return false
  return !value.Code || value.Code === 'NotFound' || value.Code === 'NoSuchKey'
}

export function parseApprovedProfileMediaKey(value: unknown): ApprovedProfileMediaKey | null {
  if (typeof value !== 'string' || /[%?\#\\]|\.\.|[\u0000-\u001f\u007f]/.test(value)) return null
  const match = APPROVED_PROFILE_MEDIA_KEY_PATTERN.exec(value)
  if (!match) return null
  return { userId: match[1], objectId: match[2], extension: match[3] as ApprovedProfileMediaKey['extension'], key: value }
}

export function isSafeApprovedProfileMediaKey(key: unknown): key is string {
  return Boolean(parseApprovedProfileMediaKey(key))
}

export function validateProfileMediaObject(head: Pick<HeadObjectCommandOutput, 'ContentType' | 'ContentLength'>, mediaType: ProfileMediaType) {
  const contentType = (head.ContentType || '').split(';', 1)[0].trim().toLowerCase()
  const contentLength = head.ContentLength
  if (!(contentType in PROFILE_MEDIA_EXTENSION_BY_MIME)) throw new Error('Unsupported profile image MIME type.')
  if (typeof contentLength !== 'number' || contentLength <= 0 || contentLength > PROFILE_MEDIA_MAX_BYTES[mediaType]) throw new Error('Invalid profile image size.')
  return { contentType: contentType as AllowedProfileMediaMime, contentLength }
}

export function buildR2CopySource(bucket: string, sourceKey: string) {
  if (!bucket || !sourceKey) throw new Error('Invalid R2 copy source.')
  return `${encodeURIComponent(bucket)}/${sourceKey.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
}

export function buildApprovedProfileMediaKey(userId: string, sourceKey: string, contentType: AllowedProfileMediaMime) {
  if (!ownsProfileMediaStorageKey(userId, sourceKey)) throw new Error('Invalid private profile media key.')
  const key = `profile-media/public/${userId}/${crypto.randomUUID()}${PROFILE_MEDIA_EXTENSION_BY_MIME[contentType]}`
  if (!parseApprovedProfileMediaKey(key)) throw new Error('Invalid approved profile media key.')
  return key
}

export function buildApprovedProfileMediaUrl(publicBaseUrl: string, userId: string, approvedKey: string) {
  const parsedKey = parseApprovedProfileMediaKey(approvedKey)
  if (!parsedKey || parsedKey.userId !== userId) throw new Error('Invalid approved profile media key.')
  const base = new URL(publicBaseUrl)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid public R2 base URL.')
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${approvedKey}`.replace(/\/{2,}/g, '/')
  return base.toString()
}

export async function headPrivateProfileMediaObject({ userId, sourceKey, mediaType }: { userId: string; sourceKey: string; mediaType: ProfileMediaType }) {
  if (!ownsProfileMediaStorageKey(userId, sourceKey)) throw new Error('Invalid private profile media key.')
  const client = getClient(); const bucket = process.env.R2_BUCKET_NAME
  if (!client || !bucket) throw new Error('R2 validation is unavailable.')
  return validateProfileMediaObject(await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey })), mediaType)
}

export class ProfileMediaCopyError extends Error {
  constructor(message: string, readonly approvedKey: string | null, readonly copyMayExist: boolean) { super(message) }
}

export async function copyProfileMediaToApprovedPublicKey({ userId, sourceKey, mediaType }: { userId: string; sourceKey: string; mediaType: ProfileMediaType }) {
  const client = getClient(); const bucket = process.env.R2_BUCKET_NAME
  if (!client || !bucket) throw new ProfileMediaCopyError('R2 copy is unavailable.', null, false)
  if (!ownsProfileMediaStorageKey(userId, sourceKey)) throw new ProfileMediaCopyError('Invalid private profile media key.', null, false)
  const source = validateProfileMediaObject(await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey })), mediaType)
  const approvedKey = buildApprovedProfileMediaKey(userId, sourceKey, source.contentType)
  try {
    await client.send(new CopyObjectCommand({ Bucket: bucket, CopySource: buildR2CopySource(bucket, sourceKey), Key: approvedKey, ContentType: source.contentType, MetadataDirective: 'REPLACE' }))
  } catch { throw new ProfileMediaCopyError('R2 copy failed.', approvedKey, false) }
  try {
    const destination = validateProfileMediaObject(await client.send(new HeadObjectCommand({ Bucket: bucket, Key: approvedKey })), mediaType)
    if (destination.contentType !== source.contentType || destination.contentLength !== source.contentLength) throw new Error('Copied object differs from source.')
  } catch { throw new ProfileMediaCopyError('R2 copy confirmation failed.', approvedKey, true) }
  return { approvedKey, contentType: source.contentType, contentLength: source.contentLength }
}

export async function deleteApprovedProfileMediaObject(key: string) {
  if (!parseApprovedProfileMediaKey(key)) throw new Error('Invalid approved profile media key.')
  const client = getClient(); const bucket = process.env.R2_BUCKET_NAME
  if (!client || !bucket) throw new Error('R2 cleanup configuration is unavailable.')
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    if (isMissingR2ObjectError(error)) return 'deleted' as const
    throw error
  }
  throw new Error('R2 deletion could not be confirmed.')
}

export async function headApprovedProfileMediaObject(key: string) {
  if (!parseApprovedProfileMediaKey(key)) throw new Error('Invalid approved profile media key.')
  const client = getClient(); const bucket = process.env.R2_BUCKET_NAME
  if (!client || !bucket) throw new Error('R2 cleanup configuration is unavailable.')
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    const contentType = (head.ContentType || '').split(';', 1)[0].trim().toLowerCase()
    if (!(contentType in PROFILE_MEDIA_EXTENSION_BY_MIME) || !head.ContentLength || head.ContentLength <= 0) throw new Error('R2 orphan metadata is unsafe.')
    return 'exists' as const
  } catch (error) {
    if (isMissingR2ObjectError(error)) return 'not_found' as const
    throw error
  }
}
