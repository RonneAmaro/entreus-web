'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Banknote,
  DatabaseZap,
  Flag,
  FileArchive,
  Gift,
  Lightbulb,
  LockKeyhole,
  Loader2,
  ShieldOff,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminPendingAlerts } from '../hooks/useAdminPendingAlerts'
import { isAdminRole } from '@/lib/admin'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

const adminCards = [
  {
    title: 'Verificacoes 18+',
    description: 'Analisar documentos, selfies e solicitacoes de liberacao 18+.',
    href: '/admin/age-verifications',
    icon: ShieldCheck,
  },
  {
    title: 'Compras ItaCash',
    description: 'Aprovar ou recusar solicitacoes manuais de compra de ItaCash.',
    href: '/admin/itacash-purchases',
    icon: Coins,
  },
  {
    title: 'Saques de criadores',
    description: 'Revisar solicitacoes de saque manual e registrar Pix pago ou recusado.',
    href: '/admin/creator-withdrawals',
    icon: Banknote,
  },
  {
    title: 'Credito Promocional',
    description: 'Enviar ItaCash promocional para usuarios testarem presentes digitais.',
    href: '/admin/promotional-itacash',
    icon: Sparkles,
  },
  {
    title: 'Feedbacks e Bugs',
    description: 'Acompanhar mensagens, sugestoes e problemas enviados pelos usuarios.',
    href: '/admin/feedback',
    icon: Bug,
  },
  {
    title: 'Denuncias',
    description: 'Revisar denuncias de posts e usuarios feitas pela comunidade.',
    href: '/admin/reports',
    icon: Flag,
  },
  {
    title: 'Moderacao',
    description: 'Conteudos ocultos e revisao de moderacao.',
    href: '/admin/moderation',
    icon: ShieldOff,
  },
  {
    title: 'Selos de usuarios',
    description: 'Conceda ou remova selos manualmente sem acessar o Supabase.',
    href: '/admin/badges',
    icon: Award,
  },
  {
    title: 'Auditoria R2',
    description: 'Verifique possiveis midias orfas no armazenamento.',
    href: '/admin/r2-orphans',
    icon: DatabaseZap,
    badge: 'dry-run',
  },
  {
    title: 'Anexos do Meet',
    description: 'Audite anexos temporarios do chat das reunioes e acompanhe possiveis arquivos expirados.',
    href: '/admin/meet-attachments',
    icon: FileArchive,
    badge: 'dry-run',
  },
  {
    title: 'Gravação Meet',
    description: 'Confira o diagnóstico seguro antes de liberar gravações de reuniões.',
    href: '/admin/meet-recording',
    icon: ShieldCheck,
    badge: 'configuração',
  },
  {
    title: 'Checklist de seguranca',
    description: 'Confira buckets, migrations e pontos criticos antes de liberar usuarios reais.',
    href: '/admin/security-check',
    icon: LockKeyhole,
    badge: 'manual',
  },
  {
    title: 'Checklist Beta Fechado',
    description: 'Roteiro manual para validar criadores, monetizacao, 18+, admin, Lab, Meet e mobile.',
    href: '/admin/beta-checklist',
    icon: ClipboardCheck,
    badge: 'manual',
  },
  {
    title: 'Sugestoes da Comunidade',
    description: 'Ver ideias enviadas pelos usuarios e entender prioridades da comunidade.',
    href: '/suggestions',
    icon: Lightbulb,
  },
  {
    title: 'Desafios da Comunidade',
    description: 'Acompanhar desafios, participacao e destaques da comunidade.',
    href: '/challenges',
    icon: Trophy,
  },
  {
    title: 'Carteira ItaCash',
    description: 'Acessar sua carteira e acompanhar movimentacoes.',
    href: '/wallet',
    icon: Wallet,
  },
  {
    title: 'Presentes Digitais',
    description: 'Ver catalogo de presentes digitais animados.',
    href: '/gifts',
    icon: Gift,
  },
]

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [newPendingAlert, setNewPendingAlert] = useState(false)
  const isAdmin = isAdminRole(adminProfile?.role)
  const handleNewPendingAlert = useCallback(() => {
    setNewPendingAlert(true)
  }, [])
  const {
    counts: adminPendingCounts,
    errors: adminPendingErrors,
    loading: adminPendingLoading,
    totalPending,
  } = useAdminPendingAlerts({
    enabled: isAdmin,
    onNewPending: handleNewPendingAlert,
  })
  const pendingSummaryCards = [
    {
      key: 'itacashPurchases' as const,
      title: 'Compras ItaCash pendentes',
      count: adminPendingCounts.itacashPurchases,
      description: 'Compras manuais e Pix com comprovante aguardando analise.',
      href: '/admin/itacash-purchases',
      action: 'Revisar agora',
      icon: Coins,
    },
    {
      key: 'ageVerifications' as const,
      title: 'Verificacoes 18+ pendentes',
      count: adminPendingCounts.ageVerifications,
      description: 'Documentos e selfies aguardando revisao manual.',
      href: '/admin/age-verifications',
      action: 'Revisar agora',
      icon: ShieldCheck,
    },
    {
      key: 'reports' as const,
      title: 'Denuncias pendentes',
      count: adminPendingCounts.reports,
      description: 'Relatos de usuarios sobre posts ou perfis.',
      href: '/admin/reports',
      action: 'Revisar agora',
      icon: Flag,
    },
    {
      key: 'feedbackReports' as const,
      title: 'Feedbacks e bugs novos',
      count: adminPendingCounts.feedbackReports,
      description: 'Relatos internos abertos, triados ou em andamento.',
      href: '/admin/feedback',
      action: 'Revisar agora',
      icon: Bug,
    },
  ]

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
        Carregando painel...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">
            Esta area e exclusiva para administradores da plataforma.
          </p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-8 text-white">
      <section className="relative mx-auto w-full max-w-7xl">
        <div className="pointer-events-none absolute -right-24 top-12 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-28 top-80 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

        <header className="relative z-10 mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/feed"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Feed
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              Painel Administrativo
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              Gerencie as principais areas da EntreUS em um so lugar.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Admin</p>
            <p className="mt-1 font-black">{adminProfile.email || adminProfile.id}</p>
          </div>
        </header>

        <div className="relative z-10 mb-6 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-50">
          Area restrita para administradores da plataforma.
        </div>

        {newPendingAlert && (
          <div className="relative z-10 mb-5 flex flex-col gap-3 rounded-3xl border border-red-300/30 bg-red-500/15 p-4 text-red-50 ring-1 ring-red-300/15 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-200" />
              <div>
                <p className="font-black">Nova pendencia administrativa aguardando analise.</p>
                <p className="mt-1 text-sm text-red-100/80">Confira o resumo abaixo e priorize os itens mais urgentes.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewPendingAlert(false)}
              className="rounded-full border border-red-200/20 px-4 py-2 text-sm font-black text-red-50 transition hover:bg-red-500/20"
            >
              Dispensar
            </button>
          </div>
        )}

        <div className={`relative z-10 mb-6 overflow-hidden rounded-[2rem] border p-5 shadow-xl ring-1 ${
          totalPending > 0
            ? 'border-red-300/30 bg-red-500/15 text-red-50 shadow-red-950/20 ring-red-300/15'
            : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-50 shadow-black/20 ring-emerald-300/10'
        }`}>
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                totalPending > 0 ? 'bg-red-500/20 text-red-100' : 'bg-emerald-500/15 text-emerald-100'
              }`}>
                {totalPending > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-lg font-black">
                  {adminPendingLoading
                    ? 'Verificando pendencias administrativas...'
                    : totalPending > 0
                      ? 'Voce tem pendencias administrativas para revisar.'
                      : 'Tudo certo por enquanto.'}
                </p>
                <p className="mt-1 text-sm opacity-80">
                  {totalPending > 0
                    ? `${totalPending} itens aguardam analise nas filas principais.`
                    : 'Nao ha pendencias administrativas no momento.'}
                </p>
              </div>
            </div>

            {totalPending > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingSummaryCards.filter((item) => item.count > 0).slice(0, 4).map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-black text-red-950 transition hover:-translate-y-0.5 hover:bg-red-50 active:scale-95"
                  >
                    {item.action}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pendingSummaryCards.map((item) => {
            const Icon = item.icon
            const hasError = Boolean(adminPendingErrors[item.key])
            const hasPending = item.count > 0

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-[1.5rem] border p-4 shadow-xl shadow-black/20 ring-1 transition hover:-translate-y-1 ${
                  hasError
                    ? 'border-amber-300/25 bg-amber-500/10 text-amber-50 ring-amber-300/10'
                    : hasPending
                    ? 'border-red-300/25 bg-red-500/10 text-red-50 ring-red-300/10'
                    : 'border-white/10 bg-zinc-950/90 text-white ring-white/5 hover:border-blue-300/25'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                    hasPending ? 'bg-red-500/20 text-red-100' : 'bg-blue-500/15 text-blue-100'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={`rounded-full px-3 py-1 text-sm font-black ${
                    hasError
                      ? 'bg-amber-300 text-amber-950'
                      : hasPending
                      ? 'bg-red-600 text-white'
                      : 'bg-white/10 text-zinc-300'
                  }`}>
                    {hasError ? '!' : item.count}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-black">{item.title}</h2>
                <p className="mt-2 min-h-10 text-sm leading-5 opacity-75">
                  {hasError ? adminPendingErrors[item.key] : item.description}
                </p>
                <span className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black shadow-sm shadow-blue-500/10">
                  {item.action}
                </span>
              </Link>
            )
          })}
        </div>

        {message && (
          <div className="relative z-10 mb-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <div className="relative z-10 grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-4">
          {adminCards.map((card) => {
            const Icon = card.icon

            return (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5 transition hover:-translate-y-1 hover:border-blue-300/30 hover:bg-blue-950/20 hover:shadow-blue-950/20"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/15 transition group-hover:bg-blue-500 group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </span>

                <h2 className="mt-5 text-xl font-black text-white">
                  {card.title}
                  {card.href === '/admin/itacash-purchases' && adminPendingCounts.itacashPurchases > 0 && (
                    <span className="ml-2 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-red-600 px-1.5 align-middle text-[11px] font-black text-white">
                      {adminPendingCounts.itacashPurchases > 99 ? '99+' : adminPendingCounts.itacashPurchases}
                    </span>
                  )}
                  {'badge' in card && card.badge && (
                    <span className="ml-2 inline-flex rounded-full bg-amber-300 px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-[0.12em] text-amber-950">
                      {card.badge}
                    </span>
                  )}
                </h2>
                <p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">
                  {card.description}
                </p>

                <span className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black shadow-sm shadow-blue-500/10 transition group-hover:bg-blue-50">
                  {card.href === '/admin/r2-orphans' ? 'Abrir auditoria' : 'Abrir'}
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
