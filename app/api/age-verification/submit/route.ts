import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validateFileContent, validateUploadMetadata, type UploadContext } from '@/lib/upload-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET_NAME = 'age-verifications'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DOCUMENT_TYPES = new Set(['rg', 'cnh', 'passport', 'other'])

type UploadKind = 'document-front' | 'document-back' | 'selfie'

type SubmitBody = {
  requestId?: unknown
  documentType?: unknown
  documentFrontPath?: unknown
  documentBackPath?: unknown
  selfiePath?: unknown
  userStatement?: unknown
  privacyAccepted?: unknown
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

function getAuthClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''
  if (!url || !key || !/^Bearer\s+\S+$/i.test(authorization)) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function parseOwnedAgeVerificationPath(input: {
  value: unknown
  userId: string
  requestId: string
  kind: UploadKind
}) {
  if (typeof input.value !== 'string' || input.value.length > 300) return null
  if (/\\|\.\.|[%?#]|[\u0000-\u001f\u007f]/.test(input.value)) return null
  const parts = input.value.split('/')
  if (parts.length !== 3 || parts[0] !== input.userId || parts[1] !== input.requestId) return null
  const fileNamePattern = new RegExp(`^${input.kind}-[0-9]{10,16}\\.[a-z0-9]{2,5}$`, 'i')
  if (!fileNamePattern.test(parts[2])) return null
  return { path: input.value, folder: `${input.userId}/${input.requestId}`, fileName: parts[2] }
}

async function validateStoredFile(input: {
  storage: ReturnType<SupabaseClient['storage']['from']>
  value: unknown
  userId: string
  requestId: string
  kind: UploadKind
  context: UploadContext
}) {
  const parsed = parseOwnedAgeVerificationPath(input)
  if (!parsed) return { ok: false as const, error: 'INVALID_UPLOAD_REFERENCE' }

  const { data: files, error: listError } = await input.storage.list(parsed.folder, {
    limit: 2,
    search: parsed.fileName,
  })
  const storedFile = files?.find((file) => file.name === parsed.fileName)
  if (listError || !storedFile) return { ok: false as const, error: 'UPLOAD_NOT_FOUND' }

  const metadata = validateUploadMetadata({
    context: input.context,
    fileName: parsed.fileName,
    declaredMime: storedFile.metadata?.mimetype,
    declaredSize: storedFile.metadata?.size,
  })
  if (!metadata.ok) return { ok: false as const, error: 'INVALID_UPLOAD' }

  const { data: blob, error: downloadError } = await input.storage.download(parsed.path)
  if (downloadError || !blob) return { ok: false as const, error: 'UPLOAD_NOT_FOUND' }

  const content = validateFileContent({
    context: input.context,
    fileName: parsed.fileName,
    declaredMime: metadata.mime,
    declaredSize: storedFile.metadata?.size as number,
    bytes: await blob.arrayBuffer(),
  })
  if (!content.ok) return { ok: false as const, error: 'INVALID_UPLOAD' }
  return { ok: true as const, path: parsed.path }
}

function calculateAge(birthDateValue: string) {
  const birthDate = new Date(`${birthDateValue}T00:00:00Z`)
  if (Number.isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) age -= 1
  return age
}

export async function POST(request: Request) {
  try {
    const auth = getAuthClient(request)
    const admin = getAdminClient()
    if (!auth) return jsonError('AUTHENTICATION_REQUIRED', 401)
    if (!admin) return jsonError('SERVER_CONFIGURATION_MISSING', 503)

    const { data: { user }, error: authError } = await auth.auth.getUser()
    if (authError || !user) return jsonError('AUTHENTICATION_REJECTED', 401)

    const body = (await request.json().catch(() => null)) as SubmitBody | null
    const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
    const documentType = typeof body?.documentType === 'string' ? body.documentType : ''
    if (!UUID_PATTERN.test(requestId) || !DOCUMENT_TYPES.has(documentType) || body?.privacyAccepted !== true) {
      return jsonError('INVALID_VERIFICATION_REQUEST', 400)
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('birth_date, is_minor, age_verification_status')
      .eq('id', user.id)
      .maybeSingle()
    const birthDate = typeof profile?.birth_date === 'string' ? profile.birth_date : ''
    const age = birthDate ? calculateAge(birthDate) : null
    if (profileError || !profile || age === null) return jsonError('PROFILE_NOT_ELIGIBLE', 403)
    if (profile.is_minor || age < 18 || profile.age_verification_status === 'approved') {
      return jsonError('PROFILE_NOT_ELIGIBLE', 403)
    }

    const storage = admin.storage.from(BUCKET_NAME)
    const front = await validateStoredFile({
      storage, value: body?.documentFrontPath, userId: user.id, requestId, kind: 'document-front', context: 'age_document',
    })
    if (!front.ok) return jsonError(front.error, 400)

    let backPath: string | null = null
    if (body?.documentBackPath !== null && body?.documentBackPath !== undefined && body.documentBackPath !== '') {
      const back = await validateStoredFile({
        storage, value: body.documentBackPath, userId: user.id, requestId, kind: 'document-back', context: 'age_document',
      })
      if (!back.ok) return jsonError(back.error, 400)
      backPath = back.path
    }

    const selfie = await validateStoredFile({
      storage, value: body?.selfiePath, userId: user.id, requestId, kind: 'selfie', context: 'age_selfie',
    })
    if (!selfie.ok) return jsonError(selfie.error, 400)

    const submittedAt = new Date().toISOString()
    const userStatement = typeof body?.userStatement === 'string' ? body.userStatement.trim().slice(0, 1000) : ''
    const { error: insertError } = await admin.from('age_verification_requests').insert({
      id: requestId,
      user_id: user.id,
      status: 'pending',
      birth_date: birthDate,
      user_statement: userStatement || null,
      document_type: documentType,
      document_front_path: front.path,
      document_back_path: backPath,
      selfie_path: selfie.path,
      submitted_at: submittedAt,
      privacy_accepted_at: submittedAt,
    })
    if (insertError) return jsonError('VERIFICATION_REQUEST_FAILED', 500)

    const { error: profileUpdateError } = await admin.from('profiles').update({
      wants_18_plus: true,
      age_verification_status: 'pending',
      show_sensitive_content: false,
      updated_at: submittedAt,
    }).eq('id', user.id)
    if (profileUpdateError) return jsonError('PROFILE_UPDATE_FAILED', 500)

    return NextResponse.json({ ok: true, requestId })
  } catch {
    return jsonError('INTERNAL_ERROR', 500)
  }
}
