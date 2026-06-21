import { describe, expect, it } from 'vitest'
import { ensureProfile } from '../../lib/auth/ensure-profile'

describe('ensureProfile', () => {
  it('keeps an existing profile unchanged', async () => {
    const profile = { id: 'u1', username: 'ana' }
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }), upsert: async () => ({ error: null }) }) }
    await expect(ensureProfile(client, 'u1')).resolves.toMatchObject({ profile, created: false })
  })
})
