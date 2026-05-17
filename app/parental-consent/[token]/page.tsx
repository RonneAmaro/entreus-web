'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ConsentRequest = {
  id: string
  guardian_email: string
  status: string
  child_birth_date: string | null
  consent_text: string | null
  expires_at: string | null
  created_at: string
}

function formatDate(value: string | null) {
  if (!value) return 'Nao informado'

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function statusLabel(status: string) {
  if (status === 'approved') return 'Autorizacao aprovada'
  if (status === 'rejected') return 'Autorizacao recusada'
  if (status === 'expired') return 'Link expirado'
  return 'Aguardando decisao'
}

export default function ParentalConsentPage() {
  const params = useParams()
  const token = typeof params.token === 'string' ? params.token : ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [request, setRequest] = useState<ConsentRequest | null>(null)
  const [message, setMessage] = useState('')
  const [resultStatus, setResultStatus] = useState('')

  useEffect(() => {
    loadRequest()
  }, [token])

  async function loadRequest() {
    if (!token) {
      setMessage('Link invalido.')
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .rpc('get_parental_consent_request', {
        p_token: token,
      })

    if (error) {
      setMessage('Nao foi possivel carregar a solicitacao: ' + error.message)
      setLoading(false)
      return
    }

    const rows = (data || []) as ConsentRequest[]

    if (rows.length === 0) {
      setMessage('Link expirado ou invalido.')
      setLoading(false)
      return
    }

    setRequest(rows[0])
    setResultStatus(rows[0].status)
    setLoading(false)
  }

  async function submitDecision(decision: 'approved' | 'rejected') {
    if (!token) return

    setSubmitting(true)
    setMessage('')

    const { data, error } = await supabase.rpc('submit_parental_consent', {
      p_token: token,
      p_decision: decision,
    })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel registrar a decisao: ' + error.message)
      return
    }

    const result = data as { status?: string; message?: string; success?: boolean } | null
    const nextStatus = result?.status || decision

    setResultStatus(nextStatus)
    setRequest((current) => current ? { ...current, status: nextStatus } : current)
    setMessage(result?.message || (decision === 'approved' ? 'Autorizacao aprovada.' : 'Autorizacao recusada.'))
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center">
        <div className="w-full rounded-[2rem] border border-blue-400/20 bg-zinc-950/90 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="EntreUS" className="h-11 w-11 rounded-full object-contain" />
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-blue-300">
                EntreUS
              </p>
              <h1 className="text-2xl font-black sm:text-3xl">
                Autorizacao do responsavel
              </h1>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex min-h-56 items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-zinc-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando solicitacao...
            </div>
          ) : !request ? (
            <div className="mt-8 rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-red-100">
              <div className="flex items-center gap-2 font-black">
                <XCircle className="h-5 w-5" />
                Link expirado ou invalido
              </div>
              <p className="mt-2 text-sm">{message || 'Nao encontramos uma solicitacao valida para este link.'}</p>
            </div>
          ) : (
            <>
              <div className="mt-8 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-100">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-100/80">Status</p>
                    <p className="text-xl font-black">{statusLabel(resultStatus)}</p>
                  </div>
                </div>

                <p className="text-sm leading-7 text-zinc-200">
                  Voce esta recebendo esta solicitacao porque um menor informou seu e-mail como responsavel para usar a plataforma EntreUS. Ao autorizar, voce permite que ele utilize recursos gerais da rede social. Conteudos 18+ permanecem bloqueados para menores.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Responsavel</p>
                    <p className="mt-1 break-all font-bold">{request.guardian_email}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Nascimento informado</p>
                    <p className="mt-1 font-bold">{formatDate(request.child_birth_date)}</p>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  resultStatus === 'approved'
                    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                    : resultStatus === 'rejected'
                      ? 'border-red-300/20 bg-red-500/10 text-red-100'
                      : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                }`}>
                  {message}
                </div>
              )}

              {resultStatus === 'pending' ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => submitDecision('approved')}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Autorizar
                  </button>

                  <button
                    type="button"
                    onClick={() => submitDecision('rejected')}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Recusar
                  </button>
                </div>
              ) : (
                <Link
                  href="/"
                  className="mt-6 inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Voltar para EntreUS
                </Link>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
