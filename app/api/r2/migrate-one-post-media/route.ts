import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PostMediaCandidate = {
  id: string
  image_url: string | null
  video_url: string | null
}

type MigrationCandidate = {
  id: string
  field: 'image_url' | 'video_url'
  oldUrl: string
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
}

function getMissingEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ]

  return required.filter((key) => !process.env[key])
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

async function findCandidate(
  supabase: SupabaseClient
): Promise<MigrationCandidate | null> {
  const { data: imagePost, error: imageError } = await supabase
    .from('posts')
    .select('id, image_url, video_url')
    .ilike('image_url', '%supabase%')
    .limit(1)
    .maybeSingle<PostMediaCandidate>()

  if (imageError) {
    throw new Error(`posts.image_url: ${imageError.message}`)
  }

  if (imagePost?.image_url) {
    return {
      id: imagePost.id,
      field: 'image_url',
      oldUrl: imagePost.image_url,
    }
  }

  const { data: videoPost, error: videoError } = await supabase
    .from('posts')
    .select('id, image_url, video_url')
    .ilike('video_url', '%supabase%')
    .limit(1)
    .maybeSingle<PostMediaCandidate>()

  if (videoError) {
    throw new Error(`posts.video_url: ${videoError.message}`)
  }

  if (videoPost?.video_url) {
    return {
      id: videoPost.id,
      field: 'video_url',
      oldUrl: videoPost.video_url,
    }
  }

  return null
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

export async function POST() {
  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_ENV_VARS',
        message: 'Variaveis de ambiente ausentes para migracao Supabase -> R2.',
        missing,
      },
      { status: 500 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )

  let candidate: MigrationCandidate | null = null

  try {
    candidate = await findCandidate(supabase)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SUPABASE_SELECT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }

  if (!candidate) {
    return NextResponse.json({
      ok: true,
      migrated: false,
      table: 'posts',
      field: null,
      id: null,
      oldUrl: null,
      newUrl: null,
      key: null,
      contentType: null,
      size: 0,
    })
  }

  let downloaded: Awaited<ReturnType<typeof downloadMedia>>

  try {
    downloaded = await downloadMedia(candidate.oldUrl)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'DOWNLOAD_FAILED',
        message: error instanceof Error ? error.message : String(error),
        table: 'posts',
        field: candidate.field,
        id: candidate.id,
        oldUrl: candidate.oldUrl,
      },
      { status: 502 },
    )
  }

  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucketName = process.env.R2_BUCKET_NAME as string
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const key = `posts/${Date.now()}-${crypto.randomUUID()}.${getExtension(
    downloaded.contentType,
    candidate.oldUrl
  )}`
  const newUrl = buildPublicUrl(publicBaseUrl, key)

  const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: downloaded.body,
        ContentType: downloaded.contentType,
      }),
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'R2_UPLOAD_FAILED',
        message: error instanceof Error ? error.message : String(error),
        table: 'posts',
        field: candidate.field,
        id: candidate.id,
        oldUrl: candidate.oldUrl,
        key,
        contentType: downloaded.contentType,
        size: downloaded.size,
      },
      { status: 502 },
    )
  }

  const { error: updateError } = await supabase
    .from('posts')
    .update({ [candidate.field]: newUrl })
    .eq('id', candidate.id)

  if (updateError) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SUPABASE_UPDATE_FAILED',
        message: updateError.message,
        table: 'posts',
        field: candidate.field,
        id: candidate.id,
        oldUrl: candidate.oldUrl,
        newUrl,
        key,
        contentType: downloaded.contentType,
        size: downloaded.size,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    migrated: true,
    table: 'posts',
    field: candidate.field,
    id: candidate.id,
    oldUrl: candidate.oldUrl,
    newUrl,
    key,
    contentType: downloaded.contentType,
    size: downloaded.size,
  })
}
