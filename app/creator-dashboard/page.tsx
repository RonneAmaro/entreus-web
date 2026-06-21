'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircle,
  Share2,
} from 'lucide-react'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import { supabase } from '@/lib/supabase'

type AnalyticsRow = {
  id?: string
  creator_id?: string
  post_id?: string | null
  created_at?: string | null
  viewed_at?: string | null
  event_date?: string | null
  views?: number | null
  view_count?: number | null
  likes?: number | null
  like_count?: number | null
  comments?: number | null
  comment_count?: number | null
  shares?: number | null
  share_count?: number | null
  state?: string | null
  state_code?: string | null
  region?: string | null
  viewer_state?: string | null
  [key: string]: unknown
}

type KpiCard = {
  label: string
  value: number
  icon: typeof Eye
  tone: string
}

type DailyViews = {
  date: string
  label: string
  views: number
}

type RegionStat = {
  region: string
  views: number
}

type AnalyticsTotals = {
  views: number
  likes: number
  comments: number
  shares: number
}

type CreatorPost = {
  id: string
  content: string | null
  created_at: string
  community_type?: string | null
  content_rating?: string | null
}

type PostPerformance = {
  post: CreatorPost
  views: number
  likes: number
  comments: number
}

type PostSortMode = 'views' | 'likes' | 'recent'

const REGION_FALLBACK = 'Nao informado'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

function numberFrom(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function getMetric(row: AnalyticsRow, keys: string[], fallbackPerRow = 0) {
  for (const key of keys) {
    const value = numberFrom(row[key])
    if (value > 0) return value
  }

  return fallbackPerRow
}

function getRowDate(row: AnalyticsRow) {
  const value = row.created_at || row.viewed_at || row.event_date
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR')
}

function formatPostDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getPostTitle(post: CreatorPost) {
  const clean = (post.content || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Publicacao sem legenda'
  return clean.length > 110 ? `${clean.slice(0, 110)}...` : clean
}

function getPostClassification(post: CreatorPost) {
  if (post.community_type === 'adult_18plus' || post.content_rating === 'adult_18plus') return 'Adulto 18+'
  if (post.content_rating === 'sensitive') return 'Sensível'
  return 'Seguro'
}

function getRegion(row: AnalyticsRow) {
  return String(
    row.state ||
      row.state_code ||
      row.region ||
      row.viewer_state ||
      REGION_FALLBACK
  ).trim() || REGION_FALLBACK
}

function buildLastSevenDays(rows: AnalyticsRow[]): DailyViews[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))

    return {
      date: getDateKey(date),
      label: formatDayLabel(date),
      views: 0,
    }
  })

  const dayMap = new Map(days.map((day) => [day.date, day]))

  rows.forEach((row) => {
    const key = getDateKey(getRowDate(row))
    const day = dayMap.get(key)
    if (!day) return

    day.views += getMetric(row, ['views', 'view_count'], 1)
  })

  return days
}

