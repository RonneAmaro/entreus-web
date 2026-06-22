'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Coins,
  Crown,
  Loader2,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
  WandSparkles,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculatePaymentTotals } from '@/lib/payment-fees'
import {
  getSafeCheckoutUrl,
  getVipCheckoutButtonLabel,
  getVipPaymentReturnMessage,
  type VipPaymentReturnStatus,
} from '@/lib/vip-checkout-flow'
import { VIP_PURCHASE_PLANS, type VipPlanKey } from '@/lib/vip-plans'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  vip_plan: string | null
  vip_status: string | null
  vip_expires_at: string | null
}

type PendingVipCheckout = {
  id: string
  externalReference: string
  status: string
  planKey: VipPlanKey
  planLabel: string
  days: number
  checkoutUrl: string
}

type PendingVipCheckoutResponse =
  | {
      ok: true
      order: PendingVipCheckout | null
    }
  | {
      ok: false
      error: string
    }

type MercadoPagoPreferenceResponse = {
  order_id?: string
  external_reference?: string
  checkout_url?: string
}

type ManualPixResponse = {
  configured?: boolean
  pix_key?: string
  pixPaymentLink?: string
  receiver_name?: string
  receiver_city?: string
}

const BADGE_MEDIA = {
  ansiao: {
    video: '/badges/anciao.mp4',
    poster: '/badges/anciao.png',
  },
  vipPlus: {
    video: '/badges/vip-premium.mp4',
    poster: '/badges/vip-premium.png',
  },
  comunidade: {
    video: '/badges/comunidade.mp4',
    poster: '/badges/comunidade.png',
  },
}

const benefits = [
  {
    title: 'Selo VIP no perfil',
    description: 'Identidade visual ativa para destacar sua presenca dentro da comunidade.',
    icon: BadgeCheck,
  },
  {
    title: 'Meet de 1 hora',
    description: 'Salas criadas por VIP ativo duram ate 60 minutos no EntreUS Meet.',
    icon: Crown,
  },
  {
    title: 'Prioridade em recursos futuros',
    description: 'Base pronta para liberar vantagens antes para quem estiver com VIP ativo.',
    icon: Star,
  },
  {
    title: 'Gravacao em fase futura',
    description: 'Estrutura preparada para beneficios de gravacao quando o produto autorizar.',
    icon: ShieldCheck,
  },
  {
    title: 'Traducao em fase futura',
    description: 'Acesso previsto para experiencias multilingues nas proximas etapas.',
    icon: WandSparkles,
  },
  {
    title: 'Beneficios expansiveis',
    description: 'O VIP sera ampliado sem depender de pagamentos nesta primeira base.',
    icon: Zap,
  },
]

function BrandWordmark() {
  return (
    <span className="inline-flex items-center font-black tracking-tight text-white">
      Entre<span className="text-blue-300">US</span>
    </span>
  )
}

function isVipActive(profile: CurrentProfile | null) {
  if (!profile || profile.vip_status !== 'active' || !profile.vip_expires_at) return false
  return new Date(profile.vip_expires_at).getTime() > Date.now()
}

function formatVipDate(value: string | null | undefined) {
  if (!value) return 'data indisponivel'

  try {
    return new Date(value).toLocaleDateString('pt-BR')
  } catch {
    return 'data indisponivel'
  }
}

function formatBRLFromCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function VipPlusPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [videoFailed, setVideoFailed] = useState(false)
  const [selectedPlanKey, setSelectedPlanKey] = useState<VipPlanKey>('vip_90d')
  const [preparingPurchase, setPreparingPurchase] = useState(false)
  const [checkoutRequested, setCheckoutRequested] = useState(false)
  const [purchaseMessage, setPurchaseMessage] = useState('')
  const [preparedOrder, setPreparedOrder] = useState<PendingVipCheckout | null>(null)
  const [manualPix, setManualPix] = useState<ManualPixResponse | null>(null)
  const [loadingManualPix, setLoadingManualPix] = useState(false)
  const [paymentReturnStatus, setPaymentReturnStatus] = useState<VipPaymentReturnStatus>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    loadNavigationShell()
  }, [])

  useEffect(() => {
    const paymentStatus = new URLSearchParams(window.location.search).get('payment')

    if (paymentStatus === 'success' || paymentStatus === 'pending' || paymentStatus === 'failure') {
      setPaymentReturnStatus(paymentStatus)
    }
  }, [])

  const vipActive = useMemo(() => isVipActive(currentProfile), [currentProfile])
  const selectedPlan = useMemo(
    () => VIP_PURCHASE_PLANS.find((plan) => plan.planKey === selectedPlanKey) || VIP_PURCHASE_PLANS[0],
    [selectedPlanKey],
  )
  const selectedPlanTotals = useMemo(
    () => calculatePaymentTotals(selectedPlan.amountBrlCents, 'mercadopago_pix'),
    [selectedPlan],
  )
  const paymentReturnMessage = getVipPaymentReturnMessage(paymentReturnStatus, vipActive)

  async function loadNavigationShell() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const user = session?.user

    if (!user) return

    setEmail(user.email || '')

    await Promise.all([
      loadNavigationProfile(user.id),
      loadUnreadNotificationsCount(user.id),
      loadPendingVipCheckout(session.access_token),
    ])
  }

  async function loadNavigationProfile(currentUserId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url, vip_plan, vip_status, vip_expires_at')
      .eq('id', currentUserId)
      .maybeSingle()

    if (!data) return

    setCurrentProfile({
      username: data.username,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
      vip_plan: data.vip_plan,
      vip_status: data.vip_status,
      vip_expires_at: data.vip_expires_at,
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

  async function loadPendingVipCheckout(accessToken: string) {
    try {
      const response = await fetch('/api/vip/purchase-orders', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = (await response.json()) as PendingVipCheckoutResponse

      if (!response.ok || !data.ok || !data.order) return

      setPreparedOrder(data.order)
      setSelectedPlanKey(data.order.planKey)
    } catch {
      // A ausência de um pedido pendente não impede a criação de um checkout novo.
    }
  }

  async function openMercadoPagoCheckout() {
    setPreparingPurchase(true)
    setPurchaseMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setPurchaseMessage('Entre na sua conta para abrir o pagamento VIP.')
      setPreparingPurchase(false)
      return
    }

    try {
      const checkoutUrlFromPendingOrder = getSafeCheckoutUrl(preparedOrder?.checkoutUrl)

      if (checkoutUrlFromPendingOrder) {
        setPurchaseMessage('Abrindo pagamento...')
        window.location.assign(checkoutUrlFromPendingOrder)
        return
      }

      setCheckoutRequested(true)

      const response = await fetch('/api/payments/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_type: 'vip_plus',
          plan_key: selectedPlan.planKey,
          payment_method_option: 'mercadopago_pix',
        }),
      })
      const data = (await response.json().catch(() => null)) as MercadoPagoPreferenceResponse | null
      const checkoutUrl = getSafeCheckoutUrl(data?.checkout_url)

      if (!response.ok || !checkoutUrl || !data?.order_id || !data.external_reference) {
        setPurchaseMessage('Não foi possível abrir o pagamento agora. Tente novamente em instantes.')
        return
      }

      setPreparedOrder({
        id: data.order_id,
        externalReference: data.external_reference,
        status: 'pending',
        planKey: selectedPlan.planKey,
        planLabel: selectedPlan.label,
        days: selectedPlan.days,
        checkoutUrl,
      })
      setPurchaseMessage('Abrindo pagamento...')
      window.location.assign(checkoutUrl)
    } catch {
      setPurchaseMessage('Não foi possível abrir o pagamento agora. Tente novamente em instantes.')
    } finally {
      setPreparingPurchase(false)
    }
  }

  async function loadManualPix() {
    setLoadingManualPix(true)
    setPurchaseMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setPurchaseMessage('Entre na sua conta para ver as instruções de Pix manual.')
      setLoadingManualPix(false)
      return
    }

    try {
      const response = await fetch('/api/payments/pix/manual-info', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = (await response.json().catch(() => null)) as ManualPixResponse | null

      if (!response.ok || !data?.configured) {
        setManualPix(null)
        setPurchaseMessage('Pix manual indisponível no momento.')
        return
      }

      setManualPix(data)
    } catch {
      setManualPix(null)
      setPurchaseMessage('Não foi possível carregar o Pix manual agora. Tente novamente em instantes.')
    } finally {
      setLoadingManualPix(false)
    }
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
        <div className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-96 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <Link
            href="/wallet"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Coins className="h-4 w-4" />
            Carteira
          </Link>
        </header>

        <section className="relative z-10 grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                <Crown className="h-4 w-4" />
              </span>
              <span className="text-sm font-black text-blue-50">
                <BrandWordmark /> VIP
              </span>
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
              EntreUS VIP Plus
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Mais destaque, mais estilo e mais possibilidades dentro da plataforma.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 ring-1 ring-blue-300/10">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Plano</p>
                <p className="mt-2 text-2xl font-black">VIP</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/75 p-4 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Assinatura</p>
                <p className="mt-2 text-2xl font-black">Preparada</p>
              </div>
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/70">Status</p>
                <p className="mt-2 text-2xl font-black">{vipActive ? 'Ativo' : 'Comprar'}</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/25 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-blue-300/20 bg-zinc-950/85 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:border-blue-300/35">
              {!videoFailed && (
                <div className="aspect-square w-full rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.22),rgba(2,6,23,0.98)_68%)] p-4">
                  <video
                    className="h-full w-full rounded-[1.5rem] object-contain drop-shadow-[0_22px_50px_rgba(59,130,246,0.32)]"
                    src={BADGE_MEDIA.vipPlus.video}
                    poster={BADGE_MEDIA.vipPlus.poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={() => setVideoFailed(true)}
                  />
                </div>
              )}

              {videoFailed && (
                <div className="flex aspect-square w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.28),rgba(2,6,23,0.96)_62%)] p-8 text-center">
                  <img
                    src={BADGE_MEDIA.vipPlus.poster}
                    alt="Selo VIP Plus"
                    className="h-48 w-48 rounded-full object-contain drop-shadow-[0_22px_50px_rgba(59,130,246,0.32)]"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="relative mt-3 flex h-24 w-24 items-center justify-center rounded-full border border-blue-200/30 bg-blue-500/15 shadow-2xl shadow-blue-500/20">
                    <div className="absolute inset-4 rounded-full border border-white/10" />
                    <Crown className="h-10 w-10 text-blue-100" />
                  </div>
                  <p className="mt-6 text-4xl font-black">VIP Plus</p>
                  <p className="mt-2 text-sm font-bold text-blue-100/70">Selo visual EntreUS</p>
                </div>
              )}

              <div className="absolute bottom-4 left-4 right-4 rounded-3xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Selo VIP</p>
                    <p className="text-xl font-black">{vipActive ? 'Ativo' : 'Disponivel em breve'}</p>
                  </div>
                  <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-black text-white">
                    Base 1
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 grid gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-2xl font-black">O que voce ganha</h2>
                <p className="text-sm text-zinc-500">Beneficios iniciais e base para vantagens futuras.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {benefits.map((benefit) => {
                const Icon = benefit.icon

                return (
                  <article key={benefit.title} className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-blue-300/25">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-black">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{benefit.description}</p>
                  </article>
                )
              })}
            </div>

            <div className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/5">
              <div className="flex items-center gap-3">
                <Palette className="h-6 w-6 text-blue-200" />
                <h2 className="text-xl font-black">Gravacao e traducao em fase futura</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Gravacao de sala, traducao simultanea e recursos premium futuros serao liberados em pacotes posteriores.
              </p>
            </div>

            <div className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 ring-1 ring-blue-300/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Planos iniciais</h2>
                  <p className="mt-1 text-sm text-blue-50/70">Valores placeholder configuraveis no codigo.</p>
                </div>
                <span className="rounded-full border border-blue-200/20 bg-black/30 px-3 py-1 text-xs font-black text-blue-100">
                  Pedido pendente seguro
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {VIP_PURCHASE_PLANS.map((plan) => {
                  const selected = selectedPlanKey === plan.planKey

                  return (
                    <button
                      key={plan.planKey}
                      type="button"
                      onClick={() => {
                        setSelectedPlanKey(plan.planKey)
                        setPreparedOrder(null)
                        setCheckoutRequested(false)
                        setManualPix(null)
                        setPurchaseMessage('')
                      }}
                      className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
                        selected
                          ? 'border-blue-200/45 bg-white text-black shadow-xl shadow-blue-950/20'
                          : 'border-white/10 bg-black/35 text-blue-50 hover:border-blue-200/25 hover:bg-blue-500/15'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black">{plan.label}</p>
                        {plan.featured && (
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${selected ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/15 text-blue-100'}`}>
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-2xl font-black">{formatBRLFromCents(plan.amountBrlCents)}</p>
                      <p className={`mt-2 text-xs font-semibold ${selected ? 'text-zinc-600' : 'text-blue-50/65'}`}>
                        {plan.days} dias de VIP apos pagamento confirmado.
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-blue-300/20 bg-zinc-950/85 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-zinc-400">Resumo</p>
                <p className="text-2xl font-black">VIP Base</p>
              </div>
            </div>

            <div className={`mt-5 rounded-3xl border p-4 ${
              vipActive
                ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                : 'border-blue-300/20 bg-blue-500/10 text-blue-100'
            }`}>
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Status da conta</p>
              <p className="mt-2 text-2xl font-black">
                {vipActive ? 'Você já é VIP' : 'Escolha um plano para pagar'}
              </p>
              {vipActive && (
                <p className="mt-2 text-sm font-semibold opacity-80">
                  Seu VIP expira em {formatVipDate(currentProfile?.vip_expires_at)}.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 text-sm text-zinc-300">
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <strong className="block text-white">{selectedPlan.label}</strong>
                <span className="mt-1 block text-zinc-400">{selectedPlan.days} dias de VIP após confirmação do pagamento.</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <strong className="block text-white">Total previsto</strong>
                <span className="mt-1 block text-zinc-400">
                  {formatBRLFromCents(selectedPlanTotals.totalBrlCents)} com taxa estimada de Pix Mercado Pago.
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <strong className="block text-white">Plano atual</strong>
                <span className="mt-1 block text-zinc-400">{currentProfile?.vip_plan || 'Sem plano VIP ativo'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openMercadoPagoCheckout}
              disabled={preparingPurchase}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {preparingPurchase ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {preparingPurchase
                ? 'Abrindo pagamento...'
                : getVipCheckoutButtonLabel(Boolean(preparedOrder?.checkoutUrl), checkoutRequested)}
            </button>

            <button
              type="button"
              onClick={loadManualPix}
              disabled={loadingManualPix}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-blue-200/35 bg-blue-500/10 px-5 py-3 text-sm font-bold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingManualPix ? 'Carregando Pix manual...' : 'Ver Pix manual'}
            </button>

            {paymentReturnMessage && (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                paymentReturnStatus === 'failure'
                  ? 'border-red-300/20 bg-red-500/10 text-red-100'
                  : paymentReturnStatus === 'pending'
                    ? 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                    : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
              }`}>
                {paymentReturnMessage}
              </div>
            )}

            {purchaseMessage && (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                purchaseMessage === 'Abrindo pagamento...'
                  ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
              }`}>
                {purchaseMessage}
              </div>
            )}

            {preparedOrder && (
              <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/70">Pedido pendente</p>
                <p className="mt-2 font-black">{preparedOrder.planLabel}</p>
                <p className="mt-1 break-all text-xs text-emerald-50/70">Referencia: {preparedOrder.externalReference}</p>
              </div>
            )}

            {manualPix && (
              <div className="mt-4 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-sm text-blue-50">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Pix manual</p>
                <p className="mt-2 font-semibold">O VIP só será ativado após confirmação do pagamento.</p>
                {manualPix.receiver_name && <p className="mt-3 text-blue-50/80">Recebedor: {manualPix.receiver_name}</p>}
                {manualPix.receiver_city && <p className="text-blue-50/80">Cidade: {manualPix.receiver_city}</p>}
                {manualPix.pix_key && (
                  <p className="mt-3 break-all rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-blue-50/90">
                    Chave Pix: {manualPix.pix_key}
                  </p>
                )}
                {getSafeCheckoutUrl(manualPix.pixPaymentLink) && (
                  <a
                    href={getSafeCheckoutUrl(manualPix.pixPaymentLink) || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-blue-50"
                  >
                    Abrir instruções de Pix
                  </a>
                )}
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  )
}
