'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Mail, RotateCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  isMissingProfileAcceptanceColumnError,
  isProfileIncomplete,
} from '@/lib/profile-completion'

type ProfileStatus = {
  username: string | null
  birth_date: string | null
  is_minor: boolean | null
  parental_consent_status: string | null
  terms_accepted_at?: string | null
  privacy_accepted_at?: string | null
}

type ConsentRequest = {
  status: string
  guardian_email: string | null
  guardian_name?: string | null
  relationship?: string | null
  expires_at?: string | null
}

function getStatusLabel(status: string, hasRequest: boolean) {
  if (!hasRequest && status !== 'approved' && status !== 'rejected') return 'Nao solicitado'
  if (status === 'approved') return 'Aprovado'
  if (status === 'rejected') return 'Recusado'
  return 'Pendente'
}

function maskEmail(value: string | null | undefined) {
  if (!value) return 'Nao informado'

  const [name, domain] = value.split('@')

  if (!name || !domain) return value

  return `${name.slice(0, 1)}***@${domain}`
}

function isMissingParentalColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false

  const message = (error.message || '').toLowerCase()

  return (
    error.code === '42703' ||
    message.includes('guardian_name') ||
    message.includes('relationship')
  )
}

export default function AccountPendingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileStatus | null>(null)
  const [request, setRequest] = useState<ConsentRequest | null>(null)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadStatus() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        router.replace('/login')
        return
      }

      const profileResult = await supabase
        .from('profiles')
        .select('username, birth_date, is_minor, parental_consent_status, terms_accepted_at, privacy_accepted_at')
        .eq('id', user.id)
        .maybeSingle()
      let profileData = profileResult.data as ProfileStatus | null
      let profileError = profileResult.error

      if (isMissingProfileAcceptanceColumnError(profileError)) {
        const fallback = await supabase
          .from('profiles')
          .select('username, birth_date, is_minor, parental_consent_status')
          .eq('id', user.id)
          .maybeSingle()

        profileData = fallback.data as ProfileStatus | null
        profileError = fallback.error
      }

      const requestResult = await supabase
        .from('parental_consent_requests')
        .select('status, guardian_email, guardian_name, relationship, expires_at')
        .eq('child_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      let requestData = requestResult.data as ConsentRequest | null

      if (isMissingParentalColumnError(requestResult.error)) {
        const fallbackRequest = await supabase
          .from('parental_consent_requests')
          .select('status, guardian_email, expires_at')
          .eq('child_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        requestData = fallbackRequest.data as ConsentRequest | null
      }

      if (!active) return

      if (!profileError && isProfileIncomplete(profileData)) {
        router.replace('/complete-profile')
        return
      }

      setProfile(profileData)
      setRequest(requestData)
      setLoading(false)
    }

    loadStatus()

    return () => {
      active = false
    }
  }, [router])

  const displayStatus = useMemo(() => {
    const status = request?.status || profile?.parental_consent_status || 'pending'
    return getStatusLabel(status, Boolean(request))
  }, [profile, request])

  const isApproved = profile?.is_minor && profile.parental_consent_status === 'approved'
  const isPending = displayStatus === 'Pendente'
  const isRejected = displayStatus === 'Recusado'

  async function handleResend() {
    if (!request?.guardian_email) {
      setMessage('Informe o e-mail do responsavel em Complete seu perfil para enviar o pedido.')
      return
    }

    setResending(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Entre novamente para reenviar o pedido.')
      setResending(false)
      return
    }

    const response = await fetch('/api/parental-consent/send-email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        guardian_email: request.guardian_email,
        guardian_name: request.guardian_name || '',
        relationship: request.relationship || '',
      }),
    })
    const result = await response.json().catch(() => null)

    setResending(false)

    if (!response.ok || !result?.success) {
      setMessage(result?.error || result?.message || 'Nao foi possivel reenviar o pedido agora.')
      return
    }

    setRequest(result.request || request)
    setMessage(result.email_sent ? 'Pedido reenviado para o responsavel.' : result.message || 'Pedido atualizado.')
  }

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl items-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-blue-500/20 bg-zinc-950 shadow-2xl shadow-blue-950/30">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.28),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(0,0,0,0.98))] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
                  <ShieldAlert className="h-4 w-4" />
                  Conta em analise
                </div>

                <h1 className="mt-5 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Autorizacao do responsavel necessaria
                </h1>

                <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                  Sua conta foi criada, mas o acesso completo aos recursos gerais do EntreUS depende da autorizacao do responsavel.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">Status atual</p>
                <p className="mt-2 text-2xl font-black text-white">{loading ? 'Carregando...' : displayStatus}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:p-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <ShieldCheck className="h-5 w-5 text-blue-300" />
                O que acontece agora
              </h2>

              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Enquanto a autorizacao nao for aprovada, recursos como feed, mensagens, notificacoes, carteira, presentes, busca, desafios, posts e perfis publicos ficam bloqueados.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                  <Mail className="h-4 w-4 text-blue-300" />
                  Responsavel
                </div>
                <p className="mt-2 break-all text-sm text-zinc-300">
                  {maskEmail(request?.guardian_email)}
                </p>
              </div>

              {isPending && (
                <p className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100">
                  Aguarde seu responsavel aprovar pelo link enviado.
                </p>
              )}

              {isRejected && (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
                  A autorizacao foi recusada. O acesso completo permanece bloqueado.
                </p>
              )}

              {isApproved && (
                <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                  Autorizacao aprovada. Seu acesso geral foi liberado.
                </p>
              )}

              <p className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold leading-6 text-cyan-100">
                Conteudos 18+ permanecem bloqueados para menores.
              </p>

              {message && (
                <p className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100">
                  {message}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-blue-500/20 bg-blue-950/20 p-5">
              <p className="text-sm leading-6 text-zinc-300">
                Voce pode reenviar o pedido para o responsavel ou alterar o e-mail informado completando seu perfil novamente.
              </p>

              {isApproved ? (
                <Link
                  href="/feed"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400"
                >
                  Entrar na EntreUS
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || !request?.guardian_email}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    Reenviar pedido
                  </button>

                  <Link
                    href="/complete-profile"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                  >
                    Alterar e-mail do responsavel
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
