import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type ParentalConsentRequest = {
  id: string
  child_user_id: string
  guardian_email: string
  token: string
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

function getSiteUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '')
  }

  return new URL(request.url).origin
}

function buildEmailText(approvalUrl: string) {
  return `Ola,

Um usuario menor de idade informou este e-mail como responsavel para autorizar o uso geral da plataforma EntreUS.

Ao autorizar, voce permite que ele utilize recursos gerais da rede social.

Importante:
A autorizacao do responsavel nao libera conteudo 18+.
Conteudo 18+ permanece bloqueado para menores.

Para analisar e responder a solicitacao, acesse:
${approvalUrl}

Se voce nao reconhece esta solicitacao, ignore este e-mail.

EntreUS - So Entre Nos`
}

async function sendResendEmail({
  to,
  approvalUrl,
}: {
  to: string
  approvalUrl: string
}) {
  const resendApiKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM

  if (!resendApiKey || !emailFrom) {
    return {
      sent: false,
      configured: false,
      message: 'O e-mail automatico ainda nao esta configurado.',
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
        subject: 'Autorizacao de responsavel - EntreUS',
        text: buildEmailText(approvalUrl),
      }),
    })
  } catch (error) {
    console.error('Falha de rede ao enviar e-mail parental pela Resend:', error)

    return {
      sent: false,
      configured: true,
      message: 'Nao foi possivel enviar o e-mail automatico agora.',
    }
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    console.error('Erro ao enviar e-mail parental pela Resend:', response.status, responseBody)

    return {
      sent: false,
      configured: true,
      message: 'Nao foi possivel enviar o e-mail automatico agora.',
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

    if (!isValidEmail(guardianEmail)) {
      return NextResponse.json({ error: 'Informe um e-mail valido do responsavel.' }, { status: 400 })
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
        { status: 500 }
      )
    }

    if (!profile?.is_minor) {
      return NextResponse.json(
        { error: 'Este fluxo e exclusivo para usuarios menores de 18 anos.' },
        { status: 403 }
      )
    }

    if (profile.parental_consent_status === 'approved') {
      return NextResponse.json(
        { error: 'A autorizacao do responsavel ja foi aprovada.' },
        { status: 400 }
      )
    }

    let consentRequest: ParentalConsentRequest | null = null

    const { data: existingRequest, error: existingError } = await supabase
      .from('parental_consent_requests')
      .select('id, child_user_id, guardian_email, token, status, child_birth_date, expires_at, created_at')
      .eq('child_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { error: 'Nao foi possivel verificar solicitacoes existentes.' },
        { status: 500 }
      )
    }

    if (existingRequest) {
      consentRequest = existingRequest as ParentalConsentRequest
    } else {
      const consentText =
        'Voce esta autorizando o uso geral da plataforma EntreUS por um menor. Conteudos 18+ permanecem bloqueados para menores.'

      const { data: createdRequest, error: createError } = await supabase
        .from('parental_consent_requests')
        .insert({
          child_user_id: user.id,
          guardian_email: guardianEmail,
          child_birth_date: profile.birth_date || null,
          consent_text: consentText,
          status: 'pending',
        })
        .select('id, child_user_id, guardian_email, token, status, child_birth_date, expires_at, created_at')
        .single()

      if (createError) {
        return NextResponse.json(
          { error: 'Nao foi possivel criar a solicitacao de autorizacao.' },
          { status: 500 }
        )
      }

      consentRequest = createdRequest as ParentalConsentRequest
    }

    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        parental_consent_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateProfileError) {
      return NextResponse.json(
        { error: 'A solicitacao foi criada, mas nao foi possivel atualizar o status da conta.' },
        { status: 500 }
      )
    }

    const approvalUrl = `${getSiteUrl(request)}/parental-consent/${consentRequest.token}`
    const emailResult = await sendResendEmail({
      to: consentRequest.guardian_email || guardianEmail,
      approvalUrl,
    })

    return NextResponse.json({
      success: true,
      email_sent: emailResult.sent,
      email_configured: emailResult.configured,
      message: emailResult.message,
      approval_url: approvalUrl,
      request: consentRequest,
    })
  } catch (error) {
    console.error('Erro ao solicitar autorizacao parental por e-mail:', error)

    return NextResponse.json(
      { error: 'Erro interno ao solicitar autorizacao parental.' },
      { status: 500 }
    )
  }
}
