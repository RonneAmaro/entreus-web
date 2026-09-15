'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthenticatedDestination } from '@/lib/auth/authenticated-destination'
import { ensureProfile } from '@/lib/auth/ensure-profile'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'

export function RootSessionGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { t } = useLanguage()
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) return

      if (!session?.user) {
        setCheckingSession(false)
        return
      }

      const repaired = await ensureProfile(supabase as never, session.user.id)
      if (!active) return

      router.replace(getAuthenticatedDestination(repaired.profile))
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [router])

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
        <p role="status" aria-live="polite">{t('auth.login.checkingSession')}</p>
      </main>
    )
  }

  return children
}
