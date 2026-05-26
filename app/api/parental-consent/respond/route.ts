import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  expires_at: string | null
  created_at: string
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceRoleKey || anonKey

  if (!supabaseUrl || !key) {
    throw new Error('Supabase environment variables are missing.')
  }

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
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
    message.includes('token_hash')
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

async function findRequestByToken(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
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
  try {
    const token = new URL(request.url).searchParams.get('token') || ''

    if (!token) {
      return NextResponse.json({ error: 'Link invalido.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await findRequestByToken(supabase, token)

    if (error || !data) {
      return NextResponse.json({ error: 'Link expirado ou invalido.' }, { status: 404 })
    }

    return NextResponse.json({ request: sanitizeRequest(data as ConsentRequest) })
  } catch (error) {
    console.error('Erro ao carregar autorizacao parental:', error)

    return NextResponse.json(
      { error: 'Nao foi possivel carregar a autorizacao agora.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const token = String(body?.token || '')
    const decision = String(body?.decision || '')
    const signedName = String(body?.signed_name || '').trim()

    if (!token || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Decisao invalida.' }, { status: 400 })
    }

    if (decision === 'approved' && signedName.length < 5) {
      return NextResponse.json({ error: 'Informe o nome completo do responsavel.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await findRequestByToken(supabase, token)

    if (error || !data) {
      return NextResponse.json({ error: 'Link expirado ou invalido.' }, { status: 404 })
    }

    const consentRequest = data as ConsentRequest
    const currentStatus = normalizeStatus(consentRequest)

    if (currentStatus === 'expired') {
      await supabase
        .from('parental_consent_requests')
        .update({ status: 'expired' })
        .eq('id', consentRequest.id)

      await supabase
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

    const decidedAt = new Date().toISOString()
    const updateWithSignature = {
      status: decision,
      approved_at: decision === 'approved' ? decidedAt : consentRequest.approved_at || null,
      rejected_at: decision === 'rejected' ? decidedAt : consentRequest.rejected_at || null,
      signed_name: signedName || null,
      signed_at: decidedAt,
    }
    const updateLegacy = {
      status: decision,
      approved_at: decision === 'approved' ? decidedAt : consentRequest.approved_at || null,
      rejected_at: decision === 'rejected' ? decidedAt : consentRequest.rejected_at || null,
    }

    let updateRequest = await supabase
      .from('parental_consent_requests')
      .update(updateWithSignature)
      .eq('id', consentRequest.id)

    if (isMissingParentalColumnError(updateRequest.error)) {
      updateRequest = await supabase
        .from('parental_consent_requests')
        .update(updateLegacy)
        .eq('id', consentRequest.id)
    }

    if (updateRequest.error) {
      return NextResponse.json(
        { error: 'Nao foi possivel registrar a decisao agora.' },
        { status: 500 },
      )
    }

    const { error: profileError } = await supabase
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
    console.error('Erro ao responder autorizacao parental:', error)

    return NextResponse.json(
      { error: 'Nao foi possivel responder a autorizacao agora.' },
      { status: 500 },
    )
  }
}
