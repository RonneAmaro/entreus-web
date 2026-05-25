'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Flag, Image as ImageIcon, Loader2, RotateCcw, ShieldAlert, ShieldOff, Video } from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { isMissingPostModerationColumnError, normalizeModerationStatus, type ModeratedPostFields } from '@/lib/post-moderation'
import { supabase } from '@/lib/supabase'
import { notifyAdminPendingAlertsChanged } from '@/app/hooks/useAdminPendingAlerts'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type ReportRow = {
  id: string
  reporter_id: string | null
  reported_post_id: string | null
  reported_user_id: string | null
  reason: string | null
  status?: string | null
  created_at?: string | null
}

type ReportedPostContext = ModeratedPostFields & {
  id: string
  user_id: string | null
  content: string | null
  category: string | null
  image_url: string | null
  video_url: string | null
  is_sensitive: boolean | null
}

type ReportStatus = 'pending' | 'in_review' | 'resolved' | 'rejected' | 'archived'
type ReportFilter = 'pending' | 'in_review' | 'resolved' | 'rejected' | 'all'

const reportFilters: { value: ReportFilter; label: string }[] = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'in_review', label: 'Em analise' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'rejected', label: 'Recusadas' },
  { value: 'all', label: 'Todas' },
]

function normalizeReportStatus(status: string | null | undefined): ReportStatus {
  if (status === 'in_review' || status === 'resolved' || status === 'rejected' || status === 'archived') {
    return status
  }

  return 'pending'
}

