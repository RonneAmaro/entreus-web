'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
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
import {
  calculatePaymentTotals,
  paymentMethodOptions,
  type PaymentMethodOption,
} from '@/lib/payment-fees'

const VIP_PLUS_PRICE_BRL_CENTS = 1490
const VIP_PLUS_BONUS_ITACASH = 100

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
    title: 'Selo VIP Plus no perfil',
    description: 'Um sinal visual para destacar sua presenca dentro da comunidade.',
    icon: BadgeCheck,
  },
  {
    title: 'Moldura especial futuramente',
    description: 'Base preparada para arco e detalhes visuais no avatar em uma proxima fase.',
    icon: Crown,
  },
  {
    title: 'Destaque visual no perfil',
    description: 'Mais estilo para sua identidade EntreUS ficar mais reconhecivel.',
    icon: Star,
  },
  {
    title: 'Bonus inicial de ItaCash',
    description: `${VIP_PLUS_BONUS_ITACASH} ItaCash para testar presentes digitais e movimentar a rede.`,
    icon: Coins,
  },
  {
    title: 'Acesso antecipado visual',
    description: 'Prioridade para experimentar recursos esteticos e personalizacao.',
    icon: WandSparkles,
  },
  {
    title: 'Beneficios futuros',
    description: 'O VIP Plus sera expandido junto com a evolucao da plataforma.',
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

function formatBRLFromCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function VipPlusPage() {
  const [videoFailed, setVideoFailed] = useState(false)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [paymentLink, setPaymentLink] = useState('')
  const [message, setMessage] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodOption>('mercadopago_pix')
  const [autoRenew, setAutoRenew] = useState(true)

  const visiblePaymentMethods = paymentMethodOptions.filter((method) =>
    ['mercadopago_pix', 'mercadopago_credit_30d', 'pix_manual', 'open_finance'].includes(method.value)
  )

  const totals = useMemo(() => {
    return calculatePaymentTotals(VIP_PLUS_PRICE_BRL_CENTS, paymentMethod)
  }, [paymentMethod])

  async function createMercadoPagoPayment() {
    setLoadingPayment(true)
    setMessage('')
    setPaymentLink('')

    if (paymentMethod === 'pix_manual') {
      setMessage('Pix manual podera ser disponibilizado pela equipe.')
      setLoadingPayment(false)
      return
    }

    if (!totals.method.available) {
      setMessage('Este metodo de pagamento ainda nao esta disponivel.')
      setLoadingPayment(false)
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Entre na sua conta para comprar VIP Plus.')
      setLoadingPayment(false)
      return
    }

    const response = await fetch('/api/payments/mercadopago/create-preference', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
          product_type: 'vip_plus',
          payment_method_option: paymentMethod,
          auto_renew: autoRenew,
        }),
      })

    const data = await response.json().catch(() => null)
    setLoadingPayment(false)

    if (!response.ok || !data?.provider_init_point) {
      setMessage(data?.error || 'Nao foi possivel iniciar pagamento Mercado Pago.')
      return
    }

    setPaymentLink(data.provider_init_point)
    setMessage('Pagamento criado. Voce pode seguir para o Mercado Pago.')
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
              <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Plano</p>
                <p className="mt-2 text-2xl font-black">VIP Plus</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Preco base</p>
                <p className="mt-2 text-2xl font-black">{formatBRLFromCents(VIP_PLUS_PRICE_BRL_CENTS)}</p>
              </div>
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/70">Bonus</p>
                <p className="mt-2 text-2xl font-black">{VIP_PLUS_BONUS_ITACASH} ItaCash</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/25 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10">
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
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Plano ativo</p>
                    <p className="text-xl font-black">VIP Plus</p>
                  </div>
                  <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-black text-white">
                    +{VIP_PLUS_BONUS_ITACASH} ItaCash
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
                  <article key={benefit.title} className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/5">
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
                <h2 className="text-xl font-black">VIP Premium em breve</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                VIP Premium ficara para uma proxima fase, quando o EntreUS Meet estiver mais completo.
              </p>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-zinc-400">Resumo</p>
                <p className="text-2xl font-black">VIP Plus mensal</p>
              </div>
            </div>

              <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4 font-black text-emerald-100">
                Recomendado: Pix Mercado Pago, menor taxa da operadora.
              </div>

              <div className="grid gap-3">
                {visiblePaymentMethods.map((method) => {
                  const active = paymentMethod === method.value

                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => {
                        if (method.available) setPaymentMethod(method.value)
                      }}
                      disabled={!method.available}
                      className={`rounded-3xl border p-4 text-left transition ${
                        active
                          ? 'border-blue-300/40 bg-blue-500/15 text-blue-50'
                          : 'border-white/10 bg-black/35 text-zinc-300 hover:border-blue-300/20 disabled:cursor-not-allowed disabled:opacity-60'
                      }`}
                    >
                      <p className="font-black">{method.label}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Taxa operadora {method.operatorFeePercent}%
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">{method.note}</p>
                      {method.recommended && (
                        <span className="mt-3 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-200">
                          Recomendado
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-black/35 px-4 py-3">
                <span className="text-zinc-400">Valor do plano</span>
                <strong>{formatBRLFromCents(VIP_PLUS_PRICE_BRL_CENTS)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/35 px-4 py-3">
                <span className="text-zinc-400">Taxa de servico EntreUS</span>
                <strong>{formatBRLFromCents(totals.platformFeeBrlCents)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/35 px-4 py-3">
                <span className="text-zinc-400">Taxa da operadora {totals.operatorFeePercent}%</span>
                <strong>{formatBRLFromCents(totals.operatorFeeBrlCents)}</strong>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Total</p>
              <p className="mt-2 text-3xl font-black">{formatBRLFromCents(totals.totalBrlCents)}</p>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-3xl border border-white/10 bg-black/35 p-4">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(event) => setAutoRenew(event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-white/20 bg-black accent-blue-500"
              />
              <span>
                <span className="block font-black">Renovar automaticamente meu VIP Plus</span>
                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  A cobranca recorrente real sera ativada em uma fase futura. Por enquanto, essa escolha fica registrada no pedido.
                </span>
              </span>
            </label>

            <div className="mt-4 rounded-3xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Status futuro</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Status do plano</span>
                  <strong className="text-blue-100">Preparado</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Renovacao automatica</span>
                  <strong className={autoRenew ? 'text-emerald-300' : 'text-zinc-400'}>
                    {autoRenew ? 'Intencao ativa' : 'Desativada'}
                  </strong>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-2 w-full cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-zinc-500"
                >
                  Cancelar renovacao em breve
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={createMercadoPagoPayment}
              disabled={loadingPayment}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              Comprar VIP Plus
            </button>

            {paymentLink && (
              <Link
                href={paymentLink}
                target="_blank"
                className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-blue-500 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-400"
              >
                Pagar com Mercado Pago
              </Link>
            )}

            {message && (
              <div className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
                {message}
              </div>
            )}

            <p className="mt-4 text-sm leading-6 text-zinc-500">
              Pix manual podera ser disponibilizado pela equipe.
            </p>
          </aside>
        </section>
      </section>
    </main>
  )
}
