'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import VideoEditor from '../components/VideoEditor'
import { supabase } from '@/lib/supabase'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export default function EditorPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    loadNavigationShell()
  }, [])

  async function loadNavigationShell() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    setEmail(user.email || '')

    await Promise.all([
      loadNavigationProfile(user.id),
      loadUnreadNotificationsCount(user.id),
    ])
  }

  async function loadNavigationProfile(currentUserId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', currentUserId)
      .maybeSingle()

    if (!data) return

    setCurrentProfile({
      username: data.username,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
    })
  }

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    setUnreadNotificationsCount(count || 0)
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

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={currentProfile?.display_name || currentProfile?.username || undefined}
        username={currentProfile?.username || null}
        email={email}
        avatarUrl={currentProfile?.avatar_url || null}
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

      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-20 pb-24 sm:px-6 lg:ml-[104px] lg:max-w-[calc(80rem-104px)] lg:px-8 lg:py-6">
        <header className="relative z-10 mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-300">
            Creator Studio
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Editar video
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-zinc-500 sm:text-base">
            Adicione texto, audio e efeitos.
          </p>
        </header>

        <div className="relative z-10">
          <VideoEditor />
        </div>
      </section>
    </main>
  )
}
