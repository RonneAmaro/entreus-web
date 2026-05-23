'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import BrandHeader from '../components/BrandHeader'
import UserBadges from '../components/UserBadges'
import Link from 'next/link'
import { Search, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  show_sensitive_content?: boolean | null
}

function getInitial(text: string) {
  if (!text) return 'U'
  return text.slice(0, 1).toUpperCase()
}

export default function SearchPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])

  const [currentUserId, setCurrentUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setCurrentUserId(user.id)
      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, show_sensitive_content')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setCurrentProfile({
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: profileData.avatar_url,
          show_sensitive_content: profileData.show_sensitive_content || false,
        })
      }

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      await Promise.all([
        loadInitialProfiles(user.id, blockedIds),
        loadUnreadNotificationsCount(user.id),
      ])

      setLoading(false)
    }

    checkUser()
  }, [router])

  async function loadUnreadNotificationsCount(userId: string) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      setMessage('Erro ao carregar notificações: ' + error.message)
      return
    }

    setUnreadNotificationsCount(count || 0)
  }

  async function loadBlockedUserIds(userId: string) {
    const { data: blockedByMe, error: blockedByMeError } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId)

    if (blockedByMeError) {
      setMessage('Erro ao carregar bloqueios: ' + blockedByMeError.message)
      return []
    }

    const { data: blockedMe, error: blockedMeError } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', userId)

    if (blockedMeError) {
      setMessage('Erro ao carregar bloqueios: ' + blockedMeError.message)
      return []
    }

    const ids = new Set<string>()

    for (const item of blockedByMe || []) {
      if (item.blocked_id) ids.add(item.blocked_id)
    }

    for (const item of blockedMe || []) {
      if (item.blocker_id) ids.add(item.blocker_id)
    }

    return Array.from(ids)
  }

  function filterBlockedProfiles(
    allProfiles: Profile[],
    userId: string,
    blockedIds: string[]
  ) {
    return allProfiles.filter(
      (profile) => profile.id !== userId && !blockedIds.includes(profile.id)
    )
  }

  async function loadInitialProfiles(
    userId = currentUserId,
    blockedIds = blockedUserIds
  ) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      setMessage('Erro ao carregar usuários: ' + error.message)
      return
    }

    const filteredProfiles = filterBlockedProfiles(data || [], userId, blockedIds)
    setProfiles(filteredProfiles)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setMessage('')
      await loadInitialProfiles()
      return
    }

    setSearching(true)
    setMessage('')

    const normalizedQuery = trimmedQuery.replace('@', '').toLowerCase()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url')
      .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${trimmedQuery}%`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      setMessage('Erro ao buscar usuários: ' + error.message)
      setSearching(false)
      return
    }

    const filteredProfiles = filterBlockedProfiles(data || [], currentUserId, blockedUserIds)
    setProfiles(filteredProfiles)

    if (!filteredProfiles || filteredProfiles.length === 0) {
      setMessage('Nenhum usuário encontrado.')
    }

    setSearching(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <p>Carregando busca...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={currentProfile?.display_name || currentProfile?.username || 'Minha conta'}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full max-w-4xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(104px+((100vw-104px-56rem)/2))] lg:py-8">
        <BrandHeader
          subtitle="Explorar"
          description="Busque pessoas pelo nome ou @username e descubra novos perfis para seguir."
          compact
        />

        <form
          onSubmit={handleSearch}
          className="mt-5 rounded-[1.75rem] border border-zinc-200/70 bg-white/90 p-5 shadow-sm shadow-black/5 ring-1 ring-black/5 backdrop-blur dark:border-zinc-800/70 dark:bg-slate-950/80 dark:ring-white/10 sm:p-6"
        >
          <label className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <Search className="h-4 w-4" />
            Buscar por nome ou @username
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: Ronne ou @ronneamaro"
              className="flex-1 rounded-2xl border border-zinc-300/80 bg-zinc-50/80 px-4 py-3 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700/80 dark:bg-black/30 dark:focus:bg-zinc-950"
            />

            <button
              type="submit"
              disabled={searching}
              className={`rounded-xl px-6 py-3 font-medium transition ${
                searching
                  ? 'cursor-not-allowed bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                  : 'bg-blue-500 text-white shadow-sm shadow-blue-500/25 hover:-translate-y-0.5 hover:bg-blue-400 active:scale-95'
              }`}
            >
              {searching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {message && (
            <p className="mt-4 rounded-2xl border border-zinc-200/70 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800/70 dark:bg-black/30 dark:text-zinc-300">
              {message}
            </p>
          )}
        </form>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {profiles.length === 0 && !message && (
            <div className="rounded-[1.75rem] border border-blue-200/70 bg-white/90 p-7 text-center text-zinc-500 shadow-sm shadow-blue-500/5 ring-1 ring-black/5 backdrop-blur dark:border-blue-400/15 dark:bg-slate-950/80 dark:text-zinc-400 dark:ring-white/10 md:col-span-2">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200/70 dark:bg-blue-950/35 dark:text-blue-300 dark:ring-blue-900/60">
                <Search className="h-7 w-7" />
              </span>
              <p className="font-black text-zinc-900 dark:text-white">Comece uma busca</p>
              <p className="mt-1 text-sm">Digite um nome ou @username para encontrar pessoas na EntreUS.</p>
              Nenhum usuário para mostrar.
            </div>
          )}

          {profiles.map((profile) => {
            const displayName = profile.display_name || profile.username

            return (
              <Link
                key={profile.id}
                href={`/u/${profile.username}`}
                className="group rounded-[1.5rem] border border-zinc-200/70 bg-white/90 p-5 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:border-blue-300/70 hover:shadow-lg hover:shadow-blue-500/10 dark:border-zinc-800/70 dark:bg-slate-950/80 dark:hover:border-blue-400/30"
              >
                <div className="flex items-start gap-4">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="h-14 w-14 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-14 w-14 rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <span className="m-auto">{getInitial(displayName)}</span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <UserBadges userId={profile.id} size="sm" max={1} />

                          <p className="truncate font-semibold text-black dark:text-white">
                            {displayName}
                          </p>
                        </div>

                        <p className="truncate text-sm text-zinc-500">
                          @{profile.username}
                        </p>
                      </div>

                      <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition group-hover:bg-blue-50 group-hover:text-blue-500 dark:bg-zinc-800 dark:group-hover:bg-blue-950/40 sm:flex">
                        <UserRound className="h-4 w-4" />
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {profile.bio?.trim() || 'Este usuário ainda não adicionou uma bio.'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
