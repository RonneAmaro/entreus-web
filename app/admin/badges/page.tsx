'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Crown,
  Loader2,
  MinusCircle,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type Badge = {
  id: string
  slug: string
  name: string
  title: string | null
  icon: string | null
  color: string | null
  rarity: string | null
}

type UserBadge = {
  id: string
  awardedAt: string | null
  reason: string | null
  badge: Badge | null
}

type UserProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  email: string | null
  vip_plan?: string | null
  vip_status?: string | null
  vip_started_at?: string | null
  vip_expires_at?: string | null
  vip_plus_badge_enabled?: boolean | null
  vip_source?: string | null
  vip_reason?: string | null
  vip_updated_at?: string | null
  badges: UserBadge[]
}

type BadgesApiResponse = {
  ok: boolean
  badges?: Badge[]
  users?: UserProfile[]
  message?: string
  error?: string
}

type BadgeSuggestion = {
  userId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  score: number
  hasCommunityBadge: boolean
  reason: string
  metrics: {
    postsPublished: number
    commentsMade: number
    likesReceived: number
    commentsReceived: number
    repostsReceived: number
    hiddenPosts: number
    activeDays: number
  }
}

type BadgeSuggestionsResponse = {
  ok: boolean
  threshold?: {
    score: number
    alternative: string
  }
  scoring?: Record<string, number | string>
  metricsUsed?: string[]
  warnings?: string[]
  candidates?: BadgeSuggestion[]
  alreadyAwarded?: BadgeSuggestion[]
  error?: string
}

const featuredBadgeSlugs = ['community', 'elder', 'vip', 'vip_premium']
const communitySuggestionReason = 'Sugerido automaticamente por engajamento na comunidade.'
const vipDurationOptions = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: '1 ano', value: 365 },
]

function getInitial(text: string) {
  return (text || 'U').slice(0, 1).toUpperCase()
}

function getProfileName(profile: UserProfile) {
  return profile.display_name || profile.username || 'Usuario'
}

function getSuggestionName(suggestion: BadgeSuggestion) {
  return suggestion.displayName || suggestion.username || 'Usuario'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Data indisponivel'

  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch {
    return 'Data indisponivel'
  }
}

function isVipActive(profile: UserProfile) {
  if (profile.vip_status !== 'active' || !profile.vip_expires_at) return false
  return new Date(profile.vip_expires_at).getTime() > Date.now()
}

function getVipStatusLabel(profile: UserProfile) {
  if (isVipActive(profile)) return 'Ativo'
  if (profile.vip_status === 'active') return 'Expirado'
  if (profile.vip_status === 'canceled') return 'Cancelado'
  if (profile.vip_status === 'pending') return 'Pendente'
  return 'Inativo'
}

function getVipStatusClass(profile: UserProfile) {
  if (isVipActive(profile)) return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
  if (profile.vip_status === 'canceled') return 'border-red-300/20 bg-red-500/10 text-red-100'
  return 'border-white/10 bg-white/5 text-zinc-300'
}

function getFriendlyError(message?: string) {
  if (!message) return 'Nao foi possivel concluir agora.'
  return message
}

