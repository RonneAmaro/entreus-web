'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import VideoEditor from '../components/VideoEditor'
import { supabase, getBrowserUser } from '@/lib/supabase'
import { signOutCurrentBrowser } from '@/lib/auth/logout'

const subscribeToHydration = () => () => {}

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export default function EditorPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false)
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadNavigationShell() {
      const { data: { user } } = await getBrowserUser()
      if (cancelled) return
      if (!user) {
        router.push('/login')
        return
      }
      setEmail(user.email || '')
      const [profileResult, notificationsResult] = await Promise.all([
        supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).maybeSingle(),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
      ])
      if (cancelled) return
      if (profileResult.data) setCurrentProfile(profileResult.data)
      setUnreadNotificationsCount(notificationsResult.count || 0)
    }
    void loadNavigationShell()
    return () => { cancelled = true }
  }, [router])

  async function handleLogout() {
    await signOutCurrentBrowser(supabase.auth, (path) => window.location.replace(path))
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_55%_12%,rgba(49,78,184,0.22),transparent_42%),#080911] text-white">
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

      <section className="relative mx-auto min-h-screen w-full max-w-[90rem] px-2 py-16 pb-20 sm:px-5 lg:ml-[104px] lg:max-w-[calc(90rem-104px)] lg:px-6 lg:py-5">
        <div className="relative z-10">
          <VideoEditor />
        </div>
      </section>
    </main>
  )
}
