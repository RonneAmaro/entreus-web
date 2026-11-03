import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedDestination } from './authenticated-destination'

const protectedRoots = new Set([
  'feed', 'profile', 'messages', 'age-verification', 'settings', 'notifications',
  'saved', 'search', 'wallet', 'buy-itacash', 'gifts', 'editor', 'creator-dashboard',
  'creator-studio', 'admin', 'complete-profile', 'account-pending',
])

export function isProtectedPath(pathname: string) {
  return protectedRoots.has(pathname.split('/')[1])
}

export function isMissingOrInvalidSession(error: { name?: string; status?: number; code?: string } | null) {
  return !error || error.name === 'AuthSessionMissingError' || error.status === 401 ||
    ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'user_not_found', 'bad_jwt'].includes(error.code || '')
}

/** A profile read failure is not an incomplete account, and never signs anyone out. */
export async function readAuthenticatedDestination(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('profiles')
    .select('id, username, birth_date, is_minor, parental_consent_status')
    .eq('id', userId).maybeSingle()
  if (error) throw new Error('Não foi possível carregar sua conta. Tente novamente.')
  return getAuthenticatedDestination(data)
}

export async function resolveEntryDestination(client: SupabaseClient) {
  const { data: { user }, error } = await client.auth.getUser()
  if (error && !isMissingOrInvalidSession(error)) {
    throw new Error('Não foi possível verificar sua sessão. Tente novamente.')
  }
  return user ? readAuthenticatedDestination(client, user.id) : null
}
