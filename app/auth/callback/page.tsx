'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { blocksMinorAccess, isProfileIncomplete, sanitizeUsername } from '@/lib/profile-completion'

type PendingOAuthProfile = {
  birth_date?: string
  accepted_terms?: boolean
  is_minor?: boolean
  parental_consent_status?: string
  wants_18_plus?: boolean
  age_verification_status?: string
}

type ExistingProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  birth_date: string | null
  is_minor: boolean | null
  parental_consent_status: string | null
}

const PROFILE_FINALIZE_ERROR =
  'Seu login Google foi confirmado, mas nao conseguimos finalizar seu perfil. Tente novamente ou entre com email e senha.'

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

function logAuthCallbackError(stage: string, error: unknown) {
  console.error(`[auth/callback] ${stage}`, error)
}

function getMetadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function buildUsernameCandidates(userId: string, email: string | null | undefined, displayName: string | null) {
  const emailPrefix = email?.split('@')[0] || ''
  const baseUsername = sanitizeUsername(displayName || emailPrefix)
  const shortId = userId.replace(/-/g, '').slice(0, 8)
  const fallbackBase = `user_${shortId}`
  const preferred = baseUsername || fallbackBase

  return Array.from(
    new Set([
      preferred,
      `${preferred}_${shortId}`.slice(0, 30),
      fallbackBase,
    ]),
  )
}

async function getAvailableUsername(userId: string, email: string | null | undefined, displayName: string | null) {
  const candidates = buildUsernameCandidates(userId, email, displayName)

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .neq('id', userId)
      .maybeSingle()

    if (error) {
      logAuthCallbackError('profiles username availability check failed', error)
      continue
    }

    if (!data) return candidate
  }

  return `user_${userId.replace(/-/g, '').slice(0, 12)}`.slice(0, 30)
}

function isUsernameConflict(error: { code?: string; message?: string } | null) {
  if (!error) return false

  const message = error.message || ''
  return error.code === '23505' || message.toLowerCase().includes('username')
}

async function insertProfileWithUsernameRetry(
  userId: string,
  candidates: string[],
  payload: Record<string, unknown>,
) {
  let lastError: { code?: string; message?: string } | null = null

  for (const username of candidates) {
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        ...payload,
        username,
      })

    if (!error) return null

    lastError = error
    logAuthCallbackError('profiles insert failed for username candidate', {
      username,
      error,
    })

    if (!isUsernameConflict(error)) break
  }

  return lastError
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
          logAuthCallbackError('exchangeCodeForSession failed', error)
          if (!cancelled) setMessage('Nao foi possivel confirmar o login social. Tente novamente.')
          return
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        logAuthCallbackError('getUser failed', userError)
      }

      if (!user) {
        if (!cancelled) setMessage('Sessao nao encontrada. Volte ao login e tente novamente.')
        return
      }

      const pendingProfile = readPendingOAuthProfile()
      const metadata = user.user_metadata || {}
      const fallbackName =
        getMetadataText(metadata, ['full_name', 'name']) ||
        user.email?.split('@')[0] ||
        'Usuario EntreUS'
      const fallbackAvatar = getMetadataText(metadata, ['avatar_url', 'picture'])

      const { data: existingProfile, error: loadProfileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, birth_date, is_minor, parental_consent_status')
        .eq('id', user.id)
        .maybeSingle()

      if (loadProfileError && !cancelled) {
        logAuthCallbackError('profiles select failed', loadProfileError)
        setMessage(PROFILE_FINALIZE_ERROR)
        return
      }

      const typedExistingProfile = existingProfile as ExistingProfile | null
      const usernameCandidates = buildUsernameCandidates(user.id, user.email, fallbackName)
      const username =
        typedExistingProfile?.username ||
        (await getAvailableUsername(user.id, user.email, fallbackName))
      const baseProfilePayload = {
        username,
        display_name: typedExistingProfile?.display_name || fallbackName,
        avatar_url: typedExistingProfile?.avatar_url || fallbackAvatar,
        updated_at: new Date().toISOString(),
      }
      const pendingProfilePayload =
        pendingProfile?.birth_date && !typedExistingProfile?.birth_date
          ? {
              birth_date: pendingProfile.birth_date,
              is_minor: pendingProfile.is_minor || false,
              parental_consent_status: pendingProfile.parental_consent_status || 'not_required',
              wants_18_plus: pendingProfile.wants_18_plus || false,
              show_sensitive_content: false,
              age_verification_status: pendingProfile.age_verification_status || 'not_started',
            }
          : {}
      const profilePayload = {
        ...baseProfilePayload,
        ...pendingProfilePayload,
      }

      const profileError = typedExistingProfile
        ? (
            await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('id', user.id)
          ).error
        : await insertProfileWithUsernameRetry(
            user.id,
            Array.from(new Set([username, ...usernameCandidates])),
            {
              ...profilePayload,
              ...(pendingProfile?.birth_date
                ? {}
                : {
                    is_minor: false,
                    parental_consent_status: 'not_required',
                    wants_18_plus: false,
                    show_sensitive_content: false,
                    age_verification_status: 'not_started',
                  }),
            },
          )

      if (profileError && !cancelled) {
        logAuthCallbackError(typedExistingProfile ? 'profiles update failed' : 'profiles insert failed', profileError)
        setMessage(PROFILE_FINALIZE_ERROR)
        return
      }

      window.sessionStorage.removeItem('entreus_oauth_signup_profile')

      if (!cancelled) {
        const completedProfile = {
          username,
          birth_date:
            pendingProfilePayload.birth_date ||
            typedExistingProfile?.birth_date ||
            null,
          is_minor:
            pendingProfilePayload.is_minor ??
            typedExistingProfile?.is_minor ??
            false,
          parental_consent_status:
            pendingProfilePayload.parental_consent_status ||
            typedExistingProfile?.parental_consent_status ||
            'not_required',
        }

        if (isProfileIncomplete(completedProfile)) {
          router.replace('/complete-profile')
          return
        }

        router.replace(blocksMinorAccess(completedProfile) ? '/account-pending' : '/feed')
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
