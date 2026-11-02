import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isProtectedPath, resolveEntryDestination } from '@/lib/auth/session-routing'
import { signOutCurrentBrowser } from '@/lib/auth/logout'

function client(profile: unknown, user: unknown = { id: 'user' }, authError: unknown = null, profileError: unknown = null) {
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: profileError }) }) }) }))
  return { auth: { getUser: vi.fn(async () => ({ data: { user }, error: authError })) }, from } as unknown as SupabaseClient
}

describe('verified entry routing used by root and login', () => {
  it('guest keeps the public page without a profile lookup', async () => {
    const api = client(null, null)
    expect(await resolveEntryDestination(api)).toBeNull()
    expect(api.from).not.toHaveBeenCalled()
  })
  it.each(['/', '/login'])('complete user entering %s goes to feed', async () => {
    expect(await resolveEntryDestination(client({ username: 'ana', birth_date: '1990-01-01' }))).toBe('/feed')
  })
  it('missing account goes to completion', async () => {
    expect(await resolveEntryDestination(client(null))).toBe('/complete-profile')
  })
  it('incomplete account goes to completion', async () => {
    expect(await resolveEntryDestination(client({ username: '', birth_date: null }))).toBe('/complete-profile')
  })
  it('minor awaiting approval goes to pending', async () => {
    expect(await resolveEntryDestination(client({ username: 'ana', birth_date: '2012-01-01', is_minor: true, parental_consent_status: 'pending' }))).toBe('/account-pending')
  })
  it('temporary auth failure does not masquerade as a guest', async () => {
    await expect(resolveEntryDestination(client(null, null, { status: 503 }))).rejects.toThrow('verificar sua')
  })
  it('temporary profile failure does not masquerade as incomplete', async () => {
    await expect(resolveEntryDestination(client(null, { id: 'user' }, null, { code: 'unavailable' }))).rejects.toThrow('carregar sua conta')
  })
  it.each(['/feed', '/profile', '/messages/123', '/age-verification', '/settings', '/admin/finance'])('protects %s', (path) => {
    expect(isProtectedPath(path)).toBe(true)
  })
  it.each(['/', '/login', '/vip-plus', '/meet', '/u/ana', '/feed-public'])('keeps %s public', (path) => {
    expect(isProtectedPath(path)).toBe(false)
  })
  it('explicit logout ends only the local session and navigates to login', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    const navigate = vi.fn()
    expect(await signOutCurrentBrowser({ signOut } as unknown as SupabaseClient['auth'], navigate)).toBe(true)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(navigate).toHaveBeenCalledWith('/login')
  })
  it('failed logout does not navigate to login', async () => {
    const navigate = vi.fn()
    expect(await signOutCurrentBrowser({ signOut: async () => ({ error: new Error() }) } as unknown as SupabaseClient['auth'], navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
