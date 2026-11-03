import { createBrowserClient } from '@supabase/ssr'

/** The SDK owns the browser singleton, cookie persistence and refresh locking. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { secure: typeof window !== 'undefined' && window.location.protocol === 'https:' } },
  )
}
