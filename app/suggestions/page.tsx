'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Rocket,
  Search,
  Send,
  Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type SuggestionCategory =
  | 'feature'
  | 'content'
  | 'design'
  | 'meet'
  | 'chat'
  | 'badges'
  | 'help'
  | 'safety'
  | 'other'

type SuggestionStatus =
  | 'open'
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'released'
  | 'declined'

type SuggestionFilter =
  | 'all'
  | 'top'
  | 'recent'
  | 'planned'
  | 'in_progress'
  | 'released'

type SuggestionRow = {
  id: string
  user_id: string
  title: string
  description: string
  category: SuggestionCategory
  status: SuggestionStatus
  admin_response: string | null
  created_at: string
  updated_at: string
}

type SuggestionVoteRow = {
  id: string
  suggestion_id: string
  user_id: string
  vote_value: -1 | 1
  created_at: string
}

type SuggestionItem = SuggestionRow & {
  voteTotal: number
  myVote: -1 | 1 | null
}

const categoryOptions: { value: SuggestionCategory; label: string }[] = [
  { value: 'feature', label: 'Recurso' },
  { value: 'content', label: 'Conteudo' },
  { value: 'design', label: 'Visual' },
  { value: 'meet', label: 'EntreUS Meet' },
  { value: 'chat', label: 'Chat' },
  { value: 'badges', label: 'Selos' },
  { value: 'help', label: 'Ajuda' },
  { value: 'safety', label: 'Seguranca' },
  { value: 'other', label: 'Outro' },
]

const statusLabels: Record<SuggestionStatus, string> = {
  open: 'Aberta',
  under_review: 'Em analise',
  planned: 'Planejada',
  in_progress: 'Em desenvolvimento',
  released: 'Lancada',
  declined: 'Recusada',
}

const filters: { value: SuggestionFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'top', label: 'Mais votadas' },
  { value: 'recent', label: 'Recentes' },
  { value: 'planned', label: 'Planejadas' },
  { value: 'in_progress', label: 'Em desenvolvimento' },
  { value: 'released', label: 'Lancadas' },
]

