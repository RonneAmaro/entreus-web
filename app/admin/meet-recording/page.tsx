'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  CloudCog,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type RecordingDiagnostics = {
  ready: boolean
  egressEnabled: boolean
  hasMeetRecordingsBucketName: boolean
  hasR2AccessConfig: boolean
  hasLiveKitServerConfig: boolean
  missing: string[]
  warnings: string[]
  storagePolicy: {
    compressionProfile: 'economy' | 'standard'
    compressionDescription: string
    storageUsage: string
    maxDurationSeconds: number
    maxExpectedFileSizeBytes: number
    retentionDays: number
    retentionWarning: string
  }
}

function formatRecordingDuration(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60)
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`
}

function formatRecordingMegabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function DiagnosticItem({
  title,
  description,
  ready,
}: {
  title: string
  description: string
  ready: boolean
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ready ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-100'}`}>
          {ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <span>
          <span className="block text-sm font-black text-white">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-zinc-400">{description}</span>
        </span>
      </div>
    </article>
  )
}

export default function AdminMeetRecordingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [diagnostics, setDiagnostics] = useState<RecordingDiagnostics | null>(null)

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Sua sessão expirou. Entre novamente para consultar o diagnóstico.')
      setDiagnosticsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/meet-recording/diagnostics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = (await response.json().catch(() => null)) as
        | (RecordingDiagnostics & { error?: string })
        | null

      if (!response.ok || !data) {
        setDiagnostics(null)
        setMessage(data?.error || 'Não foi possível carregar o diagnóstico da gravação.')
        return
      }

      setDiagnostics(data)
    } catch {
      setDiagnostics(null)
      setMessage('Não foi possível conectar ao diagnóstico da gravação agora.')
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadPage() {
      setLoading(true)
      setMessage('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        setMessage('Não foi possível verificar a permissão administrativa.')
        setLoading(false)
        return
      }

      const profile = {
        id: user.id,
        email: user.email,
        role: profileData?.role || 'user',
      }

      setAdminProfile(profile)
      setLoading(false)

      if (isAdminRole(profile.role)) {
        void loadDiagnostics()
      }
    }

    void loadPage()
  }, [loadDiagnostics, router])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando diagnóstico...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">Esta área é exclusiva para administradores.</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
          <button
            type="button"
            onClick={() => void loadDiagnostics()}
            disabled={diagnosticsLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {diagnosticsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar diagnóstico
          </button>
        </div>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,64,175,0.16),rgba(2,6,23,0.96))] p-6 shadow-xl shadow-blue-950/15 ring-1 ring-blue-300/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <CircleDot className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Gravação Meet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100/80 sm:text-base">
            Diagnóstico seguro da ativação de gravações. Esta página mostra somente estados de configuração, nunca chaves, tokens, buckets ou caminhos privados.
          </p>
        </header>

        <section className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-50">
          A gravação só será liberada quando todos os itens estiverem prontos. O perfil econômico é obrigatório para controlar o uso de armazenamento.
        </section>

        {message ? (
          <section className="mt-5 rounded-3xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-100">
            {message}
          </section>
        ) : null}

        {diagnosticsLoading && !diagnostics ? (
          <section className="mt-5 flex min-h-52 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/80 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Verificando configurações seguras...
          </section>
        ) : diagnostics ? (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2">
              <DiagnosticItem
                title="Migration Supabase"
                description="Confirmação manual: aplique a base e a migration de compactação, depois execute os scripts verify antes da liberação."
                ready={false}
              />
              <DiagnosticItem
                title="Bucket R2 privado"
                description={diagnostics.hasMeetRecordingsBucketName && diagnostics.hasR2AccessConfig ? 'Nome e acesso server-side configurados. Confirme a privacidade no R2.' : 'Pendente: configure o bucket dedicado e as credenciais server-side.'}
                ready={diagnostics.hasMeetRecordingsBucketName && diagnostics.hasR2AccessConfig}
              />
              <DiagnosticItem
                title="LiveKit Egress"
                description={diagnostics.hasLiveKitServerConfig ? 'Credenciais server-side presentes. Confirme suporte a Egress no provedor.' : 'Pendente: configure URL, API key e API secret do LiveKit no servidor.'}
                ready={diagnostics.hasLiveKitServerConfig}
              />
              <DiagnosticItem
                title="Compressão obrigatória"
                description={`Perfil padrão: ${diagnostics.storagePolicy.compressionProfile}. ${diagnostics.storagePolicy.compressionDescription}`}
                ready={diagnostics.storagePolicy.compressionProfile === 'economy'}
              />
              <DiagnosticItem
                title="Retenção planejada"
                description={`Downloads terão prazo de ${diagnostics.storagePolicy.retentionDays} dias. A remoção física automática continua pendente de um job futuro.`}
                ready={diagnostics.storagePolicy.retentionDays > 0}
              />
              <DiagnosticItem
                title="Opt-in de gravação"
                description={diagnostics.egressEnabled ? 'Ligado no ambiente.' : 'Desligado: a gravação continua bloqueada.'}
                ready={diagnostics.egressEnabled}
              />
            </section>

            <section className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-blue-50">
              <h2 className="text-lg font-black">Política de armazenamento</h2>
              <p className="mt-2 text-sm leading-6 text-blue-100/85">
                {diagnostics.storagePolicy.storageUsage}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">Perfil</dt>
                  <dd className="mt-1 text-sm font-black capitalize">{diagnostics.storagePolicy.compressionProfile}</dd>
                </div>
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">Limite</dt>
                  <dd className="mt-1 text-sm font-black">{formatRecordingDuration(diagnostics.storagePolicy.maxDurationSeconds)} · {formatRecordingMegabytes(diagnostics.storagePolicy.maxExpectedFileSizeBytes)}</dd>
                </div>
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">Retenção</dt>
                  <dd className="mt-1 text-sm font-black">{diagnostics.storagePolicy.retentionDays} dias</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-blue-100/70">{diagnostics.storagePolicy.retentionWarning}</p>
            </section>

            <section className={`mt-5 rounded-[2rem] border p-5 ${diagnostics.ready ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-50' : 'border-amber-300/25 bg-amber-500/10 text-amber-50'}`}>
              <div className="flex items-start gap-3">
                <CloudCog className="mt-0.5 h-6 w-6 shrink-0" />
                <div>
                  <h2 className="text-lg font-black">Pronto para configuração de gravação: {diagnostics.ready ? 'Sim' : 'Não'}</h2>
                  <p className="mt-2 text-sm leading-6">
                    {diagnostics.ready
                      ? 'As variáveis obrigatórias estão presentes. Antes de liberar, valide manualmente a migration, a privacidade do bucket e o suporte do LiveKit Egress.'
                      : 'A API de início continuará retornando indisponibilidade segura até que todas as configurações estejam completas.'}
                  </p>
                </div>
              </div>
            </section>

            {diagnostics.missing.length > 0 ? (
              <section className="mt-5 rounded-[2rem] border border-red-300/20 bg-red-500/10 p-5 text-red-100">
                <h2 className="text-base font-black">Itens pendentes</h2>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6">
                  {diagnostics.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}

            {diagnostics.warnings.length > 0 ? (
              <section className="mt-5 rounded-[2rem] border border-amber-300/20 bg-amber-500/10 p-5 text-amber-50">
                <h2 className="text-base font-black">Confirmações manuais</h2>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6">
                  {diagnostics.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
