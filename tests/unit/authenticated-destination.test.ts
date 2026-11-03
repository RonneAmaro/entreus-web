import { describe, expect, it } from 'vitest'
import { getAuthenticatedDestination } from '../../lib/auth/authenticated-destination'

describe('authenticated root destination', () => {
  it('sends a complete account to the feed', () => {
    expect(getAuthenticatedDestination({ id: 'user', username: 'ana', birth_date: '1990-01-01' })).toBe('/feed')
  })

  it('sends an incomplete account to profile completion', () => {
    expect(getAuthenticatedDestination({ id: 'user', username: null, birth_date: '1990-01-01' })).toBe('/complete-profile')
  })

  it('sends a minor without approved consent to the pending account page', () => {
    expect(getAuthenticatedDestination({ id: 'user', username: 'ana', birth_date: '2012-01-01', is_minor: true, parental_consent_status: 'pending' })).toBe('/account-pending')
  })

})
