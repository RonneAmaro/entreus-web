'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  birth_date: string | null
}

type AgeVerificationRequest = {
  id: string
  user_id: string
  status: string
  birth_date: string | null
  user_statement: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  document_front_path: string | null
  document_back_path: string | null
  selfie_path: string | null
  submitted_at: string | null
  privacy_accepted_at: string | null
  document_type: string | null
}

type SignedDocuments = {
  front?: string
  back?: string
  selfie?: string
}

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'rejected', label: 'Recusadas' },
  { value: 'all', label: 'Todas' },
]

function calculateAge(birthDateValue: string | null) {
  if (!birthDateValue) return null

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
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

function documentTypeLabel(value: string | null) {
  if (value === 'rg') return 'RG'
  if (value === 'cnh') return 'CNH'
  if (value === 'passport') return 'Passaporte'
  if (value === 'other') return 'Outro'
  return 'Nao informado'
}

function isPdf(path: string | null) {
  return Boolean(path?.toLowerCase().endsWith('.pdf'))
}

export default function AdminAgeVerificationsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [requests, setRequests] = useState<AgeVerificationRequest[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, UserProfile>>({})
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [selectedRequest, setSelectedRequest] = useState<AgeVerificationRequest | null>(null)
  const [signedDocuments, setSignedDocuments] = useState<SignedDocuments>({})
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
      .from('age_verification_requests')
      .select(`
        id,
        user_id,
        status,
        birth_date,
        user_statement,
        reviewed_by,
        reviewed_at,
        admin_notes,
        rejection_reason,
        created_at,
        updated_at,
        document_front_path,
        document_back_path,
        selfie_path,
        submitted_at,
        privacy_accepted_at,
        document_type
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage('Nao foi possivel carregar solicitacoes: ' + error.message)
      return
    }

    const rows = (data || []) as AgeVerificationRequest[]
    setRequests(rows)

    const userIds = Array.from(new Set(rows.map((row) => row.user_id)))

    if (userIds.length === 0) {
      setProfilesById({})
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, birth_date')
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

  async function createSignedUrl(path: string | null) {
    if (!path) return undefined

    const { data, error } = await supabase.storage
      .from('age-verifications')
      .createSignedUrl(path, 300)

    if (error) {
      setMessage('Nao foi possivel gerar URL temporaria: ' + error.message)
      return undefined
    }

    return data.signedUrl
  }

  async function openDetails(request: AgeVerificationRequest) {
    setSelectedRequest(request)
    setRejectionReason('')
    setAdminNotes(request.admin_notes || '')
    setSignedDocuments({})
    setMessage('')

    const [front, back, selfie] = await Promise.all([
      createSignedUrl(request.document_front_path),
      createSignedUrl(request.document_back_path),
      createSignedUrl(request.selfie_path),
    ])

    setSignedDocuments({ front, back, selfie })
  }

  async function approveRequest(request: AgeVerificationRequest) {
    if (!adminProfile) return

    setActionLoading(true)
    setMessage('')

    const reviewedAt = new Date().toISOString()

    const { error: requestError } = await supabase
      .from('age_verification_requests')
      .update({
        status: 'approved',
        reviewed_by: adminProfile.id,
        reviewed_at: reviewedAt,
        admin_notes: adminNotes.trim() || null,
        rejection_reason: null,
      })
      .eq('id', request.id)

    if (requestError) {
      setActionLoading(false)
      setMessage('Nao foi possivel aprovar solicitacao: ' + requestError.message)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        age_verification_status: 'approved',
        wants_18_plus: true,
        show_sensitive_content: true,
        age_verified_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .eq('id', request.user_id)

    if (profileError) {
      setActionLoading(false)
      setMessage('Solicitacao aprovada, mas perfil nao foi atualizado: ' + profileError.message)
      await loadRequests()
      return
    }

    setActionLoading(false)
    setMessage('Verificacao aprovada.')
    setSelectedRequest(null)
    await loadRequests()
  }

  async function rejectRequest(request: AgeVerificationRequest) {
    if (!adminProfile) return

    if (!rejectionReason.trim()) {
      setMessage('Informe o motivo da recusa.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const reviewedAt = new Date().toISOString()

    const { error: requestError } = await supabase
      .from('age_verification_requests')
      .update({
        status: 'rejected',
        reviewed_by: adminProfile.id,
        reviewed_at: reviewedAt,
        admin_notes: adminNotes.trim() || null,
        rejection_reason: rejectionReason.trim(),
      })
      .eq('id', request.id)

    if (requestError) {
      setActionLoading(false)
      setMessage('Nao foi possivel recusar solicitacao: ' + requestError.message)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        age_verification_status: 'rejected',
        wants_18_plus: false,
        show_sensitive_content: false,
        age_verified_at: null,
        updated_at: reviewedAt,
      })
      .eq('id', request.user_id)

    if (profileError) {
      setActionLoading(false)
      setMessage('Solicitacao recusada, mas perfil nao foi atualizado: ' + profileError.message)
      await loadRequests()
      return
    }

    setActionLoading(false)
    setMessage('Verificacao recusada.')
    setSelectedRequest(null)
    await loadRequests()
  }

  function renderSignedDocument(label: string, signedUrl: string | undefined, path: string | null) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-black">{label}</p>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-zinc-400">
            URL 5 min
          </span>
        </div>

        {!path ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-zinc-500">
            Nao enviado
          </div>
        ) : !signedUrl ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-white/10 text-sm text-zinc-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Gerando acesso temporario...
          </div>
        ) : isPdf(path) ? (
          <Link
            href={signedUrl}
            target="_blank"
            className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-100 transition hover:bg-blue-500/20"
          >
            <FileText className="h-10 w-10" />
            <span className="mt-3 text-sm font-black">Abrir PDF temporario</span>
          </Link>
        ) : (
          <a href={signedUrl} target="_blank" rel="noreferrer">
            <img
              src={signedUrl}
              alt={label}
              className="max-h-80 w-full rounded-2xl object-contain ring-1 ring-white/10"
            />
          </a>
        )}
      </div>
    )
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
              Analise de verificacoes 18+
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Documentos de verificacao sao dados sensiveis. Analise com cuidado e nao compartilhe essas informacoes.
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
              const birthDate = request.birth_date || profile?.birth_date || null
              const age = calculateAge(birthDate)

              return (
                <article key={request.id} className="rounded-[2rem] border border-white/10 bg-zinc-950 p-4 shadow-xl shadow-black/20 ring-1 ring-white/5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-black">
                        {profile?.display_name || profile?.username || 'Usuario'}
                      </p>
                      <p className="truncate text-sm text-zinc-500">
                        @{profile?.username || 'sem-username'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Nascimento</p>
                      <p className="text-sm font-semibold">{birthDate || 'Nao informado'}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Idade</p>
                      <p className="text-sm font-semibold">{age !== null ? `${age} anos` : 'N/D'}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Documento</p>
                      <p className="text-sm font-semibold">{documentTypeLabel(request.document_type)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Status</p>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                        request.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : request.status === 'rejected'
                            ? 'bg-red-500/10 text-red-300'
                            : 'bg-blue-500/10 text-blue-300'
                      }`}>
                        {statusLabel(request.status)}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-zinc-500">Envio</p>
                      <p className="text-sm font-semibold">{formatDate(request.submitted_at || request.created_at)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDetails(request)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50"
                    >
                      <Eye className="h-4 w-4" />
                      Ver detalhes
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {selectedRequest && (
          <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-6xl rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">Detalhes da solicitacao</p>
                  <h2 className="mt-2 text-2xl font-black">
                    {profilesById[selectedRequest.user_id]?.display_name ||
                      profilesById[selectedRequest.user_id]?.username ||
                      'Usuario'}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Status: {statusLabel(selectedRequest.status)} | Documento: {documentTypeLabel(selectedRequest.document_type)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
                >
                  Fechar
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
                Documentos de verificacao sao dados sensiveis. As URLs abaixo sao temporarias e expiram em 5 minutos.
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {renderSignedDocument('Documento - frente', signedDocuments.front, selectedRequest.document_front_path)}
                {renderSignedDocument('Documento - verso', signedDocuments.back, selectedRequest.document_back_path)}
                {renderSignedDocument('Selfie', signedDocuments.selfie, selectedRequest.selfie_path)}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                  <p className="font-black">Observacao do usuario</p>
                  <p className="mt-2 min-h-24 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                    {selectedRequest.user_statement || 'Sem observacao.'}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                  <label className="block">
                    <span className="font-black">Notas internas</span>
                    <textarea
                      value={adminNotes}
                      onChange={(event) => setAdminNotes(event.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-300"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="font-black">Motivo da recusa</span>
                    <textarea
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      rows={3}
                      placeholder="Obrigatorio para recusar"
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-300"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => approveRequest(selectedRequest)}
                  disabled={actionLoading || selectedRequest.status === 'approved'}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar
                </button>

                <button
                  type="button"
                  onClick={() => rejectRequest(selectedRequest)}
                  disabled={actionLoading || selectedRequest.status === 'rejected'}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Recusar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
