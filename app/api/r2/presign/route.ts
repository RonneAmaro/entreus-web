import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { canPreparePostMediaUpload, resolvePostMediaAccessLevel } from '@/lib/media/post-media-access'
import {
  UPLOAD_EXTENSION_BY_MIME_TYPE,
  formatUploadLimitMegabytes,
  getAllowedUploadContentType,
  getUploadMaxSizeBytes,
  isAllowedVideoMimeType,
  looksLikeVideoUpload,
  resolveVideoUploadLimit,
  type VideoUploadEntitlement,
  type VideoUploadLimit,
} from '@/lib/media/upload-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type R2UploadFolder = 'posts' | 'comments' | 'profiles/avatars' | 'profiles/banners'

const ACCEPTED_FOLDERS = new Set<R2UploadFolder>([
  'posts',
  'comments',
  'profiles/avatars',
  'profiles/banners',
])
const PROFILE_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PROFILE_AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024
const PROFILE_BANNER_MAX_SIZE_BYTES = 10 * 1024 * 1024
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20

type PresignBody = {
  fileName?: unknown
  contentType?: unknown
  folder?: unknown
  fileSize?: unknown
  communityType?: unknown
  contentRating?: unknown
  accessLevel?: unknown
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

type UserBadgeRow = {
  badges: { slug?: string | null } | { slug?: string | null }[] | null
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
  if (!folder || folder.includes('\\') || folder.includes('..')) return null

  return ACCEPTED_FOLDERS.has(folder as R2UploadFolder) ? (folder as R2UploadFolder) : null
}

function getSupabaseAdminForUploadLimits() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function buildObjectKey(folder: R2UploadFolder, userId: string, contentType: string, accessLevel: 'public' | 'protected' | 'adult_private') {
  const timestamp = Date.now()
  const extension = UPLOAD_EXTENSION_BY_MIME_TYPE[contentType] || 'bin'

  const prefix =
    accessLevel === 'adult_private'
      ? 'protected/adult-post-media'
      : accessLevel === 'protected'
        ? 'protected/paid-post-media'
        : folder
  return `${prefix}/${userId}/${timestamp}-${crypto.randomUUID()}.${extension}`
}

function isProfileMediaFolder(folder: R2UploadFolder) {
  return folder === 'profiles/avatars' || folder === 'profiles/banners'
}

function getMaxFileSize(folder: R2UploadFolder, contentType: string, entitlement?: VideoUploadEntitlement) {
  if (folder === 'profiles/avatars') return PROFILE_AVATAR_MAX_SIZE_BYTES
  if (folder === 'profiles/banners') return PROFILE_BANNER_MAX_SIZE_BYTES
  return getUploadMaxSizeBytes(contentType, entitlement)
}

function getFileTooLargeMessage(folder: R2UploadFolder, contentType: string, maxFileSize: number | null) {
  if (folder === 'profiles/avatars') return 'Avatar muito grande. O limite atual e 5 MB.'
  if (folder === 'profiles/banners') return 'Banner muito grande. O limite atual e 10 MB.'
  return isAllowedVideoMimeType(contentType)
    ? `Seu limite atual e ${formatUploadLimitMegabytes(maxFileSize || 0)}. Tente comprimir o video antes de publicar. VIP/Anciao tem limites maiores.`
    : contentType === 'image/gif'
      ? 'GIF muito grande. O limite atual e 5 MB.'
      : 'Imagem muito grande. O limite atual e 5 MB.'
}

async function getVideoUploadEntitlement(userId: string): Promise<VideoUploadEntitlement> {
  const supabase = getSupabaseAdminForUploadLimits()

  if (!supabase) {
    console.warn('[R2Presign] Upload entitlement lookup unavailable; using the standard video limit.')
    return {}
  }

  const [profileResult, badgeResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('vip_status, vip_expires_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_badges')
      .select('badges ( slug )')
      .eq('user_id', userId),
  ])

  if (profileResult.error || badgeResult.error) {
    console.warn('[R2Presign] Upload entitlement lookup failed; using available entitlement data.')
  }

  const profile = profileResult.data as {
    vip_status?: string | null
    vip_expires_at?: string | null
  } | null
  const badgeSlugs = ((badgeResult.data || []) as UserBadgeRow[])
    .flatMap((row) => (Array.isArray(row.badges) ? row.badges : [row.badges]))
    .map((badge) => badge?.slug || '')
    .filter(Boolean)

  return {
    vipStatus: profile?.vip_status,
    vipExpiresAt: profile?.vip_expires_at,
    badgeSlugs,
  }
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
  const accessLevel = resolvePostMediaAccessLevel({
    communityType: body.communityType,
    contentRating: body.contentRating,
    accessLevel: body.accessLevel,
  })

  console.info('[R2Presign] Upload solicitado:', {
    fileName: body.fileName,
    fileType: typeof body.contentType === 'string' ? body.contentType : null,
    fileSize: typeof body.fileSize === 'number' ? body.fileSize : null,
    contentType,
    folder,
  })

  if (!folder || !accessLevel || (accessLevel !== 'public' && folder !== 'posts')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_FOLDER',
        message: 'Pasta de upload invalida.',
      },
      { status: 400 },
    )
  }

  if (accessLevel === 'adult_private') {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_minor, wants_18_plus, age_verification_status, parental_consent_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !canPreparePostMediaUpload(accessLevel, profile
      ? {
          isMinor: profile.is_minor,
          wants18Plus: profile.wants_18_plus,
          ageVerificationStatus: profile.age_verification_status,
          parentalConsentStatus: profile.parental_consent_status,
        }
      : null)) {
      return NextResponse.json(
        { ok: false, error: 'ADULT_UPLOAD_NOT_ALLOWED', message: 'Este conteudo nao esta disponivel para sua conta.' },
        { status: 403 },
      )
    }
  }

  if (!contentType || (folder && isProfileMediaFolder(folder) && !PROFILE_IMAGE_CONTENT_TYPES.has(contentType))) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_FILE_TYPE',
        message: folder && isProfileMediaFolder(folder)
          ? 'Formato nao permitido. Use JPG, PNG ou WEBP.'
          : looksLikeVideoUpload(body.contentType, body.fileName)
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

  let videoUploadLimit: VideoUploadLimit | null = null
  let uploadEntitlement: VideoUploadEntitlement | undefined

  if (folder === 'posts' && isAllowedVideoMimeType(contentType)) {
    uploadEntitlement = await getVideoUploadEntitlement(user.id)
    videoUploadLimit = resolveVideoUploadLimit(uploadEntitlement)
  }

  const maxFileSize = getMaxFileSize(folder, contentType, uploadEntitlement)

  if (!maxFileSize || body.fileSize > maxFileSize) {
    return NextResponse.json(
      {
        ok: false,
        error: 'FILE_TOO_LARGE',
        message: getFileTooLargeMessage(folder, contentType, maxFileSize),
        maxFileSize,
        maxFileSizeMb: formatUploadLimitMegabytes(maxFileSize || 0),
      },
      { status: 413 },
    )
  }

  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucketName = process.env.R2_BUCKET_NAME as string
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const key = buildObjectKey(folder, user.id, contentType, accessLevel)

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
      ContentLength: body.fileSize,
    })
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })
    const publicUrl = accessLevel === 'public' ? buildPublicUrl(publicBaseUrl, key) : null

    console.info('[R2Presign] Upload preparado:', {
      fileName: body.fileName,
      fileType: typeof body.contentType === 'string' ? body.contentType : null,
      fileSize: body.fileSize,
      contentType,
      folder,
      status: 200,
      hasUploadUrl: Boolean(uploadUrl),
      accessLevel,
      hasPublicUrl: Boolean(publicUrl),
      hasKey: Boolean(key),
    })

    return NextResponse.json({
      ok: true,
      uploadUrl,
      ...(publicUrl ? { publicUrl } : {}),
      key,
      storageProvider: 'r2',
      storageBucket: bucketName,
      storageKey: key,
      accessLevel,
      mediaType: contentType === 'image/gif' ? 'gif' : contentType.startsWith('video/') ? 'video' : 'image',
      contentType,
      maxFileSize,
      videoUploadTier: videoUploadLimit?.tier || null,
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
