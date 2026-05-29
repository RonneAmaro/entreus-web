import { createHash, randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestSiteUrl, siteConfig } from '@/lib/site-config'

export const runtime = 'nodejs'

const CONSENT_VERSION = '2026-05'

type ParentalConsentRequest = {
  id: string
  child_user_id: string
  guardian_email: string
  guardian_name?: string | null
  relationship?: string | null
  token?: string | null
  status: string
  child_birth_date: string | null
  expires_at: string | null
  created_at: string
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function buildEmailText({
  approvalUrl,
  guardianName,
}: {
  approvalUrl: string
  guardianName: string
}) {
  const greeting = guardianName ? `Ola, ${guardianName}.` : 'Ola.'

  return `${greeting}

Voce recebeu esta mensagem porque um usuario menor de idade informou este e-mail como responsavel para uma solicitacao de autorizacao na plataforma EntreUS.

Antes de responder, leia o termo exibido no link abaixo. Voce podera autorizar ou recusar a solicitacao.

Importante:
- A autorizacao permite apenas o uso geral da rede social.
- A autorizacao do responsavel nao libera conteudo 18+.
- Conteudo 18+ permanece bloqueado para menores.
- O link vale por 7 dias.

Para analisar e responder a solicitacao, acesse:
${approvalUrl}

Se voce nao reconhece esta solicitacao, ignore este e-mail ou fale com o suporte: ${siteConfig.emails.support}

EntreUS - So Entre Nos`
}

async function sendResendEmail({
  to,
  approvalUrl,
  guardianName,
}: {
  to: string
  approvalUrl: string
  guardianName: string
}) {
  const resendApiKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM

  if (!resendApiKey || !emailFrom) {
    return {
      sent: false,
      configured: false,
      message: 'Nao foi possivel enviar o e-mail agora. A configuracao de envio precisa ser revisada.',
    }
  }

  let response: Response

  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to,
        subject: 'Autorizacao de acesso a EntreUS',
        text: buildEmailText({ approvalUrl, guardianName }),
      }),
    })
  } catch (error) {
    console.error('Falha de rede ao enviar e-mail parental pela Resend:', error)

    return {
      sent: false,
      configured: true,
      message: 'Nao foi possivel enviar o e-mail agora. Verifique o endereco do responsavel ou tente novamente.',
    }
  }

  if (!response.ok) {
    console.error('Erro ao enviar e-mail parental pela Resend:', response.status)

    return {
      sent: false,
      configured: true,
      message: 'Nao foi possivel enviar o e-mail agora. Verifique o endereco do responsavel ou tente novamente.',
    }
  }

  return {
    sent: true,
    configured: true,
    message: 'Enviamos um e-mail para seu responsavel.',
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const guardianEmail = String(body?.guardian_email || '').trim().toLowerCase()
    const guardianName = String(body?.guardian_name || '').trim()
    const relationship = String(body?.relationship || '').trim()

    if (!isValidEmail(guardianEmail)) {
      return NextResponse.json({ error: 'Informe um e-mail valido do responsavel.' }, { status: 400 })
    }

    if (guardianName && guardianName.length < 3) {
      return NextResponse.json({ error: 'Informe o nome do responsavel.' }, { status: 400 })
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Entre na sua conta para solicitar autorizacao.' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, birth_date, is_minor, parental_consent_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: 'Nao foi possivel verificar sua conta agora.' },
        { status: 500 },
      )
    }

    if (!profile?.is_minor) {
      return NextResponse.json(
        { error: 'Este fluxo e exclusivo para usuarios menores de 18 anos.' },
        { status: 403 },
      )
    }

    if (profile.parental_consent_status === 'approved') {
      return NextResponse.json(
        { error: 'A autorizacao do responsavel ja foi aprovada.' },
        { status: 400 },
      )
    }

    const token = randomUUID()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const consentText =
      'O responsavel autoriza o uso geral da plataforma EntreUS por um menor. Conteudos 18+ permanecem bloqueados para menores.'

    const insertWithResponsible = {
      child_user_id: user.id,
      guardian_email: guardianEmail,
      guardian_name: guardianName || null,
      relationship: relationship || null,
      token,
      token_hash: tokenHash,
      child_birth_date: profile.birth_date || null,
      consent_text: consentText,
      consent_version: CONSENT_VERSION,
      status: 'pending',
      expires_at: expiresAt,
    }
    const insertLegacy = {
      child_user_id: user.id,
      guardian_email: guardianEmail,
      token,
      child_birth_date: profile.birth_date || null,
      consent_text: consentText,
      status: 'pending',
      expires_at: expiresAt,
    }

    let created = await supabase
      .from('parental_consent_requests')
      .insert(insertWithResponsible)
      .select('id, child_user_id, guardian_email, guardian_name, relationship, token, status, child_birth_date, expires_at, created_at')
      .single()

    if (isMissingParentalColumnError(created.error)) {
      created = await supabase
        .from('parental_consent_requests')
        .insert(insertLegacy)
        .select('id, child_user_id, guardian_email, token, status, child_birth_date, expires_at, created_at')
        .single()
    }

    if (created.error || !created.data) {
      return NextResponse.json(
        { error: 'Nao foi possivel criar a solicitacao de autorizacao.' },
        { status: 500 },
      )
    }

    const consentRequest = created.data as ParentalConsentRequest

    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        parental_consent_status: 'pending',
        is_minor: true,
        wants_18_plus: false,
        show_sensitive_content: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateProfileError) {
      return NextResponse.json(
        { error: 'A solicitacao foi criada, mas nao foi possivel atualizar o status da conta.' },
        { status: 500 },
      )
    }

    const approvalUrl = `${getRequestSiteUrl(request)}/parental-consent/${token}`
    const emailResult = await sendResendEmail({
      to: guardianEmail,
      approvalUrl,
      guardianName,
    })
    const isProduction = process.env.NODE_ENV === 'production'
    const canUseDevLink = !isProduction && !emailResult.sent

    return NextResponse.json(
      {
        success: emailResult.sent || canUseDevLink,
        email_sent: emailResult.sent,
        email_configured: emailResult.configured,
        message: canUseDevLink
          ? 'E-mail automatico nao configurado. Use o link de teste em desenvolvimento.'
          : emailResult.message,
        approval_url: canUseDevLink ? approvalUrl : null,
        request: {
          ...consentRequest,
          token: canUseDevLink ? token : null,
        },
      },
      { status: emailResult.sent || canUseDevLink ? 200 : 503 },
    )
  } catch (error) {
    console.error('Erro ao solicitar autorizacao parental por e-mail:', error)

    return NextResponse.json(
      { error: 'Nao foi possivel solicitar autorizacao parental agora.' },
      { status: 500 },
    )
  }
}
