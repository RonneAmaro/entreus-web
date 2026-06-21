import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const DEFAULT_EXPIRATION_SECONDS = 600

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) return null

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function createR2GetSignedUrl({
  key,
  bucket,
  contentType,
  expiresInSeconds = DEFAULT_EXPIRATION_SECONDS,
}: {
  key: string
  bucket: string
  contentType?: string | null
  expiresInSeconds?: number
}) {
  const client = getR2Client()
  if (!client || !key || !bucket) throw new Error('R2 signed download is unavailable.')

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: contentType || undefined }),
    { expiresIn: Math.min(Math.max(expiresInSeconds, 300), 900) },
  )
}

export const R2_SIGNED_GET_EXPIRATION_SECONDS = DEFAULT_EXPIRATION_SECONDS
