'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Coins,
  Gift,
  History,
  Loader2,
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
  created_at: string
}

const transactionLabels: Record<string, string> = {
  admin_credit: 'Credito administrativo',
  reward: 'Recompensa',
  gift_sent: 'Presente enviado',
  gift_received: 'Presente recebido',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
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

export default function WalletPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [wallet, setWallet] = useState<ItaCashWallet | null>(null)
  const [transactions, setTransactions] = useState<ItaCashTransaction[]>([])

  useEffect(() => {
    loadWallet()
  }, [])

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
      .select('id, wallet_id, user_id, type, amount, balance_after, description, reference_type, reference_id, created_at')
      .eq('wallet_id', loadedWallet.id)
      .order('created_at', { ascending: false })
      .limit(80)

    if (transactionError) {
      setMessage('Carteira carregada, mas o historico falhou: ' + transactionError.message)
      setTransactions([])
    } else {
      setTransactions((transactionData || []) as ItaCashTransaction[])
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <Link
            href="/gifts"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Gift className="h-4 w-4" />
            Presentes
          </Link>
        </header>

        <section className="grid gap-6 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1fr)]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Carteira ItaCash
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              Seus creditos internos na EntreUS.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300">
              10 ItaCash = R$ 1,00. Cada 1 ItaCash equivale a R$ 0,10 dentro desta economia interna de teste.
            </p>

            <div className="mt-8 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white">
                  <Wallet className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-bold text-blue-100/80">Saldo disponivel</p>
                  {loading ? (
                    <Loader2 className="mt-2 h-7 w-7 animate-spin text-blue-100" />
                  ) : (
                    <p className="text-4xl font-black text-white">
                      {wallet?.balance || 0} ItaCash
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Valor aproximado</p>
                  <p className="mt-2 text-lg font-black text-white">
                    {formatBRLFromItaCash(wallet?.balance || 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Saldo bloqueado</p>
                  <p className="mt-2 text-lg font-black text-white">
                    {wallet?.locked_balance || 0} ItaCash
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-50">
              <div className="mb-2 flex items-center gap-2 font-black">
                <ShieldAlert className="h-5 w-5" />
                Aviso importante
              </div>
              ItaCash e credito interno da plataforma, nao e moeda oficial, nao e investimento financeiro e nao possui saque ou compra real neste pacote.
            </div>
          </div>

          <section className="rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl shadow-black/20 ring-1 ring-white/10 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-blue-200">
                <History className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Historico</h2>
                <p className="text-sm text-zinc-400">Entradas, saidas e presentes.</p>
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
                {transactions.map((transaction) => (
                  <article key={transaction.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">
                          {transactionLabels[transaction.type] || transaction.type}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {transaction.description || 'Movimentacao ItaCash'}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-zinc-500">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-black ${transaction.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {transaction.amount >= 0 ? '+' : ''}{transaction.amount}
                        </p>
                        <p className="text-xs text-zinc-500">
                          saldo {transaction.balance_after}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  )
}
