'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  Clipboard,
  Eye,
  FileWarning,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldOff,
  Video,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import {
  isMissingPostModerationColumnError,
  normalizeModerationStatus,
  type ModeratedPostFields,
  type ModerationStatus,
} from '@/lib/post-moderation'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type ModeratedPost = ModeratedPostFields & {
  id: string
  content: string | null
  category: string | null
  created_at: string | null
  user_id: string | null
  image_url: string | null
  video_url: string | null
  is_sensitive: boolean | null
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ReportSummary = {
  id: string
  reported_post_id: string | null
  status: string | null
  reason: string | null
  created_at: string | null
}

type StatusFilter = 'all' | 'hidden' | 'removed'

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'hidden', label: 'Ocultos' },
  { value: 'removed', label: 'Removidos' },
]

function getStatusLabel(status: string | null | undefined) {
  const normalized = normalizeModerationStatus(status)
  if (normalized === 'hidden') return 'Oculto'
  if (normalized === 'removed') return 'Removido'
  return 'Ativo'
}

function getStatusClass(status: string | null | undefined) {
  const normalized = normalizeModerationStatus(status)
  if (normalized === 'hidden') return 'border-red-300/25 bg-red-500/10 text-red-100'
  if (normalized === 'removed') return 'border-zinc-300/20 bg-white/10 text-zinc-100'
  return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
}

function getDisplayName(profile: ProfileSummary | undefined) {
  if (!profile) return 'Usuario indisponivel'
  return profile.display_name || profile.username || 'Usuario sem nome'
}

function getUsername(profile: ProfileSummary | undefined) {
  return profile?.username || 'usuario'
}

