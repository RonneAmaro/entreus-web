'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type ChallengeStatus = 'draft' | 'scheduled' | 'active' | 'voting' | 'finished' | 'archived'
type ChallengeFilter = 'active' | 'voting' | 'finished'

type ChallengeRow = {
  id: string
  title: string
  slug: string
  description: string
  status: ChallengeStatus
  starts_at: string
  ends_at: string
}

type ChallengeEntryRow = {
  id: string
  challenge_id: string
}

type ChallengeItem = ChallengeRow & {
  entriesCount: number
}

const filters: { value: ChallengeFilter; label: string }[] = [
  { value: 'active', label: 'Ativos' },
  { value: 'voting', label: 'Em votacao' },
  { value: 'finished', label: 'Encerrados' },
]

const statusLabels: Record<ChallengeStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  active: 'Ativo',
  voting: 'Em votacao',
  finished: 'Encerrado',
  archived: 'Arquivado',
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusClass(status: ChallengeStatus) {
  if (status === 'active') return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
  if (status === 'voting') return 'border-blue-300/25 bg-blue-500/10 text-blue-100'
  if (status === 'finished') return 'border-zinc-300/20 bg-white/10 text-zinc-100'
  return 'border-amber-300/25 bg-amber-500/10 text-amber-100'
}

export default function ChallengesPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<ChallengeFilter>('active')
  const [challenges, setChallenges] = useState<ChallengeItem[]>([])

  useEffect(() => {
    loadChallenges()
  }, [])

  const visibleChallenges = useMemo(() => {
    return challenges.filter((challenge) => {
      if (filter === 'active') return challenge.status === 'active' || challenge.status === 'scheduled'
      if (filter === 'voting') return challenge.status === 'voting'
      return challenge.status === 'finished' || challenge.status === 'archived'
    })
  }, [challenges, filter])

  async function loadChallenges() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('community_challenges')
      .select('id, title, slug, description, status, starts_at, ends_at')
      .in('status', ['scheduled', 'active', 'voting', 'finished', 'archived'])
      .order('starts_at', { ascending: false })

    if (error) {
      setMessage('Nao foi possivel carregar desafios: ' + error.message)
      setChallenges([])
      setLoading(false)
      return
    }

    const rows = (data || []) as ChallengeRow[]
    const challengeIds = rows.map((item) => item.id)
    let entries: ChallengeEntryRow[] = []

    if (challengeIds.length > 0) {
      const { data: entriesData } = await supabase
        .from('challenge_entries')
        .select('id, challenge_id')
        .in('challenge_id', challengeIds)

      entries = (entriesData || []) as ChallengeEntryRow[]
    }

    setChallenges(
      rows.map((challenge) => ({
        ...challenge,
        entriesCount: entries.filter((entry) => entry.challenge_id === challenge.id).length,
      }))
    )
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/feed" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>
          <Link href="/suggestions" className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50">
            Sugestoes
          </Link>
        </header>

        <div className="py-12">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
            Desafios da Comunidade
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
            Participe, interaja e ganhe destaque na EntreUS.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
            Desafios periodicos para transformar posts da comunidade em momentos de descoberta, conversa e reconhecimento.
          </p>

          <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
                  filter === item.value
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-white/10 bg-zinc-950 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando desafios...
          </div>
        ) : visibleChallenges.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center">
            <div>
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-200">
                <Trophy className="h-7 w-7" />
              </span>
              <h2 className="mt-5 text-xl font-black">Nenhum desafio encontrado por aqui.</h2>
              <p className="mt-2 text-sm text-zinc-400">Quando a equipe abrir um novo desafio, ele aparece nesta area.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 pb-10 md:grid-cols-2 xl:grid-cols-3">
            {visibleChallenges.map((challenge) => (
              <article key={challenge.id} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-blue-300/25">
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(challenge.status)}`}>
                    {statusLabels[challenge.status]}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
                    <Users className="h-3.5 w-3.5" />
                    {challenge.entriesCount}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-black tracking-tight">{challenge.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">{challenge.description}</p>
                <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(challenge.starts_at)} ate {formatDate(challenge.ends_at)}
                </p>
                <Link href={`/challenges/${challenge.slug}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50">
                  Ver desafio
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
