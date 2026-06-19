import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DocumentKind = 'front' | 'back' | 'selfie'

type AgeVerificationDocumentPaths = {
  document_front_path: string | null
  document_back_path: string | null
  selfie_path: string | null
}

const SIGNED_URL_EXPIRES_IN_SECONDS = 5 * 60
const DOCUMENT_KINDS: DocumentKind[] = ['front', 'back', 'selfie']
const SUPABASE_BUCKET_NAME = 'age-verifications'
const R2_PRIVATE_PREFIX = 'private/age-verifications/'

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && DOCUMENT_KINDS.includes(value as DocumentKind)
}

function getPathForKind(paths: AgeVerificationDocumentPaths, kind: DocumentKind) {
  if (kind === 'front') return paths.document_front_path
  if (kind === 'back') return paths.document_back_path
  return paths.selfie_path
}

function isSafeObjectPath(value: string) {
  return Boolean(
    value &&
      !value.startsWith('/') &&
      !value.includes('..') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.includes('?') &&
      !value.includes('#'),
  )
}

function getR2PrivateKey(value: string) {
  const trimmed = value.trim()
  const key = trimmed.startsWith('r2://')
    ? trimmed.slice('r2://'.length).replace(/^\/+/, '')
    : trimmed.replace(/^\/+/, '')

  if (!key.startsWith(R2_PRIVATE_PREFIX)) return null
  if (!isSafeObjectPath(key)) return null

  return key
}

function getSupabaseStoragePath(value: string) {
  const raw = value.trim()

  try {
    const parsed = new URL(raw)
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = '/storage/v1/object/'
    const markerIndex = pathname.indexOf(marker)

    if (markerIndex === -1) return null

    const segments = pathname
      .slice(markerIndex + marker.length)
      .split('/')
      .filter(Boolean)

    if (segments.length < 3) return null

    segments.shift()
    const bucket = segments.shift()
    const objectPath = segments.join('/')

    if (bucket !== SUPABASE_BUCKET_NAME || !isSafeObjectPath(objectPath)) return null
    return objectPath
  } catch {
    const objectPath = raw.replace(/^\/+/, '')
    if (!isSafeObjectPath(objectPath)) return null
    return objectPath
  }
}

function getFileType(reference: string) {
  return reference.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'
}

function getR2BucketName() {
  return (
    process.env.R2_AGE_VERIFICATION_BUCKET_NAME ||
    process.env.R2_PRIVATE_BUCKET_NAME ||
    process.env.R2_BUCKET_NAME ||
    ''
  )
}

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      getR2BucketName(),
  )
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  })
}

async function validateAdmin(request: Request) {
  const supabase = getSupabaseForRequest(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false as const, status: 401, error: 'UNAUTHORIZED' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !isAdminRole(profile?.role)) {
    return { ok: false as const, status: 403, error: 'FORBIDDEN' }
  }

  return { ok: true as const, supabase }
}

export async function POST(request: Request) {
  try {
    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status })
    }

    const body = (await request.json().catch(() => null)) as {
      requestId?: unknown
      documentKind?: unknown
    } | null

    if (typeof body?.requestId !== 'string' || !isDocumentKind(body.documentKind)) {
      return NextResponse.json({ ok: false, error: 'INVALID_DOCUMENT_REQUEST' }, { status: 400 })
    }

    const { data: verificationRequest, error: requestError } = await admin.supabase
      .from('age_verification_requests')
      .select('document_front_path, document_back_path, selfie_path')
      .eq('id', body.requestId)
      .maybeSingle()

    if (requestError) {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_LOOKUP_FAILED' }, { status: 500 })
    }

    if (!verificationRequest) {
      return NextResponse.json({ ok: false, error: 'REQUEST_NOT_FOUND' }, { status: 404 })
    }

    const path = getPathForKind(verificationRequest as AgeVerificationDocumentPaths, body.documentKind)

    if (!path) {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_AVAILABLE' }, { status: 404 })
    }

    const r2Key = getR2PrivateKey(path)

    if (r2Key) {
      if (!hasR2Config()) {
        return NextResponse.json({ ok: false, error: 'SIGNED_URL_FAILED' }, { status: 500 })
      }

      const signedUrl = await getSignedUrl(
        getR2Client(),
        new GetObjectCommand({
          Bucket: getR2BucketName(),
          Key: r2Key,
          ResponseContentDisposition: 'inline',
        }),
        { expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS },
      )

      return NextResponse.json({
        ok: true,
        signedUrl,
        expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS,
        fileType: getFileType(r2Key),
      })
    }

    const storagePath = getSupabaseStoragePath(path)

    if (!storagePath) {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_AVAILABLE' }, { status: 404 })
    }

    const { data, error } = await admin.supabase.storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN_SECONDS)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ ok: false, error: 'SIGNED_URL_FAILED' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      signedUrl: data.signedUrl,
      expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS,
      fileType: getFileType(storagePath),
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
