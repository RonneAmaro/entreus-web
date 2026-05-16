'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Send,
  ThumbsUp,
  Trophy,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type ChallengeStatus = 'draft' | 'scheduled' | 'active' | 'voting' | 'finished' | 'archived'
type EntryStatus = 'submitted' | 'approved' | 'featured' | 'winner' | 'rejected'

type ChallengeRow = {
  id: string
  title: string
  slug: string
  description: string
  rules: string | null
  banner_url: string | null
  status: ChallengeStatus
  starts_at: string
  ends_at: string
  voting_starts_at: string | null
  voting_ends_at: string | null
  max_entries_per_user: number | null
}

type EntryRow = {
  id: string
  challenge_id: string
  user_id: string
  post_id: string
  caption: string | null
  status: EntryStatus
  rank: number | null
  selected_at: string | null
  created_at: string
}

type VoteRow = {
  id: string
  challenge_id: string
  entry_id: string
  user_id: string
  vote_value: 1
}

type PostSummary = {
  id: string
  user_id: string
  content: string | null
  image_url: string | null
  video_url: string | null
  created_at: string
  profiles?: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
}

type PostSummaryResponse = Omit<PostSummary, 'profiles'> & {
  profiles?:
    | PostSummary['profiles']
    | NonNullable<PostSummary['profiles']>[]
    | null
}

type EntryItem = EntryRow & {
  post: PostSummary | null
  votesCount: number
  votedByMe: boolean
}

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

function getAuthorName(post: PostSummary | null) {
  return post?.profiles?.display_name || post?.profiles?.username || 'Usuario EntreUS'
}

function normalizePostSummary(post: PostSummaryResponse): PostSummary {
  return {
    ...post,
    profiles: Array.isArray(post.profiles)
      ? post.profiles[0] || null
      : post.profiles || null,
  }
}

