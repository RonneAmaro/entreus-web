'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Loader2,
  ReceiptText,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type UserProfile = {
  id: string
  username: string | null
  display_name: string | null
}

type ItaCashPurchaseRequest = {
  id: string
  user_id: string
  amount_itacash: number
  base_amount_brl_cents: number
  platform_fee_percent: number
  platform_fee_brl_cents: number
  operator_fee_percent: number
  operator_fee_brl_cents: number
  total_brl_cents: number
  payment_method: string
  status: string
  user_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  rejection_reason: string | null
  created_at: string
}

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'rejected', label: 'Recusadas' },
  { value: 'all', label: 'Todas' },
]

function formatBRLFromCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
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

function statusLabel(status: string) {
  if (status === 'approved') return 'Aprovada'
  if (status === 'rejected') return 'Recusada'
  if (status === 'canceled') return 'Cancelada'
  return 'Pendente'
}

function paymentMethodLabel(method: string) {
  if (method === 'mercadopago_manual') return 'Mercado Pago manual'
  return 'Pix manual'
}

export default function AdminItaCashPurchasesPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [requests, setRequests] = useState<ItaCashPurchaseRequest[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, UserProfile>>({})
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [rejectingRequest, setRejectingRequest] = useState<ItaCashPurchaseRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [adminNotes, setAdminNotes] = useState('')

  useEffect(() => {
    loadPage()
  }, [])

  const visibleRequests = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((request) => request.status === filter)
  }, [filter, requests])

  async function loadPage() {
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

    if (loadedAdminProfile.role !== 'admin') {
      setLoading(false)
      return
    }

    await loadRequests()
    setLoading(false)
  }

  async function loadRequests() {
    const { data, error } = await supabase
      .from('itacash_purchase_requests')
      .select(`
        id,
        user_id,
        amount_itacash,
        base_amount_brl_cents,
        platform_fee_percent,
        platform_fee_brl_cents,
        operator_fee_percent,
        operator_fee_brl_cents,
        total_brl_cents,
        payment_method,
        status,
        user_note,
        reviewed_by,
        reviewed_at,
        admin_notes,
        rejection_reason,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage('Nao foi possivel carregar solicitacoes: ' + error.message)
      return
    }

    const rows = (data || []) as ItaCashPurchaseRequest[]
    setRequests(rows)

    const userIds = Array.from(new Set(rows.map((row) => row.user_id)))

    if (userIds.length === 0) {
      setProfilesById({})
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', userIds)

    if (profilesError) {
      setMessage('Solicitacoes carregadas, mas perfis falharam: ' + profilesError.message)
      return
    }

    const profileMap = ((profilesData || []) as UserProfile[]).reduce(
      (acc, profile) => {
        acc[profile.id] = profile
        return acc
      },
      {} as Record<string, UserProfile>
    )

    setProfilesById(profileMap)
  }

  async function approveRequest(request: ItaCashPurchaseRequest) {
    setActionLoadingId(request.id)
    setMessage('')

    const { error } = await supabase.rpc('approve_itacash_purchase_request', {
      p_request_id: request.id,
      p_admin_notes: adminNotes.trim() || null,
    })

    setActionLoadingId(null)

    if (error) {
      setMessage('Nao foi possivel aprovar solicitacao: ' + error.message)
      return
    }

    setMessage('Solicitacao aprovada e ItaCash creditado na carteira.')
    setAdminNotes('')
    await loadRequests()
  }

  async function rejectRequest() {
    if (!rejectingRequest) return

    if (!rejectionReason.trim()) {
      setMessage('Informe o motivo da recusa.')
      return
    }

    setActionLoadingId(rejectingRequest.id)
    setMessage('')

    const { error } = await supabase.rpc('reject_itacash_purchase_request', {
      p_request_id: rejectingRequest.id,
      p_rejection_reason: rejectionReason.trim(),
      p_admin_notes: adminNotes.trim() || null,
    })

    setActionLoadingId(null)

    if (error) {
      setMessage('Nao foi possivel recusar solicitacao: ' + error.message)
      return
    }

    setMessage('Solicitacao recusada sem credito de ItaCash.')
    setRejectingRequest(null)
    setRejectionReason('')
    setAdminNotes('')
    await loadRequests()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando painel...
      </main>
    )
  }

  if (!adminProfile || adminProfile.role !== 'admin') {
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
              href="/feed"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Feed
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              Compras manuais de ItaCash
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Aprove somente depois de conferir o pagamento por fora. Nenhuma integracao automatica e executada aqui.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Admin</p>
            <p className="mt-1 font-black">{adminProfile.email || adminProfile.id}</p>
          </div>
        </header>

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
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-5 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        )}

        <div className="grid gap-4">
          {visibleRequests.length === 0 ? (
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center text-zinc-400">
              Nenhuma solicitacao encontrada.
            </div>
          ) : (
            visibleRequests.map((request) => {
              const profile = profilesById[request.user_id]
              const isPending = request.status === 'pending'

              return (
                <article key={request.id} className="rounded-[2rem] border border-white/10 bg-zinc-950 p-4 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(7,minmax(0,1fr))_auto] xl:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-black">
                        {profile?.display_name || profile?.username || 'Usuario'}
                      </p>
                      <p className="truncate text-sm text-zinc-500">
                        @{profile?.username || 'sem-username'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">ItaCash</p>
                      <p className="text-sm font-black">{request.amount_itacash}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Valor base</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.base_amount_brl_cents)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Taxa EntreUS</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.platform_fee_brl_cents)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Taxa operadora</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.operator_fee_brl_cents)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Total</p>
                      <p className="text-sm font-black">{formatBRLFromCents(request.total_brl_cents)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Metodo</p>
                      <p className="text-sm font-semibold">{paymentMethodLabel(request.payment_method)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Data</p>
                      <p className="text-sm font-semibold">{formatDate(request.created_at)}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className={`inline-flex justify-center rounded-full px-2.5 py-1 text-xs font-black ${
                        request.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : request.status === 'rejected'
                            ? 'bg-red-500/10 text-red-300'
                            : 'bg-blue-500/10 text-blue-300'
                      }`}>
                        {statusLabel(request.status)}
                      </span>

                      {isPending && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => approveRequest(request)}
                            disabled={actionLoadingId === request.id}
                            className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoadingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingRequest(request)
                              setRejectionReason('')
                            }}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {(request.user_note || request.rejection_reason || request.admin_notes) && (
                    <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm text-zinc-300 md:grid-cols-3">
                      <p><span className="font-black text-zinc-100">Observacao:</span> {request.user_note || 'Sem observacao.'}</p>
                      <p><span className="font-black text-zinc-100">Recusa:</span> {request.rejection_reason || 'N/D'}</p>
                      <p><span className="font-black text-zinc-100">Revisao:</span> {formatDate(request.reviewed_at)}</p>
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>

        {rejectingRequest && (
          <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">Recusar compra</p>
                  <h2 className="mt-2 text-2xl font-black">
                    {rejectingRequest.amount_itacash} ItaCash
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Total: {formatBRLFromCents(rejectingRequest.total_brl_cents)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
                >
                  Fechar
                </button>
              </div>

              <label className="mt-5 block">
                <span className="font-black">Motivo da recusa</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={4}
                  placeholder="Obrigatorio para recusar"
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>

              <label className="mt-4 block">
                <span className="font-black">Notas internas</span>
                <textarea
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-blue-300"
                />
              </label>

              <button
                type="button"
                onClick={rejectRequest}
                disabled={actionLoadingId === rejectingRequest.id}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoadingId === rejectingRequest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                Confirmar recusa
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
