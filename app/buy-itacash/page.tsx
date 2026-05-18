'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  FileCheck2,
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

type PixInfo = {
  pix_key: string
  pixPaymentLink: string
  receiver_name: string
  receiver_city: string
  configured: boolean
}

const PROOF_BUCKET = 'payment-proofs'
const ACCEPTED_PROOF_TYPES = ['image/png', 'image/jpeg', 'application/pdf']

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
  const [pixInfo, setPixInfo] = useState<PixInfo | null>(null)
  const [pixInfoLoading, setPixInfoLoading] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [copiedPixKey, setCopiedPixKey] = useState(false)
  const [copiedPixLink, setCopiedPixLink] = useState(false)

  useEffect(() => {
    checkSession()
  }, [])

  useEffect(() => {
    if (paymentMethod === 'pix_manual' && !pixInfo && !pixInfoLoading) {
      loadPixInfo()
    }
  }, [paymentMethod, pixInfo, pixInfoLoading])

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

  async function loadPixInfo() {
    setPixInfoLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setPixInfoLoading(false)
      return
    }

    const response = await fetch('/api/payments/pix/manual-info', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    const data = await response.json().catch(() => null)
    setPixInfoLoading(false)

    if (!response.ok) {
      setMessage(data?.error || 'Nao foi possivel carregar as instrucoes Pix.')
      return
    }

    setPixInfo(data as PixInfo)
  }

  async function copyPixKey() {
    if (!pixInfo?.pix_key) return

    await navigator.clipboard.writeText(pixInfo.pix_key)
    setCopiedPixKey(true)
    window.setTimeout(() => setCopiedPixKey(false), 2000)
  }

  async function copyPixLink() {
    if (!pixInfo?.pixPaymentLink) return

    await navigator.clipboard.writeText(pixInfo.pixPaymentLink)
    setCopiedPixLink(true)
    window.setTimeout(() => setCopiedPixLink(false), 2000)
  }

  function handleProofFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    setProofFile(file)

    if (!file) return

    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      setMessage('Envie um comprovante em PNG, JPG, JPEG ou PDF.')
      setProofFile(null)
      event.target.value = ''
    }
  }

  function getSafeProofFileName(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'comprovante'
    const cleanExtension = extension.replace(/[^a-z0-9]/g, '') || 'comprovante'
    return `${Date.now()}-comprovante.${cleanExtension}`
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

    if (!pixInfo?.configured || !pixInfo.pix_key) {
      setMessage('Pix manual ainda nao esta configurado pela equipe.')
      setSubmitting(false)
      return
    }

    if (!proofFile) {
      setMessage('Envie o comprovante Pix antes de criar a solicitacao.')
      setSubmitting(false)
      return
    }

    if (!ACCEPTED_PROOF_TYPES.includes(proofFile.type)) {
      setMessage('Envie um comprovante em PNG, JPG, JPEG ou PDF.')
      setSubmitting(false)
      return
    }

    const requestId = crypto.randomUUID()
    const proofPath = `${user.id}/${requestId}/${getSafeProofFileName(proofFile)}`

    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(proofPath, proofFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: proofFile.type,
      })

    if (uploadError) {
      setMessage('Nao foi possivel enviar o comprovante: ' + uploadError.message)
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('itacash_purchase_requests').insert({
      id: requestId,
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
      proof_path: proofPath,
      proof_uploaded_at: new Date().toISOString(),
      pix_key_snapshot: pixInfo.pix_key,
      pix_total_brl_cents: totals.totalBrlCents,
    })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel criar a solicitacao: ' + error.message)
      return
    }

    setSuccess(true)
    setUserNote('')
    setProofFile(null)
    setMessage('Comprovante enviado e solicitacao criada. Aguarde a confirmacao da equipe.')
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

            {paymentMethod === 'pix_manual' && (
              <div className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-100">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black">Pix manual em 4 passos</h2>
                    <p className="mt-2 text-sm leading-6 text-blue-50/80">
                      1. Escolha a quantidade. 2. Pague via Pix. 3. Envie o comprovante. 4. Aguarde analise.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="rounded-2xl bg-black/35 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Chave Pix</p>
                    {pixInfoLoading ? (
                      <p className="mt-2 text-zinc-400">Carregando chave Pix...</p>
                    ) : pixInfo?.configured ? (
                      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <code className="min-w-0 flex-1 break-all rounded-xl bg-black px-3 py-2 text-blue-100">
                          {pixInfo.pix_key}
                        </code>
                        <button
                          type="button"
                          onClick={copyPixKey}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-blue-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedPixKey ? 'Copiada' : 'Copiar chave Pix'}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-amber-100">Pix manual ainda nao esta configurado pela equipe.</p>
                    )}
                    {(pixInfo?.receiver_name || pixInfo?.receiver_city) && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Favorecido: {pixInfo.receiver_name || 'Nao informado'}
                        {pixInfo.receiver_city ? ` - ${pixInfo.receiver_city}` : ''}
                      </p>
                    )}
                  </div>

                  {pixInfo?.pixPaymentLink && (
                    <div className="rounded-2xl bg-black/35 px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Link Pix</p>
                      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                        <Link
                          href={pixInfo.pixPaymentLink}
                          target="_blank"
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-blue-500 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-400"
                        >
                          Abrir link de pagamento Pix
                        </Link>
                        <button
                          type="button"
                          onClick={copyPixLink}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-blue-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedPixLink ? 'Link copiado' : 'Copiar link Pix'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-black/35 px-4 py-3">
                      <p className="text-zinc-400">Total do Pix</p>
                      <p className="mt-1 text-2xl font-black">{formatBRLFromCents(totals.totalBrlCents)}</p>
                      <p className="mt-2 text-xs font-semibold text-amber-100">
                        Pague exatamente o valor total informado. Depois envie o comprovante para analise.
                      </p>
                    </div>
                    <label className="rounded-2xl bg-black/35 px-4 py-3">
                      <span className="text-sm font-black text-zinc-200">Comprovante</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                        onChange={handleProofFileChange}
                        className="mt-3 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-black file:text-black"
                      />
                      <span className="mt-2 block text-xs text-zinc-500">
                        PNG, JPG, JPEG ou PDF. Depois do pagamento, envie o comprovante para analise.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

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
              {paymentMethod === 'pix_manual' ? 'Enviar comprovante e criar solicitacao' : 'Criar pagamento Mercado Pago'}
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
