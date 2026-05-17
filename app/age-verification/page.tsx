'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  birth_date: string | null
  is_minor: boolean | null
  wants_18_plus: boolean | null
  age_verification_status: string | null
}

type AgeVerificationRequest = {
  id: string
  status: string
  created_at: string
}

function calculateAge(birthDateValue: string | null) {
  if (!birthDateValue) return null

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

function statusLabel(status: string | null | undefined) {
  if (status === 'pending') return 'Sua verificacao esta em analise.'
  if (status === 'approved') return 'Verificacao 18+ aprovada.'
  if (status === 'rejected') return 'Verificacao recusada.'
  return 'Verificacao 18+ ainda nao iniciada.'
}

export default function AgeVerificationPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [acceptedStatement, setAcceptedStatement] = useState(false)
  const [statement, setStatement] = useState('')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [latestRequest, setLatestRequest] = useState<AgeVerificationRequest | null>(null)

  useEffect(() => {
    loadPage()
  }, [])

  const age = useMemo(() => calculateAge(profile?.birth_date || null), [profile?.birth_date])
  const hasBirthDate = age !== null
  const isMinor = Boolean(profile?.is_minor || (age !== null && age < 18))
  const status = profile?.age_verification_status || 'not_started'
  const hasPendingRequest = latestRequest?.status === 'pending' || status === 'pending'
  const isApproved = status === 'approved'
  const canSubmit = hasBirthDate && !isMinor && !hasPendingRequest && !isApproved

  async function loadPage() {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, birth_date, is_minor, wants_18_plus, age_verification_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage('Nao foi possivel carregar seu perfil: ' + profileError.message)
      setLoading(false)
      return
    }

    const loadedProfile = (profileData || {
      id: user.id,
      birth_date: null,
      is_minor: false,
      wants_18_plus: false,
      age_verification_status: 'not_started',
    }) as Profile

    setProfile(loadedProfile)

    const { data: requestData, error: requestError } = await supabase
      .from('age_verification_requests')
      .select('id, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (requestError) {
      setMessage('Perfil carregado, mas o historico de verificacao falhou: ' + requestError.message)
    } else {
      setLatestRequest((requestData || null) as AgeVerificationRequest | null)
    }

    setLoading(false)
  }

  async function handleSubmit() {
    if (!profile) return

    if (!acceptedStatement) {
      setMessage('Confirme a declaracao para enviar a solicitacao.')
      return
    }

    if (isMinor) {
      setMessage('Usuarios menores de 18 anos nao podem solicitar verificacao 18+.')
      return
    }

    if (!hasBirthDate) {
      setMessage('Informe sua data de nascimento no perfil antes de solicitar verificacao 18+.')
      return
    }

    if (hasPendingRequest) {
      setMessage('Ja existe uma solicitacao pendente.')
      return
    }

    if (isApproved) {
      setMessage('Sua verificacao 18+ ja esta aprovada.')
      return
    }

    setSubmitting(true)
    setMessage('')

    const { error: insertError } = await supabase
      .from('age_verification_requests')
      .insert({
        user_id: profile.id,
        status: 'pending',
        birth_date: profile.birth_date || null,
        user_statement: statement.trim() || null,
      })

    if (insertError) {
      setSubmitting(false)
      setMessage('Nao foi possivel enviar a solicitacao: ' + insertError.message)
      return
    }

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        wants_18_plus: true,
        age_verification_status: 'pending',
        show_sensitive_content: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (profileUpdateError) {
      setSubmitting(false)
      setMessage('Solicitacao criada, mas o perfil nao foi atualizado: ' + profileUpdateError.message)
      await loadPage()
      return
    }

    setSubmitting(false)
    setAcceptedStatement(false)
    setStatement('')
    setMessage('Solicitacao enviada. Sua verificacao esta em analise.')
    await loadPage()
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Perfil
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-100">
            <ShieldAlert className="h-4 w-4" />
            18+
          </div>
        </header>

        <div className="rounded-[2rem] border border-blue-400/20 bg-zinc-950/90 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2">
                <img src="/logo-icon.png" alt="EntreUS" className="h-8 w-8 rounded-full object-contain" />
                <span className="text-sm font-black">
                  Entre<span className="text-blue-300">US</span> Safety
                </span>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                Verificacao 18+
              </h1>

              <p className="mt-4 text-base leading-7 text-zinc-300 sm:text-lg">
                A verificacao e necessaria para visualizar conteudo 18+ na EntreUS. Neste pacote, ela apenas cria a solicitacao para aprovacao manual futura pelo Supabase.
              </p>
            </div>

            <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5 lg:w-72">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-200/70">Status</p>
              <p className="mt-2 text-lg font-black">{statusLabel(status)}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {age !== null ? `${age} anos informados no perfil.` : 'Data de nascimento nao informada.'}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-50">
            Conteudo 18+ e permitido apenas para usuarios maiores de idade e aprovados pela plataforma.
          </div>

          {loading ? (
            <div className="mt-8 flex min-h-56 items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-zinc-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando...
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              {isMinor && (
                <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-red-100">
                  <div className="flex items-center gap-2 font-black">
                    <ShieldAlert className="h-5 w-5" />
                    Verificacao bloqueada
                  </div>
                  <p className="mt-2 text-sm leading-6">
                    Usuarios menores de 18 anos nao podem solicitar verificacao 18+. Conteudo 18+ permanece bloqueado.
                  </p>
                </div>
              )}

              {!hasBirthDate && (
                <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5 text-amber-100">
                  Informe sua data de nascimento no perfil antes de solicitar verificacao 18+.
                </div>
              )}

              {!isMinor && hasPendingRequest && (
                <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5 text-blue-100">
                  Sua verificacao esta em analise.
                </div>
              )}

              {!isMinor && isApproved && (
                <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100">
                  <div className="flex items-center gap-2 font-black">
                    <CheckCircle2 className="h-5 w-5" />
                    Verificacao 18+ aprovada.
                  </div>
                </div>
              )}

              {!isMinor && status === 'rejected' && !hasPendingRequest && (
                <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-red-100">
                  Verificacao recusada. Voce pode enviar uma nova solicitacao.
                </div>
              )}

              {canSubmit && (
                <div className="rounded-3xl border border-white/10 bg-black/35 p-5">
                  <label className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-200">
                    <input
                      type="checkbox"
                      checked={acceptedStatement}
                      onChange={(event) => setAcceptedStatement(event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 accent-blue-500"
                    />
                    <span>
                      Declaro que tenho 18 anos ou mais e que as informacoes da minha conta sao verdadeiras.
                    </span>
                  </label>

                  <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-black text-zinc-200">
                      Observacao para analise
                    </span>
                    <textarea
                      value={statement}
                      onChange={(event) => setStatement(event.target.value)}
                      rows={4}
                      placeholder="Opcional"
                      className="w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    Enviar solicitacao
                  </button>
                </div>
              )}

              {message && (
                <div className="rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
                  {message}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
