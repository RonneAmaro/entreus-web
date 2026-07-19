'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bookmark,
  CheckCircle2,
  Coins,
  Clock,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Repeat2,
  Send,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import AppSidebar from '../components/AppSidebar'
import { useLanguage } from '../components/LanguageProvider'
import MobileNavigation from '../components/MobileNavigation'
import { CreatorChecklist, CreatorDashboardStats } from '../components/CreatorDashboardStats'
import ItaCashAmount from '../components/ItaCashAmount'
import { supabase } from '@/lib/supabase'
import {
  summarizeCreatorDashboard,
  type CreatorDashboardPost,
  type CreatorMetric,
} from '@/lib/creator-dashboard'
import { summarizeCreatorTips, type CreatorTipRecentItem } from '@/lib/creator-tips'
import { summarizePaidPostUnlocks, type PaidPostTransactionRow } from '@/lib/paid-posts'
import {
  isMissingPostAnalyticsSchemaError,
  rankPostsByEngagement,
  rankPostsByViews,
  summarizePostViewRows,
  type PostViewRow,
} from '@/lib/post-analytics'
import {
  BANK_ACCOUNT_TYPES,
  CREATOR_WITHDRAWAL_PAYMENT_METHODS,
  ITACASH_PER_BRL,
  MIN_WITHDRAWAL_BRL,
  MIN_WITHDRAWAL_ITACASH,
  PIX_KEY_TYPES,
  canRequestWithdrawal,
  convertItaCashToBrl,
  formatWithdrawalPaymentDetailsSummary,
  validateWithdrawalRequestPayload,
  type BankAccountType,
  type CreatorWithdrawalPaymentDetails,
  type CreatorWithdrawalPaymentMethod,
  type CreatorWithdrawalStatus,
  type PixKeyType,
} from '@/lib/creator-withdrawals'

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
type CreatorWithdrawalRow = {
  id: string
  amount_itacash: number
  amount_brl: number
  payment_method: CreatorWithdrawalPaymentMethod
  payment_details: CreatorWithdrawalPaymentDetails
  payment_summary?: string
  payment_method_label?: string
  status: CreatorWithdrawalStatus
  rejection_reason: string | null
  created_at: string
  paid_at: string | null
}

type QueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

type CountedQueryResult<T> = QueryResult<T> & {
  count?: number | null
}

const EMPTY_QUERY: QueryResult<PostReference> = { data: [], error: null }
const EMPTY_VIEW_QUERY: CountedQueryResult<PostViewRow> = { data: [], error: null, count: 0 }
const DEFAULT_WITHDRAWAL_FORM = {
  amountItacash: '',
  paymentMethod: 'pix' as CreatorWithdrawalPaymentMethod,
  pixKey: '',
  pixKeyType: 'cpf' as PixKeyType,
  pixHolderName: '',
  bankHolderName: '',
  bankDocument: '',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
  bankAccountType: 'checking' as BankAccountType,
  bankNotes: '',
  internationalHolderName: '',
  internationalCountry: '',
  internationalDesiredMethod: '',
  internationalNotes: '',
  otherHolderName: '',
  otherMethodDescription: '',
  otherNotes: '',
}

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

function formatNumber(value: number, locale: string) {
  return value.toLocaleString(locale)
}

function formatDate(value: string | null, locale: string, t: (key: string) => string) {
  if (!value) return t('creator.dashboard.noActivity')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('creator.dashboard.dateUnavailable')
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatBRL(value: number, locale: string) {
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

function withdrawalStatusClass(status: CreatorWithdrawalStatus) {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-300/15'
  if (status === 'approved') return 'bg-blue-500/10 text-blue-100 ring-blue-300/15'
  if (status === 'rejected') return 'bg-red-500/10 text-red-200 ring-red-300/15'
  if (status === 'cancelled') return 'bg-zinc-500/10 text-zinc-300 ring-white/10'
  return 'bg-amber-500/10 text-amber-100 ring-amber-300/15'
}

function withdrawalStatusIcon(status: CreatorWithdrawalStatus) {
  if (status === 'paid') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'approved') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'rejected') return <XCircle className="h-3.5 w-3.5" />
  return <Clock className="h-3.5 w-3.5" />
}

function labelCommunity(value: string, t: (key: string) => string) {
  return t(`creator.dashboard.communities.${['general', 'sports', 'geopolitics', 'military', 'adult_18plus'].includes(value) ? value : 'general'}`)
}

function labelRating(value: string, t: (key: string) => string) {
  return t(`creator.dashboard.ratings.${['safe', 'sensitive', 'adult_18plus'].includes(value) ? value : 'safe'}`)
}

function creatorMetric(value: number | undefined): CreatorMetric {
  return value === undefined
    ? { value: 0, available: false }
    : { value, available: true }
}

