import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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

  it('keeps the public landing page behind session restoration', () => {
    const gate = readFileSync('app/components/RootSessionGate.tsx', 'utf8')

    expect(gate).toContain("const [checkingSession, setCheckingSession] = useState(true)")
    expect(gate).toContain('if (checkingSession)')
    expect(gate).toContain('router.replace(getAuthenticatedDestination(repaired.profile))')
  })

  it('renders the public homepage only after a sessionless check', () => {
    const gate = readFileSync('app/components/RootSessionGate.tsx', 'utf8')

    expect(gate).toContain('if (!session?.user)')
    expect(gate).toContain('setCheckingSession(false)')
  })

  it('keeps the login session destination rules on the shared resolver', () => {
    const loginPage = readFileSync('app/login/page.tsx', 'utf8')

    expect(loginPage).toContain("import { getAuthenticatedDestination } from '@/lib/auth/authenticated-destination'")
    expect(loginPage).toContain('const destination = getAuthenticatedDestination(repaired.profile)')
  })
})
