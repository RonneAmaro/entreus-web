'use client'

/* eslint-disable react-hooks/immutability -- the initial effect intentionally calls the async wallet loader declared later in the component */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import ItaCashAmount from '../components/ItaCashAmount'
import EntreUSWordmark from '../components/EntreUSWordmark'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Crown,
  History,
  Loader2,
  PlusCircle,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '../components/LanguageProvider'

type Translate = (key: string, values?: Record<string, string | number>) => string

type ItaCashWallet = {
  id: string
  user_id: string
  balance: number
  locked_balance: number
  created_at: string
  updated_at: string
}

type ItaCashTransaction = {
  id: string
  wallet_id: string
  user_id: string
  type: string
  amount: number
  balance_after: number
  description: string | null
  reference_type: string | null
  reference_id: string | null
  metadata: {
    promotional?: boolean
    withdrawable?: boolean
    reason?: string | null
    campaign?: string | null
    gross_amount?: number
    creator_amount?: number
    platform_fee_amount?: number
    platform_fee_bps?: number
  } | null
  created_at: string
}

type PurchaseRequest = {
  id: string
  amount_itacash: number
  total_brl_cents: number
  payment_method: string
  status: string
  rejection_reason: string | null
  created_at: string
}

type PaymentOrder = {
  id: string
  amount_itacash: number | null
  total_brl_cents: number
  provider_payment_method: string | null
  provider_status: string | null
  status: string
  created_at: string
  paid_at: string | null
  expires_at: string | null
}

type UserGiftContext = {
  id: string
  sender_id: string
  receiver_id: string
  gift_id: string
  giftName?: string
  giftSlug?: string
  senderUsername?: string | null
  receiverUsername?: string | null
  senderName?: string | null
  receiverName?: string | null
}

type UserGiftRow = {
  id: string
  sender_id: string
  receiver_id: string
  gift_id: string
}

type GiftSummary = {
  id: string
  name: string
  slug: string
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
}

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

const transactionLabelKeys: Record<string, string> = {
  admin_credit: 'wallet.transaction.adminCredit',
  reward: 'wallet.transaction.reward',
  gift_sent: 'wallet.transaction.giftSent',
  gift_received: 'wallet.transaction.giftReceived',
  tip_sent: 'wallet.transaction.tipSent',
  tip_received: 'wallet.transaction.tipReceived',
  support_sent: 'wallet.transaction.supportSent',
  support_received: 'wallet.transaction.supportReceived',
  paid_post_unlock: 'wallet.transaction.paidPostUnlock',
  paid_post_received: 'wallet.transaction.paidPostReceived',
  purchase_confirmed: 'wallet.transaction.purchaseConfirmed',
  promotional_credit: 'wallet.transaction.promotionalCredit',
  withdrawal_requested: 'wallet.transaction.withdrawalRequested',
  withdrawal_refunded: 'wallet.transaction.withdrawalRefunded',
  refund: 'wallet.transaction.refund',
  adjustment: 'wallet.transaction.adjustment',
}