function buildRegionStats(rows: AnalyticsRow[]): RegionStat[] {
  const totals = new Map<string, number>()

  rows.forEach((row) => {
    const region = getRegion(row)
    const views = getMetric(row, ['views', 'view_count'], 1)
    totals.set(region, (totals.get(region) || 0) + views)
  })

  return Array.from(totals.entries())
    .map(([region, views]) => ({ region, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)
}

function buildLinePath(points: DailyViews[], width: number, height: number) {
  const maxViews = Math.max(...points.map((point) => point.views), 1)
  const step = points.length > 1 ? width / (points.length - 1) : width

  return points
    .map((point, index) => {
      const x = index * step
      const y = height - (point.views / maxViews) * (height - 20) - 10
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function buildAreaPath(points: DailyViews[], width: number, height: number) {
  const line = buildLinePath(points, width, height)
  return `${line} L ${width} ${height} L 0 ${height} Z`
}

function buildPostPerformance(
  posts: CreatorPost[],
  rows: AnalyticsRow[],
  sortMode: PostSortMode
) {
  const metricsByPost = new Map<string, { views: number; likes: number; comments: number }>()

  rows.forEach((row) => {
    if (!row.post_id) return

    const current = metricsByPost.get(row.post_id) || {
      views: 0,
      likes: 0,
      comments: 0,
    }

    current.views += getMetric(row, ['views', 'view_count'], 1)
    current.likes += getMetric(row, ['likes', 'like_count'])
    current.comments += getMetric(row, ['comments', 'comment_count'])

    metricsByPost.set(row.post_id, current)
  })

  return posts
    .map((post) => {
      const metrics = metricsByPost.get(post.id) || {
        views: 0,
        likes: 0,
        comments: 0,
      }

      return {
        post,
        ...metrics,
      }
    })
    .sort((a, b) => {
      if (sortMode === 'likes') return b.likes - a.likes
      if (sortMode === 'recent') {
        return new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime()
      }

      return b.views - a.views
    })
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[2rem] bg-white/10 ${className}`}>
      <div className="h-full w-full rounded-[2rem] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

function KpiCard({ item }: { item: KpiCard }) {
  const Icon = item.icon

  return (
    <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            {item.label}
          </p>
          <p className="mt-3 text-4xl font-black text-white">{formatNumber(item.value)}</p>
        </div>

        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  )
}

export default function CreatorDashboardPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [posts, setPosts] = useState<CreatorPost[]>([])
  const [postSortMode, setPostSortMode] = useState<PostSortMode>('views')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
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

    const [analyticsResult, postsResult] = await Promise.all([
      supabase
        .from('post_analytics')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('posts')
        .select('id, content, created_at, community_type, content_rating')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(80),
      loadNavigationProfile(user.id),
      loadUnreadNotificationsCount(user.id),
    ])

    if (postsResult.error) {
      setMessage('Nao foi possivel carregar suas publicacoes agora. Tente novamente em instantes.')
      setRows([])
      setPosts([])
      setLoading(false)
      return
    }

    if (analyticsResult.error) {
      setMessage('Analytics indisponivel no momento. Suas publicacoes continuam visiveis abaixo.')
      setRows([])
    } else {
      setRows((analyticsResult.data || []) as AnalyticsRow[])
    }

    setPosts((postsResult.data || []) as CreatorPost[])
    setLoading(false)
  }

  async function loadNavigationProfile(currentUserId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', currentUserId)
      .maybeSingle()

    if (!data) return

    setCurrentProfile({
      username: data.username,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
    })
  }

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    setUnreadNotificationsCount(count || 0)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  const totals = useMemo(() => {
    return rows.reduce<AnalyticsTotals>(
      (acc, row) => {
        acc.views += getMetric(row, ['views', 'view_count'], 1)
        acc.likes += getMetric(row, ['likes', 'like_count'])
        acc.comments += getMetric(row, ['comments', 'comment_count'])
        acc.shares += getMetric(row, ['shares', 'share_count'])
        return acc
      },
      { views: 0, likes: 0, comments: 0, shares: 0 }
    )
  }, [rows])

  const kpis: KpiCard[] = [
    {
      label: 'Visualizacoes Totais',
      value: totals.views,
      icon: Eye,
      tone: 'bg-blue-500/15 text-blue-200',
    },
    {
      label: 'Total de Curtidas',
      value: totals.likes,
      icon: Heart,
      tone: 'bg-red-500/15 text-red-200',
    },
    {
      label: 'Engajamento (Comentarios)',
      value: totals.comments,
      icon: MessageCircle,
      tone: 'bg-emerald-500/15 text-emerald-200',
    },
    {
      label: 'Compartilhamentos',
      value: totals.shares,
      icon: Share2,
      tone: 'bg-violet-500/15 text-violet-200',
    },
  ]

  const dailyViews = useMemo(() => buildLastSevenDays(rows), [rows])
  const regionStats = useMemo(() => buildRegionStats(rows), [rows])
  const postPerformance = useMemo(
    () => buildPostPerformance(posts, rows, postSortMode),
    [postSortMode, posts, rows]
  )
  const linePath = buildLinePath(dailyViews, 640, 220)
  const areaPath = buildAreaPath(dailyViews, 640, 220)
  const maxRegionViews = Math.max(...regionStats.map((item) => item.views), 1)

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={currentProfile?.display_name || currentProfile?.username || undefined}
        username={currentProfile?.username || null}
        email={email}
        avatarUrl={currentProfile?.avatar_url || null}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={currentProfile?.display_name || currentProfile?.username || 'Minha conta'}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-20 pb-24 sm:px-6 lg:ml-[104px] lg:max-w-[calc(80rem-104px)] lg:px-8 lg:py-6">
        <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-96 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/feed"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Feed
            </Link>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-300">
              EntreUS Pro
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
              Painel do criador
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
              Acompanhe seus conteúdos, crescimento e preparação para monetização.
            </p>
          </div>

          <div className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-blue-50 ring-1 ring-blue-300/10">
            <BarChart3 className="h-8 w-8 text-blue-200" />
            <p className="mt-3 text-sm font-bold text-blue-100/70">Modo profissional</p>
            <p className="text-2xl font-black">Analytics</p>
          </div>
        </header>

        {message && (
          <div className="relative z-10 mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        {loading ? (
          <div className="relative z-10 mt-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <LoadingBlock key={index} className="h-36" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
              <LoadingBlock className="h-[24rem]" />
              <LoadingBlock className="h-[24rem]" />
            </div>
            <LoadingBlock className="h-[26rem]" />
          </div>
        ) : (
          <div className="relative z-10 mt-8 space-y-6 pb-10">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((item) => (
                <KpiCard key={item.label} item={item} />
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-2xl shadow-black/20 ring-1 ring-white/5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
                      Ultimos 7 dias
                    </p>
                    <h2 className="mt-1 text-2xl font-black">Evolucao de visualizacoes</h2>
                  </div>
                  <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-200 ring-1 ring-blue-300/15">
                    {formatNumber(totals.views)} views
                  </span>
                </div>

                <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/35 p-4">
                  <svg viewBox="0 0 640 260" className="h-72 w-full" role="img" aria-label="Grafico de visualizacoes dos ultimos 7 dias">
                    <defs>
                      <linearGradient id="viewsArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath} fill="url(#viewsArea)" transform="translate(0 10)" />
                    <path d={linePath} fill="none" stroke="#60a5fa" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" transform="translate(0 10)" />
                    {dailyViews.map((point, index) => {
                      const x = index * (640 / Math.max(dailyViews.length - 1, 1))
                      const maxViews = Math.max(...dailyViews.map((item) => item.views), 1)
                      const y = 220 - (point.views / maxViews) * 200

                      return (
                        <g key={point.date} transform={`translate(${x} ${y + 10})`}>
                          <circle r="6" fill="#bfdbfe" stroke="#2563eb" strokeWidth="3" />
                          <text y="-14" textAnchor="middle" className="fill-zinc-200 text-[18px] font-bold">
                            {point.views}
                          </text>
                        </g>
                      )
                    })}
                    {dailyViews.map((point, index) => {
                      const x = index * (640 / Math.max(dailyViews.length - 1, 1))

                      return (
                        <text key={point.date} x={x} y="252" textAnchor="middle" className="fill-zinc-500 text-[16px] font-bold">
                          {point.label}
                        </text>
                      )
                    })}
                  </svg>
                </div>
              </article>

              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-2xl shadow-black/20 ring-1 ring-white/5">
                <div className="mb-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    Publico
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Distribuicao regional</h2>
                </div>

                {regionStats.length === 0 ? (
                  <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/35 p-8 text-center text-zinc-500">
                    Nenhum dado regional encontrado ainda.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {regionStats.map((item) => {
                      const percent = (item.views / maxRegionViews) * 100

                      return (
                        <div key={item.region}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <span className="font-black text-zinc-100">{item.region}</span>
                            <span className="font-semibold text-zinc-500">{formatNumber(item.views)}</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-2xl shadow-black/20 ring-1 ring-white/5">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">
                    Conteudo
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Desempenho por Publicacao</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Compare seus posts por alcance, curtidas e comentarios.
                  </p>
                </div>

                <label className="w-full lg:w-64">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                    Ordenar por
                  </span>
                  <select
                    value={postSortMode}
                    onChange={(event) => setPostSortMode(event.target.value as PostSortMode)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-black text-white outline-none transition focus:border-blue-300"
                  >
                    <option value="views">Mais Vistos</option>
                    <option value="likes">Mais Curtidos</option>
                    <option value="recent">Mais Recentes</option>
                  </select>
                </label>
              </div>

              {postPerformance.length === 0 ? (
                <div className="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/35 p-8 text-center text-zinc-500">
                  Nenhuma publicacao encontrada para este criador.
                </div>
              ) : (
                <div className="space-y-3">
                  {postPerformance.map((item) => (
                    <article
                      key={item.post.id}
                      className="grid gap-4 rounded-3xl border border-white/10 bg-black/35 p-4 transition hover:border-blue-300/25 hover:bg-blue-950/10 md:grid-cols-[6rem_minmax(0,1fr)_auto]"
                    >
                      <div className="relative flex aspect-video h-24 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 md:aspect-square md:h-24 md:w-24">
                        <div className="flex h-full w-full flex-col items-center justify-center text-zinc-500">
                          <ImageIcon className="h-7 w-7" />
                          <span className="mt-1 text-xs font-bold">Mídia protegida</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-black text-white">
                          {getPostTitle(item.post)}
                        </h3>
                        <p className="mt-2 text-sm font-semibold text-zinc-500">
                          Publicado em {formatPostDate(item.post.created_at)}
                        </p>
                        <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-zinc-300">{getPostClassification(item.post)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-black text-blue-200 ring-1 ring-blue-300/15">
                          <Eye className="h-3.5 w-3.5" />
                          {formatNumber(item.views)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-200 ring-1 ring-red-300/15">
                          <Heart className="h-3.5 w-3.5" />
                          {formatNumber(item.likes)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-emerald-300/15">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {formatNumber(item.comments)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {rows.length === 0 && (
              <div className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-8 text-center text-zinc-400 ring-1 ring-white/5">
                <Loader2 className="mx-auto mb-3 h-8 w-8 text-blue-200" />
                Ainda nao ha eventos de analytics para suas publicacoes.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