export default function AdminReportsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [postContextById, setPostContextById] = useState<Record<string, ReportedPostContext>>({})
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null)
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<ReportFilter>('pending')

  const filteredReports = useMemo(() => {
    const statusPriority: Record<ReportStatus, number> = {
      pending: 0,
      in_review: 1,
      resolved: 2,
      rejected: 3,
      archived: 4,
    }

    return reports
      .filter((report) => {
        const status = normalizeReportStatus(report.status)
        if (reportFilter === 'all') return true
        if (reportFilter === 'pending') return status === 'pending'
        return status === reportFilter
      })
      .sort((a, b) => statusPriority[normalizeReportStatus(a.status)] - statusPriority[normalizeReportStatus(b.status)])
  }, [reports, reportFilter])

  useEffect(() => {
    loadPage()
  }, [])

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
      setMessage('Nao foi possivel verificar permissao admin.')
      setLoading(false)
      return
    }

    const loadedProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }
    setAdminProfile(loadedProfile)

    if (!isAdminRole(loadedProfile.role)) {
      setLoading(false)
      return
    }

    let reportsData: ReportRow[] | null = null
    let reportsError: { message: string } | null = null

    const primaryResult = await supabase
      .from('reports')
      .select('id, reporter_id, reported_post_id, reported_user_id, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(80)

    reportsData = (primaryResult.data || null) as ReportRow[] | null
    reportsError = primaryResult.error

    if (reportsError) {
      console.warn('[AdminReports] Status filter unavailable, loading recent reports:', reportsError.message)
      const fallback = await supabase
        .from('reports')
        .select('id, reporter_id, reported_post_id, reported_user_id, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      reportsData = (fallback.data || null) as ReportRow[] | null
      reportsError = fallback.error
    }

    if (reportsError) {
      console.error('[AdminReports] Load failed:', reportsError.message)
      setMessage('Nao foi possivel carregar denuncias agora.')
      setReports([])
      setPostContextById({})
    } else {
      const loadedReports = reportsData || []
      setReports(loadedReports)
      await loadReportedPostContext(loadedReports)
    }

    setLoading(false)
  }

  async function loadReportedPostContext(loadedReports: ReportRow[]) {
    const postIds = Array.from(
      new Set(
        loadedReports
          .map((report) => report.reported_post_id)
          .filter((postId): postId is string => Boolean(postId)),
      ),
    )

    if (postIds.length === 0) {
      setPostContextById({})
      return
    }

    const selectWithModeration =
      'id, user_id, content, category, image_url, video_url, is_sensitive, moderation_status, moderated_at, moderated_by, moderation_reason'
    const selectFallback = 'id, user_id, content, category, image_url, video_url, is_sensitive'

    let { data, error } = await supabase
      .from('posts')
      .select(selectWithModeration)
      .in('id', postIds)

    if (error && isMissingPostModerationColumnError(error)) {
      const fallback = await supabase
        .from('posts')
        .select(selectFallback)
        .in('id', postIds)

      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) {
      console.warn('[AdminReports] Post context unavailable:', error.message)
      setPostContextById({})
      return
    }

    const nextContext = ((data || []) as ReportedPostContext[]).reduce<Record<string, ReportedPostContext>>(
      (acc, post) => {
        acc[post.id] = post
        return acc
      },
      {},
    )

    setPostContextById(nextContext)
  }

  function isSensitivePost(post: ReportedPostContext | undefined) {
    return Boolean(
      post?.is_sensitive ||
        post?.category === 'adulto' ||
        post?.category === 'sensual' ||
        post?.category === '18plus',
    )
  }

  function getStatusLabel(status: string | null | undefined) {
    const normalized = normalizeReportStatus(status)
    if (normalized === 'in_review') return 'Em analise'
    if (normalized === 'resolved') return 'Procedente / resolvida'
    if (normalized === 'rejected') return 'Denuncia recusada'
    if (normalized === 'archived') return 'Arquivada'
    return 'Pendente'
  }

  function getReportStatusClass(status: string | null | undefined) {
    const normalized = normalizeReportStatus(status)
    if (normalized === 'in_review') return 'border-blue-300/20 bg-blue-500/10 text-blue-100'
    if (normalized === 'resolved') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
    if (normalized === 'rejected' || normalized === 'archived') return 'border-zinc-300/20 bg-white/10 text-zinc-100'
    return 'border-amber-300/20 bg-amber-500/10 text-amber-100'
  }

  function getPostModerationLabel(post: ReportedPostContext | undefined) {
    const status = normalizeModerationStatus(post?.moderation_status)
    if (status === 'hidden') return 'conteudo oculto'
    if (status === 'removed') return 'conteudo removido'
    return 'conteudo ativo'
  }

  function getPostModerationClass(post: ReportedPostContext | undefined) {
    const status = normalizeModerationStatus(post?.moderation_status)
    if (status === 'hidden' || status === 'removed') {
      return 'border-red-300/20 bg-red-500/10 text-red-100'
    }

    return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
  }

  async function updateReportStatus(reportId: string, status: ReportStatus) {
    if (updatingReportId) return

    setUpdatingReportId(reportId)
    setMessage('')

    const { error } = await supabase
      .from('reports')
      .update({ status })
      .eq('id', reportId)

    if (error) {
      setMessage('Nao foi possivel atualizar a denuncia: ' + error.message)
      setUpdatingReportId(null)
      return
    }

    setReports((current) =>
      current.map((report) => (report.id === reportId ? { ...report, status } : report)),
    )
    setMessage(
      status === 'resolved'
        ? 'Denuncia marcada como resolvida.'
        : status === 'rejected'
          ? 'Denuncia recusada. O conteudo continuara ativo.'
          : 'Denuncia marcada como em analise.',
    )
    notifyAdminPendingAlertsChanged()
    setUpdatingReportId(null)
  }

  async function rejectReport(report: ReportRow) {
    const confirmed = window.confirm(
      'Recusar denuncia? A denuncia sera encerrada e o conteudo continuara ativo.',
    )

    if (!confirmed) return

    await updateReportStatus(report.id, 'rejected')
  }

  async function notifyPostOwnerAboutHiddenContent(postId: string, postOwnerId: string | null | undefined) {
    if (!postOwnerId || !adminProfile) return

    const { error } = await supabase.from('notifications').insert({
      user_id: postOwnerId,
      actor_id: adminProfile.id,
      type: 'post_hidden',
      post_id: postId,
    })

    if (error) {
      console.warn('[AdminReports] Post hidden notification failed:', error.message)
    }
  }

  async function moderatePost(report: ReportRow, nextStatus: 'active' | 'hidden') {
    if (!report.reported_post_id || !adminProfile || updatingPostId) return

    const hiding = nextStatus === 'hidden'
    const confirmText = hiding
      ? 'Ocultar conteudo? O conteudo sera ocultado para usuarios comuns e o criador sera notificado.'
      : 'Restaurar conteudo? O conteudo voltara a aparecer para usuarios comuns.'

    if (!window.confirm(confirmText)) return

    const reason = hiding
      ? window.prompt('Motivo da ocultacao:', 'Conteudo ocultado pela moderacao.') || 'Conteudo ocultado pela moderacao.'
      : window.prompt('Motivo da restauracao:', 'Conteudo restaurado pela moderacao.') || 'Conteudo restaurado pela moderacao.'

    setUpdatingPostId(report.reported_post_id)
    setMessage('')

    const { error } = await supabase.rpc('moderate_reported_post', {
      p_post_id: report.reported_post_id,
      p_status: nextStatus,
      p_reason: reason.trim() || (hiding ? 'Conteudo ocultado pela moderacao.' : 'Conteudo restaurado pela moderacao.'),
      p_report_id: report.id,
      p_resolve_report: hiding,
    })

    if (error) {
      setMessage('Nao foi possivel moderar o conteudo: ' + error.message)
      setUpdatingPostId(null)
      return
    }

    if (hiding) {
      await notifyPostOwnerAboutHiddenContent(
        report.reported_post_id,
        postContextById[report.reported_post_id]?.user_id || report.reported_user_id,
      )

      setReports((current) =>
        current.map((item) => (item.id === report.id ? { ...item, status: 'resolved' } : item)),
      )
      setPostContextById((current) => ({
        ...current,
        [report.reported_post_id as string]: {
          ...current[report.reported_post_id as string],
          moderation_status: 'hidden',
          moderated_at: new Date().toISOString(),
          moderated_by: adminProfile.id,
          moderation_reason: reason.trim() || 'Conteudo ocultado pela moderacao.',
        },
      }))
      setMessage('Conteudo ocultado e denuncia resolvida.')
      notifyAdminPendingAlertsChanged()
    } else {
      setPostContextById((current) => ({
        ...current,
        [report.reported_post_id as string]: {
          ...current[report.reported_post_id as string],
          moderation_status: 'active',
          moderated_at: new Date().toISOString(),
          moderated_by: adminProfile.id,
          moderation_reason: reason.trim() || 'Conteudo restaurado pela moderacao.',
        },
      }))
      setMessage('Conteudo restaurado.')
    }

    setUpdatingPostId(null)
  }

  async function copyPostLink(postId: string) {
    const path = `/post/${postId}`

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setMessage('Link do conteudo copiado.')
    } catch {
      setMessage(`Link do conteudo: ${path}`)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando denuncias...
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">Esta area e exclusiva para administradores.</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <Link href="/admin/moderation" className="ml-2 inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-500/20">
          <ShieldOff className="h-4 w-4" />
          Ver central de moderacao
        </Link>

        <header className="mt-6 rounded-[2rem] border border-red-300/25 bg-red-500/10 p-6 ring-1 ring-red-300/10">
          <Flag className="h-9 w-9 text-red-100" />
          <h1 className="mt-4 text-3xl font-black">Denuncias pendentes</h1>
          <p className="mt-2 text-sm leading-6 text-red-100/80">
            Decida se a denuncia entra em analise, se sera recusada ou se o conteudo deve ser ocultado.
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-white">Fila de denuncias</p>
            <p className="mt-1 text-xs text-zinc-500">
              {filteredReports.length} denuncias no filtro atual. Pendentes contam apenas status pending ou vazio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reportFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setReportFilter(filter.value)}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  reportFilter === filter.value
                    ? 'bg-white text-black'
                    : 'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {filteredReports.length === 0 ? (
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100 ring-1 ring-emerald-300/10">
              Nenhuma denuncia neste filtro.
            </div>
          ) : (
            filteredReports.map((report) => {
              const postContext = report.reported_post_id ? postContextById[report.reported_post_id] : undefined
              const hasImage = Boolean(postContext?.image_url)
              const hasVideo = Boolean(postContext?.video_url)
              const sensitive = isSensitivePost(postContext)
              const postModerationStatus = normalizeModerationStatus(postContext?.moderation_status)
              const postActionLoading = Boolean(report.reported_post_id && updatingPostId === report.reported_post_id)

              return (
              <article key={report.id} className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-blue-300/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${getReportStatusClass(report.status)}`}>
                      <AlertTriangle className="h-4 w-4" />
                      {getStatusLabel(report.status)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">{report.reason || 'Sem motivo informado.'}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Denunciado: {report.reported_user_id || '-'} · Autor: {report.reporter_id || '-'}
                    </p>
                    {postContext && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-zinc-300">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${getPostModerationClass(postContext)}`}>
                            {getPostModerationLabel(postContext)}
                          </span>
                          {hasImage && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-100">
                              <ImageIcon className="h-3.5 w-3.5" />
                              imagem
                            </span>
                          )}
                          {hasVideo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-1 text-purple-100">
                              <Video className="h-3.5 w-3.5" />
                              video
                            </span>
                          )}
                          {sensitive && (
                            <span className="rounded-full bg-yellow-500/10 px-2.5 py-1 text-yellow-100">
                              conteudo sensivel / 18+
                            </span>
                          )}
                          {!hasImage && !hasVideo && (
                            <span className="rounded-full bg-white/10 px-2.5 py-1 text-zinc-300">
                              sem midia anexada
                            </span>
                          )}
                        </div>

                        {postContext.content && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-300">
                            {postContext.content}
                          </p>
                        )}

                        {postContext.moderation_reason && postModerationStatus !== 'active' && (
                          <p className="mt-2 text-xs font-semibold text-red-100/80">
                            Motivo: {postContext.moderation_reason}
                          </p>
                        )}

                        {hasImage && postContext.image_url && (
                          <div className="mt-3 h-32 w-full overflow-hidden rounded-2xl border border-white/10 bg-black sm:max-w-xs">
                            {sensitive ? (
                              <div className="flex h-full items-center justify-center bg-zinc-900 px-4 text-center text-xs font-bold text-yellow-100">
                                Preview protegido: conteudo sensivel
                              </div>
                            ) : (
                              <img
                                src={postContext.image_url}
                                alt="Preview do post denunciado"
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {report.reported_post_id && !postContext && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm font-semibold text-zinc-300">
                        Conteudo indisponivel.
                      </div>
                    )}
                  </div>
                  {report.reported_post_id && (
                    <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:max-w-56">
                      <Link href={`/post/${report.reported_post_id}`} className="rounded-full bg-white px-4 py-2 text-center text-xs font-black text-black">
                        Abrir post
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyPostLink(report.reported_post_id as string)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white transition hover:bg-white/10"
                      >
                        Copiar link
                      </button>
                      {postModerationStatus === 'active' ? (
                        <button
                          type="button"
                          onClick={() => moderatePost(report, 'hidden')}
                          disabled={postActionLoading}
                          className="inline-flex items-center gap-1 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {postActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                          Ocultar conteudo
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moderatePost(report, 'active')}
                          disabled={postActionLoading}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {postActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Restaurar conteudo
                        </button>
                      )}
                      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-400">
                        {postModerationStatus === 'active'
                          ? 'Ocultar conteudo remove o post da visualizacao comum e notifica o criador.'
                          : 'Restaurar conteudo faz o post voltar a aparecer para usuarios comuns.'}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-2 border-t border-white/10 pt-3 sm:flex sm:flex-wrap">
                  <p className="text-xs leading-5 text-zinc-500 sm:basis-full">
                    Recusar denuncia encerra a denuncia e mantem o conteudo ativo.
                  </p>
                  <button
                    type="button"
                    onClick={() => updateReportStatus(report.id, 'in_review')}
                    disabled={updatingReportId === report.id}
                    className="rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Marcar em analise
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectReport(report)}
                    disabled={updatingReportId === report.id}
                    className="rounded-full border border-zinc-300/20 bg-white/5 px-4 py-2 text-xs font-black text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Recusar denuncia
                  </button>
                  {updatingReportId === report.id && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-black text-zinc-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando
                    </span>
                  )}
                </div>
              </article>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
