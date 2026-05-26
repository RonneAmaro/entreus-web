'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PendingOAuthProfile = {
  birth_date?: string
  is_minor?: boolean
  parental_consent_status?: string
  wants_18_plus?: boolean
  age_verification_status?: string
}

function readPendingOAuthProfile() {
  if (typeof window === 'undefined') return null

  const rawValue = window.sessionStorage.getItem('entreus_oauth_signup_profile')
  if (!rawValue) return null

  try {
    return JSON.parse(rawValue) as PendingOAuthProfile
  } catch {
    return null
  }
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Conectando sua conta...')

  useEffect(() => {
    let cancelled = false

    async function finishOAuthLogin() {
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          if (!cancelled) setMessage('Nao foi possivel confirmar o login social. Tente novamente.')
          return
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!cancelled) setMessage('Sessao nao encontrada. Volte ao login e tente novamente.')
        return
      }

      const pendingProfile = readPendingOAuthProfile()
      const metadata = user.user_metadata || {}
      const fallbackName =
        typeof metadata.full_name === 'string'
          ? metadata.full_name
          : typeof metadata.name === 'string'
            ? metadata.name
            : null
      const fallbackAvatar =
        typeof metadata.avatar_url === 'string'
          ? metadata.avatar_url
          : typeof metadata.picture === 'string'
            ? metadata.picture
            : null

      const { data: existingProfile, error: loadProfileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, birth_date')
        .eq('id', user.id)
        .maybeSingle()

      if (loadProfileError && !cancelled) {
        setMessage('Login confirmado, mas nao foi possivel carregar seu perfil.')
        return
      }

      const profilePayload = existingProfile
        ? {
            id: user.id,
            display_name: existingProfile.display_name || fallbackName,
            avatar_url: existingProfile.avatar_url || fallbackAvatar,
            ...(pendingProfile?.birth_date && !existingProfile.birth_date
              ? {
                  birth_date: pendingProfile.birth_date,
                  is_minor: pendingProfile.is_minor || false,
                  parental_consent_status: pendingProfile.parental_consent_status || 'not_required',
                  wants_18_plus: pendingProfile.wants_18_plus || false,
                  show_sensitive_content: false,
                  age_verification_status: pendingProfile.age_verification_status || 'not_started',
                }
              : {}),
            updated_at: new Date().toISOString(),
          }
        : {
            id: user.id,
            display_name: fallbackName,
            avatar_url: fallbackAvatar,
            birth_date: pendingProfile?.birth_date || null,
            is_minor: pendingProfile?.is_minor || false,
            parental_consent_status: pendingProfile?.parental_consent_status || 'not_required',
            wants_18_plus: pendingProfile?.wants_18_plus || false,
            show_sensitive_content: false,
            age_verification_status: pendingProfile?.age_verification_status || 'not_started',
            updated_at: new Date().toISOString(),
          }

      const { error: profileError } = await supabase.from('profiles').upsert(profilePayload)

      if (profileError && !cancelled) {
        setMessage('Login confirmado, mas nao foi possivel preparar o perfil automaticamente.')
        return
      }

      window.sessionStorage.removeItem('entreus_oauth_signup_profile')

      if (!cancelled) {
        router.replace(pendingProfile?.is_minor ? '/account-pending' : '/feed')
      }
    }

    finishOAuthLogin()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-black">EntreUS</h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      </div>
    </main>
  )
}
