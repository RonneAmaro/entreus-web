'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  ReceiptText,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { useLanguage } from '@/app/components/LanguageProvider'
import { supabase } from '@/lib/supabase'
import { usePendingItaCashPurchasesCount } from '../../hooks/usePendingItaCashPurchasesCount'
import { isAdminRole } from '@/lib/admin'

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
  proof_path: string | null
  proof_url: string | null
  proof_uploaded_at: string | null
  pix_total_brl_cents: number | null
  created_at: string
}

const FILTERS: FilterStatus[] = ['pending', 'approved', 'rejected', 'all']
const KNOWN_PROOF_API_ERRORS = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'PROOF_NOT_AVAILABLE', 'SIGNED_URL_FAILED'])

function formatBRLFromCents(value: number, locale: string) {
  return (value / 100).toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback

  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hasPaymentProof(request: ItaCashPurchaseRequest) {
  return Boolean(request.proof_path || request.proof_url)
}

export default function AdminItaCashPurchasesPage() {
  const router = useRouter()
  const { language, t } = useLanguage()

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
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null)
  const [newPendingAlert, setNewPendingAlert] = useState(false)
  const isAdmin = isAdminRole(adminProfile?.role)

  const handleNewPendingPurchase = useCallback(() => {
    setNewPendingAlert(true)
  }, [])

  const handlePurchaseRequestsChanged = useCallback(() => {
    loadRequests()
  }, [])

  const { pendingCount: livePendingCount } = usePendingItaCashPurchasesCount({
    enabled: isAdmin,
    onNewPending: handleNewPendingPurchase,
    onChanged: handlePurchaseRequestsChanged,
  })

  useEffect(() => {
    loadPage()
  }, [])

  const filters = useMemo(
    () => FILTERS.map((value) => ({ value, label: t(`admin.itacashPurchases.filters.${value}`) })),
    [t],
  )

  const visibleRequests = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((request) => request.status === filter)
  }, [filter, requests])

  const pendingRequestsCount = useMemo(() => {
    return requests.filter((request) => request.status === 'pending').length
  }, [requests])

  const visiblePendingCount = Math.max(pendingRequestsCount, livePendingCount)

  const translateStatus = useCallback((status: string) => {
    if (status === 'approved' || status === 'rejected' || status === 'canceled' || status === 'pending') {
      return t(`admin.itacashPurchases.status.${status}`)
    }
    return t('admin.itacashPurchases.status.unknown')
  }, [t])

  const translatePaymentMethod = useCallback((method: string) => {
    if (method === 'mercadopago_manual' || method === 'mercadopago_auto' || method === 'mercadopago_pix' || method === 'pix_manual') {
      return t(`admin.itacashPurchases.paymentMethods.${method}`)
    }
    return t('admin.itacashPurchases.paymentMethods.unknown')
  }, [t])

  const translateProofApiError = useCallback((code?: string) => {
    if (code && KNOWN_PROOF_API_ERRORS.has(code)) {
      return t(`admin.itacashPurchases.proofErrors.${code}`)
    }
    return t('admin.itacashPurchases.proofErrors.unknown')
  }, [t])

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
      setMessage(t('admin.itacashPurchases.messages.adminCheckFailed'))
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
        proof_path,
        proof_url,
        proof_uploaded_at,
        pix_total_brl_cents,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('admin.itacashPurchases.messages.loadFailed'))
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
      setMessage(t('admin.itacashPurchases.messages.profilesFailed'))
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
      setMessage(t('admin.itacashPurchases.messages.approveFailed'))
      return
    }

    setMessage(t('admin.itacashPurchases.messages.approvedSuccess'))
    setAdminNotes('')
    await loadRequests()
  }

  async function rejectRequest() {
    if (!rejectingRequest) return

    if (!rejectionReason.trim()) {
      setMessage(t('admin.itacashPurchases.messages.rejectionReasonRequired'))
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
      setMessage(t('admin.itacashPurchases.messages.rejectFailed'))
      return
    }

    setMessage(t('admin.itacashPurchases.messages.rejectedSuccess'))
    setRejectingRequest(null)
    setRejectionReason('')
    setAdminNotes('')
    await loadRequests()
  }

  async function openProof(request: ItaCashPurchaseRequest) {
    if (!hasPaymentProof(request)) {
      setMessage(t('admin.itacashPurchases.messages.proofMissing'))
      return
    }

    setProofLoadingId(request.id)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setProofLoadingId(null)
      setMessage(t('admin.itacashPurchases.messages.sessionExpired'))
      return
    }

    const response = await fetch('/api/admin/itacash-purchases/payment-proof/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ requestId: request.id }),
    })

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      signedUrl?: string
      error?: string
    } | null

    setProofLoadingId(null)

    if (!response.ok || !data?.ok || !data.signedUrl) {
      setMessage(translateProofApiError(data?.error))
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('admin.itacashPurchases.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('admin.itacashPurchases.accessDeniedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">
            {t('admin.itacashPurchases.accessDeniedDescription')}
          </p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
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
              {t('messages.detail.back')}
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              {t('admin.itacashPurchases.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              {t('admin.itacashPurchases.description')}
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">{t('admin.itacashPurchases.admin')}</p>
            <p className="mt-1 font-black">{adminProfile.email || adminProfile.id}</p>
          </div>
        </header>

        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className={`rounded-[2rem] border p-5 ring-1 ${
            visiblePendingCount > 0
              ? 'border-red-300/30 bg-red-500/15 text-red-50 ring-red-300/15'
              : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-50 ring-emerald-300/10'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                visiblePendingCount > 0 ? 'bg-red-500/20 text-red-100' : 'bg-emerald-500/15 text-emerald-100'
              }`}>
                {visiblePendingCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-lg font-black">
                  {visiblePendingCount > 0
                    ? t('admin.itacashPurchases.summary.pendingTitle')
                    : t('admin.itacashPurchases.summary.emptyTitle')}
                </p>
                <p className="mt-1 text-sm opacity-80">
                  {visiblePendingCount > 0
                    ? t('admin.itacashPurchases.summary.pendingDescription')
                    : t('admin.itacashPurchases.summary.emptyDescription')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('admin.itacashPurchases.summary.pendingCountTitle')}</p>
            <p className={`mt-2 text-4xl font-black ${visiblePendingCount > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
              {visiblePendingCount}
            </p>
            <p className="mt-1 text-sm text-zinc-400">{t('admin.itacashPurchases.summary.pendingCountUnit')}</p>
          </div>
        </div>

        {newPendingAlert && (
          <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-red-300/30 bg-red-500/15 p-4 text-red-50 ring-1 ring-red-300/15 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-200" />
              <div>
                <p className="font-black">{t('admin.itacashPurchases.alerts.newPendingTitle')}</p>
                <p className="mt-1 text-sm text-red-100/80">{t('admin.itacashPurchases.alerts.newPendingDescription')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewPendingAlert(false)}
              className="rounded-full border border-red-200/20 px-4 py-2 text-sm font-black text-red-50 transition hover:-translate-y-0.5 hover:bg-red-500/20 active:scale-95"
            >
              {t('admin.itacashPurchases.actions.dismiss')}
            </button>
          </div>
        )}

        <div className="mb-5 flex flex-wrap gap-2">
          {filters.map((item) => (
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
              {item.value === 'pending' && visiblePendingCount > 0 && (
                <span className="ml-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                  {visiblePendingCount > 99 ? '99+' : visiblePendingCount}
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
          {visibleRequests.length === 0 ? (
            <div className="rounded-[2rem] border border-blue-300/15 bg-zinc-950/80 p-8 text-center text-zinc-400 ring-1 ring-blue-300/10">
              {t('admin.itacashPurchases.empty')}
            </div>
          ) : (
            visibleRequests.map((request) => {
              const profile = profilesById[request.user_id]
              const isPending = request.status === 'pending'

              return (
                <article
                  key={request.id}
                  className={`rounded-[2rem] border p-4 shadow-xl ring-1 transition hover:-translate-y-0.5 ${
                    isPending
                      ? 'border-red-300/30 bg-red-500/10 shadow-red-950/20 ring-red-300/15'
                      : 'border-white/10 bg-zinc-950/80 shadow-black/20 ring-white/5'
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(7,minmax(0,1fr))_auto] xl:items-center">
                    <div className="min-w-0">
                      {isPending && (
                        <p className="mb-1 inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                          {t('admin.itacashPurchases.openStatus.pending')}
                        </p>
                      )}
                      <p className="truncate font-black">
                        {profile?.display_name || profile?.username || t('admin.itacashPurchases.fallback.user')}
                      </p>
                      <p className="truncate text-sm text-zinc-500">
                        @{profile?.username || t('admin.itacashPurchases.fallback.username')}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.itacash')}</p>
                      <p className="text-sm font-black">{request.amount_itacash}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.baseAmount')}</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.base_amount_brl_cents, language)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.platformFee')}</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.platform_fee_brl_cents, language)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.operatorFee')}</p>
                      <p className="text-sm font-semibold">{formatBRLFromCents(request.operator_fee_brl_cents, language)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.total')}</p>
                      <p className="text-sm font-black">{formatBRLFromCents(request.total_brl_cents, language)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.method')}</p>
                      <p className="text-sm font-semibold">{translatePaymentMethod(request.payment_method)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">{t('admin.itacashPurchases.fields.date')}</p>
                      <p className="text-sm font-semibold">{formatDate(request.created_at, language, t('admin.itacashPurchases.notProvided'))}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className={`inline-flex justify-center rounded-full px-2.5 py-1 text-xs font-black ${
                        request.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : request.status === 'rejected'
                            ? 'bg-red-500/10 text-red-300'
                            : 'bg-red-500/15 text-red-100 ring-1 ring-red-300/20'
                      }`}>
                        {translateStatus(request.status)}
                      </span>

                      {isPending && (
                        <div className="flex gap-2">
                          {hasPaymentProof(request) && (
                            <button
                              type="button"
                              onClick={() => openProof(request)}
                              disabled={proofLoadingId === request.id}
                              aria-label={t('admin.itacashPurchases.actions.openProof')}
                              title={t('admin.itacashPurchases.actions.openProof')}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {proofLoadingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                              {t('admin.itacashPurchases.actions.openProof')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => approveRequest(request)}
                            disabled={actionLoadingId === request.id}
                            aria-label={t('admin.itacashPurchases.actions.approve')}
                            title={t('admin.itacashPurchases.actions.approve')}
                            className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoadingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {t('admin.itacashPurchases.actions.approve')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingRequest(request)
                              setRejectionReason('')
                            }}
                            aria-label={t('admin.itacashPurchases.actions.reject')}
                            title={t('admin.itacashPurchases.actions.reject')}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {t('admin.itacashPurchases.actions.reject')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {(request.user_note || request.rejection_reason || request.admin_notes || hasPaymentProof(request)) && (
                    <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm text-zinc-300 md:grid-cols-4">
                      <p><span className="font-black text-zinc-100">{t('admin.itacashPurchases.meta.note')}</span> {request.user_note || t('admin.itacashPurchases.meta.noNote')}</p>
                      <p>
                        <span className="font-black text-zinc-100">{t('admin.itacashPurchases.meta.proof')}</span>{' '}
                        {hasPaymentProof(request) ? (
                          <button
                            type="button"
                            onClick={() => openProof(request)}
                            aria-label={t('admin.itacashPurchases.actions.openProof')}
                            title={t('admin.itacashPurchases.actions.openProof')}
                            className="font-black text-blue-200 underline-offset-4 hover:underline"
                          >
                            {t('admin.itacashPurchases.actions.openProof')}
                          </button>
                        ) : (
                          t('admin.itacashPurchases.meta.proofMissing')
                        )}
                      </p>
                      <p><span className="font-black text-zinc-100">{t('admin.itacashPurchases.meta.rejection')}</span> {request.rejection_reason || t('admin.itacashPurchases.notProvided')}</p>
                      <p><span className="font-black text-zinc-100">{t('admin.itacashPurchases.meta.reviewedAt')}</span> {formatDate(request.reviewed_at, language, t('admin.itacashPurchases.notProvided'))}</p>
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
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">{t('admin.itacashPurchases.modal.kicker')}</p>
                  <h2 className="mt-2 text-2xl font-black">
                    {rejectingRequest.amount_itacash} ItaCash
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {t('admin.itacashPurchases.modal.total', { value: formatBRLFromCents(rejectingRequest.total_brl_cents, language) })}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  aria-label={t('common.close')}
                  title={t('common.close')}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
                >
                  {t('common.close')}
                </button>
              </div>

              <label className="mt-5 block">
                <span className="font-black">{t('admin.itacashPurchases.modal.rejectionReason')}</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={4}
                  placeholder={t('admin.itacashPurchases.modal.rejectionReasonPlaceholder')}
                  aria-label={t('admin.itacashPurchases.modal.rejectionReason')}
                  title={t('admin.itacashPurchases.modal.rejectionReason')}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>

              <label className="mt-4 block">
                <span className="font-black">{t('admin.itacashPurchases.modal.adminNotes')}</span>
                <textarea
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  rows={3}
                  aria-label={t('admin.itacashPurchases.modal.adminNotes')}
                  title={t('admin.itacashPurchases.modal.adminNotes')}
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
                {t('admin.itacashPurchases.modal.confirmReject')}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
