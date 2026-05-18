'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bug,
  Coins,
  Gift,
  Lightbulb,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
    title: 'Credito Promocional',
    description: 'Enviar ItaCash promocional para usuarios testarem presentes digitais.',
    href: '/admin/promotional-itacash',
    icon: Sparkles,
  },
  {
    title: 'Feedbacks e Bugs',
    description: 'Acompanhar mensagens, sugestoes e problemas enviados pelos usuarios.',
    href: '/feedback',
    icon: Bug,
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

  if (!adminProfile || adminProfile.role !== 'admin') {
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
                className="group rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5 transition hover:-translate-y-1 hover:border-blue-300/30 hover:bg-blue-950/20 hover:shadow-blue-950/20"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/15 transition group-hover:bg-blue-500 group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </span>

                <h2 className="mt-5 text-xl font-black text-white">
                  {card.title}
                </h2>
                <p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">
                  {card.description}
                </p>

                <span className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black transition group-hover:bg-blue-50">
                  Abrir
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
