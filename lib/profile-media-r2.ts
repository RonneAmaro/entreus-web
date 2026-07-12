import { CopyObjectCommand, HeadObjectCommand, S3Client, type HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { ownsProfileMediaStorageKey, type ProfileMediaType } from '@/lib/profile-media-moderation'

export const PROFILE_MEDIA_EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const
const PROFILE_MEDIA_MAX_BYTES: Record<ProfileMediaType, number> = { avatar: 5 * 1024 * 1024, banner: 10 * 1024 * 1024 }
export type AllowedProfileMediaMime = keyof typeof PROFILE_MEDIA_EXTENSION_BY_MIME

function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID; const accessKeyId = process.env.R2_ACCESS_KEY_ID; const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } })
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
  return `profile-media/public/${userId}/${crypto.randomUUID()}${PROFILE_MEDIA_EXTENSION_BY_MIME[contentType]}`
}

export function buildApprovedProfileMediaUrl(publicBaseUrl: string, userId: string, approvedKey: string) {
  const expectedPrefix = `profile-media/public/${userId}/`
  if (!approvedKey.startsWith(expectedPrefix) || approvedKey.includes('..') || approvedKey.includes('\\')) throw new Error('Invalid approved profile media key.')
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
