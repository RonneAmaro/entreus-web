import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

export const runtime = 'nodejs'

type ConsentRequest = {
  id: string
  child_user_id: string
  guardian_email: string
  guardian_name?: string | null
  relationship?: string | null
  status: string
  child_birth_date: string | null
  consent_text: string | null
  consent_version?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  guardian_selfie_path?: string | null
  guardian_selfie_uploaded_at?: string | null
  approval_user_agent?: string | null
  expires_at: string | null
  created_at: string
}

type ServerSupabase = {
  client: any
  hasServiceRole: boolean
}

type ParsedDecisionBody = {
  token: string
  decision: string
  signedName: string
  selfieFile: File | null
}

const GUARDIAN_SELFIE_BUCKET = 'age-verifications'
const GUARDIAN_SELFIE_MAX_SIZE_BYTES = 5 * 1024 * 1024
const GUARDIAN_SELFIE_ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const GUARDIAN_SELFIE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function getSupabaseServer(): ServerSupabase {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceRoleKey || anonKey

  if (!supabaseUrl || !key) {
    throw new Error('Supabase environment variables are missing.')
  }

  return {
    client: createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
    hasServiceRole: Boolean(serviceRoleKey),
  }
}

function mapRpcRequest(row: {
  id: string
  guardian_email: string
  status: string
  child_birth_date: string | null
  consent_text: string | null
  expires_at: string | null
  created_at: string
}): ConsentRequest {
  return {
    id: row.id,
    child_user_id: '',
    guardian_email: row.guardian_email,
    status: row.status,
    child_birth_date: row.child_birth_date,
    consent_text: row.consent_text,
    expires_at: row.expires_at,
    created_at: row.created_at,
  }
}

async function findRequestByLegacyRpc(client: ReturnType<typeof createClient>, token: string) {
  const rpcClient = client as any
  const { data, error } = await rpcClient.rpc('get_parental_consent_request', {
    p_token: token,
  })

  if (error) return { data: null, error }

  const rows = (data || []) as Array<{
    id: string
    guardian_email: string
    status: string
    child_birth_date: string | null
    consent_text: string | null
    expires_at: string | null
    created_at: string
  }>

  return {
    data: rows[0] ? mapRpcRequest(rows[0]) : null,
    error: null,
  }
}