function formatBRLFromItaCash(value: number, locale: string) {
  return (value * 0.1).toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBRLFromCents(value: number, locale: string) {
  const safeValue = Number.isFinite(value) ? value : 0

  return (safeValue / 100).toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

function purchaseStatusLabel(status: string, t: Translate) {
  const normalizedStatus = (status || '').toLowerCase()

  if (normalizedStatus === 'paid' || normalizedStatus === 'approved') return t('wallet.status.approved')
  if (normalizedStatus === 'processed') return t('wallet.status.credited')
  if (normalizedStatus === 'rejected') return t('wallet.status.rejected')
  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') return t('wallet.status.canceled')
  if (normalizedStatus === 'pending') return t('wallet.status.pendingReview')
  if (normalizedStatus === 'in_process') return t('wallet.status.pendingPayment')
  if (normalizedStatus === 'authorized') return t('wallet.status.pendingConfirmation')
  if (normalizedStatus === 'failed') return t('wallet.status.failed')
  if (normalizedStatus === 'expired') return t('wallet.status.expired')
  return t('wallet.status.underReview')
}

function purchaseStatusClass(status: string) {
  const normalizedStatus = (status || '').toLowerCase()

  if (normalizedStatus === 'paid') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-300/15'
  if (normalizedStatus === 'approved') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-300/15'
  if (normalizedStatus === 'processed') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-300/15'
  if (normalizedStatus === 'rejected') return 'bg-red-500/10 text-red-200 ring-red-300/15'
  if (normalizedStatus === 'canceled') return 'bg-zinc-500/10 text-zinc-300 ring-white/10'
  if (normalizedStatus === 'cancelled') return 'bg-zinc-500/10 text-zinc-300 ring-white/10'
  if (normalizedStatus === 'failed') return 'bg-red-500/10 text-red-200 ring-red-300/15'
  if (normalizedStatus === 'expired') return 'bg-zinc-500/10 text-zinc-300 ring-white/10'
  return 'bg-amber-500/10 text-amber-100 ring-amber-300/15'
}

function paymentMethodLabel(method: string | null, t: Translate) {
  if (method === 'manual_pix' || method === 'pix_manual') return t('wallet.payment.manualPix')
  if (method === 'mercadopago_manual' || method === 'mercadopago_auto') return t('wallet.payment.mercadoPago')
  if (method === 'mercadopago_pix') return t('wallet.payment.mercadoPagoPix')
  if (method === 'mercadopago_credit_30d') return t('wallet.payment.credit30d')
  if (method === 'mercadopago_credit_instant') return t('wallet.payment.credit')
  if (method === 'open_finance') return 'Open Finance'
  return t('wallet.payment.manualPix')
}

function providerStatusLabel(status: string | null, t: Translate) {
  const normalizedStatus = (status || '').toLowerCase()

  if (!normalizedStatus) return ''
  if (normalizedStatus === 'approved') return t('wallet.providerStatus.approved')
  if (normalizedStatus === 'pending') return t('wallet.providerStatus.pending')
  if (normalizedStatus === 'in_process') return t('wallet.providerStatus.inProcess')
  if (normalizedStatus === 'authorized') return t('wallet.providerStatus.authorized')
  if (normalizedStatus === 'rejected') return t('wallet.providerStatus.rejected')
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') return t('wallet.providerStatus.canceled')
  if (normalizedStatus === 'expired') return t('wallet.providerStatus.expired')
  return t('wallet.providerStatus.underReview')
}

function purchaseStatusHelp(status: string, t: Translate) {
  const normalizedStatus = (status || '').toLowerCase()

  if (normalizedStatus === 'pending') return t('wallet.statusHelp.pending')
  if (normalizedStatus === 'approved' || normalizedStatus === 'paid' || normalizedStatus === 'processed') {
    return t('wallet.statusHelp.credited')
  }
  if (normalizedStatus === 'rejected') return t('wallet.statusHelp.rejected')
  if (normalizedStatus === 'expired') return t('wallet.statusHelp.expired')
  if (normalizedStatus === 'failed') return t('wallet.statusHelp.failed')
  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') return t('wallet.statusHelp.canceled')
  return t('wallet.statusHelp.default')
}

function getGiftNameFromDescription(description: string | null) {
  if (!description) return ''
  const parts = description.split(':')
  return parts.length > 1 ? parts.slice(1).join(':').trim() : ''
}

function formatRevenueSplitDetail(metadata: ItaCashTransaction['metadata'], t: Translate) {
  const grossAmount = metadata?.gross_amount
  const platformFeeAmount = metadata?.platform_fee_amount

  if (
    typeof grossAmount !== 'number' ||
    typeof platformFeeAmount !== 'number' ||
    grossAmount <= 0 ||
    platformFeeAmount <= 0
  ) {
    return ''
  }

  return t('wallet.transaction.revenueSplit', { gross: grossAmount, fee: platformFeeAmount })
}

export default function WalletPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { language, t } = useLanguage()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [wallet, setWallet] = useState<ItaCashWallet | null>(null)
  const [transactions, setTransactions] = useState<ItaCashTransaction[]>([])
  const [giftContexts, setGiftContexts] = useState<Record<string, UserGiftContext>>({})
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([])

  useEffect(() => {
    // Hydration state is intentionally established after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    loadWallet()
  }, [])

  const availableBalance = wallet?.balance || 0
  const lockedBalance = wallet?.locked_balance || 0

  const totals = useMemo(() => {
    return transactions.reduce(
      (acc, transaction) => {
        if (transaction.amount > 0) acc.income += transaction.amount
        if (transaction.amount < 0) acc.outcome += Math.abs(transaction.amount)
        return acc
      },
      { income: 0, outcome: 0 }
    )
  }, [transactions])

  async function loadGiftContexts(transactionRows: ItaCashTransaction[]) {
    const referenceIds = Array.from(
      new Set(
        transactionRows
          .filter((item) => item.reference_type === 'user_gift' && item.reference_id)
          .map((item) => item.reference_id as string)
      )
    )

    if (referenceIds.length === 0) {
      setGiftContexts({})
      return
    }

    const { data: userGiftData } = await supabase
      .from('user_gifts')
      .select('id, sender_id, receiver_id, gift_id')
      .in('id', referenceIds)

    const userGiftRows = (userGiftData || []) as UserGiftRow[]
    const giftIds = Array.from(new Set(userGiftRows.map((item) => item.gift_id)))
    const userIds = Array.from(
      new Set(userGiftRows.flatMap((item) => [item.sender_id, item.receiver_id]))
    )

    const [{ data: giftData }, { data: profileData }] = await Promise.all([
      giftIds.length > 0
        ? supabase.from('digital_gifts').select('id, name, slug').in('id', giftIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('profiles').select('id, username, display_name').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ])

    const giftsById = ((giftData || []) as GiftSummary[]).reduce(
      (acc, gift) => {
        acc[gift.id] = gift
        return acc
      },
      {} as Record<string, GiftSummary>
    )
    const profilesById = ((profileData || []) as ProfileSummary[]).reduce(
      (acc, profile) => {
        acc[profile.id] = profile
        return acc
      },
      {} as Record<string, ProfileSummary>
    )

    setGiftContexts(
      userGiftRows.reduce((acc, item) => {
        const gift = giftsById[item.gift_id]
        const sender = profilesById[item.sender_id]
        const receiver = profilesById[item.receiver_id]

        acc[item.id] = {
          ...item,
          giftName: gift?.name,
          giftSlug: gift?.slug,
          senderUsername: sender?.username,
          senderName: sender?.display_name,
          receiverUsername: receiver?.username,
          receiverName: receiver?.display_name,
        }

        return acc
      }, {} as Record<string, UserGiftContext>)
    )
  }

  async function loadWallet() {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage(t('wallet.errors.signIn'))
      setLoading(false)
      return
    }

    setEmail(user.email || '')

    await Promise.all([
      loadNavigationProfile(user.id),
      loadUnreadNotificationsCount(user.id),
      loadPurchaseRequests(user.id),
      loadPaymentOrders(user.id),
    ])

    const { data: walletData, error: walletError } = await supabase
      .rpc('ensure_itacash_wallet')

    if (walletError || !walletData) {
      setMessage(t('wallet.errors.load', { error: walletError?.message || t('common.retry') }))
      setLoading(false)
      return
    }

    const loadedWallet = walletData as ItaCashWallet
    setWallet(loadedWallet)

    const { data: transactionData, error: transactionError } = await supabase
      .from('itacash_transactions')
      .select('id, wallet_id, user_id, type, amount, balance_after, description, reference_type, reference_id, metadata, created_at')
      .eq('wallet_id', loadedWallet.id)
      .order('created_at', { ascending: false })
      .limit(60)

    if (transactionError) {
      setMessage(t('wallet.errors.history', { error: transactionError.message }))
      setTransactions([])
      setGiftContexts({})
    } else {
      const rows = (transactionData || []) as ItaCashTransaction[]
      setTransactions(rows)
      await loadGiftContexts(rows)
    }

    setLoading(false)
  }

  function renderTransactionContext(transaction: ItaCashTransaction) {
    const context = transaction.reference_id ? giftContexts[transaction.reference_id] : null
    const giftName = context?.giftName || getGiftNameFromDescription(transaction.description) || 'ItaCash'

    if (transaction.type === 'gift_sent') {
      const receiver = context?.receiverUsername
        ? `@${context.receiverUsername}`
        : context?.receiverName || t('wallet.otherUser')

      return {
        title: t('wallet.transaction.sentGiftTo', { gift: giftName, user: receiver }),
        detail: t('wallet.transaction.giftSent'),
        tone: 'out',
      }
    }

    if (transaction.type === 'gift_received') {
      const sender = context?.senderUsername
        ? `@${context.senderUsername}`
        : context?.senderName || t('wallet.otherUser')

      return {
        title: t('wallet.transaction.receivedGiftFrom', { gift: giftName, user: sender }),
        detail: t('wallet.transaction.giftReceived'),
        tone: 'in',
      }
    }

    if (transaction.type === 'tip_sent' || transaction.type === 'support_sent') {
      const splitDetail = formatRevenueSplitDetail(transaction.metadata, t)
      return {
        title: t('wallet.transaction.tipSentTitle'),
        detail: splitDetail || transaction.description || t('wallet.transaction.tipSentDetail'),
        tone: 'out',
      }
    }

    if (transaction.type === 'tip_received' || transaction.type === 'support_received') {
      const splitDetail = formatRevenueSplitDetail(transaction.metadata, t)
      return {
        title: t('wallet.transaction.tipReceivedTitle'),
        detail: splitDetail || transaction.description || t('wallet.transaction.tipReceivedDetail'),
        tone: 'in',
      }
    }

    if (transaction.type === 'paid_post_unlock') {
      return {
        title: t('wallet.transaction.unlockedPostTitle'),
        detail: transaction.description || t('wallet.transaction.unlockedPostDetail'),
        tone: 'out',
      }
    }

    if (transaction.type === 'paid_post_received') {
      const splitDetail = formatRevenueSplitDetail(transaction.metadata, t)
      return {
        title: t('wallet.transaction.paidPostReceivedTitle'),
        detail: splitDetail || transaction.description || t('wallet.transaction.paidPostReceivedDetail'),
        tone: 'in',
      }
    }

    if (transaction.type === 'withdrawal_requested') {
      return {
        title: t('wallet.transaction.withdrawalRequested'),
        detail: transaction.description || t('wallet.transaction.withdrawalRequestedDetail'),
        tone: 'out',
      }
    }

    if (transaction.type === 'withdrawal_refunded') {
      return {
        title: t('wallet.transaction.withdrawalRefunded'),
        detail: transaction.description || t('wallet.transaction.withdrawalRefundedDetail'),
        tone: 'in',
      }
    }

    if (transaction.type === 'purchase_confirmed') {
      const isPaymentOrder = transaction.reference_type === 'payment_order'

      return {
        title: isPaymentOrder ? t('wallet.transaction.mercadoPagoCredited') : t('wallet.transaction.purchaseCredited'),
        detail: transaction.description || (isPaymentOrder ? t('wallet.transaction.automaticCredit') : t('wallet.transaction.teamCredit')),
        tone: 'in',
      }
    }

    if (
      (transaction.type === 'admin_credit' && transaction.metadata?.promotional) ||
      transaction.type === 'promotional_credit'
    ) {
      const details = [
        transaction.metadata?.reason ? t('wallet.transaction.reason', { value: transaction.metadata.reason }) : '',
        transaction.metadata?.campaign ? t('wallet.transaction.campaign', { value: transaction.metadata.campaign }) : '',
      ].filter(Boolean)

      return {
        title: t('wallet.transaction.promotionalTitle'),
        detail: details.length > 0 ? details.join(' | ') : t('wallet.transaction.promotionalDetail'),
        tone: 'in',
        promotional: true,
      }
    }

    return {
      title: transactionLabelKeys[transaction.type] ? t(transactionLabelKeys[transaction.type]) : transaction.type,
      detail: transaction.description || t('wallet.transaction.movement'),
      tone: transaction.amount >= 0 ? 'in' : 'out',
    }
  }

  async function loadPurchaseRequests(currentUserId: string) {
    const { data, error } = await supabase
      .from('itacash_purchase_requests')
      .select('id, amount_itacash, total_brl_cents, payment_method, status, rejection_reason, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      setPurchaseRequests([])
      return
    }

    setPurchaseRequests((data || []) as PurchaseRequest[])
  }

  async function loadPaymentOrders(currentUserId: string) {
    const { data, error } = await supabase
      .from('payment_orders')
      .select('id, amount_itacash, total_brl_cents, provider_payment_method, provider_status, status, created_at, paid_at, expires_at')
      .eq('user_id', currentUserId)
      .eq('product_type', 'itacash')
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      setPaymentOrders([])
      return
    }

    setPaymentOrders((data || []) as PaymentOrder[])
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
        displayName={currentProfile?.display_name || currentProfile?.username || t('navigation.myAccount')}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-20 pb-24 sm:px-6 lg:ml-[104px] lg:max-w-[calc(80rem-104px)] lg:px-8 lg:py-6">
        <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('navigation.feed')}
          </Link>

          <Link
            href="/vip-plus"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Crown className="h-4 w-4" />
            VIP Plus
          </Link>
        </header>

        <section className="relative z-10 grid items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2">
              <img src="/logo-icon.png" alt="EntreUS" className="h-8 w-8 rounded-full object-contain" />
              <span className="text-sm font-black">
                <EntreUSWordmark /> Wallet
              </span>
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
              {t('wallet.heroTitle')} <EntreUSWordmark />.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              {t('wallet.heroDescriptionBefore')} <EntreUSWordmark /> {t('wallet.heroDescriptionAfter')}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="relative overflow-hidden rounded-3xl border border-blue-300/25 bg-blue-500/15 p-5 shadow-xl shadow-blue-950/20 ring-1 ring-blue-300/10">
                <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-400/20 blur-2xl" />
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">{t('wallet.available')}</p>
                <ItaCashAmount amount={availableBalance} size="xl" className="relative mt-3 text-blue-50" valueClassName="text-4xl" />
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('wallet.approximate')}</p>
                <p className="mt-3 text-2xl font-black">{formatBRLFromItaCash(availableBalance, language)}</p>
                <p className="text-sm text-zinc-400">{t('wallet.exchangeRate')}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('wallet.locked')}</p>
                <ItaCashAmount amount={lockedBalance} size="lg" className="mt-3" />
                <p className="text-sm text-zinc-400">{t('wallet.reserved')}</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-blue-300/20 bg-zinc-950/80 p-5 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:border-blue-300/35">
              <img
                src="/itacash.png"
                alt="ItaCash"
                className="mx-auto aspect-square max-h-72 w-full object-contain drop-shadow-[0_22px_50px_rgba(59,130,246,0.28)]"
              />
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/45 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white">
                    {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Wallet className="h-6 w-6" />}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-blue-100/80">{t('wallet.internalCurrency')}</p>
                    <ItaCashAmount amount={availableBalance} size="xl" valueClassName="text-3xl" />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-300">
                  {t('wallet.internalCurrencyDescription')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-10">
          <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
            <div className="mb-2 flex items-center gap-2 font-black">
              <ShieldAlert className="h-5 w-5" />
              {t('wallet.importantNotice')}
            </div>
            {t('wallet.legalNotice')}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 ring-1 ring-blue-300/10 transition hover:border-blue-300/35">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-100">
                  <Coins className="h-5 w-5" />
                </span>
              <div>
                <h2 className="text-xl font-black">{t('wallet.buyItaCash')}</h2>
                <p className="mt-2 text-sm leading-6 text-blue-50/80">
                    {t('wallet.buyDescription')}
                </p>
              </div>
            </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                  <p className="text-2xl font-black">{t('wallet.exchangeRate')}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {t('wallet.serviceFee')}
                  </p>
                </div>

                <Link
                  href="/buy-itacash"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  {t('wallet.buyItaCash')}
                </Link>

                <Link
                  href="/vip-plus"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-5 py-3 text-sm font-black text-blue-50 transition hover:bg-blue-500/20"
                >
                  <Crown className="h-4 w-4" />
                  VIP Plus
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/10">
              <h3 className="text-lg font-black">{t('wallet.giftsVsSupport')}</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                <p><span className="font-black text-blue-100">{t('wallet.giftAction')}</span> {t('wallet.giftExplanation')}</p>
                <p><span className="font-black text-emerald-100">{t('wallet.supportAction')}</span> {t('wallet.supportExplanation')}</p>
              </div>

              {purchaseRequests.length > 0 && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-3 text-sm font-black text-zinc-200">{t('wallet.recentRequests')}</p>
                  <div className="space-y-3">
                    {purchaseRequests.map((request) => (
                      <div key={request.id} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300 transition hover:border-blue-300/20 hover:bg-blue-950/10">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{t('wallet.paymentMethod')}</p>
                            <p className="mt-1 font-semibold text-zinc-100">{paymentMethodLabel(request.payment_method, t)}</p>
                          </div>

                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{t('wallet.amount')}</p>
                            <ItaCashAmount amount={request.amount_itacash} size="sm" className="mt-1 text-white" />
                          </div>

                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{t('wallet.totalPaid')}</p>
                            <p className="mt-1 font-semibold text-zinc-100">{formatBRLFromCents(request.total_brl_cents, language)}</p>
                          </div>

                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{t('wallet.requestDate')}</p>
                            <p className="mt-1 font-semibold text-zinc-100">{formatDate(request.created_at, language)}</p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{t('wallet.currentStatus')}</span>
                            <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${purchaseStatusClass(request.status)}`}>
                              {purchaseStatusLabel(request.status, t)}
                            </span>
                          </div>

                          <p className="mt-2 text-xs font-semibold leading-5 text-zinc-400">
                            {purchaseStatusHelp(request.status, t)}
                          </p>

                          {request.status === 'rejected' && request.rejection_reason && (
                            <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold leading-5 text-red-100 ring-1 ring-red-300/15">
                              {t('wallet.rejectionReason', { reason: request.rejection_reason })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {paymentOrders.length > 0 && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-3 text-sm font-black text-zinc-200">{t('wallet.mercadoPagoPayments')}</p>
                  <div className="space-y-3">
                    {paymentOrders.map((order) => (
                      <div key={order.id} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300 transition hover:border-blue-300/20 hover:bg-blue-950/10">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-black text-white">
                              {order.amount_itacash && order.amount_itacash > 0
                                ? <ItaCashAmount amount={order.amount_itacash} size="sm" className="text-white" />
                                : t('wallet.purchase')}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-zinc-500">{formatDate(order.created_at, language)}</p>
                          </div>

                          <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${purchaseStatusClass(order.status)}`}>
                            {purchaseStatusLabel(order.status, t)}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs font-semibold text-zinc-400 sm:grid-cols-2">
                          <p>{t('wallet.method')}: <span className="text-zinc-200">{paymentMethodLabel(order.provider_payment_method || 'mercadopago_auto', t)}</span></p>
                          <p>{t('wallet.totalPaid')}: <span className="text-zinc-200">{formatBRLFromCents(order.total_brl_cents, language)}</span></p>
                          {order.provider_status && (
                            <p>{t('wallet.mercadoPagoStatus')}: <span className="text-zinc-200">{providerStatusLabel(order.provider_status, t)}</span></p>
                          )}
                          <p className="sm:col-span-2">{purchaseStatusHelp(order.status, t)}</p>
                          {order.expires_at && order.status === 'pending' && (
                            <p>{t('wallet.expires')}: <span className="text-zinc-200">{formatDate(order.expires_at, language)}</span></p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-4 shadow-2xl shadow-black/20 ring-1 ring-white/10 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-blue-200">
                    <History className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-2xl font-black">{t('wallet.history')}</h2>
                    <p className="text-sm text-zinc-400">{t('wallet.historyDescription')}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-right">
                <div className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-emerald-100 ring-1 ring-emerald-300/15">
                  <p className="text-xs font-bold text-emerald-200/70">{t('wallet.income')}</p>
                  <p className="font-black">+{totals.income}</p>
                </div>
                <div className="rounded-2xl bg-red-500/10 px-4 py-2 text-red-100 ring-1 ring-red-300/15">
                  <p className="text-xs font-bold text-red-200/70">{t('wallet.outcome')}</p>
                  <p className="font-black">-{totals.outcome}</p>
                </div>
              </div>
            </div>

            {message && (
              <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
                {message}
              </div>
            )}

            {loading ? (
              <div className="flex min-h-64 items-center justify-center text-zinc-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('common.loading')}
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-white/15 p-8 text-center">
                <div>
                  <Coins className="mx-auto h-9 w-9 text-blue-200" />
                  <h3 className="mt-4 text-lg font-black">{t('wallet.empty')}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{t('wallet.emptyDescription')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction) => {
                  const context = renderTransactionContext(transaction)
                  const isIncome = transaction.amount >= 0
                  const transactionLabel = context.promotional
                    ? t('wallet.transaction.promotionalCredit')
                    : transactionLabelKeys[transaction.type]
                      ? t(transactionLabelKeys[transaction.type])
                      : t('wallet.transaction.movement')

                  return (
                    <article key={transaction.id} className="rounded-3xl border border-white/10 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-blue-300/20 hover:bg-blue-950/10">
                      <div className="flex items-start gap-4">
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                          isIncome ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'
                        }`}>
                          {isIncome ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black text-white">{context.title}</p>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                                  isIncome ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
                                }`}>
                                  {transactionLabel}
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-6 text-zinc-300">{context.detail}</p>
                              {context.promotional && (
                                <p className="mt-2 inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-200 ring-1 ring-blue-300/15">
                                  {t('wallet.transaction.promotionalDetail')}
                                </p>
                              )}
                              <p className="mt-2 text-xs font-semibold text-zinc-500">{formatDate(transaction.created_at, language)}</p>
                            </div>

                            <div className="shrink-0 text-left sm:text-right">
                              <p className={`text-xl font-black ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}>
                                {isIncome ? '+' : ''}{transaction.amount}
                              </p>
                              <p className="text-xs text-zinc-500">{t('wallet.balance', { value: transaction.balance_after })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
