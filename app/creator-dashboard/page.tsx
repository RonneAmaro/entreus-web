'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bookmark,
  Coins,
  Heart,
  Loader2,
  MessageCircle,
  Repeat2,
  Send,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import { CreatorChecklist, CreatorDashboardStats } from '../components/CreatorDashboardStats'
import { supabase } from '@/lib/supabase'
import {
  summarizeCreatorDashboard,
  type CreatorDashboardPost,
  type CreatorMetric,
} from '@/lib/creator-dashboard'
import { summarizeCreatorTips, type CreatorTipRecentItem } from '@/lib/creator-tips'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  age_verification_status: string | null
  terms_accepted_at: string | null
}

type PostReference = { post_id: string | null }
type TipRow = { id: string | null; amount: number | null; created_at: string | null; metadata: Record<string, unknown> | null }
type WalletRow = { balance: number | null }

type QueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

const EMPTY_QUERY: QueryResult<PostReference> = { data: [], error: null }

function isMissingPostColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message || '').toLowerCase()
  return (
    message.includes('community_type') ||
    message.includes('content_rating') ||
    message.includes('moderation_status')
  )
}

function metricFromQuery<T>(result: QueryResult<T>, getValue: (rows: T[]) => number): number | undefined {
  if (result.error) return undefined
  return getValue(result.data || [])
}

function countReferences(rows: PostReference[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    if (!row.post_id) return counts
    counts[row.post_id] = (counts[row.post_id] || 0) + 1
    return counts
  }, {})
}

function mergeInteractionCounts(...sources: Record<string, number>[]) {
  return sources.reduce<Record<string, number>>((counts, source) => {
    for (const [postId, value] of Object.entries(source)) {
      counts[postId] = (counts[postId] || 0) + value
    }
    return counts
  }, {})
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR')
}

