'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { migrateLegacySession } from '@/lib/auth/legacy-session'

let migration: Promise<boolean> | undefined

export default function LegacySessionMigration() {
  useEffect(() => {
    const key = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
    // The old browser-only release cannot send its session to the server.
    // Retire that storage once; all subsequent visits use SSR cookies exclusively.
    try {
      if (!window.localStorage.getItem(key)) return
      migration ??= migrateLegacySession(supabase, window.localStorage, key)
      void migration.then((migrated) => { if (migrated) window.location.reload() }).catch(() => {
        // Keep the legacy session available for a later attempt after a network failure.
        migration = undefined
      })
    } catch { /* Storage may be unavailable in restricted browser contexts. */ }
  }, [])
  return null
}
