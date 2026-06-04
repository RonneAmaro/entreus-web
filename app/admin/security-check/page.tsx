'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileArchive,
  FileWarning,
  HardDrive,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type BadgeTone = 'manual' | 'pending' | 'critical' | 'ok' | 'check'

const bucketChecks = [
  {
    name: 'meet-chat-attachments',
    label: 'Conferir',
    tone: 'manual' as const,
    description: 'Bucket esperado para anexos do chat do Meet.',
    items: [
      'Deve existir no Supabase Storage.',
      'Deve ser privado e nao publico.',
      'Downloads devem usar signed URL temporaria.',
      'Nao listar arquivos reais de usuarios nesta pagina.',
    ],
  },
  {
    name: 'age-verifications',
    label: 'Conferir',
    tone: 'manual' as const,
    description: 'Bucket esperado para documentos, selfies e comprovantes sensiveis de verificacao 18+.',
    items: [
      'Deve existir se o fluxo de verificacao 18+ usa esse bucket.',
      'Deve ser privado e nao publico.',
      'Acesso admin deve acontecer por signed URL temporaria.',
      'Nao expor path bruto, documentos ou dados pessoais fora do momento de revisao.',
    ],
  },
]

const migrationGroups = [
  {
    title: 'Meet',
    files: [
      'supabase/migrations/20260603_create_meet_room_chat_messages.sql',
      'supabase/migrations/20260603_add_meet_chat_attachments.sql',
    ],
  },
  {
    title: 'Moderacao',
    files: [
      'supabase/migrations/20260524_add_post_moderation_fields.sql',
      'supabase/migrations/20260524_add_moderation_notification_type.sql',
      'supabase/migrations/20260524_harden_admin_sensitive_rls.sql',
    ],
  },
  {
    title: 'Consentimento parental / termos',
    files: [
      'supabase/migrations/20260526_add_profile_terms_privacy_acceptance.sql',
      'supabase/migrations/20260526_extend_parental_consent_responsible_terms.sql',
      'supabase/migrations/20260527_add_parental_consent_guardian_selfie.sql',
    ],
  },
]

const riskCards = [
  {
    title: 'Meet anexos',
    tone: 'critical' as const,
    items: [
      'Bucket privado.',
      'Limite de 5 MB.',
      'Tipos perigosos bloqueados.',
      'Signed URL temporaria.',
      'Usuario precisa estar aprovado na sala.',
      'Proximo passo: limpeza/expiracao de anexos antigos.',
    ],
  },
  {
    title: 'Verificacao 18+',
    tone: 'critical' as const,
    items: [
      'Bucket age-verifications privado.',
      'Menor nao pode acessar conteudo 18+.',
      'Conteudo sensivel nao deve montar midia antes do reveal.',
    ],
  },
  {
    title: 'Admin/moderacao',
    tone: 'check' as const,
    items: [
      '/admin deve bloquear usuario comum.',
      'Reports pendentes devem contar so null/pending.',
      'Ocultar conteudo nao deleta definitivamente.',
    ],
  },
  {
    title: 'ItaCash',
    tone: 'critical' as const,
    items: [
      'Webhook Mercado Pago precisa ser idempotente.',
      'Saldo nao pode duplicar com webhook repetido.',
      'Nao apresentar ItaCash como cripto/investimento.',
    ],
  },
  {
    title: 'Upload/R2',
    tone: 'check' as const,
    items: [
      'Presigned URL.',
      'Validar tipo/tamanho.',
      'Planejar limpeza de midia orfa.',
    ],
  },
]

const manualTests = [
  'Entrar em /admin com usuario comum e confirmar bloqueio.',
  'Criar sala Meet e testar chat historico.',
  'Entrar depois na sala e ver mensagens antigas.',
  'Enviar anexo no Meet e baixar como outro usuario aprovado.',
  'Tentar baixar anexo sem estar aprovado.',
  'Testar arquivo bloqueado no chat do Meet.',
  'Testar post sensivel com usuario menor/nao verificado.',
  'Testar ocultar/restaurar conteudo denunciado.',
  'Testar webhook duplicado do Mercado Pago em ambiente controlado.',
]

