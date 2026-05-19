'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type ProfileStatus = {
  is_minor: boolean | null
  parental_consent_status: string | null
}

type ConsentRequest = {
  status: string
}

function getStatusLabel(status: string, hasRequest: boolean) {
  if (!hasRequest && status !== 'approved' && status !== 'rejected') return 'Nao solicitado'
  if (status === 'approved') return 'Aprovado'
  if (status === 'rejected') return 'Recusado'
  return 'Pendente'
}

export default function AccountPendingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileStatus | null>(null)
  const [request, setRequest] = useState<ConsentRequest | null>(null)

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

      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_minor, parental_consent_status')
        .eq('id', user.id)
        .maybeSingle()

      const { data: requestData } = await supabase
        .from('parental_consent_requests')
        .select('status')
        .eq('child_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) return

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

              {isPending && (
                <p className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100">
                  Aguarde seu responsavel aprovar pelo link enviado/gerado.
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
            </div>

            <div className="rounded-3xl border border-blue-500/20 bg-blue-950/20 p-5">
              <p className="text-sm leading-6 text-zinc-300">
                No perfil voce pode informar o e-mail do responsavel, gerar o link de autorizacao e acompanhar o status.
              </p>

              <Link
                href="/profile"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400"
              >
                Solicitar autorizacao
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
