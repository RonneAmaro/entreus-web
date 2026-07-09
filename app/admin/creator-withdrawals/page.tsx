'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  ReceiptText,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isAdminRole } from '@/lib/admin'
import {
  formatWithdrawalPaymentDetailsSummary,
  formatWithdrawalStatus,
  getWithdrawalPaymentDetailsForAdmin,
  getWithdrawalPaymentMethodLabel,
  isOpenCreatorWithdrawalStatus,
  type CreatorWithdrawalPaymentDetails,
  type CreatorWithdrawalPaymentMethod,
  type CreatorWithdrawalStatus,
} from '@/lib/creator-withdrawals'

type FilterStatus = CreatorWithdrawalStatus | 'all'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type CreatorProfile = {
  id: string
  username: string | null
  display_name: string | null
}

type CreatorWithdrawal = {
  id: string
  user_id: string
  amount_itacash: number
  amount_brl: number
  payment_method: CreatorWithdrawalPaymentMethod
  payment_details: CreatorWithdrawalPaymentDetails
  payment_summary?: string
  payment_method_label?: string
  status: CreatorWithdrawalStatus
  admin_notes: string | null
  rejection_reason: string | null
  reviewed_at: string | null
  paid_at: string | null
  created_at: string
  creator: CreatorProfile | null
}

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'reviewing', label: 'Em analise' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'paid', label: 'Pagas' },
  { value: 'rejected', label: 'Recusadas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'all', label: 'Todas' },
]

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value: string | null) {
  if (!value) return 'Nao informado'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClass(status: CreatorWithdrawalStatus) {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-300/15'
  if (status === 'approved') return 'bg-blue-500/10 text-blue-100 ring-blue-300/15'
  if (status === 'rejected') return 'bg-red-500/10 text-red-200 ring-red-300/15'
  if (status === 'cancelled') return 'bg-zinc-500/10 text-zinc-300 ring-white/10'
  return 'bg-amber-500/10 text-amber-100 ring-amber-300/15'
}

function statusIcon(status: CreatorWithdrawalStatus) {
  if (status === 'paid') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'approved') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'rejected') return <XCircle className="h-3.5 w-3.5" />
  return <Clock className="h-3.5 w-3.5" />
}

export default function AdminCreatorWithdrawalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [withdrawals, setWithdrawals] = useState<CreatorWithdrawal[]>([])
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const visibleWithdrawals = useMemo(() => {
    if (filter === 'all') return withdrawals
    return withdrawals.filter((withdrawal) => withdrawal.status === filter)
  }, [filter, withdrawals])

  const pendingCount = useMemo(() => {
    return withdrawals.filter((withdrawal) => withdrawal.status === 'pending').length
  }, [withdrawals])

  const getSessionToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.access_token || ''
  }, [])

  const loadWithdrawals = useCallback(async () => {
    const token = await getSessionToken()

    if (!token) {
      setMessage('Sessao expirada. Entre novamente.')
      setWithdrawals([])
      return
    }

    const response = await fetch('/api/admin/creator-withdrawals?status=all', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      withdrawals?: CreatorWithdrawal[]
      error?: string
    } | null

    if (!response.ok || !data?.ok) {
      setMessage(data?.error || 'Nao foi possivel carregar solicitacoes de saque.')
      setWithdrawals([])
      return
    }

    setWithdrawals(data.withdrawals || [])
  }, [getSessionToken])

  const loadPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage('Nao foi possivel verificar permissao admin: ' + profileError.message)
      setLoading(false)
      return
    }

    const loadedAdminProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }
    setAdminProfile(loadedAdminProfile)

    if (!isAdminRole(loadedAdminProfile.role)) {
      setLoading(false)
      return
    }

    await loadWithdrawals()
    setLoading(false)
  }, [loadWithdrawals, router])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadPage])

  async function updateWithdrawal(withdrawal: CreatorWithdrawal, action: 'reviewing' | 'approved' | 'paid' | 'rejected') {
    const note = (notesById[withdrawal.id] || '').trim()

    if (action === 'rejected' && !note) {
      setMessage('Informe o motivo da recusa antes de recusar.')
      return
    }

    const token = await getSessionToken()

    if (!token) {
      setMessage('Sessao expirada. Entre novamente.')
      return
    }

    setActionLoadingId(withdrawal.id)
    setMessage('')

    const response = await fetch(`/api/admin/creator-withdrawals/${withdrawal.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(action === 'paid'
        ? { action: 'paid', adminNotes: note || null }
        : action === 'rejected'
          ? { action: 'rejected', reason: note }
          : { action, adminNotes: note || null }),
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      message?: string
      error?: string
    } | null

    setActionLoadingId(null)

    if (!response.ok || !data?.ok) {
      setMessage(data?.error || 'Nao foi possivel processar solicitacao.')
      return
    }

    setMessage(data.message || 'Solicitacao atualizada.')
    setNotesById((current) => ({ ...current, [withdrawal.id]: '' }))
    await loadWithdrawals()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando painel...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">
            Esta area e exclusiva para administradores.
          </p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              Saques manuais de criadores
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Pague manualmente fora da plataforma e depois marque como pago. Esta tela apenas registra analise, aprovacao, pagamento ou recusa.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Admin</p>
            <p className="mt-1 font-black">{adminProfile.email || adminProfile.id}</p>
          </div>
        </header>

        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className={`rounded-[2rem] border p-5 ring-1 ${
            pendingCount > 0
              ? 'border-red-300/30 bg-red-500/15 text-red-50 ring-red-300/15'
              : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-50 ring-emerald-300/10'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                pendingCount > 0 ? 'bg-red-500/20 text-red-100' : 'bg-emerald-500/15 text-emerald-100'
              }`}>
                {pendingCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-lg font-black">
                  {pendingCount > 0
                    ? 'Existem saques aguardando pagamento manual.'
                    : 'Nenhuma solicitacao pendente agora.'}
                </p>
                <p className="mt-1 text-sm opacity-80">
                  O saldo ja foi debitado quando o criador solicitou o saque. Ao recusar, o valor volta para a carteira.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Pendentes</p>
            <p className={`mt-2 text-4xl font-black ${pendingCount > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
              {pendingCount}
            </p>
            <p className="mt-1 text-sm text-zinc-400">saques</p>
          </div>
        </div>

        <div className="mb-5 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-50">
          Nenhum pagamento automatico e executado aqui. Confira os dados do titular antes de realizar o pagamento e, ao recusar, informe o motivo para o criador.
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-black transition ${
                filter === item.value
                  ? 'bg-white text-black'
                  : 'border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              {item.label}
              {item.value === 'pending' && pendingCount > 0 && (
                <span className="ml-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-5 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        )}

        <div className="grid gap-4">
          {visibleWithdrawals.length === 0 ? (
            <div className="rounded-[2rem] border border-blue-300/15 bg-zinc-950/80 p-8 text-center text-zinc-400 ring-1 ring-blue-300/10">
              Nenhuma solicitacao encontrada.
            </div>
          ) : (
            visibleWithdrawals.map((withdrawal) => {
              const isOpen = isOpenCreatorWithdrawalStatus(withdrawal.status)
              const profile = withdrawal.creator
              const note = notesById[withdrawal.id] || ''
              const paymentSummary = withdrawal.payment_summary || formatWithdrawalPaymentDetailsSummary(withdrawal.payment_method, withdrawal.payment_details)
              const paymentFields = getWithdrawalPaymentDetailsForAdmin(withdrawal.payment_method, withdrawal.payment_details)

              return (
                <article
                  key={withdrawal.id}
                  className={`rounded-[2rem] border p-4 shadow-xl ring-1 transition hover:-translate-y-0.5 ${
                    isOpen
                      ? 'border-red-300/30 bg-red-500/10 shadow-red-950/20 ring-red-300/15'
                      : 'border-white/10 bg-zinc-950/80 shadow-black/20 ring-white/5'
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,1fr))_auto] xl:items-center">
                    <div className="min-w-0">
                      {isOpen && (
                        <p className="mb-1 inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                          {withdrawal.status === 'approved'
                            ? 'Aprovado para pagamento manual'
                            : withdrawal.status === 'reviewing'
                              ? 'Em analise manual'
                              : 'Aguardando analise manual'}
                        </p>
                      )}
                      <p className="truncate font-black">
                        {profile?.display_name || profile?.username || 'Usuario'}
                      </p>
                      <p className="truncate text-sm text-zinc-500">
                        @{profile?.username || 'sem-username'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">ItaCash</p>
                      <p className="text-sm font-black">{withdrawal.amount_itacash}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Valor R$</p>
                      <p className="text-sm font-black">{formatBRL(Number(withdrawal.amount_brl) || 0)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Metodo</p>
                      <p className="text-sm font-semibold">{getWithdrawalPaymentMethodLabel(withdrawal.payment_method)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Resumo</p>
                      <p className="break-words text-sm font-semibold">{paymentSummary}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Data</p>
                      <p className="text-sm font-semibold">{formatDate(withdrawal.created_at)}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className={`inline-flex justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ring-1 ${statusClass(withdrawal.status)}`}>
                        {statusIcon(withdrawal.status)}
                        {formatWithdrawalStatus(withdrawal.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm text-zinc-300">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Dados para pagamento manual</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Confira os dados do titular antes de realizar o pagamento fora da plataforma.
                      </p>
                      {paymentFields.length > 0 ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {paymentFields.map((field) => (
                            <div key={`${withdrawal.id}-${field.label}`} className="rounded-xl bg-white/5 px-3 py-2">
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">{field.label}</p>
                              <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{field.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-zinc-500">Dados indisponiveis para este metodo.</p>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                      <div>
                      <p><span className="font-black text-zinc-100">Pago em:</span> {formatDate(withdrawal.paid_at)}</p>
                      <p className="mt-1"><span className="font-black text-zinc-100">Revisao:</span> {formatDate(withdrawal.reviewed_at)}</p>
                      {withdrawal.admin_notes && (
                        <p className="mt-1"><span className="font-black text-zinc-100">Nota admin:</span> {withdrawal.admin_notes}</p>
                      )}
                      {withdrawal.rejection_reason && (
                        <p className="mt-1 text-red-100"><span className="font-black">Recusa:</span> {withdrawal.rejection_reason}</p>
                      )}
                    </div>

                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Observacao ou motivo</span>
                      <textarea
                        value={note}
                        onChange={(event) => setNotesById((current) => ({ ...current, [withdrawal.id]: event.target.value }))}
                        rows={3}
                        disabled={!isOpen || actionLoadingId === withdrawal.id}
                        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>

                    {isOpen && (
                      <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                        {withdrawal.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => updateWithdrawal(withdrawal, 'reviewing')}
                            disabled={actionLoadingId === withdrawal.id}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs font-black text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoadingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                            Em analise
                          </button>
                        )}
                        {(withdrawal.status === 'pending' || withdrawal.status === 'reviewing') && (
                          <button
                            type="button"
                            onClick={() => updateWithdrawal(withdrawal, 'approved')}
                            disabled={actionLoadingId === withdrawal.id}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-xs font-black text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoadingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Aprovar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateWithdrawal(withdrawal, 'paid')}
                          disabled={actionLoadingId === withdrawal.id}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoadingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                          Marcar como pago
                        </button>
                        <button
                          type="button"
                          onClick={() => updateWithdrawal(withdrawal, 'rejected')}
                          disabled={actionLoadingId === withdrawal.id}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-3 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoadingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Recusar
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950/80 p-5 text-sm leading-6 text-zinc-300 ring-1 ring-white/5">
          <div className="flex items-start gap-3">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" />
            <p>
              Ao marcar como pago, apenas o status muda para `paid`; o saldo nao muda novamente. Ao recusar, a RPC estorna o ItaCash para a carteira do criador.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
