'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

export default function SearchPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState('')

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

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      setLoading(false)
      await loadInitialProfiles(user.id, blockedIds)
    }

    checkUser()
  }, [router])

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

  async function loadInitialProfiles(userId = currentUserId, blockedIds = blockedUserIds) {
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

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center">
        <p>Carregando busca...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Buscar usuários</p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/feed"
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Voltar ao feed
          </Link>

          <Link
            href="/profile"
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Meu perfil
          </Link>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-8">
        <form
          onSubmit={handleSearch}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 mb-6"
        >
          <label className="block mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            Buscar por nome ou @username
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: Ronne ou @ronneamaro"
              className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
            />

            <button
              type="submit"
              disabled={searching}
              className={`px-6 py-3 rounded-xl font-medium ${
                searching
                  ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                  : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
              }`}
            >
              {searching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {message && (
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
          )}
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.length === 0 && !message && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              Nenhum usuário para mostrar.
            </div>
          )}

          {profiles.map((profile) => {
            const displayName = profile.display_name || profile.username

            return (
              <Link
                key={profile.id}
                href={`/u/${profile.username}`}
                className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 hover:opacity-90 transition"
              >
                <div className="flex items-start gap-4">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="w-14 h-14 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="font-semibold text-black dark:text-white">
                      {displayName}
                    </p>
                    <p className="text-sm text-zinc-500">@{profile.username}</p>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-3">
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