function isSensitivePost(post: ModeratedPost) {
  return Boolean(
    post.is_sensitive ||
      post.category === 'adulto' ||
      post.category === 'sensual' ||
      post.category === '18plus',
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Data indisponivel'

  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch {
    return 'Data indisponivel'
  }
}

export default function AdminModerationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [schemaMessage, setSchemaMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [posts, setPosts] = useState<ModeratedPost[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, ProfileSummary>>({})
  const [reportsByPostId, setReportsByPostId] = useState<Record<string, ReportSummary>>({})
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('hidden')
  const [restoringPostId, setRestoringPostId] = useState<string | null>(null)

  useEffect(() => {
    loadPage()
  }, [])

  const filteredPosts = useMemo(() => {
    if (statusFilter === 'all') return posts
    return posts.filter((post) => normalizeModerationStatus(post.moderation_status) === statusFilter)
  }, [posts, statusFilter])

  async function loadPage() {
    setLoading(true)
    setMessage('')
    setSchemaMessage('')

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

    await loadModeratedPosts()
    setLoading(false)
  }

  async function loadModeratedPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
        video_url,
        is_sensitive,
        moderation_status,
        moderated_at,
        moderated_by,
        moderation_reason
      `)
      .neq('moderation_status', 'active')
      .order('moderated_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (error) {
      if (isMissingPostModerationColumnError(error)) {
        setSchemaMessage(
          'Os campos de moderacao ainda nao estao disponiveis no banco. Aplique manualmente a migration do Pacote 36 para ativar esta central.',
        )
        setPosts([])
        setProfilesById({})
        setReportsByPostId({})
        return
      }

      setMessage('Nao foi possivel carregar conteudos moderados: ' + error.message)
      setPosts([])
      setProfilesById({})
      setReportsByPostId({})
      return
    }

    const moderatedPosts = ((data || []) as ModeratedPost[])
      .map((post) => ({
        ...post,
        moderation_status: normalizeModerationStatus(post.moderation_status),
      }))
      .filter((post) => normalizeModerationStatus(post.moderation_status) !== 'active')

    setPosts(moderatedPosts)
    await Promise.all([
      loadProfilesForPosts(moderatedPosts),
      loadReportsForPosts(moderatedPosts),
    ])
  }

  async function loadProfilesForPosts(moderatedPosts: ModeratedPost[]) {
    const profileIds = Array.from(
      new Set(
        moderatedPosts
          .flatMap((post) => [post.user_id, post.moderated_by])
          .filter((id): id is string => Boolean(id)),
      ),
    )

    if (profileIds.length === 0) {
      setProfilesById({})
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', profileIds)

    if (error) {
      console.warn('[AdminModeration] Profiles unavailable:', error.message)
      setProfilesById({})
      return
    }

    const nextProfiles = ((data || []) as ProfileSummary[]).reduce<Record<string, ProfileSummary>>(
      (acc, profile) => {
        acc[profile.id] = profile
        return acc
      },
      {},
    )

    setProfilesById(nextProfiles)
  }

  async function loadReportsForPosts(moderatedPosts: ModeratedPost[]) {
    const postIds = moderatedPosts.map((post) => post.id)

    if (postIds.length === 0) {
      setReportsByPostId({})
      return
    }

    const { data, error } = await supabase
      .from('reports')
      .select('id, reported_post_id, status, reason, created_at')
      .in('reported_post_id', postIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[AdminModeration] Related reports unavailable:', error.message)
      setReportsByPostId({})
      return
    }

    const nextReports = ((data || []) as ReportSummary[]).reduce<Record<string, ReportSummary>>(
      (acc, report) => {
        if (report.reported_post_id && !acc[report.reported_post_id]) {
          acc[report.reported_post_id] = report
        }

        return acc
      },
      {},
    )

    setReportsByPostId(nextReports)
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

  async function restorePost(post: ModeratedPost) {
    if (!adminProfile || restoringPostId) return

    const confirmed = window.confirm(
      'Tem certeza que deseja restaurar este conteudo? Ele voltara a aparecer para usuarios comuns conforme a visibilidade original.',
    )

    if (!confirmed) return

    const reason =
      window.prompt('Motivo da restauracao:', 'Conteudo restaurado pela central de moderacao.') ||
      'Conteudo restaurado pela central de moderacao.'

    setRestoringPostId(post.id)
    setMessage('')

    const { error } = await supabase.rpc('moderate_reported_post', {
      p_post_id: post.id,
      p_status: 'active' satisfies ModerationStatus,
      p_reason: reason.trim() || 'Conteudo restaurado pela central de moderacao.',
      p_report_id: null,
      p_resolve_report: false,
    })

    if (error) {
      setMessage('Nao foi possivel restaurar o conteudo: ' + error.message)
      setRestoringPostId(null)
      return
    }

    setPosts((current) => current.filter((item) => item.id !== post.id))
    setMessage('Conteudo restaurado com sucesso.')
    setRestoringPostId(null)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando central de moderacao...
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
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
          <Link href="/admin/reports" className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-500/20">
            <FileWarning className="h-4 w-4" />
            Ver denuncias
          </Link>
        </div>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-6 ring-1 ring-white/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <ShieldOff className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-black">Central de Moderacao</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Historico operacional de posts ocultos ou removidos pela moderacao, com restauracao segura e contexto para revisao.
          </p>
        </header>

        {(message || schemaMessage) && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {schemaMessage || message}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-white">Filtros</p>
            <p className="mt-1 text-xs text-zinc-500">
              {filteredPosts.length} conteudos no filtro atual.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  statusFilter === filter.value
                    ? 'bg-white text-black'
                    : 'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {schemaMessage ? null : filteredPosts.length === 0 ? (
          <div className="mt-5 rounded-[2rem] border border-emerald-300/20 bg-emerald-500/10 p-7 text-emerald-50 ring-1 ring-emerald-300/10">
            <h2 className="text-2xl font-black">Nenhum conteudo oculto</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-100/80">
              Quando um post for ocultado pela moderacao, ele aparecera aqui.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admin" className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
                Voltar ao Admin
              </Link>
              <Link href="/admin/reports" className="rounded-full border border-emerald-200/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-black text-emerald-50">
                Ver denuncias
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {filteredPosts.map((post) => {
              const author = post.user_id ? profilesById[post.user_id] : undefined
              const moderator = post.moderated_by ? profilesById[post.moderated_by] : undefined
              const relatedReport = reportsByPostId[post.id]
              const hasImage = Boolean(post.image_url)
              const hasVideo = Boolean(post.video_url)
              const sensitive = isSensitivePost(post)
              const restoring = restoringPostId === post.id

              return (
                <article key={post.id} className="rounded-[2rem] border border-white/10 bg-zinc-950/85 p-4 ring-1 ring-white/5 transition hover:border-blue-300/25 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                        <span className={`inline-flex rounded-full border px-3 py-1 ${getStatusClass(post.moderation_status)}`}>
                          {getStatusLabel(post.moderation_status)}
                        </span>
                        {hasImage && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-blue-100">
                            <ImageIcon className="h-3.5 w-3.5" />
                            imagem
                          </span>
                        )}
                        {hasVideo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-3 py-1 text-purple-100">
                            <Video className="h-3.5 w-3.5" />
                            video
                          </span>
                        )}
                        {sensitive && (
                          <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-yellow-100">
                            sensivel / 18+
                          </span>
                        )}
                      </div>

                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-200">
                        {post.content || 'Post sem texto.'}
                      </p>

                      <div className="mt-4 grid gap-2 text-xs leading-5 text-zinc-500 sm:grid-cols-2">
                        <p>
                          <span className="font-black text-zinc-300">Autor:</span>{' '}
                          {post.user_id ? (
                            <Link href={`/u/${getUsername(author)}`} className="text-blue-200 underline-offset-4 hover:underline">
                              {getDisplayName(author)}
                            </Link>
                          ) : (
                            'Autor indisponivel'
                          )}
                        </p>
                        <p>
                          <span className="font-black text-zinc-300">Moderador:</span>{' '}
                          {getDisplayName(moderator)}
                        </p>
                        <p className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(post.moderated_at)}
                        </p>
                        <p>
                          <span className="font-black text-zinc-300">Post:</span> {post.id}
                        </p>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Motivo</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-200">
                          {post.moderation_reason || 'Sem motivo registrado.'}
                        </p>
                      </div>

                      {relatedReport && (
                        <div className="mt-3 rounded-2xl border border-red-300/15 bg-red-500/10 p-3 text-sm text-red-100">
                          <p className="font-black">Denuncia relacionada</p>
                          <p className="mt-1 line-clamp-2 text-red-100/80">
                            {relatedReport.reason || 'Sem motivo informado.'}
                          </p>
                          <p className="mt-1 text-xs text-red-100/60">
                            Status: {relatedReport.status || 'pendente'} - {formatDate(relatedReport.created_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-48">
                      <Link href={`/post/${post.id}`} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                        <Eye className="h-3.5 w-3.5" />
                        Abrir post
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyPostLink(post.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white transition hover:bg-white/10"
                      >
                        <Clipboard className="h-3.5 w-3.5" />
                        Copiar link
                      </button>
                      {relatedReport && (
                        <Link href="/admin/reports" className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20">
                          Ver denuncia
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => restorePost(post)}
                        disabled={restoring}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Restaurar conteudo
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
