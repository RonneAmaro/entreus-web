import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  UPLOAD_EXTENSION_BY_MIME_TYPE,
  getAllowedUploadContentType,
  getUploadMaxSizeBytes,
  isAllowedVideoMimeType,
  looksLikeVideoUpload,
} from '@/lib/media/upload-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCEPTED_FOLDERS = new Set(['posts', 'comments'])
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20

type PresignBody = {
  fileName?: unknown
  contentType?: unknown
  folder?: unknown
  fileSize?: unknown
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL,
  )
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function getFolder(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return null

  const folder = value.trim()
  if (!folder || folder.includes('/') || folder.includes('\\') || folder.includes('..')) return null

  return ACCEPTED_FOLDERS.has(folder) ? folder : null
}

function buildObjectKey(folder: string, userId: string, contentType: string) {
  const timestamp = Date.now()
  const extension = UPLOAD_EXTENSION_BY_MIME_TYPE[contentType] || 'bin'

  return `${folder}/${userId}/${timestamp}-${crypto.randomUUID()}.${extension}`
}

function normalizeContentType(contentType: unknown, fileName: string) {
  return getAllowedUploadContentType(contentType, fileName)
}

function buildPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`
}

function getRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(request: Request, userId: string) {
  const now = Date.now()
  const rateLimitKey = `${userId}:${getRateLimitIp(request)}`
  const current = rateLimitStore.get(rateLimitKey)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return false
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true
  }

  current.count += 1
  return false
}

export async function POST(request: Request) {
  if (!hasR2Config()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SERVER_UPLOAD_CONFIG_MISSING',
        message: 'Nao foi possivel preparar o upload agora. Tente novamente em instantes.',
      },
      { status: 500 },
    )
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SERVER_AUTH_CONFIG_MISSING',
        message: 'Nao foi possivel preparar o upload agora. Tente novamente em instantes.',
      },
      { status: 500 },
    )
  }

  const supabase = getSupabaseForRequest(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Faca login novamente para publicar.',
      },
      { status: 401 },
    )
  }

  // In-memory rate limiting is best-effort on serverless, but blocks bursts within a warm instance.
  if (isRateLimited(request, user.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'RATE_LIMITED',
        message: 'Muitos uploads em pouco tempo. Tente novamente em instantes.',
      },
      { status: 429 },
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

  const contentType = normalizeContentType(body.contentType, body.fileName)
  const folder = getFolder(body.folder)

  console.info('[R2Presign] Upload solicitado:', {
    fileName: body.fileName,
    fileType: typeof body.contentType === 'string' ? body.contentType : null,
    fileSize: typeof body.fileSize === 'number' ? body.fileSize : null,
    contentType,
    folder,
  })

  if (!contentType) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_FILE_TYPE',
        message: looksLikeVideoUpload(body.contentType, body.fileName)
          ? 'Formato nao aceito. Use MP4, WebM ou MOV para videos.'
          : 'Formato nao permitido. Use JPG, PNG, WEBP ou GIF.',
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
        error: 'INVALID_FILE_SIZE',
        message: 'Tamanho do arquivo invalido.',
      },
      { status: 400 },
    )
  }

  const maxFileSize = getUploadMaxSizeBytes(contentType)

  if (!maxFileSize || body.fileSize > maxFileSize) {
    return NextResponse.json(
      {
        ok: false,
        error: 'FILE_TOO_LARGE',
        message: isAllowedVideoMimeType(contentType)
          ? 'Este video esta muito pesado. Envie um video menor ou comprimido.'
          : contentType === 'image/gif'
            ? 'GIF muito grande. O limite atual e 5 MB.'
          : 'Imagem muito grande. O limite atual e 5 MB.',
      },
      { status: 413 },
    )
  }

  if (!folder) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_FOLDER',
        message: 'Pasta de upload invalida.',
      },
      { status: 400 },
    )
  }

  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucketName = process.env.R2_BUCKET_NAME as string
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const key = buildObjectKey(folder, user.id, contentType)

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
      ContentType: contentType,
    })
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })
    const publicUrl = buildPublicUrl(publicBaseUrl, key)

    console.info('[R2Presign] Upload preparado:', {
      fileName: body.fileName,
      fileType: typeof body.contentType === 'string' ? body.contentType : null,
      fileSize: body.fileSize,
      contentType,
      folder,
      status: 200,
      hasUploadUrl: Boolean(uploadUrl),
      hasPublicUrl: Boolean(publicUrl),
      hasKey: Boolean(key),
    })

    return NextResponse.json({
      ok: true,
      uploadUrl,
      publicUrl,
      key,
      contentType,
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })
  } catch (error) {
    console.error('[R2Presign] Falha ao preparar upload:', {
      fileName: body.fileName,
      fileType: typeof body.contentType === 'string' ? body.contentType : null,
      fileSize: body.fileSize,
      contentType,
      folder,
      error: error instanceof Error ? error.message : 'Erro inesperado no presign.',
    })

    return NextResponse.json(
      {
        ok: false,
        error: 'R2_PRESIGN_FAILED',
        message: 'Nao foi possivel preparar o upload agora. Tente novamente em instantes.',
      },
      { status: 502 },
    )
  }
}
