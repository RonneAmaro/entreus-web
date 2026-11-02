import type { SupabaseClient } from '@supabase/supabase-js'

/** One-time upgrade, on this origin only, using the supported SDK validation API. */
export async function migrateLegacySession(client: SupabaseClient, storage: Storage, key: string) {
  const existing = await client.auth.getSession()
  if (existing.data.session) { storage.removeItem(key); return false }
  const raw = storage.getItem(key)
  if (!raw) return false
  let legacy: { access_token?: string; refresh_token?: string }
  try { legacy = JSON.parse(raw) } catch { return false }
  if (typeof legacy.access_token !== 'string' || typeof legacy.refresh_token !== 'string') return false
  const { data, error } = await client.auth.setSession({ access_token: legacy.access_token, refresh_token: legacy.refresh_token })
  if (error || !data.session) return false
  storage.removeItem(key)
  return true
}
