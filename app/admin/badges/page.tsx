'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  vip_plus_badge_enabled?: boolean | null
  badges: UserBadge[]
}

type BadgesApiResponse = {
  ok: boolean
  badges?: Badge[]
  users?: UserProfile[]
  message?: string
  error?: string
}

const featuredBadgeSlugs = ['community', 'elder', 'vip', 'vip_premium']

function getInitial(text: string) {
  return (text || 'U').slice(0, 1).toUpperCase()
}

function getProfileName(profile: UserProfile) {
  return profile.display_name || profile.username || 'Usuario'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Data indisponivel'

  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch {
    return 'Data indisponivel'
  }
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
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [badges, setBadges] = useState<Badge[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])

  const grantableBadges = useMemo(() => {
    const bySlug = new Map(badges.map((badge) => [badge.slug, badge]))
    const featured = featuredBadgeSlugs.map((slug) => bySlug.get(slug)).filter((badge): badge is Badge => Boolean(badge))
    const rest = badges.filter((badge) => !featuredBadgeSlugs.includes(badge.slug))
    return [...featured, ...rest]
  }, [badges])

  const loadBadges = useCallback(async (searchQuery = query) => {
    setSearching(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage('Sessao expirada. Entre novamente para gerenciar selos.')
      setSearching(false)
      return
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
      } else {
        setBadges(data.badges || [])
        setUsers(data.users || [])
      }
    } catch {
      setMessage('Nao foi possivel conectar ao painel de selos agora.')
      setUsers([])
    } finally {
      setSearching(false)
    }
  }, [query])

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
      }
    }

    loadPage()
  }, [loadBadges, router])

  async function searchUsers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (query.trim().length < 2) {
      setMessage('Digite pelo menos 2 caracteres para buscar usuario.')
      return
    }

    await loadBadges(query)
  }

  async function submitBadgeAction(payload: {
    action: 'grant' | 'revoke'
    userId: string
    badgeSlug?: string
    userBadgeId?: string
    label: string
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
          reason: reason.trim() || null,
        }),
      })
      const data = (await response.json()) as BadgesApiResponse

      if (!response.ok || !data.ok) {
        setMessage(getFriendlyError(data.error))
      } else {
        setMessage(data.message || (payload.action === 'grant' ? 'Selo concedido com sucesso.' : 'Selo removido com sucesso.'))
        await loadBadges(query)
      }
    } catch {
      setMessage('Nao foi possivel atualizar selo agora.')
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

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
          <form onSubmit={searchUsers} className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label>
              <span className="text-sm font-black text-zinc-200">Buscar usuario</span>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 focus-within:border-blue-300">
                <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
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
        </section>

        <div className="mt-5 grid gap-4">
          {users.length === 0 ? (
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-7 text-center text-zinc-400 ring-1 ring-white/5">
              <Sparkles className="mx-auto h-8 w-8 text-blue-100" />
              <p className="mt-3 font-black text-white">Nenhum usuario selecionado</p>
              <p className="mt-1 text-sm">Busque por nome, username, arroba ou e-mail para gerenciar selos.</p>
            </div>
          ) : (
            users.map((user) => {
              const name = getProfileName(user)
              const currentBadgeSlugs = new Set(user.badges.map((item) => item.badge?.slug).filter(Boolean))

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
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
                              VIP: {user.vip_status || 'indisponivel'}
                            </span>
                            {user.vip_plan && (
                              <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                                Plano {user.vip_plan}
                              </span>
                            )}
                          </div>
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