async function submitByLegacyRpc(client: ReturnType<typeof createClient>, token: string, decision: string) {
  const rpcClient = client as any
  const { data, error } = await rpcClient.rpc('submit_parental_consent', {
    p_token: token,
    p_decision: decision,
  })

  if (error) return { data: null, error }

  const result = data as { success?: boolean; status?: string; message?: string } | null

  return {
    data: {
      success: Boolean(result?.success),
      status: result?.status || decision,
      message: result?.message || (decision === 'approved' ? 'Autorizacao aprovada.' : 'Autorizacao recusada.'),
    },
    error: null,
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isMissingParentalColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false

  const message = (error.message || '').toLowerCase()

  return (
    error.code === '42703' ||
    message.includes('guardian_name') ||
    message.includes('relationship') ||
    message.includes('consent_version') ||
    message.includes('signed_name') ||
    message.includes('signed_at') ||
    message.includes('token_hash') ||
    message.includes('guardian_selfie_path') ||
    message.includes('guardian_selfie_uploaded_at') ||
    message.includes('approval_user_agent')
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeStatus(request: ConsentRequest) {
  if (request.status === 'pending' && request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    return 'expired'
  }

  return request.status
}

function sanitizeRequest(request: ConsentRequest) {
  return {
    id: request.id,
    guardian_email: request.guardian_email,
    guardian_name: request.guardian_name || null,
    relationship: request.relationship || null,
    status: normalizeStatus(request),
    child_birth_date: request.child_birth_date,
    consent_text: request.consent_text,
    consent_version: request.consent_version || '2026-05',
    expires_at: request.expires_at,
    created_at: request.created_at,
  }
}

async function parseDecisionBody(request: Request): Promise<ParsedDecisionBody> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const formData = await request.formData()
    const selfieValue = formData.get('guardian_selfie')

    return {
      token: String(formData.get('token') || ''),
      decision: String(formData.get('decision') || ''),
      signedName: String(formData.get('signed_name') || '').trim(),
      selfieFile: selfieValue instanceof File ? selfieValue : null,
    }
  }

  const body = await request.json().catch(() => null)

  return {
    token: String(body?.token || ''),
    decision: String(body?.decision || ''),
    signedName: String(body?.signed_name || '').trim(),
    selfieFile: null,
  }
}

function validateGuardianSelfie(file: File | null) {
  if (!file || file.size === 0) {
    return 'Envie uma selfie simples do responsavel para aprovar a autorizacao.'
  }

  if (!GUARDIAN_SELFIE_ACCEPTED_TYPES.has(file.type)) {
    return 'A selfie precisa ser uma imagem JPG, PNG ou WEBP.'
  }

  if (file.size > GUARDIAN_SELFIE_MAX_SIZE_BYTES) {
    return 'A selfie deve ter no maximo 5 MB.'
  }

  return ''
}

async function ensureGuardianSelfieColumns(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase
    .from('parental_consent_requests')
    .select('guardian_selfie_path, guardian_selfie_uploaded_at, approval_user_agent')
    .limit(1)

  return !isMissingParentalColumnError(error)
}

function buildGuardianSelfiePath(requestId: string, file: File) {
  const extension = GUARDIAN_SELFIE_EXTENSIONS[file.type] || 'jpg'
  return `parental-consent/${requestId}/guardian-selfie-${Date.now()}.${extension}`
}

async function findRequestByToken(server: ServerSupabase, token: string) {
  const supabase = server.client

  if (!server.hasServiceRole) {
    if (!isUuid(token)) {
      return {
        data: null,
        error: { message: 'A validacao segura do link precisa da chave de servidor configurada.' },
      }
    }

    return findRequestByLegacyRpc(supabase, token)
  }

  const tokenHash = hashToken(token)

  let result = await supabase
    .from('parental_consent_requests')
    .select(
      'id, child_user_id, guardian_email, guardian_name, relationship, status, child_birth_date, consent_text, consent_version, approved_at, rejected_at, expires_at, created_at',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (isMissingParentalColumnError(result.error)) {
    result = await supabase
      .from('parental_consent_requests')
      .select('id, child_user_id, guardian_email, status, child_birth_date, consent_text, approved_at, rejected_at, expires_at, created_at')
      .eq('token', token)
      .maybeSingle()
  } else if (!result.error && !result.data && isUuid(token)) {
    result = await supabase
      .from('parental_consent_requests')
      .select(
        'id, child_user_id, guardian_email, guardian_name, relationship, status, child_birth_date, consent_text, consent_version, approved_at, rejected_at, expires_at, created_at',
      )
      .eq('token', token)
      .maybeSingle()

    if (isMissingParentalColumnError(result.error)) {
      result = await supabase
        .from('parental_consent_requests')
        .select('id, child_user_id, guardian_email, status, child_birth_date, consent_text, approved_at, rejected_at, expires_at, created_at')
        .eq('token', token)
        .maybeSingle()
    }
  }

  return result
}

export async function GET(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const token = new URL(request.url).searchParams.get('token') || ''

    if (!token) {
      return NextResponse.json({ error: 'Link invalido.' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const { data, error } = await findRequestByToken(supabase, token)

    if (error || !data) {
      return NextResponse.json(
        {
          error: error?.message?.includes('chave de servidor')
            ? 'Nao foi possivel validar este link agora. A configuracao de servidor precisa ser revisada.'
            : 'Link expirado ou invalido.',
        },
        { status: error?.message?.includes('chave de servidor') ? 503 : 404 },
      )
    }

    return NextResponse.json({ request: sanitizeRequest(data as ConsentRequest) })
  } catch (error) {
    logServerEvent('error', {
      event: 'parental_consent_respond.load_failed',
      requestId,
      error,
    })

    return NextResponse.json(
      { error: 'Nao foi possivel carregar a autorizacao agora.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const parsedBody = await parseDecisionBody(request)
    const token = parsedBody.token
    const decision = parsedBody.decision
    const signedName = parsedBody.signedName

    if (!token || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Decisao invalida.' }, { status: 400 })
    }

    if (decision === 'approved' && signedName.length < 5) {
      return NextResponse.json({ error: 'Informe o nome completo do responsavel.' }, { status: 400 })
    }

    if (decision === 'approved') {
      const selfieError = validateGuardianSelfie(parsedBody.selfieFile)

      if (selfieError) {
        return NextResponse.json({ error: selfieError }, { status: 400 })
      }
    }

    const supabase = getSupabaseServer()
    const { data, error } = await findRequestByToken(supabase, token)

    if (error || !data) {
      return NextResponse.json(
        {
          error: error?.message?.includes('chave de servidor')
            ? 'Nao foi possivel validar este link agora. A configuracao de servidor precisa ser revisada.'
            : 'Link expirado ou invalido.',
        },
        { status: error?.message?.includes('chave de servidor') ? 503 : 404 },
      )
    }

    const consentRequest = data as ConsentRequest
    const currentStatus = normalizeStatus(consentRequest)

    if (currentStatus === 'expired') {
      if (supabase.hasServiceRole) {
        await supabase.client
          .from('parental_consent_requests')
          .update({ status: 'expired' })
          .eq('id', consentRequest.id)

        await supabase.client
          .from('profiles')
          .update({
            parental_consent_status: 'pending',
            is_minor: true,
            wants_18_plus: false,
            show_sensitive_content: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consentRequest.child_user_id)
          .neq('parental_consent_status', 'approved')
      }

      return NextResponse.json(
        { error: 'Este link expirou. Solicite um novo pedido de autorizacao.', status: 'expired' },
        { status: 410 },
      )
    }

    if (currentStatus !== 'pending') {
      return NextResponse.json({
        success: true,
        status: currentStatus,
        message: 'Esta solicitacao ja foi respondida.',
      })
    }

    if (!supabase.hasServiceRole) {
      if (decision === 'approved') {
        return NextResponse.json(
          { error: 'A aprovacao com selfie precisa da chave de servidor configurada.' },
          { status: 503 },
        )
      }

      const legacyResult = await submitByLegacyRpc(supabase.client, token, decision)

      if (legacyResult.error || !legacyResult.data) {
        return NextResponse.json(
          { error: 'Nao foi possivel registrar a decisao agora. A configuracao de servidor precisa ser revisada.' },
          { status: 503 },
        )
      }

      return NextResponse.json(legacyResult.data)
    }

    const decidedAt = new Date().toISOString()
    let guardianSelfiePath: string | null = null

    if (decision === 'approved') {
      const hasSelfieColumns = await ensureGuardianSelfieColumns(supabase.client)

      if (!hasSelfieColumns) {
        return NextResponse.json(
          { error: 'A aprovacao com selfie ainda precisa da migration parental mais recente.' },
          { status: 503 },
        )
      }

      const selfieFile = parsedBody.selfieFile as File
      guardianSelfiePath = buildGuardianSelfiePath(consentRequest.id, selfieFile)

      const { error: uploadError } = await supabase.client.storage
        .from(GUARDIAN_SELFIE_BUCKET)
        .upload(guardianSelfiePath, selfieFile, {
          contentType: selfieFile.type,
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: 'Nao foi possivel enviar a selfie do responsavel. Tente novamente.' },
          { status: 500 },
        )
      }
    }

    const updateWithSignature = {
      status: decision,
      approved_at: decision === 'approved' ? decidedAt : consentRequest.approved_at || null,
      rejected_at: decision === 'rejected' ? decidedAt : consentRequest.rejected_at || null,
      signed_name: signedName || null,
      signed_at: decidedAt,
      guardian_selfie_path: guardianSelfiePath,
      guardian_selfie_uploaded_at: guardianSelfiePath ? decidedAt : null,
      approval_user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
    }
    const updateLegacy = {
      status: decision,
      approved_at: decision === 'approved' ? decidedAt : consentRequest.approved_at || null,
      rejected_at: decision === 'rejected' ? decidedAt : consentRequest.rejected_at || null,
    }

    let updateRequest = await supabase
      .client
      .from('parental_consent_requests')
      .update(updateWithSignature)
      .eq('id', consentRequest.id)
      .eq('status', 'pending')

    if (isMissingParentalColumnError(updateRequest.error)) {
      updateRequest = await supabase
        .client
        .from('parental_consent_requests')
        .update(updateLegacy)
        .eq('id', consentRequest.id)
        .eq('status', 'pending')
    }

    if (updateRequest.error) {
      return NextResponse.json(
        { error: 'Nao foi possivel registrar a decisao agora.' },
        { status: 500 },
      )
    }

    const { data: latestRequest } = await supabase.client
      .from('parental_consent_requests')
      .select('status')
      .eq('id', consentRequest.id)
      .maybeSingle()

    const latestStatus = String(latestRequest?.status || decision)

    if (latestStatus !== decision) {
      return NextResponse.json({
        success: true,
        status: latestStatus,
        message: 'Esta solicitacao ja foi respondida.',
      })
    }

    const { error: profileError } = await supabase.client
      .from('profiles')
      .update({
        parental_consent_status: decision,
        is_minor: true,
        wants_18_plus: false,
        show_sensitive_content: false,
        updated_at: decidedAt,
      })
      .eq('id', consentRequest.child_user_id)

    if (profileError) {
      return NextResponse.json(
        { error: 'A decisao foi registrada, mas nao foi possivel atualizar a conta do menor.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      status: decision,
      message: decision === 'approved' ? 'Autorizacao aprovada.' : 'Autorizacao recusada.',
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'parental_consent_respond.submit_failed',
      requestId,
      error,
    })

    return NextResponse.json(
      { error: 'Nao foi possivel responder a autorizacao agora.' },
      { status: 500 },
    )
  }
}
