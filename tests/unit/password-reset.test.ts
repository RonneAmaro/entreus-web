import { describe, expect, it } from 'vitest'
import {
  getPasswordResetValidationMessage,
  PASSWORD_RESET_MIN_LENGTH,
} from '../../lib/auth/password-reset'

describe('password reset validation', () => {
  it('requires a new password', () => {
    expect(getPasswordResetValidationMessage('', '')).toBe('Digite uma nova senha.')
  })

  it('requires the configured minimum length', () => {
    expect(getPasswordResetValidationMessage('curta', 'curta')).toBe(
      `Sua nova senha precisa ter pelo menos ${PASSWORD_RESET_MIN_LENGTH} caracteres.`,
    )
  })

  it('requires matching password confirmation', () => {
    expect(getPasswordResetValidationMessage('senha-segura', 'senha-diferente')).toBe(
      'As senhas digitadas não são iguais.',
    )
  })

  it('accepts matching valid passwords', () => {
    expect(getPasswordResetValidationMessage('senha-segura', 'senha-segura')).toBeNull()
  })
})