function getBadgeClass(tone: BadgeTone) {
  if (tone === 'ok') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
  if (tone === 'critical') return 'border-red-300/25 bg-red-500/10 text-red-100'
  if (tone === 'pending') return 'border-amber-300/25 bg-amber-500/10 text-amber-100'
  if (tone === 'check') return 'border-blue-300/25 bg-blue-500/10 text-blue-100'
  return 'border-zinc-300/20 bg-white/10 text-zinc-100'
}

function getBadgeLabel(tone: BadgeTone, label?: string) {
  if (label) return label
  if (tone === 'ok') return 'OK'
  if (tone === 'critical') return 'Critico'
  if (tone === 'pending') return 'Pendente'
  if (tone === 'check') return 'Conferir'
  return 'Manual'
}

function StatusBadge({ tone, label }: { tone: BadgeTone; label?: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-black ${getBadgeClass(tone)}`}>
      {getBadgeLabel(tone, label)}
    </span>
  )
}

export default function AdminSecurityCheckPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)

  useEffect(() => {
    loadPage()
  }, [])

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
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage('Nao foi possivel verificar permissao admin: ' + profileError.message)
      setLoading(false)
      return
    }

    setAdminProfile({
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando checklist...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">Esta area e exclusiva para administradores.</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <Link href="/admin/meet-attachments" className="ml-2 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-100 transition hover:bg-blue-500/20">
          <FileArchive className="h-4 w-4" />
          Auditoria de anexos do Meet
        </Link>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-6 ring-1 ring-white/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <LockKeyhole className="h-6 w-6" />
          </span>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black">Checklist de seguranca</h1>
            <StatusBadge tone="manual" label="Manual" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Confira buckets, migrations e pontos criticos antes de liberar usuarios reais. Esta pagina nao consulta arquivos,
            nao mostra secrets e nao cria recursos automaticamente.
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-lg font-black">
                <HardDrive className="h-5 w-5 text-blue-100" />
                Buckets esperados
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Conferencia manual no Supabase Storage. Nao torne buckets sensiveis publicos para facilitar teste.
              </p>
            </div>
            <StatusBadge tone="manual" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {bucketChecks.map((bucket) => (
              <article key={bucket.name} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-black text-white">{bucket.name}</h2>
                  <StatusBadge tone={bucket.tone} label={bucket.label} />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{bucket.description}</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  {bucket.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-blue-200" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-lg font-black">
                <Database className="h-5 w-5 text-blue-100" />
                Migrations criticas
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Aplicar migrations manualmente no Supabase SQL Editor. Depois de aplicar, testar a funcionalidade relacionada.
              </p>
            </div>
            <StatusBadge tone="pending" label="Pendente" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {migrationGroups.map((group) => (
              <article key={group.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <h2 className="font-black text-white">{group.title}</h2>
                <div className="mt-3 space-y-2">
                  {group.files.map((file) => (
                    <p key={file} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold leading-5 text-zinc-300">
                      {file}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-100" />
            <h2 className="text-lg font-black">Riscos criticos para revisar</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {riskCards.map((risk) => (
              <article key={risk.title} className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-white">{risk.title}</h3>
                  <StatusBadge tone={risk.tone} />
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  {risk.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-blue-200" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-blue-50 ring-1 ring-blue-300/10">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            <h2 className="text-lg font-black">Checklist de testes manuais</h2>
            <StatusBadge tone="check" label="Conferir" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {manualTests.map((test) => (
              <p key={test} className="rounded-2xl border border-blue-200/10 bg-black/20 px-3 py-2 text-sm leading-6 text-blue-50/90">
                {test}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-amber-300/20 bg-amber-500/10 p-5 text-amber-100 ring-1 ring-amber-300/10">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-black">Limites deste diagnostico</h2>
              <p className="mt-2 text-sm leading-6 text-amber-100/85">
                Bucket privado, migrations aplicadas e webhooks idempotentes precisam ser confirmados no ambiente real.
                Esta pagina nao usa service role no client, nao lista objetos de storage, nao gera signed URLs e nao altera configuracao.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