export default function ChallengeDetailPage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [votingEntryId, setVotingEntryId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null)
  const [entries, setEntries] = useState<EntryItem[]>([])
  const [myPosts, setMyPosts] = useState<PostSummary[]>([])
  const [selectedPostId, setSelectedPostId] = useState('')
  const [caption, setCaption] = useState('')

  useEffect(() => {
    loadPage()
  }, [slug])

  const myEntriesCount = useMemo(() => {
    return entries.filter((entry) => entry.user_id === userId).length
  }, [entries, userId])

  const canParticipate = !!(
    challenge &&
    userId &&
    challenge.status === 'active' &&
    new Date(challenge.starts_at).getTime() <= Date.now() &&
    new Date(challenge.ends_at).getTime() >= Date.now() &&
    myEntriesCount < (challenge.max_entries_per_user || 1)
  )

  async function loadPage() {
    setLoading(true)
    setMessage('')
    setSuccessMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const currentUserId = user?.id || ''
    setUserId(currentUserId)

    const { data: challengeData, error: challengeError } = await supabase
      .from('community_challenges')
      .select('id, title, slug, description, rules, banner_url, status, starts_at, ends_at, voting_starts_at, voting_ends_at, max_entries_per_user')
      .eq('slug', slug)
      .maybeSingle()

    if (challengeError || !challengeData) {
      setMessage('Desafio nao encontrado ou indisponivel.')
      setChallenge(null)
      setLoading(false)
      return
    }

    const loadedChallenge = challengeData as ChallengeRow
    setChallenge(loadedChallenge)

    await Promise.all([
      loadEntries(loadedChallenge.id, currentUserId),
      currentUserId ? loadMyPosts(currentUserId) : Promise.resolve(),
    ])

    setLoading(false)
  }

  async function loadEntries(challengeId: string, currentUserId: string = userId) {
    const { data: entriesData, error: entriesError } = await supabase
      .from('challenge_entries')
      .select('id, challenge_id, user_id, post_id, caption, status, rank, selected_at, created_at')
      .eq('challenge_id', challengeId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })

    if (entriesError) {
      setMessage('Nao foi possivel carregar participacoes: ' + entriesError.message)
      setEntries([])
      return
    }

    const entryRows = (entriesData || []) as EntryRow[]
    const postIds = entryRows.map((entry) => entry.post_id)
    const entryIds = entryRows.map((entry) => entry.id)

    let posts: PostSummary[] = []
    let votes: VoteRow[] = []

    if (postIds.length > 0) {
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, user_id, content, image_url, video_url, created_at, profiles(username, display_name, avatar_url)')
        .in('id', postIds)

      posts = ((postsData || []) as PostSummaryResponse[]).map(normalizePostSummary)
    }

    if (entryIds.length > 0) {
      const { data: votesData } = await supabase
        .from('challenge_votes')
        .select('id, challenge_id, entry_id, user_id, vote_value')
        .in('entry_id', entryIds)

      votes = (votesData || []) as VoteRow[]
    }

    setEntries(
      entryRows.map((entry) => {
        const entryVotes = votes.filter((vote) => vote.entry_id === entry.id)
        return {
          ...entry,
          post: posts.find((post) => post.id === entry.post_id) || null,
          votesCount: entryVotes.length,
          votedByMe: entryVotes.some((vote) => vote.user_id === currentUserId),
        }
      }).sort((a, b) => {
        if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    )
  }

  async function loadMyPosts(currentUserId: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('id, user_id, content, image_url, video_url, created_at, profiles(username, display_name, avatar_url)')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      setMessage('Nao foi possivel carregar seus posts: ' + error.message)
      setMyPosts([])
      return
    }

    const posts = ((data || []) as PostSummaryResponse[]).map(normalizePostSummary)
    setMyPosts(posts)
    setSelectedPostId((current) => current || posts[0]?.id || '')
  }

  async function handleJoinChallenge() {
    if (!challenge || !selectedPostId || !userId || submitting) return

    if (!canParticipate) {
      setSuccessMessage('')
      setMessage('Voce ja atingiu o limite de participacoes ou o desafio nao esta ativo.')
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('challenge_entries')
      .insert({
        challenge_id: challenge.id,
        user_id: userId,
        post_id: selectedPostId,
        caption: caption.trim() || null,
      })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel participar: ' + error.message)
      return
    }

    setCaption('')
    setSuccessMessage('Participacao enviada para o desafio.')
    await loadEntries(challenge.id, userId)
  }

  async function handleToggleVote(entry: EntryItem) {
    if (!challenge || !userId || votingEntryId) {
      if (!userId) setMessage('Entre na sua conta para votar.')
      return
    }

    setVotingEntryId(entry.id)
    setMessage('')
    setSuccessMessage('')

    if (entry.votedByMe) {
      const { error } = await supabase
        .from('challenge_votes')
        .delete()
        .eq('entry_id', entry.id)
        .eq('user_id', userId)

      setVotingEntryId(null)

      if (error) {
        setMessage('Nao foi possivel remover seu voto: ' + error.message)
        return
      }

      await loadEntries(challenge.id, userId)
      return
    }

    const { error } = await supabase
      .from('challenge_votes')
      .insert({
        challenge_id: challenge.id,
        entry_id: entry.id,
        user_id: userId,
      })

    setVotingEntryId(null)

    if (error) {
      setMessage('Nao foi possivel votar: ' + error.message)
      return
    }

    await loadEntries(challenge.id, userId)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-zinc-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando desafio...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/challenges" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Desafios
          </Link>
          <Link href="/feed" className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50">
            Feed
          </Link>
        </header>

        {!challenge ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-zinc-950 p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-blue-200" />
            <h1 className="mt-4 text-2xl font-black">Desafio indisponivel</h1>
            {message && <p className="mt-2 text-zinc-400">{message}</p>}
          </div>
        ) : (
          <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1fr)]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
              {challenge.banner_url && (
                <img
                  src={challenge.banner_url}
                  alt={challenge.title}
                  className="mb-5 aspect-video w-full rounded-3xl border border-white/10 object-cover"
                />
              )}
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(challenge.status)}`}>
                {statusLabels[challenge.status]}
              </span>
              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                {challenge.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-zinc-300">{challenge.description}</p>
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <CalendarDays className="h-4 w-4" />
                {formatDate(challenge.starts_at)} ate {formatDate(challenge.ends_at)}
              </p>

              {challenge.rules && (
                <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950 p-5">
                  <h2 className="font-black">Regras</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                    {challenge.rules}
                  </p>
                </div>
              )}

              <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950 p-5">
                <h2 className="font-black">Participar</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Escolha um post existente para entrar no desafio.
                </p>

                {myEntriesCount >= (challenge.max_entries_per_user || 1) && (
                  <div className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
                    Voce ja participou deste desafio.
                  </div>
                )}

                {challenge.status !== 'active' && (
                  <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
                    Participacoes ficam disponiveis somente enquanto o desafio esta ativo.
                  </div>
                )}

                <label className="mt-4 block">
                  <span className="text-sm font-black text-zinc-100">Seu post</span>
                  <select
                    value={selectedPostId}
                    onChange={(event) => setSelectedPostId(event.target.value)}
                    disabled={!canParticipate || myPosts.length === 0}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:opacity-60"
                  >
                    {myPosts.length === 0 ? (
                      <option value="">Nenhum post encontrado</option>
                    ) : (
                      myPosts.map((post) => (
                        <option key={post.id} value={post.id}>
                          {(post.content || 'Post com midia').slice(0, 80)}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="mt-4 block">
                  <span className="text-sm font-black text-zinc-100">Legenda opcional</span>
                  <textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    rows={3}
                    disabled={!canParticipate}
                    className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:opacity-60"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleJoinChallenge}
                  disabled={!canParticipate || !selectedPostId || submitting}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Participar
                </button>

                {(message || successMessage) && (
                  <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                    successMessage
                      ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                      : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                  }`}>
                    {successMessage ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <X className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{successMessage || message}</span>
                  </div>
                )}
              </div>
            </aside>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">Posts participantes</h2>
                  <p className="mt-1 text-sm text-zinc-400">{entries.length} participacoes</p>
                </div>
              </div>

              {entries.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center">
                  <div>
                    <Trophy className="mx-auto h-10 w-10 text-blue-200" />
                    <h3 className="mt-4 text-xl font-black">Ainda nao ha participacoes.</h3>
                    <p className="mt-2 text-sm text-zinc-400">Se o desafio estiver ativo, escolha um post e participe.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {entries.map((entry) => {
                    const post = entry.post
                    const authorName = getAuthorName(post)

                    return (
                      <article key={entry.id} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              {post?.profiles?.avatar_url ? (
                                <img src={post.profiles.avatar_url} alt={authorName} className="h-10 w-10 rounded-full object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-sm font-black text-blue-100">
                                  {authorName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-black">{authorName}</p>
                                <p className="text-xs text-zinc-500">{formatDate(entry.created_at)}</p>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleVote(entry)}
                            disabled={votingEntryId === entry.id}
                            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              entry.votedByMe
                                ? 'bg-blue-600 text-white'
                                : 'bg-white/5 text-zinc-200 hover:bg-white/10'
                            }`}
                          >
                            {votingEntryId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                            {entry.votesCount}
                          </button>
                        </div>

                        {entry.caption && (
                          <p className="mt-4 rounded-2xl border border-blue-300/15 bg-blue-500/10 p-3 text-sm leading-6 text-blue-50">
                            {entry.caption}
                          </p>
                        )}

                        <div className="mt-4 rounded-2xl border border-white/10 bg-black p-4">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                            {post?.content || 'Post com midia'}
                          </p>
                          {post?.image_url && (
                            <img src={post.image_url} alt="Midia do post" className="mt-3 max-h-80 w-full rounded-2xl object-cover" />
                          )}
                          {post?.video_url && (
                            <video src={post.video_url} controls playsInline className="mt-3 max-h-80 w-full rounded-2xl bg-black object-contain" />
                          )}
                          {post && (
                            <Link href={`/post/${post.id}`} className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-black text-zinc-200 transition hover:bg-white/10">
                              Abrir post
                            </Link>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