export default function AdminBadgesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [updatingKey, setUpdatingKey] = useState('')
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [reason, setReason] = useState('')
  const [vipPlan, setVipPlan] = useState<'vip' | 'vip_premium'>('vip')
  const [vipDurationDays, setVipDurationDays] = useState(30)
  const [badges, setBadges] = useState<Badge[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionCandidates, setSuggestionCandidates] = useState<BadgeSuggestion[]>([])
  const [alreadyAwardedCommunity, setAlreadyAwardedCommunity] = useState<BadgeSuggestion[]>([])
  const [suggestionWarnings, setSuggestionWarnings] = useState<string[]>([])
  const [metricsUsed, setMetricsUsed] = useState<string[]>([])
  const searchResultsRef = useRef<HTMLDivElement | null>(null)

  const grantableBadges = useMemo(() => {
    const bySlug = new Map(badges.map((badge) => [badge.slug, badge]))
    const featured = featuredBadgeSlugs.map((slug) => bySlug.get(slug)).filter((badge): badge is Badge => Boolean(badge))
    const rest = badges.filter((badge) => !featuredBadgeSlugs.includes(badge.slug))
    return [...featured, ...rest]
  }, [badges])

  const loadBadges = useCallback(async (searchQuery = '') => {
    setSearching(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Sessao expirada. Entre novamente para gerenciar selos.')
      setSearching(false)
      return []
    }

    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.set('q', searchQuery.trim())

      const response = await fetch(`/api/admin/badges?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = (await response.json()) as BadgesApiResponse

      if (!response.ok || !data.ok) {
        setMessage(getFriendlyError(data.error))
        setUsers([])
        return []
      } else {
        setBadges(data.badges || [])
        setUsers(data.users || [])
        return data.users || []
      }
    } catch {
      setMessage('Nao foi possivel conectar ao painel de selos agora.')
      setUsers([])
      return []
    } finally {
      setSearching(false)
    }
  }, [])

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSuggestionsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/badges/suggestions', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = (await response.json()) as BadgeSuggestionsResponse

      if (!response.ok || !data.ok) {
        setSuggestionCandidates([])
        setAlreadyAwardedCommunity([])
        setSuggestionWarnings([getFriendlyError(data.error)])
      } else {
        setSuggestionCandidates(data.candidates || [])
        setAlreadyAwardedCommunity(data.alreadyAwarded || [])
        setSuggestionWarnings(data.warnings || [])
        setMetricsUsed(data.metricsUsed || [])
      }
    } catch {
      setSuggestionCandidates([])
      setAlreadyAwardedCommunity([])
      setSuggestionWarnings(['Nao foi possivel carregar recomendacoes agora.'])
    } finally {
      setSuggestionsLoading(false)
    }
  }, [])

  useEffect(() => {
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

      const profile = {
        id: user.id,
        email: user.email,
        role: profileData?.role || 'user',
      }

      setAdminProfile(profile)
      setLoading(false)

      if (isAdminRole(profile.role)) {
        void loadBadges('')
        void loadSuggestions()
      }
    }

    loadPage()
  }, [loadBadges, loadSuggestions, router])

  async function searchUsers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextSearch = searchInput.trim()

    if (!nextSearch) {
      setMessage('Digite nome, username, arroba ou e-mail para buscar.')
      return
    }

    setSubmittedSearch(nextSearch)
    const results = await loadBadges(nextSearch)
    if (results.length === 0) setSelectedUser(null)
    window.requestAnimationFrame(() => {
      searchResultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  async function submitBadgeAction(payload: {
    action: 'grant' | 'revoke'
    userId: string
    badgeSlug?: string
    userBadgeId?: string
    label: string
    reasonOverride?: string
  }) {
    if (payload.action === 'revoke') {
      const confirmed = window.confirm(`Remover ${payload.label} deste usuario?`)
      if (!confirmed) return
    }

    setUpdatingKey(`${payload.action}-${payload.userId}-${payload.badgeSlug || payload.userBadgeId}`)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Sessao expirada. Entre novamente para atualizar selos.')
      setUpdatingKey('')
      return
    }

    try {
      const response = await fetch('/api/admin/badges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: payload.action,
          userId: payload.userId,
          badgeSlug: payload.badgeSlug,
          userBadgeId: payload.userBadgeId,
          reason: payload.reasonOverride || reason.trim() || null,
        }),
      })
      const data = (await response.json()) as BadgesApiResponse

      if (!response.ok || !data.ok) {
        setMessage(getFriendlyError(data.error))
      } else {
        setMessage(data.message || (payload.action === 'grant' ? 'Selo concedido com sucesso.' : 'Selo removido com sucesso.'))
        const nextUsers = await loadBadges(submittedSearch)
        if (selectedUser) {
          setSelectedUser(nextUsers.find((user) => user.id === selectedUser.id) || selectedUser)
        }
        await loadSuggestions()
      }
    } catch {
      setMessage('Nao foi possivel atualizar selo agora.')
    } finally {
      setUpdatingKey('')
    }
  }

  async function submitVipAction(payload: {
    action: 'grant_vip' | 'cancel_vip'
    userId: string
    label: string
  }) {
    if (payload.action === 'cancel_vip') {
      const confirmed = window.confirm(`Cancelar VIP de ${payload.label}? Os selos VIP tambem serao removidos.`)
      if (!confirmed) return
    }

    setUpdatingKey(`${payload.action}-${payload.userId}`)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Sessao expirada. Entre novamente para atualizar VIP.')
      setUpdatingKey('')
      return
    }

    try {
      const response = await fetch('/api/admin/badges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: payload.action,
          userId: payload.userId,
          planKey: vipPlan,
          durationDays: vipDurationDays,
          reason: reason.trim() || null,
        }),
      })
      const data = (await response.json()) as BadgesApiResponse

      if (!response.ok || !data.ok) {
        setMessage(getFriendlyError(data.error))
      } else {
        setMessage(data.message || 'VIP atualizado com sucesso.')
        const nextUsers = await loadBadges(submittedSearch)
        if (selectedUser) {
          setSelectedUser(nextUsers.find((user) => user.id === selectedUser.id) || selectedUser)
        }
        await loadSuggestions()
      }
    } catch {
      setMessage('Nao foi possivel atualizar VIP agora.')
    } finally {
      setUpdatingKey('')
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando selos...
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
      <section className="mx-auto w-full max-w-7xl">
        <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-6 ring-1 ring-white/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <Award className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-black">Selos de usuarios</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Busque usuarios e conceda ou remova selos manualmente sem acessar o Supabase.
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 ring-1 ring-blue-300/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-100" />
                <h2 className="text-xl font-black text-white">Recomendacoes de Selo Comunidade</h2>
                <span className="rounded-full border border-blue-200/20 bg-black/20 px-3 py-1 text-xs font-black text-blue-100">
                  {suggestionCandidates.length} candidatos
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-50/80">
                Usuarios com participacao real na plataforma que podem merecer o Selo Comunidade. A concessao continua manual.
              </p>
              {metricsUsed.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-blue-100/60">
                  Metricas usadas: {metricsUsed.join(', ')}.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => loadSuggestions()}
              disabled={suggestionsLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {suggestionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Atualizar sugestoes
            </button>
          </div>

          {suggestionWarnings.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
              {suggestionWarnings.join(' | ')}
            </div>
          )}

          <div className="mt-4 grid gap-3">
            {suggestionsLoading && suggestionCandidates.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-3xl border border-white/10 bg-black/25 p-6 text-blue-100">
                <Loader2 className="h-5 w-5 animate-spin" />
                Calculando recomendacoes...
              </div>
            ) : suggestionCandidates.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-center text-sm font-semibold text-blue-100/75">
                Nenhum candidato encontrado ainda.
              </div>
            ) : (
              suggestionCandidates.map((suggestion, index) => {
                const name = getSuggestionName(suggestion)
                const key = `grant-${suggestion.userId}-community`

                return (
                  <article key={suggestion.userId} className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          {suggestion.avatarUrl ? (
                            <img
                              src={suggestion.avatarUrl}
                              alt={name}
                              className="h-12 w-12 rounded-full border border-blue-300/20 object-cover"
                            />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-950/40 text-sm font-black text-blue-100">
                              {getInitial(name)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-black">#{index + 1}</span>
                              <h3 className="truncate text-lg font-black text-white">{name}</h3>
                              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-100">
                                Score {suggestion.score}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-blue-100/70">@{suggestion.username || 'sem-username'}</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">{suggestion.reason}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs font-black text-zinc-300 sm:grid-cols-3 xl:grid-cols-6">
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Posts: {suggestion.metrics.postsPublished}</span>
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Comentarios: {suggestion.metrics.commentsMade}</span>
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Curtidas recebidas: {suggestion.metrics.likesReceived}</span>
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Comentarios recebidos: {suggestion.metrics.commentsReceived}</span>
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Reposts recebidos: {suggestion.metrics.repostsReceived}</span>
                          <span className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">Dias ativos: {suggestion.metrics.activeDays}</span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:flex lg:grid lg:min-w-56">
                        <Link href={suggestion.username ? `/u/${suggestion.username}` : '/search'} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                          <UserRound className="h-3.5 w-3.5" />
                          Ver perfil
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            submitBadgeAction({
                              action: 'grant',
                              userId: suggestion.userId,
                              badgeSlug: 'community',
                              label: 'Comunidade',
                              reasonOverride: communitySuggestionReason,
                            })
                          }
                          disabled={updatingKey === key}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Conceder Selo Comunidade
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {alreadyAwardedCommunity.length > 0 && (
            <details className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-4">
              <summary className="cursor-pointer text-sm font-black text-blue-100">
                Ja possuem Selo Comunidade ({alreadyAwardedCommunity.length})
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {alreadyAwardedCommunity.map((suggestion) => (
                  <div key={suggestion.userId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-blue-50/80">
                    {getSuggestionName(suggestion)} - score {suggestion.score}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
          <form onSubmit={searchUsers} className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label>
              <span className="text-sm font-black text-zinc-200">Buscar usuario</span>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 focus-within:border-blue-300">
                <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="nome, username, @usuario ou e-mail"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </form>

          <label className="mt-4 block">
            <span className="text-sm font-black text-zinc-200">Motivo / observacao opcional</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Ex.: Usuario muito participativo na comunidade."
              className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
            />
          </label>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <span className="text-sm font-black text-zinc-200">Plano VIP manual</span>
              <select
                value={vipPlan}
                onChange={(event) => setVipPlan(event.target.value === 'vip_premium' ? 'vip_premium' : 'vip')}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-black text-white outline-none focus:border-blue-300"
              >
                <option value="vip">VIP</option>
                <option value="vip_premium">VIP Premium</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-black text-zinc-200">Periodo para concessao</span>
              <select
                value={vipDurationDays}
                onChange={(event) => setVipDurationDays(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-black text-white outline-none focus:border-blue-300"
              >
                {vipDurationOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div ref={searchResultsRef} className="mt-5 grid gap-3">
          {submittedSearch && (
            <section className="rounded-[2rem] border border-blue-300/20 bg-zinc-950/80 p-5 ring-1 ring-white/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white">Resultados da busca</h2>
                  <p className="mt-1 text-sm text-zinc-400">Termo buscado: {submittedSearch}</p>
                </div>
                <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                  {users.length} encontrado{users.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {searching ? (
                  <div className="flex items-center justify-center gap-2 rounded-3xl border border-white/10 bg-black/25 p-5 text-blue-100">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Buscando usuarios...
                  </div>
                ) : users.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-center text-sm font-semibold text-zinc-300">
                    Nenhum usuario encontrado.
                  </div>
                ) : (
                  users.map((user) => {
                    const name = getProfileName(user)
                    const selected = selectedUser?.id === user.id

                    return (
                      <article key={user.id} className="rounded-3xl border border-white/10 bg-black/25 p-4">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={name}
                                className="h-12 w-12 rounded-full border border-blue-300/20 object-cover"
                              />
                            ) : (
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-950/40 text-sm font-black text-blue-100">
                                {getInitial(name)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-black text-white">{name}</h3>
                              <p className="truncate text-sm text-zinc-500">@{user.username || 'sem-username'}</p>
                              {user.email && <p className="truncate text-sm text-zinc-500">{user.email}</p>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            disabled={selected}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                            {selected ? 'Selecionado' : 'Selecionar'}
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )}
        </div>

        <div className="mt-5 grid gap-4">
          {!selectedUser ? (
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-7 text-center text-zinc-400 ring-1 ring-white/5">
              <Sparkles className="mx-auto h-8 w-8 text-blue-100" />
              <p className="mt-3 font-black text-white">Nenhum usuario selecionado</p>
              <p className="mt-1 text-sm">Busque por nome, username, arroba ou e-mail para gerenciar selos.</p>
            </div>
          ) : (
            [selectedUser].map((user) => {
              const name = getProfileName(user)
              const currentBadgeSlugs = new Set(user.badges.map((item) => item.badge?.slug).filter(Boolean))
              const vipActive = isVipActive(user)

              return (
                <article key={user.id} className="rounded-[2rem] border border-white/10 bg-zinc-950/85 p-4 ring-1 ring-white/5 sm:p-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={name}
                            className="h-14 w-14 rounded-full border border-blue-300/20 object-cover"
                          />
                        ) : (
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-950/40 text-lg font-black text-blue-100">
                            {getInitial(name)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-black text-white">{name}</h2>
                          <p className="truncate text-sm text-zinc-500">@{user.username || 'sem-username'}</p>
                          {user.email && <p className="truncate text-sm text-zinc-500">{user.email}</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${getVipStatusClass(user)}`}>
                              VIP: {getVipStatusLabel(user)}
                            </span>
                            {user.vip_plan && (
                              <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                                Plano {user.vip_plan}
                              </span>
                            )}
                          </div>
                          {user.vip_expires_at && (
                            <p className="mt-2 text-xs font-semibold text-zinc-500">
                              Expira em {formatDate(user.vip_expires_at)}
                              {user.vip_source ? ` - origem ${user.vip_source}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Selos atuais</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {user.badges.length === 0 ? (
                            <span className="rounded-full border border-dashed border-white/10 px-3 py-1 text-xs font-semibold text-zinc-500">
                              Nenhum selo atual
                            </span>
                          ) : (
                            user.badges.map((item) => {
                              const badge = item.badge
                              if (!badge) return null

                              return (
                                <span key={item.id} className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                                  {badge.icon ? <img src={badge.icon} alt={badge.name} className="h-5 w-5 object-contain" /> : <Crown className="h-4 w-4" />}
                                  {badge.name}
                                </span>
                              )
                            })
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href={user.username ? `/u/${user.username}` : '/search'} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                          <UserRound className="h-3.5 w-3.5" />
                          Ver perfil
                        </Link>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100/70">VIP manual</p>
                        <div className="mt-3 grid gap-2">
                          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-amber-50/85">
                            <strong>Status:</strong> {getVipStatusLabel(user)}
                            {user.vip_expires_at ? ` - expira em ${formatDate(user.vip_expires_at)}` : ''}
                            {user.vip_source ? ` - origem ${user.vip_source}` : ''}
                          </div>
                          {user.vip_reason && (
                            <p className="text-xs leading-5 text-amber-50/70">Motivo atual: {user.vip_reason}</p>
                          )}
                          <div className="grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => submitVipAction({ action: 'grant_vip', userId: user.id, label: name })}
                              disabled={updatingKey === `grant_vip-${user.id}`}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {updatingKey === `grant_vip-${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
                              {vipActive ? 'Estender VIP' : 'Conceder VIP'}
                            </button>
                            <button
                              type="button"
                              onClick={() => submitVipAction({ action: 'cancel_vip', userId: user.id, label: name })}
                              disabled={!vipActive || updatingKey === `cancel_vip-${user.id}`}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingKey === `cancel_vip-${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MinusCircle className="h-3.5 w-3.5" />}
                              Cancelar VIP
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Conceder selo</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {grantableBadges.map((badge) => {
                            const alreadyHas = currentBadgeSlugs.has(badge.slug)
                            const key = `grant-${user.id}-${badge.slug}`

                            return (
                              <button
                                key={badge.id}
                                type="button"
                                onClick={() => submitBadgeAction({ action: 'grant', userId: user.id, badgeSlug: badge.slug, label: badge.name })}
                                disabled={alreadyHas || updatingKey === key}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-xs font-black text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {alreadyHas ? `${badge.name} atual` : `Conceder ${badge.name}`}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Remover selo</p>
                        <div className="mt-3 grid gap-2">
                          {user.badges.length === 0 ? (
                            <p className="text-sm text-zinc-500">Nenhum selo para remover.</p>
                          ) : (
                            user.badges.map((item) => {
                              const badge = item.badge
                              if (!badge) return null
                              const key = `revoke-${user.id}-${item.id}`

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => submitBadgeAction({ action: 'revoke', userId: user.id, userBadgeId: item.id, label: badge.name })}
                                  disabled={updatingKey === key}
                                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {updatingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MinusCircle className="h-3.5 w-3.5" />}
                                  Remover {badge.name}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>

                      {user.badges.length > 0 && (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Historico atual</p>
                          <div className="mt-2 grid gap-2">
                            {user.badges.map((item) => (
                              <p key={item.id} className="text-xs leading-5 text-zinc-400">
                                {item.badge?.name || 'Selo'} concedido em {formatDate(item.awardedAt)}
                                {item.reason ? ` - ${item.reason}` : ''}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
