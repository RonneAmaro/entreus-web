import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCEPTED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
])

const ACCEPTED_FOLDERS = new Set(['posts', 'comments', 'avatars', 'banners', 'messages'])
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_SIZE_BYTES = 30 * 1024 * 1024

type PresignBody = {
  fileName?: unknown
  contentType?: unknown
  folder?: unknown
  fileSize?: unknown
}

const EXTENSIONS_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogg',
}

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL,
  )
}

function getFolder(value: unknown) {
  if (value === undefined || value === null) return 'posts'
  if (typeof value !== 'string') return null

  const folder = value.trim()
  if (!folder) return 'posts'

  return ACCEPTED_FOLDERS.has(folder) ? folder : null
}

function buildObjectKey(folder: string, contentType: string) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const extension = EXTENSIONS_BY_CONTENT_TYPE[contentType] || 'bin'

  return `${folder}/${year}/${month}/${crypto.randomUUID()}.${extension}`
}

function buildPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`
}

function getMaxSize(contentType: string) {
  return contentType.startsWith('video/') ? VIDEO_MAX_SIZE_BYTES : IMAGE_MAX_SIZE_BYTES
}

export async function POST(request: Request) {
  if (!hasR2Config()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Configuracao Cloudflare R2 ausente no servidor.',
      },
      { status: 500 },
    )
  }

  let body: PresignBody

  try {
    body = (await request.json()) as PresignBody
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'JSON invalido.',
      },
      { status: 400 },
    )
  }

  if (typeof body.fileName !== 'string' || body.fileName.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nome do arquivo ausente.',
      },
      { status: 400 },
    )
  }

  if (typeof body.contentType !== 'string' || !ACCEPTED_CONTENT_TYPES.has(body.contentType)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Tipo de arquivo invalido.',
      },
      { status: 415 },
    )
  }

  if (
    typeof body.fileSize !== 'number' ||
    !Number.isFinite(body.fileSize) ||
    body.fileSize <= 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Tamanho do arquivo invalido.',
      },
      { status: 400 },
    )
  }

  if (body.fileSize > getMaxSize(body.contentType)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Arquivo muito grande.',
        message: body.contentType.startsWith('video/')
          ? 'Esse video esta muito grande. Tente usar um video menor ou otimize no editor antes de publicar.'
          : 'Essa imagem esta muito grande. Use uma imagem de ate 5 MB.',
      },
      { status: 413 },
    )
  }

  const folder = getFolder(body.folder)

  if (!folder) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Pasta invalida.',
      },
      { status: 400 },
    )
  }

  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucketName = process.env.R2_BUCKET_NAME as string
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const key = buildObjectKey(folder, body.contentType)

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: body.contentType,
    })
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })

    return NextResponse.json({
      ok: true,
      uploadUrl,
      publicUrl: buildPublicUrl(publicBaseUrl, key),
      key,
      contentType: body.contentType,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nao foi possivel preparar o upload para o R2.',
      },
      { status: 502 },
    )
  }
}
