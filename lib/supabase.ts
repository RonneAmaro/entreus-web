import { createClient } from './supabase/client'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'

// Compatibility facade: queries and Realtime use the same cookie-backed client.
export const supabase = createClient()

/** UI identity only. Server handlers and RLS still verify every protected operation. */
export async function getBrowserUser() {
  const verified = await supabase.auth.getUser()
  if (!isAuthRetryableFetchError(verified.error)) return verified
  // A temporarily unreachable Auth service must not bounce a mounted page to login.
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { data: { user: session.user }, error: null } : verified
}

export type SocialAuthProvider = 'google' | 'facebook'

export function getSocialAuthRedirectTo() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}/auth/callback`
}

export function signInWithSocialProvider(provider: SocialAuthProvider) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getSocialAuthRedirectTo(),
    },
  })
}
