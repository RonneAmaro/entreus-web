'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  } | null
  created_at: string
}

type PurchaseRequest = {
  id: string
  amount_itacash: number
  total_brl_cents: number
  payment_method: string
  status: string
  created_at: string
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

const transactionLabels: Record<string, string> = {
  admin_credit: 'Credito administrativo',
  reward: 'Recompensa',
  gift_sent: 'Presente enviado',
  gift_received: 'Presente recebido',
  tip_sent: 'Apoio enviado',
  tip_received: 'Apoio recebido',
  purchase_confirmed: 'Compra confirmada',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
}

function BrandWordmark() {
  return (
    <span className="inline-flex items-center font-black tracking-tight text-white">
      Entre<span className="text-blue-300">US</span>
    </span>
  )
}

function formatBRLFromItaCash(value: number) {
  return (value * 0.1).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBRLFromCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function getGiftNameFromDescription(description: string | null) {
  if (!description) return ''
  const parts = description.split(':')
  return parts.length > 1 ? parts.slice(1).join(':').trim() : ''
}

export default function WalletPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [wallet, setWallet] = useState<ItaCashWallet | null>(null)
  const [transactions, setTransactions] = useState<ItaCashTransaction[]>([])
  const [giftContexts, setGiftContexts] = useState<Record<string, UserGiftContext>>({})
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])

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
      setMessage('Entre na sua conta para ver sua carteira ItaCash.')
      setLoading(false)
      return
    }

    await loadPurchaseRequests(user.id)

    const { data: walletData, error: walletError } = await supabase
      .rpc('ensure_itacash_wallet')

    if (walletError || !walletData) {
      setMessage('Nao foi possivel carregar sua carteira: ' + (walletError?.message || 'tente novamente.'))
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
      .limit(80)

    if (transactionError) {
      setMessage('Carteira carregada, mas o historico falhou: ' + transactionError.message)
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
        : context?.receiverName || 'outro usuario'

      return {
        title: `Voce enviou ${giftName} para ${receiver}`,
        detail: 'Presente enviado',
        tone: 'out',
      }
    }

    if (transaction.type === 'gift_received') {
      const sender = context?.senderUsername
        ? `@${context.senderUsername}`
        : context?.senderName || 'outro usuario'

      return {
        title: `Voce recebeu ${giftName} de ${sender}`,
        detail: 'Presente recebido',
        tone: 'in',
      }
    }

    if (transaction.type === 'tip_sent') {
      return {
        title: 'Voce enviou apoio em ItaCash',
        detail: transaction.description || 'Apoio enviado para criador',
        tone: 'out',
      }
    }

    if (transaction.type === 'tip_received') {
      return {
        title: 'Voce recebeu apoio em ItaCash',
        detail: transaction.description || 'Apoio recebido na carteira',
        tone: 'in',
      }
    }

    if (transaction.type === 'purchase_confirmed') {
      return {
        title: 'Compra manual de ItaCash confirmada',
        detail: transaction.description || 'Credito aprovado pela equipe',
        tone: 'in',
      }
    }

    if (transaction.type === 'admin_credit' && transaction.metadata?.promotional) {
      const details = [
        transaction.metadata.reason ? `Motivo: ${transaction.metadata.reason}` : '',
        transaction.metadata.campaign ? `Campanha: ${transaction.metadata.campaign}` : '',
      ].filter(Boolean)

      return {
        title: 'Credito promocional EntreUS',
        detail: details.length > 0 ? details.join(' | ') : 'Credito promocional para uso na plataforma',
        tone: 'in',
        promotional: true,
      }
    }

    return {
      title: transactionLabels[transaction.type] || transaction.type,
      detail: transaction.description || 'Movimentacao ItaCash',
      tone: transaction.amount >= 0 ? 'in' : 'out',
    }
  }

  async function loadPurchaseRequests(currentUserId: string) {
    const { data, error } = await supabase
      .from('itacash_purchase_requests')
      .select('id, amount_itacash, total_brl_cents, payment_method, status, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      setPurchaseRequests([])
      return
    }

    setPurchaseRequests((data || []) as PurchaseRequest[])
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
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
                <BrandWordmark /> Wallet
              </span>
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
              ItaCash para reconhecer, presentear e circular valor dentro da <BrandWordmark />.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Seus creditos internos na <BrandWordmark /> ficam organizados aqui: saldo, equivalencia em reais e historico de presentes.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Disponivel</p>
                <p className="mt-3 text-3xl font-black">{availableBalance}</p>
                <p className="text-sm font-bold text-blue-100/70">ItaCash</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Aproximado</p>
                <p className="mt-3 text-2xl font-black">{formatBRLFromItaCash(availableBalance)}</p>
                <p className="text-sm text-zinc-400">10 ItaCash = R$ 1,00</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Bloqueado</p>
                <p className="mt-3 text-2xl font-black">{lockedBalance}</p>
                <p className="text-sm text-zinc-400">Reservado</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-blue-300/20 bg-zinc-950/80 p-5 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10">
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
                    <p className="text-sm font-bold text-blue-100/80">Moeda interna</p>
                    <p className="text-3xl font-black">{availableBalance} ItaCash</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-300">
                  Use ItaCash para presentes digitais e testes da economia interna da plataforma.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-10">
          <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-50">
            <div className="mb-2 flex items-center gap-2 font-black">
              <ShieldAlert className="h-5 w-5" />
              Aviso importante
            </div>
            ItaCash e credito interno da plataforma, nao e moeda oficial, nao e investimento financeiro e nao possui saque ou compra real neste pacote.
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 ring-1 ring-blue-300/10">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-100">
                  <Coins className="h-5 w-5" />
                </span>
              <div>
                <h2 className="text-xl font-black">Comprar ItaCash</h2>
                <p className="mt-2 text-sm leading-6 text-blue-50/80">
                    Solicite uma compra manual com quantidade livre. A equipe confere o pagamento por fora e aprova o credito.
                </p>
              </div>
            </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                  <p className="text-2xl font-black">10 ItaCash = R$ 1,00</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    A taxa de servico EntreUS e de 2%. Mercado Pago manual pode incluir taxa da operadora separada.
                  </p>
                </div>

                <Link
                  href="/buy-itacash"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  Comprar ItaCash
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

            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/10">
              <h3 className="text-lg font-black">Presentes x Apoios</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                <p><span className="font-black text-blue-100">Presentear</span> envia um presente visual para a vitrine. Presentes nao aumentam saldo.</p>
                <p><span className="font-black text-emerald-100">Apoiar</span> transfere ItaCash diretamente para a carteira do criador.</p>
              </div>

              {purchaseRequests.length > 0 && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-3 text-sm font-black text-zinc-200">Solicitacoes recentes</p>
                  <div className="space-y-2">
                    {purchaseRequests.map((request) => (
                      <div key={request.id} className="rounded-2xl bg-black/35 px-3 py-2 text-sm text-zinc-300">
                        <span className="font-black text-white">{request.amount_itacash} ItaCash</span>
                        {' - '}
                        {formatBRLFromCents(request.total_brl_cents)}
                        <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-black text-amber-100">
                          {request.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/10 bg-zinc-950/90 p-4 shadow-2xl shadow-black/20 ring-1 ring-white/10 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-blue-200">
                    <History className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-2xl font-black">Historico da carteira</h2>
                    <p className="text-sm text-zinc-400">Presentes enviados, recebidos e creditos internos.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-right">
                <div className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-emerald-100 ring-1 ring-emerald-300/15">
                  <p className="text-xs font-bold text-emerald-200/70">Entradas</p>
                  <p className="font-black">+{totals.income}</p>
                </div>
                <div className="rounded-2xl bg-red-500/10 px-4 py-2 text-red-100 ring-1 ring-red-300/15">
                  <p className="text-xs font-bold text-red-200/70">Saidas</p>
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
                Carregando...
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-white/15 p-8 text-center">
                <div>
                  <Coins className="mx-auto h-9 w-9 text-blue-200" />
                  <h3 className="mt-4 text-lg font-black">Ainda nao ha transacoes.</h3>
                  <p className="mt-2 text-sm text-zinc-400">Creditos de teste e presentes aparecerao aqui.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction) => {
                  const context = renderTransactionContext(transaction)
                  const isIncome = transaction.amount >= 0

                  return (
                    <article key={transaction.id} className="rounded-3xl border border-white/10 bg-black/35 p-4 transition hover:border-blue-300/20 hover:bg-blue-950/10">
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
                                  {transactionLabels[transaction.type] || transaction.type}
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-6 text-zinc-300">{context.detail}</p>
                              {context.promotional && (
                                <p className="mt-2 inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-200 ring-1 ring-blue-300/15">
                                  Credito promocional para uso na plataforma
                                </p>
                              )}
                              <p className="mt-2 text-xs font-semibold text-zinc-500">{formatDate(transaction.created_at)}</p>
                            </div>

                            <div className="shrink-0 text-left sm:text-right">
                              <p className={`text-xl font-black ${isIncome ? 'text-emerald-300' : 'text-red-300'}`}>
                                {isIncome ? '+' : ''}{transaction.amount}
                              </p>
                              <p className="text-xs text-zinc-500">saldo {transaction.balance_after}</p>
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
