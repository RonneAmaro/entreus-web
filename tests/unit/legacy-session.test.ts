import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { migrateLegacySession } from '@/lib/auth/legacy-session'

describe('same-origin legacy session upgrade', () => {
  function setup(cookieSession = false, migrationFails = false) {
    const storage = { getItem: vi.fn(() => JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' })), removeItem: vi.fn() }
    const api = { auth: {
      getSession: async () => ({ data: { session: cookieSession ? {} : null } }),
      setSession: vi.fn(async () => ({ data: { session: migrationFails ? null : {} }, error: migrationFails ? {} : null })),
    } }
    return { storage, api, run: () => migrateLegacySession(api as unknown as SupabaseClient, storage as unknown as Storage, 'legacy-key') }
  }
  it('validates via SDK before retiring old storage', async () => {
    const fixture = setup()
    expect(await fixture.run()).toBe(true)
    expect(fixture.api.auth.setSession).toHaveBeenCalledTimes(1)
    expect(fixture.storage.removeItem).toHaveBeenCalledWith('legacy-key')
  })
  it('keeps old storage if migration cannot validate', async () => {
    const fixture = setup(false, true)
    expect(await fixture.run()).toBe(false)
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })
  it('never replaces an existing cookie session with the old account', async () => {
    const fixture = setup(true)
    expect(await fixture.run()).toBe(false)
    expect(fixture.api.auth.setSession).not.toHaveBeenCalled()
  })
})
