import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from '../../lib/auth/auth-error-messages'

describe('auth error messages', () => {
  it('hides Supabase technical errors', () => {
    expect(getAuthErrorMessage({ message: 'User already registered' })).toContain('já possui uma conta')
    expect(getAuthErrorMessage({ message: 'Invalid login credentials' })).toContain('E-mail ou senha incorretos')
    expect(getAuthErrorMessage({ message: 'Password should be at least 6 characters' })).toContain('pelo menos 8')
    expect(getAuthErrorMessage({ message: 'unknown' })).toContain('Não conseguimos')
  })
})
