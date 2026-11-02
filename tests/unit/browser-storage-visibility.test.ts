import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { describe, expect, it } from 'vitest'

describe('09E browser-only architecture diagnostic', () => {
  it('restores browser storage while the HTTP server sees no authenticated session', async () => {
    const persisted = new Map<string, string>()
    const key = 'sb-fixture-auth-token'
    persisted.set(key, JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: 4102444800, user: { id: 'fixture-user' } }))
    const options = { auth: { storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (key: string) => persisted.get(key) ?? null, setItem: (key: string, value: string) => { persisted.set(key, value) }, removeItem: (key: string) => { persisted.delete(key) } },
    } }
    const browser = createClient('https://fixture.invalid', 'fixture-key', options)
    expect(Boolean((await browser.auth.getSession()).data.session)).toBe(true)
    const reopened = createClient('https://fixture.invalid', 'fixture-key', options)
    expect(Boolean((await reopened.auth.getSession()).data.session)).toBe(true)
    const server = createServerClient('https://fixture.invalid', 'fixture-key', { cookies: { getAll: () => [], setAll: () => {} } })
    expect(Boolean((await server.auth.getUser()).data.user)).toBe(false)
    expect(persisted.has(key)).toBe(true)
  })
})