function formatDate(value: string | null) {
  if (!value) return 'Sem atividade ainda'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function labelCommunity(value: string) {
  const labels: Record<string, string> = {
    general: 'Geral',
    sports: 'Esportes',
    geopolitics: 'Geopolítica',
    military: 'Militar',
    adult_18plus: 'Adulto 18+',
  }
  return labels[value] || 'Geral'
}

function labelRating(value: string) {
  const labels: Record<string, string> = {
    safe: 'Seguro',
    sensitive: 'Sensível',
    adult_18plus: 'Adulto 18+',
  }
  return labels[value] || 'Seguro'
}

function creatorMetric(value: number | undefined): CreatorMetric {
  return value === undefined
    ? { value: 0, available: false }
    : { value, available: true }
}

export default function CreatorDashboardPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const mounted = true
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [profile, setProfile] = useState<CurrentProfile | null>(null)
  const [posts, setPosts] = useState<CreatorDashboardPost[]>([])
  const [metrics, setMetrics] = useState({
    likes: undefined as number | undefined,
    comments: undefined as number | undefined,
    reposts: undefined as number | undefined,
    saves: undefined as number | undefined,
    followers: undefined as number | undefined,
    supports: undefined as number | undefined,
    walletBalance: undefined as number | undefined,
  })
  const [tipActivity, setTipActivity] = useState({
    count: undefined as number | undefined,
    recentTips: [] as CreatorTipRecentItem[],
  })
  const [interactionsByPostId, setInteractionsByPostId] = useState<Record<string, number>>({})

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/login')
      return
    }

    setEmail(user.email || '')

    const [profileResult, unreadResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, age_verification_status, terms_accepted_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false),
    ])

    if (profileResult.data) {
      setProfile(profileResult.data as CurrentProfile)
    }
    setUnreadNotificationsCount(unreadResult.count || 0)

    let postsResult = await supabase
      .from('posts')
      .select('id, created_at, community_type, content_rating, category, moderation_status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (isMissingPostColumnError(postsResult.error)) {
      const fallbackPostsResult = await supabase
        .from('posts')
        .select('id, created_at, category')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      postsResult = fallbackPostsResult as typeof postsResult
    }

    if (postsResult.error) {
      setMessage('Não foi possível carregar suas publicações agora. Tente novamente em instantes.')
      setPosts([])
      setLoading(false)
      return
    }

    const ownPosts = (postsResult.data || []) as CreatorDashboardPost[]
    setPosts(ownPosts)
    const postIds = ownPosts.map((post) => post.id)

    const postReferences = <T extends PostReference>(table: 'likes' | 'comments' | 'reposts' | 'bookmarks') => {
      if (postIds.length === 0) return Promise.resolve(EMPTY_QUERY as QueryResult<T>)
      return supabase
        .from(table)
        .select('post_id')
        .in('post_id', postIds) as unknown as Promise<QueryResult<T>>
    }

    const [likesResult, commentsResult, repostsResult, savesResult, followersResult, tipsResult, walletResult] = await Promise.all([
      postReferences('likes'),
      postReferences('comments'),
      postReferences('reposts'),
      postReferences('bookmarks'),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id),
      supabase
        .from('itacash_transactions')
        .select('id, amount, created_at, metadata')
        .eq('user_id', user.id)
        .eq('type', 'tip_received')
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('itacash_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const likes = metricFromQuery(likesResult, (rows) => rows.length)
    const comments = metricFromQuery(commentsResult, (rows) => rows.length)
    const reposts = metricFromQuery(repostsResult, (rows) => rows.length)
    const saves = metricFromQuery(savesResult, (rows) => rows.length)
    const followers = followersResult.error ? undefined : followersResult.count || 0
    const tipsSummary = tipsResult.error ? null : summarizeCreatorTips((tipsResult.data || []) as TipRow[])
    const supports = tipsSummary?.totalReceived
    const walletBalance = walletResult.error ? undefined : Math.max(0, Number((walletResult.data as WalletRow | null)?.balance) || 0)

    setMetrics({ likes, comments, reposts, saves, followers, supports, walletBalance })
    setTipActivity({
      count: tipsSummary?.countReceived,
      recentTips: tipsSummary?.recentTips || [],
    })
    setInteractionsByPostId(
      mergeInteractionCounts(
        countReferences((likesResult.data || []) as PostReference[]),
        countReferences((commentsResult.data || []) as PostReference[]),
        countReferences((repostsResult.data || []) as PostReference[]),
        countReferences((savesResult.data || []) as PostReference[]),
      ),
    )

    if ([likesResult, commentsResult, repostsResult, savesResult].some((result) => result.error)) {
      setMessage('Algumas métricas de interação estão indisponíveis no momento. Seus posts continuam seguros e privados neste painel.')
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadDashboard])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const summary = useMemo(
    () => summarizeCreatorDashboard({
      posts,
      likesReceived: metrics.likes,
      commentsReceived: metrics.comments,
      repostsReceived: metrics.reposts,
      savesReceived: metrics.saves,
      followers: metrics.followers,
      supportsReceived: metrics.supports,
      walletBalance: metrics.walletBalance,
      interactionsByPostId,
    }),
    [interactionsByPostId, metrics, posts],
  )

  const statCards = [
    { label: 'Posts publicados', metric: creatorMetric(summary.posts), icon: BarChart3, tone: 'bg-blue-500/15 text-blue-200' },
    { label: 'Curtidas recebidas', metric: summary.likes, icon: Heart, tone: 'bg-rose-500/15 text-rose-200', unavailableLabel: 'Disponível quando a leitura de interações responder.' },
    { label: 'Comentários recebidos', metric: summary.comments, icon: MessageCircle, tone: 'bg-emerald-500/15 text-emerald-200', unavailableLabel: 'Disponível quando a leitura de interações responder.' },
    { label: 'Seguidores', metric: summary.followers, icon: Users, tone: 'bg-violet-500/15 text-violet-200', unavailableLabel: 'Disponível quando a lista de seguidores responder.' },
    { label: 'Engajamento estimado', metric: summary.engagementRate, icon: BarChart3, tone: 'bg-amber-500/15 text-amber-200', suffix: summary.engagementRate.available ? '%' : '', unavailableLabel: 'Analytics de visualizações ainda está em preparação.' },
    { label: 'Apoios recebidos', metric: summary.supports, icon: Coins, tone: 'bg-cyan-500/15 text-cyan-200', suffix: summary.supports.available ? ' ItaCash' : '', unavailableLabel: 'Mostra apenas apoios ItaCash já registrados.' },
  ]

  const checklist = [
    { label: 'Foto de perfil', complete: Boolean(profile?.avatar_url), description: 'Ajuda seu público a reconhecer sua conta.' },
    { label: 'Bio preenchida', complete: Boolean(profile?.bio?.trim()), description: 'Explique que tipo de conteúdo você cria.' },
    { label: 'Username configurado', complete: Boolean(profile?.username), description: 'Necessário para divulgar seu perfil.' },
    { label: 'Primeira publicação', complete: summary.posts > 0, description: 'As métricas aparecem após a primeira publicação.' },
    { label: 'Regras da comunidade aceitas', complete: Boolean(profile?.terms_accepted_at), description: 'Use a plataforma conforme os termos aceitos.' },
    { label: 'Verificação 18+ para conteúdo adulto', complete: profile?.age_verification_status === 'approved', description: 'Opcional; exigida apenas para publicar na área adulta.' },
    { label: 'Pronto para monetização futura', complete: Boolean(profile?.username && profile?.avatar_url && summary.posts > 0), description: 'Gorjetas ItaCash ja podem aparecer no painel; posts pagos e saques terao pacote proprio.' },
  ]

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={profile?.display_name || profile?.username || undefined}
        username={profile?.username || null}
        email={email}
        avatarUrl={profile?.avatar_url || null}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={profile?.display_name || profile?.username || 'Minha conta'}
        avatarUrl={profile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onLogout={handleLogout}
        onPostClick={() => router.push('/feed#post-composer')}
      />

      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-20 pb-24 sm:px-6 lg:ml-[104px] lg:max-w-[calc(80rem-104px)] lg:px-8 lg:py-8">
        <Link href="/feed" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Feed
        </Link>

        <header className="mt-6 flex flex-col gap-5 rounded-[2rem] border border-blue-300/20 bg-gradient-to-br from-blue-500/15 via-zinc-950 to-zinc-950 p-6 shadow-2xl shadow-blue-950/20 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-3xl border border-blue-200/30 object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/15 text-2xl font-black text-blue-100 ring-1 ring-blue-300/20">
                {(profile?.display_name || profile?.username || 'C').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">EntreUS para criadores</p>
              <h1 className="mt-2 truncate text-3xl font-black tracking-tight sm:text-4xl">Painel do Criador</h1>
              <p className="mt-1 truncate text-sm text-zinc-400">{profile?.display_name || profile?.username || 'Seu perfil'}</p>
              {profile?.username && <p className="mt-1 text-sm font-bold text-blue-100">@{profile.username}</p>}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-blue-500/15 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-blue-300/20 sm:self-auto">
            <BadgeCheck className="h-4 w-4" />
            Métricas iniciais
          </div>
        </header>

        {message && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">{message}</p>}

        {loading ? (
          <div className="mt-6 flex min-h-80 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/90 text-zinc-300">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            Carregando seu painel...
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <CreatorDashboardStats items={statCards} />

            {summary.posts === 0 ? (
              <section className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-7 text-center ring-1 ring-blue-300/10">
                <Send className="mx-auto h-9 w-9 text-blue-200" />
                <h2 className="mt-4 text-2xl font-black">Publique seu primeiro conteúdo</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-blue-100/75">Depois da primeira publicação, você verá aqui o resumo de conteúdo e as interações recebidas.</p>
                <Link href="/feed#post-composer" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-50">Criar publicação</Link>
              </section>
            ) : (
              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Resumo de conteúdo</p>
                      <h2 className="mt-2 text-2xl font-black">Suas publicações</h2>
                    </div>
                    <p className="text-sm text-zinc-500">Última atividade: {formatDate(summary.lastActivityAt)}</p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {Object.entries(summary.ratings).map(([rating, count]) => (
                      <div key={rating} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{labelRating(rating)}</p>
                        <p className="mt-2 text-2xl font-black">{formatNumber(count)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(summary.communities).filter(([, count]) => count > 0).map(([community, count]) => (
                      <span key={community} className="rounded-full border border-blue-300/15 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-100">{labelCommunity(community)} · {formatNumber(count)}</span>
                    ))}
                  </div>
                  {summary.hiddenPosts > 0 && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100"><ShieldAlert className="h-4 w-4" />{summary.hiddenPosts} publicação(ões) com status de moderação diferente de ativo.</p>
                  )}
                </article>

                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Monetização</p>
                  <h2 className="mt-2 text-2xl font-black">Gorjetas ItaCash</h2>
                  {summary.walletBalance.available ? (
                    <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/70">Saldo ItaCash da carteira</p>
                      <p className="mt-2 text-2xl font-black text-cyan-50">{formatNumber(summary.walletBalance.value)} ItaCash</p>
                      <p className="mt-2 text-xs leading-5 text-cyan-100/70">Consulta somente leitura; não representa saldo disponível para saque.</p>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">Carteira ItaCash indisponível no momento.</p>
                  )}
                  {summary.supports.available ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Total recebido</p>
                        <p className="mt-2 text-xl font-black text-white">{formatNumber(summary.supports.value)} ItaCash</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Apoios recebidos</p>
                        <p className="mt-2 text-xl font-black text-white">{formatNumber(tipActivity.count || 0)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">Apoios em ItaCash indisponiveis no momento.</p>
                  )}
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Ultimos apoios</p>
                    {summary.supports.available && tipActivity.recentTips.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {tipActivity.recentTips.map((tip) => (
                          <div key={tip.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                            <span className="font-bold text-zinc-100">{formatNumber(tip.amount)} ItaCash</span>
                            <span className="shrink-0 text-xs text-zinc-500">{formatDate(tip.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-zinc-400">Quando alguem apoiar seu conteudo, os ItaCash aparecerao aqui.</p>
                    )}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                    <li>Posts pagos — em preparação</li>
                    <li>Solicitação de saque — em preparação</li>
                  </ul>
                  <Link href="/wallet" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-cyan-100"><Wallet className="h-4 w-4" />Abrir carteira</Link>
                </article>
              </section>
            )}

            {summary.posts > 0 && (
              <section className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Publicações recentes</p>
                  <h2 className="mt-2 text-2xl font-black">Atividade recente</h2>
                  <div className="mt-4 space-y-3">
                    {summary.recentPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <div className="min-w-0"><p className="text-sm font-bold text-zinc-100">Publicação em {labelCommunity(post.community)}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(post.createdAt)} · {labelRating(post.rating)}</p></div>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-200">{formatNumber(post.engagement)} interações</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Destaques</p>
                  <h2 className="mt-2 text-2xl font-black">Mais engajadas</h2>
                  <div className="mt-4 space-y-3">
                    {summary.topPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <div className="min-w-0"><p className="text-sm font-bold text-zinc-100">Publicação em {labelCommunity(post.community)}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(post.createdAt)} · {labelRating(post.rating)}</p></div>
                        <span className="shrink-0 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-black text-rose-200">{formatNumber(post.engagement)} interações</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Checklist do criador</p>
                <h2 className="mt-2 text-2xl font-black">Próximos passos</h2>
                <CreatorChecklist items={checklist} />
              </article>

              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Interações recebidas</p>
                <h2 className="mt-2 text-2xl font-black">Visão complementar</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-black/30 p-4"><Repeat2 className="h-5 w-5 text-violet-200" /><p className="mt-3 text-xl font-black">{summary.reposts.available ? formatNumber(summary.reposts.value) : '—'}</p><p className="mt-1 text-xs text-zinc-500">Reposts</p></div>
                  <div className="rounded-2xl bg-black/30 p-4"><Bookmark className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xl font-black">{summary.saves.available ? formatNumber(summary.saves.value) : '—'}</p><p className="mt-1 text-xs text-zinc-500">Salvos</p></div>
                  <div className="rounded-2xl bg-black/30 p-4"><Coins className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-xl font-black">{summary.supports.available ? `${formatNumber(summary.supports.value)} ItaCash` : '—'}</p><p className="mt-1 text-xs text-zinc-500">Apoios</p></div>
                </div>
                <p className="mt-5 text-sm leading-6 text-zinc-500">Não carregamos conteúdo, mídia, URLs de storage ou dados de outros criadores neste painel.</p>
              </article>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
