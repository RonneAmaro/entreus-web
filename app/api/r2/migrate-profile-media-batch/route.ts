import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProfileMediaCandidate = {
  id: string
  avatar_url: string | null
  banner_url: string | null
}

type ProfileMediaField = 'avatar_url' | 'banner_url'

type MigrationCandidate = {
  id: string
  field: ProfileMediaField
  oldUrl: string
  folder: 'avatars' | 'banners'
}

type MigrationResult = {
  ok: boolean
  id: string
  field: ProfileMediaField
  oldUrl: string
  newUrl: string | null
  key: string | null
  contentType: string | null
  size: number
  error?: string
}

const DEFAULT_LIMIT = 3
const MAX_LIMIT = 5

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function getMissingEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ]

  return required.filter((key) => !process.env[key])
}

function getRequestedLimit(request: Request) {
  const rawLimit = new URL(request.url).searchParams.get('limit')
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_LIMIT
  }

  return Math.min(parsedLimit, MAX_LIMIT)
}

function normalizeContentType(value: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() || ''
}

function getExtensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname
    const extension = pathname.split('.').pop()?.toLowerCase()

    if (extension && /^[a-z0-9]+$/.test(extension)) {
      return extension
    }
  } catch {
    return null
  }

  return null
}

function getExtension(contentType: string, oldUrl: string) {
  return (
    CONTENT_TYPE_EXTENSIONS[contentType] ||
    getExtensionFromUrl(oldUrl) ||
    'bin'
  )
}

function buildPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`
}

function stillPointsToSupabase(value: string | null) {
  return value?.toLowerCase().includes('supabase') || false
}

async function findCandidates(
  supabase: SupabaseClient,
  limit: number
): Promise<MigrationCandidate[]> {
  const candidates: MigrationCandidate[] = []

  const { data: avatarProfiles, error: avatarError } = await supabase
    .from('profiles')
    .select('id, avatar_url, banner_url')
    .ilike('avatar_url', '%supabase%')
    .limit(limit)
    .returns<ProfileMediaCandidate[]>()

  if (avatarError) {
    throw new Error(`profiles.avatar_url: ${avatarError.message}`)
  }

  for (const profile of avatarProfiles || []) {
    if (profile.avatar_url && candidates.length < limit) {
      candidates.push({
        id: profile.id,
        field: 'avatar_url',
        oldUrl: profile.avatar_url,
        folder: 'avatars',
      })
    }
  }

  const remaining = limit - candidates.length

  if (remaining <= 0) {
    return candidates
  }

  const { data: bannerProfiles, error: bannerError } = await supabase
    .from('profiles')
    .select('id, avatar_url, banner_url')
    .ilike('banner_url', '%supabase%')
    .limit(remaining)
    .returns<ProfileMediaCandidate[]>()

  if (bannerError) {
    throw new Error(`profiles.banner_url: ${bannerError.message}`)
  }

  for (const profile of bannerProfiles || []) {
    if (profile.banner_url && candidates.length < limit) {
      candidates.push({
        id: profile.id,
        field: 'banner_url',
        oldUrl: profile.banner_url,
        folder: 'banners',
      })
    }
  }

  return candidates
}

async function downloadMedia(url: string) {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Download falhou com status ${response.status}.`)
  }

  const contentType =
    normalizeContentType(response.headers.get('content-type')) ||
    'application/octet-stream'
  const body = Buffer.from(await response.arrayBuffer())

  if (body.length === 0) {
    throw new Error('Download retornou um arquivo vazio.')
  }

  return {
    body,
    contentType,
    size: body.length,
  }
}

async function migrateCandidate(
  supabase: SupabaseClient,
  r2Client: S3Client,
  candidate: MigrationCandidate
): Promise<MigrationResult> {
  let key: string | null = null
  let newUrl: string | null = null
  let contentType: string | null = null
  let size = 0

  try {
    const downloaded = await downloadMedia(candidate.oldUrl)

    contentType = downloaded.contentType
    size = downloaded.size
    key = `${candidate.folder}/${Date.now()}-${crypto.randomUUID()}.${getExtension(
      contentType,
      candidate.oldUrl
    )}`
    newUrl = buildPublicUrl(process.env.R2_PUBLIC_BASE_URL as string, key)

    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME as string,
        Key: key,
        Body: downloaded.body,
        ContentType: contentType,
      }),
    )

    const { data: updatedByWrite, error: updateError } = await supabase
      .from('profiles')
      .update({ [candidate.field]: newUrl })
      .eq('id', candidate.id)
      .select('id, avatar_url, banner_url')
      .maybeSingle<ProfileMediaCandidate>()

    if (updateError) {
      throw new Error(`Update Supabase falhou: ${updateError.message}`)
    }

    if (!updatedByWrite) {
      throw new Error('Update Supabase nao afetou nenhum registro.')
    }

    const { data: updatedProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, avatar_url, banner_url')
      .eq('id', candidate.id)
      .maybeSingle<ProfileMediaCandidate>()

    if (verifyError) {
      throw new Error(`Verificacao Supabase falhou: ${verifyError.message}`)
    }

    if (!updatedProfile) {
      throw new Error('Verificacao Supabase nao encontrou o registro atualizado.')
    }

    const updatedUrl = updatedProfile[candidate.field]

    if (updatedUrl !== newUrl) {
      throw new Error('Update Supabase nao gravou a nova URL no campo esperado.')
    }

    if (stillPointsToSupabase(updatedUrl)) {
      throw new Error('Campo atualizado ainda aponta para Supabase Storage.')
    }

    return {
      ok: true,
      id: candidate.id,
      field: candidate.field,
      oldUrl: candidate.oldUrl,
      newUrl,
      key,
      contentType,
      size,
    }
  } catch (error) {
    return {
      ok: false,
      id: candidate.id,
      field: candidate.field,
      oldUrl: candidate.oldUrl,
      newUrl,
      key,
      contentType,
      size,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function POST(request: Request) {
  const requestedLimit = getRequestedLimit(request)
  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        requestedLimit,
        processed: 0,
        migrated: 0,
        failed: 0,
        results: [],
        error: 'MISSING_ENV_VARS',
        message:
          'Variaveis de ambiente ausentes para migracao Supabase -> R2. Esta rota precisa de SUPABASE_SERVICE_ROLE_KEY no server-side para atualizar profiles com RLS.',
        missing,
      },
      { status: 500 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  )

  let candidates: MigrationCandidate[] = []

  try {
    candidates = await findCandidates(supabase, requestedLimit)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        requestedLimit,
        processed: 0,
        migrated: 0,
        failed: 0,
        results: [],
        error: 'SUPABASE_SELECT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }

  const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID as string}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  })

  const results: MigrationResult[] = []

  for (const candidate of candidates) {
    results.push(await migrateCandidate(supabase, r2Client, candidate))
  }

  const migrated = results.filter((result) => result.ok).length
  const failed = results.length - migrated

  return NextResponse.json({
    ok: failed === 0,
    requestedLimit,
    processed: results.length,
    migrated,
    failed,
    results,
  })
}
