'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const protectedRoutes = [
  '/feed',
  '/messages',
  '/notifications',
  '/wallet',
  '/gifts',
  '/buy-itacash',
  '/suggestions',
  '/challenges',
  '/saved',
  '/search',
  '/meet',
  '/post',
  '/u',
]

function isProtectedPath(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function blocksMinorAccess(profile: { is_minor: boolean | null; parental_consent_status: string | null } | null) {
  return Boolean(profile?.is_minor && profile.parental_consent_status !== 'approved')
}

export default function ParentalAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  const shouldCheck = useMemo(() => isProtectedPath(pathname || ''), [pathname])

  useEffect(() => {
    let active = true

    async function checkAccess() {
      if (!shouldCheck) {
        setAllowed(true)
        return
      }

      setAllowed(false)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        setAllowed(true)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_minor, parental_consent_status')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      if (blocksMinorAccess(profile)) {
        router.replace('/account-pending')
        return
      }

      setAllowed(true)
    }

    checkAccess()

    return () => {
      active = false
    }
  }, [router, shouldCheck, pathname])

  if (!shouldCheck || allowed) {
    return <>{children}</>
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-blue-500/20 bg-zinc-950/95 p-6 text-center shadow-2xl shadow-blue-950/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Verificando acesso</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Estamos confirmando se sua conta ja tem autorizacao do responsavel.
        </p>
      </div>
    </main>
  )
}