export default function CreatorDashboardPage() {
  const router = useRouter()
  const { language, t } = useLanguage()
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
    grossAmount: undefined as number | undefined,
    platformFeeAmount: undefined as number | undefined,
    recentTips: [] as CreatorTipRecentItem[],
  })
  const [paidPostActivity, setPaidPostActivity] = useState({
    total: undefined as number | undefined,
    grossAmount: undefined as number | undefined,
    platformFeeAmount: undefined as number | undefined,
    count: undefined as number | undefined,
    recentUnlocks: [] as ReturnType<typeof summarizePaidPostUnlocks>['recentUnlocks'],
  })
  const [withdrawals, setWithdrawals] = useState<CreatorWithdrawalRow[]>([])
  const [withdrawalForm, setWithdrawalForm] = useState(DEFAULT_WITHDRAWAL_FORM)
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false)
  const [withdrawalMessage, setWithdrawalMessage] = useState('')
  const [viewActivity, setViewActivity] = useState({
    available: false,
    total: 0,
    last7: 0,
    last30: 0,
    viewsByPostId: {} as Record<string, number>,
  })
  const [interactionsByPostId, setInteractionsByPostId] = useState<Record<string, number>>({})

  const loadWithdrawals = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setWithdrawals([])
      return
    }

    const response = await fetch('/api/creator-withdrawals', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      withdrawals?: CreatorWithdrawalRow[]
      error?: string
    } | null

    if (!response.ok || !data?.ok) {
      setWithdrawals([])
      setWithdrawalMessage(t('creator.dashboard.errors.loadWithdrawals'))
      return
    }

    setWithdrawals(data.withdrawals || [])
  }, [t])

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
      setMessage(t('creator.dashboard.errors.loadPosts'))
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

    const [likesResult, commentsResult, repostsResult, savesResult, followersResult, tipsResult, paidPostsResult, walletResult, viewsResult] = await Promise.all([
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
        .from('itacash_transactions')
        .select('id, amount, created_at, metadata')
        .eq('user_id', user.id)
        .eq('type', 'paid_post_received')
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('itacash_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle(),
      postIds.length === 0
        ? Promise.resolve(EMPTY_VIEW_QUERY)
        : supabase
          .from('post_views')
          .select('post_id, created_at', { count: 'exact' })
          .eq('creator_id', user.id)
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(10000) as unknown as Promise<CountedQueryResult<PostViewRow>>,
    ])

    const likes = metricFromQuery(likesResult, (rows) => rows.length)
    const comments = metricFromQuery(commentsResult, (rows) => rows.length)
    const reposts = metricFromQuery(repostsResult, (rows) => rows.length)
    const saves = metricFromQuery(savesResult, (rows) => rows.length)
    const followers = followersResult.error ? undefined : followersResult.count || 0
    const tipsSummary = tipsResult.error ? null : summarizeCreatorTips((tipsResult.data || []) as TipRow[])
    const paidPostsSummary = paidPostsResult.error ? null : summarizePaidPostUnlocks((paidPostsResult.data || []) as PaidPostTransactionRow[])
    const supports = tipsSummary?.totalReceived
    const walletBalance = walletResult.error ? undefined : Math.max(0, Number((walletResult.data as WalletRow | null)?.balance) || 0)
    const viewsSummary = viewsResult.error ? null : summarizePostViewRows((viewsResult.data || []) as PostViewRow[])

    setMetrics({ likes, comments, reposts, saves, followers, supports, walletBalance })
    setTipActivity({
      count: tipsSummary?.countReceived,
      grossAmount: tipsSummary?.grossAmount,
      platformFeeAmount: tipsSummary?.platformFeeAmount,
      recentTips: tipsSummary?.recentTips || [],
    })
    setPaidPostActivity({
      total: paidPostsSummary?.totalReceived,
      grossAmount: paidPostsSummary?.grossAmount,
      platformFeeAmount: paidPostsSummary?.platformFeeAmount,
      count: paidPostsSummary?.unlockCount,
      recentUnlocks: paidPostsSummary?.recentUnlocks || [],
    })
    setViewActivity({
      available: !viewsResult.error,
      total: viewsResult.error ? 0 : Math.max(viewsSummary?.total || 0, viewsResult.count || 0),
      last7: viewsSummary?.last7 || 0,
      last30: viewsSummary?.last30 || 0,
      viewsByPostId: viewsSummary?.viewsByPostId || {},
    })
    setInteractionsByPostId(
      mergeInteractionCounts(
        countReferences((likesResult.data || []) as PostReference[]),
        countReferences((commentsResult.data || []) as PostReference[]),
        countReferences((repostsResult.data || []) as PostReference[]),
        countReferences((savesResult.data || []) as PostReference[]),
      ),
    )

    if (viewsResult.error && !isMissingPostAnalyticsSchemaError(viewsResult.error)) {
      setMessage((current) => current || t('creator.dashboard.errors.viewsUnavailable'))
    }

    if ([likesResult, commentsResult, repostsResult, savesResult].some((result) => result.error)) {
      setMessage(t('creator.dashboard.errors.metricsUnavailable'))
    }

    await loadWithdrawals()
    setLoading(false)
  }, [loadWithdrawals, router, t])

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

  async function handleWithdrawalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWithdrawalMessage('')

    const availableBalance = metrics.walletBalance === undefined ? null : metrics.walletBalance
    const validation = validateWithdrawalRequestPayload({
      amountItacash: withdrawalForm.amountItacash,
      paymentMethod: withdrawalForm.paymentMethod,
      pixKey: withdrawalForm.pixKey,
      pixKeyType: withdrawalForm.pixKeyType,
      holderName: withdrawalForm.pixHolderName,
      bankHolderName: withdrawalForm.bankHolderName,
      bankDocument: withdrawalForm.bankDocument,
      bankName: withdrawalForm.bankName,
      bankAgency: withdrawalForm.bankAgency,
      bankAccount: withdrawalForm.bankAccount,
      bankAccountType: withdrawalForm.bankAccountType,
      bankNotes: withdrawalForm.bankNotes,
      internationalHolderName: withdrawalForm.internationalHolderName,
      internationalCountry: withdrawalForm.internationalCountry,
      internationalDesiredMethod: withdrawalForm.internationalDesiredMethod,
      internationalNotes: withdrawalForm.internationalNotes,
      otherHolderName: withdrawalForm.otherHolderName,
      otherMethodDescription: withdrawalForm.otherMethodDescription,
      otherNotes: withdrawalForm.otherNotes,
      availableBalance,
    })

    if (!validation.ok) {
      setWithdrawalMessage(t(`creator.withdrawal.errors.${validation.reason}`))
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setWithdrawalMessage(t('creator.withdrawal.errors.not_authenticated'))
      return
    }

    setWithdrawalSubmitting(true)
    const response = await fetch('/api/creator-withdrawals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(validation.value),
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      message?: string
      error?: string
    } | null

    setWithdrawalSubmitting(false)

    if (!response.ok || !data?.ok) {
      setWithdrawalMessage(t('creator.withdrawal.errors.internal'))
      return
    }

    setWithdrawalForm((current) => ({
      ...DEFAULT_WITHDRAWAL_FORM,
      paymentMethod: current.paymentMethod,
      pixKeyType: current.pixKeyType,
      bankAccountType: current.bankAccountType,
    }))
    setWithdrawalMessage(t('creator.withdrawal.requestSent'))
    await loadDashboard()
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
      views: viewActivity.available ? viewActivity.total : undefined,
      interactionsByPostId,
    }),
    [interactionsByPostId, metrics, posts, viewActivity.available, viewActivity.total],
  )

  const topViewedPosts = useMemo(
    () => viewActivity.available
      ? rankPostsByViews(posts, viewActivity.viewsByPostId, interactionsByPostId, 5)
      : [],
    [interactionsByPostId, posts, viewActivity.available, viewActivity.viewsByPostId],
  )

  const topEngagementByViewPosts = useMemo(
    () => viewActivity.available
      ? rankPostsByEngagement(posts, viewActivity.viewsByPostId, interactionsByPostId, 5)
      : [],
    [interactionsByPostId, posts, viewActivity.available, viewActivity.viewsByPostId],
  )

  const statCards = [
    { label: t('creator.dashboard.stats.posts'), metric: creatorMetric(summary.posts), icon: BarChart3, tone: 'bg-blue-500/15 text-blue-200' },
    { label: t('creator.dashboard.stats.views'), metric: creatorMetric(viewActivity.available ? viewActivity.total : undefined), icon: Eye, tone: 'bg-emerald-500/15 text-emerald-200', unavailableLabel: t('creator.dashboard.stats.analyticsMigration') },
    { label: t('creator.dashboard.stats.views7'), metric: creatorMetric(viewActivity.available ? viewActivity.last7 : undefined), icon: TrendingUp, tone: 'bg-lime-500/15 text-lime-200', unavailableLabel: t('creator.dashboard.stats.analyticsMigration') },
    { label: t('creator.dashboard.stats.views30'), metric: creatorMetric(viewActivity.available ? viewActivity.last30 : undefined), icon: BarChart3, tone: 'bg-sky-500/15 text-sky-200', unavailableLabel: t('creator.dashboard.stats.analyticsMigration') },
    { label: t('creator.dashboard.stats.likes'), metric: summary.likes, icon: Heart, tone: 'bg-rose-500/15 text-rose-200', unavailableLabel: t('creator.dashboard.stats.interactionsUnavailable') },
    { label: t('creator.dashboard.stats.comments'), metric: summary.comments, icon: MessageCircle, tone: 'bg-emerald-500/15 text-emerald-200', unavailableLabel: t('creator.dashboard.stats.interactionsUnavailable') },
    { label: t('creator.dashboard.stats.followers'), metric: summary.followers, icon: Users, tone: 'bg-violet-500/15 text-violet-200', unavailableLabel: t('creator.dashboard.stats.followersUnavailable') },
    { label: t('creator.dashboard.stats.engagement'), metric: summary.engagementRate, icon: BarChart3, tone: 'bg-amber-500/15 text-amber-200', suffix: summary.engagementRate.available ? '%' : '', unavailableLabel: t('creator.dashboard.stats.analyticsPreparing') },
    {
      label: t('creator.dashboard.stats.netTips'),
      metric: summary.supports,
      icon: Coins,
      tone: 'bg-cyan-500/15 text-cyan-200',
      renderValue: summary.supports.available
        ? <ItaCashAmount amount={summary.supports.value} size="lg" className="text-white" valueClassName="text-2xl" />
        : undefined,
      unavailableLabel: t('creator.dashboard.stats.netTipsUnavailable'),
    },
  ]

  const checklist = [
    { label: t('creator.dashboard.checklist.photo'), complete: Boolean(profile?.avatar_url), description: t('creator.dashboard.checklist.photoDescription') },
    { label: t('creator.dashboard.checklist.bio'), complete: Boolean(profile?.bio?.trim()), description: t('creator.dashboard.checklist.bioDescription') },
    { label: t('creator.dashboard.checklist.username'), complete: Boolean(profile?.username), description: t('creator.dashboard.checklist.usernameDescription') },
    { label: t('creator.dashboard.checklist.firstPost'), complete: summary.posts > 0, description: t('creator.dashboard.checklist.firstPostDescription') },
    { label: t('creator.dashboard.checklist.rules'), complete: Boolean(profile?.terms_accepted_at), description: t('creator.dashboard.checklist.rulesDescription') },
    { label: t('creator.dashboard.checklist.adultVerification'), complete: profile?.age_verification_status === 'approved', description: t('creator.dashboard.checklist.adultVerificationDescription') },
    { label: t('creator.dashboard.checklist.monetization'), complete: Boolean(profile?.username && profile?.avatar_url && summary.posts > 0), description: t('creator.dashboard.checklist.monetizationDescription') },
  ]

  const walletBalanceValue = summary.walletBalance.available ? summary.walletBalance.value : 0
  const canSubmitWithdrawal = summary.walletBalance.available && canRequestWithdrawal(walletBalanceValue)
  const withdrawalFormDisabled = !summary.walletBalance.available || withdrawalSubmitting
  const selectedPaymentMethodLabel = t(`creator.withdrawal.methods.${withdrawalForm.paymentMethod}`)
  const selectedPaymentMethodNotice = t(`creator.withdrawal.methodNotices.${withdrawalForm.paymentMethod}`)
  const withdrawalPreviewAmount = Number(withdrawalForm.amountItacash)
  const withdrawalPreviewBrl = Number.isFinite(withdrawalPreviewAmount)
    ? convertItaCashToBrl(withdrawalPreviewAmount)
    : 0
  const tipNetAmount = summary.supports.available ? summary.supports.value : undefined
  const paidPostNetAmount = paidPostActivity.total
  const revenueAvailable = tipNetAmount !== undefined || paidPostNetAmount !== undefined
  const netRevenueAmount = (tipNetAmount || 0) + (paidPostNetAmount || 0)
  const grossRevenueAmount = (tipActivity.grossAmount ?? tipNetAmount ?? 0) + (paidPostActivity.grossAmount ?? paidPostNetAmount ?? 0)
  const platformFeeAmount = (tipActivity.platformFeeAmount || 0) + (paidPostActivity.platformFeeAmount || 0)

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
        displayName={profile?.display_name || profile?.username || t('navigation.myAccount')}
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
          {t('navigation.feed')}
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
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">{t('creator.dashboard.eyebrow')}</p>
              <h1 className="mt-2 truncate text-3xl font-black tracking-tight sm:text-4xl">{t('creator.dashboard.title')}</h1>
              <p className="mt-1 truncate text-sm text-zinc-400">{profile?.display_name || profile?.username || 'Seu perfil'}</p>
              {profile?.username && <p className="mt-1 text-sm font-bold text-blue-100">@{profile.username}</p>}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-blue-500/15 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-blue-300/20 sm:self-auto">
            <BadgeCheck className="h-4 w-4" />
            {t('creator.dashboard.initialMetrics')}
          </div>
        </header>

        <nav aria-label={t('creator.dashboard.quickActionsLabel')} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/feed#post-composer" className="flex min-w-0 items-center gap-3 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            <Send className="h-4 w-4 shrink-0" /> {t('creator.dashboard.createPaidPost')}
          </Link>
          <Link href="#monetizacao" className="flex min-w-0 items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <Coins className="h-4 w-4 shrink-0" /> {t('creator.dashboard.viewMonetization')}
          </Link>
          <Link href="#saque" className="flex min-w-0 items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            <Banknote className="h-4 w-4 shrink-0" /> {t('creator.dashboard.requestWithdrawal')}
          </Link>
          <Link href="/profile" className="flex min-w-0 items-center gap-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-100 transition hover:-translate-y-0.5 hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            <BadgeCheck className="h-4 w-4 shrink-0" /> {t('creator.dashboard.editProfile')}
          </Link>
        </nav>

        {message && <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">{message}</p>}

        {loading ? (
          <div className="mt-6 flex min-h-80 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/90 text-zinc-300">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            {t('creator.dashboard.loading')}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <CreatorDashboardStats items={statCards} />

            {summary.posts === 0 && (
              <section className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-7 text-center ring-1 ring-blue-300/10">
                <Send className="mx-auto h-9 w-9 text-blue-200" />
                <h2 className="mt-4 text-2xl font-black">{t('creator.dashboard.firstPostTitle')}</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-blue-100/75">{t('creator.dashboard.firstPostDescription')}</p>
                <Link href="/feed#post-composer" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-50">{t('creator.dashboard.createPost')}</Link>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">{t('creator.dashboard.contentSummary')}</p>
                      <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.yourPosts')}</h2>
                    </div>
                    <p className="text-sm text-zinc-500">{t('creator.dashboard.lastActivity', { date: formatDate(summary.lastActivityAt, language, t) })}</p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {Object.entries(summary.ratings).map(([rating, count]) => (
                      <div key={rating} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{labelRating(rating, t)}</p>
                        <p className="mt-2 text-2xl font-black">{formatNumber(count, language)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(summary.communities).filter(([, count]) => count > 0).map(([community, count]) => (
                      <span key={community} className="rounded-full border border-blue-300/15 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-100">{labelCommunity(community, t)} · {formatNumber(count, language)}</span>
                    ))}
                  </div>
                  {summary.hiddenPosts > 0 && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100"><ShieldAlert className="h-4 w-4" />{t('creator.dashboard.hiddenPosts', { count: summary.hiddenPosts })}</p>
                  )}
                </article>

                <article id="monetizacao" className="min-w-0 scroll-mt-24 overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/90 p-4 shadow-xl shadow-black/20 ring-1 ring-white/5 sm:p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">{t('creator.dashboard.monetization')}</p>
                  <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.itacashRevenue')}</h2>
                  {summary.walletBalance.available ? (
                    <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/70">{t('creator.dashboard.netWalletBalance')}</p>
                      <ItaCashAmount amount={summary.walletBalance.value} size="lg" className="mt-2 text-cyan-50" valueClassName="text-2xl" />
                      <p className="mt-2 text-xs leading-5 text-cyan-100/70">{t('creator.dashboard.balanceEquivalent', { value: formatBRL(convertItaCashToBrl(summary.walletBalance.value), language) })}</p>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">{t('creator.dashboard.walletUnavailable')}</p>
                  )}
                  {revenueAvailable && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.financialSummary')}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-bold text-zinc-500">{t('creator.dashboard.netRevenue')}</p>
                          <ItaCashAmount amount={netRevenueAmount} size="sm" className="mt-1 text-emerald-100" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-500">{t('creator.dashboard.platformFee')}</p>
                          <ItaCashAmount amount={platformFeeAmount} size="sm" className="mt-1 text-amber-100" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-500">{t('creator.dashboard.grossAmount')}</p>
                          <ItaCashAmount amount={grossRevenueAmount} size="sm" className="mt-1 text-white" />
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-zinc-500">{t('creator.dashboard.revenueNotice')}</p>
                    </div>
                  )}
                  {summary.supports.available ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.netTipsReceived')}</p>
                        <ItaCashAmount amount={summary.supports.value} size="lg" className="mt-2 text-white" valueClassName="text-xl" />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.tips')}</p>
                        <p className="mt-2 text-xl font-black text-white">{formatNumber(tipActivity.count || 0, language)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">{t('creator.dashboard.tipsUnavailable')}</p>
                  )}
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.latestNetTips')}</p>
                    {summary.supports.available && tipActivity.recentTips.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {tipActivity.recentTips.map((tip) => (
                          <div key={tip.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                            <ItaCashAmount amount={tip.amount} size="sm" className="text-zinc-100" />
                            <span className="shrink-0 text-xs text-zinc-500">{formatDate(tip.createdAt, language, t)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{t('creator.dashboard.noTips')}</p>
                    )}
                  </div>
                  <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/70">{t('creator.dashboard.paidPosts')}</p>
                    {paidPostActivity.total !== undefined ? (
                      <>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.netPaidPosts')}</p>
                            <ItaCashAmount amount={paidPostActivity.total} size="lg" className="mt-2 text-white" valueClassName="text-xl" />
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.dashboard.unlocks')}</p>
                            <p className="mt-2 text-xl font-black text-white">{formatNumber(paidPostActivity.count || 0, language)}</p>
                          </div>
                        </div>
                        {paidPostActivity.recentUnlocks.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {paidPostActivity.recentUnlocks.map((unlock) => (
                              <div key={unlock.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                                <ItaCashAmount amount={unlock.amount} size="sm" className="text-zinc-100" />
                                <span className="shrink-0 text-xs text-zinc-500">{formatDate(unlock.createdAt, language, t)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-cyan-100/75">{t('creator.dashboard.noPaidUnlocks')}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-cyan-100/75">{t('creator.dashboard.paidPostsUnavailable')}</p>
                    )}
                  </div>
                  <div id="saque" className="mt-4 min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-100">
                        <Banknote className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100/70">{t('creator.withdrawal.title')}</p>
                        <h3 className="mt-1 text-xl font-black">{t('creator.withdrawal.requestManual')}</h3>
                        <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                          {t('creator.withdrawal.manualPrefix')} <ItaCashAmount amount={MIN_WITHDRAWAL_ITACASH} size="sm" className="mx-1" /> = {formatBRL(MIN_WITHDRAWAL_BRL, language)}.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('wallet.available')}</p>
                        <ItaCashAmount amount={walletBalanceValue} size="lg" className="mt-2" valueClassName="text-xl" />
                        <p className="mt-1 text-xs text-zinc-400">{formatBRL(convertItaCashToBrl(walletBalanceValue), language)}</p>
                      </div>
                      <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.conversion')}</p>
                        <ItaCashAmount amount={ITACASH_PER_BRL} size="lg" className="mt-2" valueClassName="text-xl" />
                        <p className="mt-1 text-xs text-zinc-400">{formatBRL(1, language)}</p>
                      </div>
                    </div>

                    {!canSubmitWithdrawal && (
                      <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-semibold leading-6 text-amber-100">
                        {t('creator.withdrawal.minimumPrefix')} <ItaCashAmount amount={MIN_WITHDRAWAL_ITACASH} size="sm" className="mx-1" /> ({formatBRL(MIN_WITHDRAWAL_BRL, language)}) {t('creator.withdrawal.minimumSuffix')}
                      </p>
                    )}

                    {withdrawalMessage && (
                      <p className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 p-3 text-sm font-semibold leading-6 text-blue-100">
                        {withdrawalMessage}
                      </p>
                    )}

                    <form onSubmit={handleWithdrawalSubmit} className="mt-4 grid gap-3">
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.amount')}</span>
                        <input
                          type="number"
                          min={MIN_WITHDRAWAL_ITACASH}
                          step={1}
                          value={withdrawalForm.amountItacash}
                          onChange={(event) => setWithdrawalForm((current) => ({ ...current, amountItacash: event.target.value }))}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={withdrawalFormDisabled}
                        />
                        <span className="mt-1 block text-xs text-zinc-500">
                          {t('creator.withdrawal.preview', { value: formatBRL(withdrawalPreviewBrl > 0 ? withdrawalPreviewBrl : 0, language) })}
                        </span>
                      </label>

                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.paymentMethod')}</span>
                        <select
                          value={withdrawalForm.paymentMethod}
                          onChange={(event) => setWithdrawalForm((current) => ({ ...current, paymentMethod: event.target.value as CreatorWithdrawalPaymentMethod }))}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={withdrawalFormDisabled}
                        >
                          {CREATOR_WITHDRAWAL_PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>{t(`creator.withdrawal.methods.${method}`)}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">
                          {selectedPaymentMethodNotice} {t('creator.withdrawal.checkDetails')}
                        </span>
                      </label>

                      {withdrawalForm.paymentMethod === 'pix' && (
                      <div className="grid gap-3">
                        <p className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-3 text-xs font-semibold leading-5 text-emerald-50/80">
                          {t('creator.withdrawal.pixRecommended')}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.pixType')}</span>
                          <select
                            value={withdrawalForm.pixKeyType}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, pixKeyType: event.target.value as PixKeyType }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          >
                            {PIX_KEY_TYPES.map((type) => (
                              <option key={type} value={type}>{t(`creator.withdrawal.pixTypes.${type}`)}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.pixKey')}</span>
                          <input
                            value={withdrawalForm.pixKey}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, pixKey: event.target.value }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                        </div>

                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.holderName')}</span>
                          <input
                            value={withdrawalForm.pixHolderName}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, pixHolderName: event.target.value }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                      </div>
                      )}

                      {withdrawalForm.paymentMethod === 'bank_transfer' && (
                      <div className="grid gap-3">
                        <p className="rounded-2xl border border-amber-300/15 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-50/80">
                          {t('creator.withdrawal.bankNotice')}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.holderName')}</span>
                            <input
                              value={withdrawalForm.bankHolderName}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankHolderName: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.holderDocument')}</span>
                            <input
                              value={withdrawalForm.bankDocument}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankDocument: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.bank')}</span>
                            <input
                              value={withdrawalForm.bankName}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankName: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.accountType')}</span>
                            <select
                              value={withdrawalForm.bankAccountType}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankAccountType: event.target.value as BankAccountType }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            >
                              {BANK_ACCOUNT_TYPES.map((type) => (
                                <option key={type} value={type}>{t(`creator.withdrawal.accountTypes.${type}`)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.agency')}</span>
                            <input
                              value={withdrawalForm.bankAgency}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankAgency: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.account')}</span>
                            <input
                              value={withdrawalForm.bankAccount}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankAccount: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.optionalNote')}</span>
                          <textarea
                            value={withdrawalForm.bankNotes}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, bankNotes: event.target.value }))}
                            rows={2}
                            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                      </div>
                      )}

                      {withdrawalForm.paymentMethod === 'international_manual' && (
                      <div className="grid gap-3">
                        <p className="rounded-2xl border border-amber-300/15 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-50/80">
                          {t('creator.withdrawal.internationalNotice')}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.holderName')}</span>
                            <input
                              value={withdrawalForm.internationalHolderName}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, internationalHolderName: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.country')}</span>
                            <input
                              value={withdrawalForm.internationalCountry}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, internationalCountry: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.desiredMethod')}</span>
                          <input
                            value={withdrawalForm.internationalDesiredMethod}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, internationalDesiredMethod: event.target.value }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.notes')}</span>
                          <textarea
                            value={withdrawalForm.internationalNotes}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, internationalNotes: event.target.value }))}
                            rows={2}
                            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                      </div>
                      )}

                      {withdrawalForm.paymentMethod === 'other_manual' && (
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.holderName')}</span>
                            <input
                              value={withdrawalForm.otherHolderName}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, otherHolderName: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.methodDescription')}</span>
                            <input
                              value={withdrawalForm.otherMethodDescription}
                              onChange={(event) => setWithdrawalForm((current) => ({ ...current, otherMethodDescription: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={withdrawalFormDisabled}
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.notes')}</span>
                          <textarea
                            value={withdrawalForm.otherNotes}
                            onChange={(event) => setWithdrawalForm((current) => ({ ...current, otherNotes: event.target.value }))}
                            rows={2}
                            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={withdrawalFormDisabled}
                          />
                        </label>
                      </div>
                      )}

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-zinc-400">
                        {t('creator.withdrawal.selectedMethod')} <span className="font-black text-zinc-100">{selectedPaymentMethodLabel}</span>. {t('creator.withdrawal.processingNotice')}
                      </div>

                      <button
                        type="submit"
                        disabled={!canSubmitWithdrawal || withdrawalSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {withdrawalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                        {t('creator.dashboard.requestWithdrawal')}
                      </button>
                    </form>

                    <div className="mt-5 border-t border-white/10 pt-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{t('creator.withdrawal.recentRequests')}</p>
                      {withdrawals.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {withdrawals.slice(0, 5).map((withdrawal) => (
                            <div key={withdrawal.id} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <ItaCashAmount amount={withdrawal.amount_itacash} size="sm" className="text-white" />
                                  <p className="mt-1 text-xs text-zinc-500">{formatBRL(Number(withdrawal.amount_brl) || 0, language)} - {formatDate(withdrawal.created_at, language, t)}</p>
                                  <p className="mt-1 text-xs font-semibold text-zinc-300">
                                    {withdrawal.payment_summary || formatWithdrawalPaymentDetailsSummary(withdrawal.payment_method, withdrawal.payment_details)}
                                  </p>
                                </div>
                                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ring-1 ${withdrawalStatusClass(withdrawal.status)}`}>
                                  {withdrawalStatusIcon(withdrawal.status)}
                                  {t(`creator.withdrawal.statuses.${withdrawal.status}`)}
                                </span>
                              </div>
                              {withdrawal.rejection_reason && (
                                <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold leading-5 text-red-100 ring-1 ring-red-300/15">
                                  {t('creator.withdrawal.rejectionReason', { reason: withdrawal.rejection_reason })}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-6 text-emerald-50/75">{t('creator.withdrawal.noRequests')}</p>
                      )}
                    </div>
                  </div>
                  <Link href="/wallet" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-cyan-100"><Wallet className="h-4 w-4" />{t('creator.dashboard.openWallet')}</Link>
                </article>
              </section>

            {summary.posts > 0 && (
              <section className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{t('creator.dashboard.recentPosts')}</p>
                  <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.recentActivity')}</h2>
                  <div className="mt-4 space-y-3">
                    {summary.recentPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <div className="min-w-0"><p className="text-sm font-bold text-zinc-100">{t('creator.dashboard.postIn', { community: labelCommunity(post.community, t) })}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(post.createdAt, language, t)} · {labelRating(post.rating, t)}</p></div>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-200">{t('creator.dashboard.interactions', { count: formatNumber(post.engagement, language) })}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">{t('creator.dashboard.highlights')}</p>
                  <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.mostEngaged')}</h2>
                  <div className="mt-4 space-y-3">
                    {summary.topPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <div className="min-w-0"><p className="text-sm font-bold text-zinc-100">{t('creator.dashboard.postIn', { community: labelCommunity(post.community, t) })}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(post.createdAt, language, t)} · {labelRating(post.rating, t)}</p></div>
                        <span className="shrink-0 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-black text-rose-200">{t('creator.dashboard.interactions', { count: formatNumber(post.engagement, language) })}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {summary.posts > 0 && (
              <section className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{t('creator.dashboard.views')}</p>
                  <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.topByViews')}</h2>
                  {!viewActivity.available ? (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-400">{t('creator.dashboard.viewsMigration')}</p>
                  ) : topViewedPosts.some((item) => item.views > 0) ? (
                    <div className="mt-4 space-y-3">
                      {topViewedPosts.filter((item) => item.views > 0).map((post) => (
                        <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-100">{t('creator.dashboard.postIn', { community: labelCommunity(post.community, t) })}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDate(post.createdAt, language, t)} - {labelRating(post.rating, t)}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-200">{t('creator.dashboard.viewsCount', { count: formatNumber(post.views, language) })}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-400">{t('creator.dashboard.noViews')}</p>
                  )}
                </article>

                <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">{t('creator.dashboard.engagement')}</p>
                  <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.rateByPost')}</h2>
                  {!viewActivity.available ? (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-400">{t('creator.dashboard.rateMigration')}</p>
                  ) : topEngagementByViewPosts.some((item) => item.engagementRate.available) ? (
                    <div className="mt-4 space-y-3">
                      {topEngagementByViewPosts.filter((item) => item.engagementRate.available).map((post) => (
                        <div key={post.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-100">{t('creator.dashboard.postIn', { community: labelCommunity(post.community, t) })}</p>
                            <p className="mt-1 text-xs text-zinc-500">{t('creator.dashboard.interactionsAndViews', { interactions: formatNumber(post.interactions, language), views: formatNumber(post.views, language) })}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-200">{post.engagementRate.value.toLocaleString(language)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-400">{t('creator.dashboard.rateUnavailable')}</p>
                  )}
                </article>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">{t('creator.dashboard.creatorChecklist')}</p>
                <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.nextSteps')}</h2>
                <CreatorChecklist items={checklist} />
              </article>

              <article className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{t('creator.dashboard.receivedInteractions')}</p>
                <h2 className="mt-2 text-2xl font-black">{t('creator.dashboard.complementaryView')}</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-black/30 p-4"><Repeat2 className="h-5 w-5 text-violet-200" /><p className="mt-3 text-xl font-black">{summary.reposts.available ? formatNumber(summary.reposts.value, language) : '—'}</p><p className="mt-1 text-xs text-zinc-500">{t('creator.dashboard.reposts')}</p></div>
                  <div className="rounded-2xl bg-black/30 p-4"><Bookmark className="h-5 w-5 text-amber-200" /><p className="mt-3 text-xl font-black">{summary.saves.available ? formatNumber(summary.saves.value, language) : '—'}</p><p className="mt-1 text-xs text-zinc-500">{t('creator.dashboard.saved')}</p></div>
                  <div className="rounded-2xl bg-black/30 p-4"><Coins className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-xl font-black">{summary.supports.available ? <ItaCashAmount amount={summary.supports.value} size="lg" valueClassName="text-xl" /> : '—'}</p><p className="mt-1 text-xs text-zinc-500">{t('creator.dashboard.netTips')}</p></div>
                </div>
                <p className="mt-5 text-sm leading-6 text-zinc-500">{t('creator.dashboard.privacyNotice')}</p>
              </article>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
