'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  CreditCard,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calculatePaymentTotals,
  PLATFORM_FEE_PERCENT,
  paymentMethodOptions,
  type PaymentMethodOption,
} from '@/lib/payment-fees'

function formatBRLFromCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function BuyItaCashPage() {
  const [amount, setAmount] = useState('100')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodOption>('mercadopago_pix')
  const [userNote, setUserNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [paymentLink, setPaymentLink] = useState('')

  useEffect(() => {
    checkSession()
  }, [])

  const amountItacash = useMemo(() => {
    const parsed = Number.parseInt(amount, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [amount])

  const visiblePaymentMethods = paymentMethodOptions.filter((method) =>
    ['pix_manual', 'mercadopago_pix', 'mercadopago_credit_30d', 'mercadopago_credit_instant', 'open_finance'].includes(method.value)
  )

  const totals = useMemo(() => {
    const baseAmountBrlCents = amountItacash * 10
    return calculatePaymentTotals(baseAmountBrlCents, paymentMethod)
  }, [amountItacash, paymentMethod])

  async function checkSession() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('Entre na sua conta para comprar ItaCash.')
    }

    setLoading(false)
  }

  async function createPurchaseRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setSuccess(false)
    setPaymentLink('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('Entre na sua conta para criar uma solicitacao.')
      return
    }

    if (amountItacash <= 0) {
      setMessage('Informe uma quantidade valida de ItaCash.')
      return
    }

    setSubmitting(true)

    if (paymentMethod !== 'pix_manual') {
      if (!totals.method.available) {
        setMessage('Este metodo de pagamento ainda nao esta disponivel.')
        setSubmitting(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setMessage('Entre na sua conta para iniciar o pagamento.')
        setSubmitting(false)
        return
      }

      const response = await fetch('/api/payments/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_type: 'itacash',
          amount_itacash: amountItacash,
          payment_method_option: paymentMethod,
        }),
      })

      const data = await response.json().catch(() => null)
      setSubmitting(false)

      if (!response.ok || !data?.provider_init_point) {
        setMessage(data?.error || 'Nao foi possivel criar pagamento Mercado Pago.')
        return
      }

      setPaymentLink(data.provider_init_point)
      setSuccess(true)
      setMessage('Pagamento criado. Siga para o Mercado Pago para concluir.')
      return
    }

    const { error } = await supabase.from('itacash_purchase_requests').insert({
      user_id: user.id,
      amount_itacash: amountItacash,
      base_amount_brl_cents: totals.baseAmountBrlCents,
      platform_fee_percent: PLATFORM_FEE_PERCENT,
      platform_fee_brl_cents: totals.platformFeeBrlCents,
      operator_fee_percent: totals.operatorFeePercent,
      operator_fee_brl_cents: totals.operatorFeeBrlCents,
      total_brl_cents: totals.totalBrlCents,
      payment_method: 'pix_manual',
      status: 'pending',
      user_note: userNote.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel criar a solicitacao: ' + error.message)
      return
    }

    setSuccess(true)
    setUserNote('')
    setMessage('Solicitacao criada. Aguarde a confirmacao da equipe.')
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Carteira
          </Link>

          <Link
            href="/gifts"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Wallet className="h-4 w-4" />
            Usar ItaCash
          </Link>
        </header>

        <section className="relative z-10 grid gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
                <Coins className="h-4 w-4" />
              </span>
              <span className="text-sm font-black text-blue-50">Compra manual ou automatica</span>
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
              Comprar ItaCash
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Escolha qualquer quantidade, veja as taxas separadas e use Mercado Pago automatico ou mantenha a solicitacao manual como alternativa.
            </p>

            <div className="mt-6 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-50">
              As taxas sao mostradas antes da confirmacao. A EntreUS cobra 2% de taxa de servico. A operadora de pagamento pode cobrar uma taxa propria conforme o metodo escolhido.
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Conversao</p>
                <p className="mt-2 text-2xl font-black">10 = R$ 1,00</p>
                <p className="text-sm text-zinc-400">ItaCash</p>
              </div>
              <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Taxa EntreUS</p>
                <p className="mt-2 text-2xl font-black">2%</p>
                <p className="text-sm text-blue-100/70">Sempre separada</p>
              </div>
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/70">Recomendado</p>
                <p className="mt-2 text-2xl font-black">Pix MP</p>
                <p className="text-sm text-emerald-100/70">Menor taxa</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10">
              <img
                src="/itacash.png"
                alt="ItaCash"
                className="mx-auto aspect-square max-h-72 w-full object-contain drop-shadow-[0_22px_50px_rgba(59,130,246,0.28)]"
              />

              <div className="mt-4 rounded-3xl border border-white/10 bg-black/45 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                    <ReceiptText className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-zinc-400">Total a pagar</p>
                    <p className="text-3xl font-black">{formatBRLFromCents(totals.totalBrlCents)}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/35 px-4 py-3">
                    <span className="text-zinc-400">Valor base</span>
                    <strong>{formatBRLFromCents(totals.baseAmountBrlCents)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/35 px-4 py-3">
                    <span className="text-zinc-400">Taxa de servico EntreUS</span>
                    <strong>{formatBRLFromCents(totals.platformFeeBrlCents)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/35 px-4 py-3">
                    <span className="text-zinc-400">Taxa da operadora</span>
                    <strong>{formatBRLFromCents(totals.operatorFeeBrlCents)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={createPurchaseRequest}
          className="relative z-10 grid gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_24rem]"
        >
          <section className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/10">
            <label className="block">
              <span className="text-sm font-black text-zinc-200">Quantidade de ItaCash</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-2xl font-black text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-300"
              />
            </label>

            <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm font-black text-emerald-100">
              Recomendado: Pix Mercado Pago, menor taxa da operadora.
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    {method.recommended ? <Sparkles className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                    <p className="mt-3 font-black">{method.label}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {method.operatorFeeFixedCents > 0
                        ? `Taxa operadora ${formatBRLFromCents(method.operatorFeeFixedCents)}`
                        : `Taxa operadora ${method.operatorFeePercent}%`}
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

            <label className="mt-5 block">
              <span className="text-sm font-black text-zinc-200">Observacao opcional</span>
              <textarea
                value={userNote}
                onChange={(event) => setUserNote(event.target.value)}
                rows={4}
                placeholder="Ex.: pagamento feito em nome de..."
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-300"
              />
            </label>

            {message && (
              <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                success
                  ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || submitting || amountItacash <= 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {paymentMethod === 'pix_manual' ? 'Criar solicitacao manual' : 'Criar pagamento Mercado Pago'}
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
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-blue-200">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-black">Resumo</h2>
                <p className="text-sm text-zinc-500">10 ItaCash = R$ 1,00</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">ItaCash</span>
                <strong>{amountItacash}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Metodo</span>
                <strong>{totals.method.label}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">EntreUS 2%</span>
                <strong>{formatBRLFromCents(totals.platformFeeBrlCents)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Operadora {totals.operatorFeePercent}%</span>
                <strong>{formatBRLFromCents(totals.operatorFeeBrlCents)}</strong>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Total</p>
              <p className="mt-2 text-3xl font-black">{formatBRLFromCents(totals.totalBrlCents)}</p>
            </div>
          </aside>
        </form>
      </section>
    </main>
  )
}
