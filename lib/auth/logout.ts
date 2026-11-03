import type { SupabaseClient } from '@supabase/supabase-js'

export async function signOutCurrentBrowser(auth: SupabaseClient['auth'], navigate: (path: string) => void) {
  const { error } = await auth.signOut({ scope: 'local' })
  if (error) return false
  navigate('/login')
  return true
}