function getCategoryLabel(category: SuggestionCategory) {
  return categoryOptions.find((item) => item.value === category)?.label || 'Outro'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStatusClass(status: SuggestionStatus) {
  if (status === 'released') return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
  if (status === 'in_progress') return 'border-blue-300/25 bg-blue-500/10 text-blue-100'
  if (status === 'planned') return 'border-violet-300/25 bg-violet-500/10 text-violet-100'
  if (status === 'declined') return 'border-red-300/25 bg-red-500/10 text-red-100'
  if (status === 'under_review') return 'border-amber-300/25 bg-amber-500/10 text-amber-100'
  return 'border-white/10 bg-white/5 text-zinc-200'
}

export default function SuggestionsPage() {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [votingSuggestionId, setVotingSuggestionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SuggestionCategory>('feature')
  const [filter, setFilter] = useState<SuggestionFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])

  useEffect(() => {
    async function loadPage() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUserId(user.id)
      }

      await loadSuggestions(user?.id || '')
      setLoading(false)
    }

    loadPage()
  }, [])

  const visibleSuggestions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    let items = [...suggestions]

    if (filter === 'planned') {
      items = items.filter((item) => item.status === 'planned')
    } else if (filter === 'in_progress') {
      items = items.filter((item) => item.status === 'in_progress')
    } else if (filter === 'released') {
      items = items.filter((item) => item.status === 'released')
    }

    if (normalizedQuery) {
      items = items.filter((item) => {
        return [
          item.title,
          item.description,
          getCategoryLabel(item.category),
          statusLabels[item.status],
        ].join(' ').toLowerCase().includes(normalizedQuery)
      })
    }

    if (filter === 'top') {
      return items.sort((a, b) => {
        if (b.voteTotal !== a.voteTotal) return b.voteTotal - a.voteTotal
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    return items.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filter, searchQuery, suggestions])

  async function loadSuggestions(currentUserId: string = userId) {
    setMessage('')

    const { data: suggestionData, error: suggestionError } = await supabase
      .from('community_suggestions')
      .select('id, user_id, title, description, category, status, admin_response, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (suggestionError) {
      setMessage('Nao foi possivel carregar sugestoes: ' + suggestionError.message)
      setSuggestions([])
      return
    }

    const rows = (suggestionData || []) as SuggestionRow[]
    const suggestionIds = rows.map((item) => item.id)

    let votes: SuggestionVoteRow[] = []

    if (suggestionIds.length > 0) {
      const { data: voteData, error: voteError } = await supabase
        .from('community_suggestion_votes')
        .select('id, suggestion_id, user_id, vote_value, created_at')
        .in('suggestion_id', suggestionIds)

      if (voteError) {
        setMessage('Nao foi possivel carregar votos: ' + voteError.message)
      } else {
        votes = (voteData || []) as SuggestionVoteRow[]
      }
    }

    const votesBySuggestion = votes.reduce(
      (acc, vote) => {
        if (!acc[vote.suggestion_id]) acc[vote.suggestion_id] = []
        acc[vote.suggestion_id].push(vote)
        return acc
      },
      {} as Record<string, SuggestionVoteRow[]>
    )

    setSuggestions(
      rows.map((item) => {
        const itemVotes = votesBySuggestion[item.id] || []

        return {
          ...item,
          voteTotal: itemVotes.reduce((total, vote) => total + vote.vote_value, 0),
          myVote:
            itemVotes.find((vote) => vote.user_id === currentUserId)?.vote_value || null,
        }
      })
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()

    if (!trimmedTitle || !trimmedDescription) {
      setSuccessMessage('')
      setMessage('Preencha titulo e descricao para enviar uma sugestao.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setSuccessMessage('')
      setMessage('Entre na sua conta para enviar sugestoes.')
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('community_suggestions')
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        description: trimmedDescription,
        category,
      })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel enviar sugestao: ' + error.message)
      return
    }

    setUserId(user.id)
    setTitle('')
    setDescription('')
    setCategory('feature')
    setSuccessMessage('Sugestao enviada. Obrigado por ajudar a construir o futuro da EntreUS.')
    await loadSuggestions(user.id)
  }

  async function handleVote(suggestion: SuggestionItem, nextVote: -1 | 1) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setSuccessMessage('')
      setMessage('Entre na sua conta para votar em sugestoes.')
      return
    }

    setVotingSuggestionId(suggestion.id)
    setMessage('')
    setSuccessMessage('')

    if (suggestion.myVote === nextVote) {
      const { error } = await supabase
        .from('community_suggestion_votes')
        .delete()
        .eq('suggestion_id', suggestion.id)
        .eq('user_id', user.id)

      setVotingSuggestionId(null)

      if (error) {
        setMessage('Nao foi possivel remover seu voto: ' + error.message)
        return
      }

      setUserId(user.id)
      await loadSuggestions(user.id)
      return
    }

    const { error } = await supabase
      .from('community_suggestion_votes')
      .upsert(
        {
          suggestion_id: suggestion.id,
          user_id: user.id,
          vote_value: nextVote,
        },
        {
          onConflict: 'suggestion_id,user_id',
        }
      )

    setVotingSuggestionId(null)

    if (error) {
      setMessage('Nao foi possivel registrar seu voto: ' + error.message)
      return
    }

    setUserId(user.id)
    await loadSuggestions(user.id)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <Link
            href="/help"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            Ajuda
          </Link>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(30rem,1fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Sugestoes da Comunidade
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Ajude a construir o futuro da EntreUS.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
              Compartilhe ideias, vote no que faz sentido para voce e acompanhe o que esta planejado, em desenvolvimento ou lancado.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
                  <MessageSquarePlus className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black text-white">Enviar sugestao</h2>
                  <p className="text-sm text-zinc-400">Uma ideia por vez, bem explicada.</p>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-black text-zinc-100">Titulo</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={140}
                  placeholder="Ex.: Fixar conversa importante no topo"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-black text-zinc-100">Descricao</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  placeholder="Explique o problema, a melhoria e quando isso ajudaria."
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-black text-zinc-100">Categoria</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SuggestionCategory)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-300"
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {(message || successMessage) && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                    successMessage
                      ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                      : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                  }`}
                >
                  {successMessage ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{successMessage || message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black shadow-xl shadow-blue-950/20 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar sugestao
              </button>
            </form>
          </div>

          <div className="min-w-0">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3 text-zinc-400 transition focus-within:border-blue-300">
                  <Search className="h-5 w-5 shrink-0" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar sugestoes..."
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-500"
                  />
                </label>

                <div className="flex gap-2 overflow-x-auto pb-1 xl:max-w-[34rem]">
                  {filters.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFilter(item.value)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
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
            </div>

            {loading ? (
              <div className="mt-6 flex min-h-72 items-center justify-center rounded-3xl border border-white/10 bg-zinc-950 text-zinc-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando sugestoes...
              </div>
            ) : visibleSuggestions.length === 0 ? (
              <div className="mt-6 flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center">
                <div>
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-200">
                    <Sparkles className="h-7 w-7" />
                  </span>
                  <h2 className="mt-5 text-xl font-black text-white">
                    Ainda nao ha sugestoes. Seja o primeiro a enviar uma ideia.
                  </h2>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {visibleSuggestions.map((suggestion) => (
                  <article
                    key={suggestion.id}
                    className="rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-xl shadow-black/20 transition hover:border-blue-300/25 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex sm:w-20 sm:shrink-0 sm:flex-col sm:items-center">
                        <button
                          type="button"
                          onClick={() => handleVote(suggestion, 1)}
                          disabled={votingSuggestionId === suggestion.id}
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 ${
                            suggestion.myVote === 1
                              ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
                              : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                          }`}
                          aria-label="Votar positivamente"
                          title="Votar positivamente"
                        >
                          <ArrowUp className="h-5 w-5" />
                        </button>

                        <div className="flex h-10 min-w-12 items-center justify-center px-2 text-lg font-black text-white sm:h-12">
                          {votingSuggestionId === suggestion.id ? (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-200" />
                          ) : (
                            suggestion.voteTotal
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleVote(suggestion, -1)}
                          disabled={votingSuggestionId === suggestion.id}
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 ${
                            suggestion.myVote === -1
                              ? 'border-red-300/30 bg-red-500/15 text-red-100'
                              : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                          }`}
                          aria-label="Votar negativamente"
                          title="Votar negativamente"
                        >
                          <ArrowDown className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                            {getCategoryLabel(suggestion.category)}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(suggestion.status)}`}>
                            {statusLabels[suggestion.status]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDate(suggestion.created_at)}
                          </span>
                        </div>

                        <h2 className="mt-3 text-xl font-black tracking-tight text-white">
                          {suggestion.title}
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                          {suggestion.description}
                        </p>

                        {suggestion.admin_response && (
                          <div className="mt-4 rounded-2xl border border-blue-300/15 bg-blue-500/10 p-4 text-sm leading-6 text-blue-50">
                            <div className="mb-1 flex items-center gap-2 font-black">
                              <Rocket className="h-4 w-4" />
                              Resposta da equipe
                            </div>
                            {suggestion.admin_response}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
