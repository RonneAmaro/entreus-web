import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCEPTED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])

const IMAGE_MAX_SIZE = 5 * 1024 * 1024
const VIDEO_MAX_SIZE = 30 * 1024 * 1024

function getMissingEnvVars() {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ]

  return required.filter((key) => !process.env[key])
}

function getMaxSize(contentType: string) {
  return contentType.startsWith('video/') ? VIDEO_MAX_SIZE : IMAGE_MAX_SIZE
}

function getExtension(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension && /^[a-z0-9]+$/.test(extension)) {
    return extension
  }

  const fallbackExtensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
  }

  return fallbackExtensions[file.type] || 'bin'
}

function buildPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`
}

export async function POST(request: Request) {
  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_ENV_VARS',
        message: 'Variaveis de ambiente do Cloudflare R2 ausentes.',
        missing,
      },
      { status: 500 },
    )
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_FILE',
        message: 'Envie um arquivo no campo "file" do FormData.',
      },
      { status: 400 },
    )
  }

  if (!ACCEPTED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_FILE_TYPE',
        message:
          'Tipo de arquivo invalido. Use image/jpeg, image/png, image/webp ou video/mp4.',
        contentType: file.type || null,
      },
      { status: 415 },
    )
  }

  const maxSize = getMaxSize(file.type)

  if (file.size > maxSize) {
    return NextResponse.json(
      {
        ok: false,
        error: 'FILE_TOO_LARGE',
        message:
          file.type === 'video/mp4'
            ? 'Videos devem ter no maximo 30 MB.'
            : 'Imagens devem ter no maximo 5 MB.',
        maxSize,
        size: file.size,
      },
      { status: 413 },
    )
  }

  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucketName = process.env.R2_BUCKET_NAME as string
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const key = `posts/${Date.now()}-${crypto.randomUUID()}.${getExtension(file)}`
  const body = Buffer.from(await file.arrayBuffer())

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: file.type,
      }),
    )

    return NextResponse.json({
      ok: true,
      key,
      url: buildPublicUrl(publicBaseUrl, key),
      contentType: file.type,
      size: file.size,
    })
  } catch (error) {
    console.error('Erro ao enviar arquivo para o Cloudflare R2:', error)

    return NextResponse.json(
      {
        ok: false,
        error: 'R2_UPLOAD_FAILED',
        message: 'Nao foi possivel enviar o arquivo para o Cloudflare R2.',
      },
      { status: 502 },
    )
  }
}
