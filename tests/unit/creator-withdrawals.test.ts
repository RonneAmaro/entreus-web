import { describe, expect, it } from 'vitest'
import {
  MIN_WITHDRAWAL_ITACASH,
  canRequestWithdrawal,
  convertItaCashToBrl,
  formatWithdrawalStatus,
  validatePixKeyType,
  validateWithdrawalAmount,
} from '../../lib/creator-withdrawals'

describe('creator withdrawals helper', () => {
  it('accepts 1000 ItaCash as the minimum valid withdrawal', () => {
    expect(validateWithdrawalAmount(MIN_WITHDRAWAL_ITACASH)).toMatchObject({
      ok: true,
      value: {
        amountItacash: 1000,
        amountBrl: 100,
      },
    })
  })

  it('rejects 999 ItaCash', () => {
    expect(validateWithdrawalAmount(999)).toMatchObject({
      ok: false,
      reason: 'minimum_amount',
    })
  })

  it('rejects zero, negative and decimal amounts', () => {
    expect(validateWithdrawalAmount(0)).toMatchObject({ ok: false, reason: 'invalid_amount' })
    expect(validateWithdrawalAmount(-1)).toMatchObject({ ok: false, reason: 'invalid_amount' })
    expect(validateWithdrawalAmount('1000.5')).toMatchObject({ ok: false, reason: 'invalid_amount' })
  })

  it('converts 1000 ItaCash to R$ 100.00', () => {
    expect(convertItaCashToBrl(1000)).toBe(100)
  })

  it('validates Pix key types', () => {
    expect(validatePixKeyType('cpf')).toBe(true)
    expect(validatePixKeyType('email')).toBe(true)
    expect(validatePixKeyType('bank_account')).toBe(false)
  })

  it('formats withdrawal statuses', () => {
    expect(formatWithdrawalStatus('pending')).toBe('Pendente')
    expect(formatWithdrawalStatus('paid')).toBe('Pago')
    expect(formatWithdrawalStatus('rejected')).toBe('Recusado')
    expect(formatWithdrawalStatus('cancelled')).toBe('Cancelado')
  })

  it('detects insufficient and sufficient balances', () => {
    expect(validateWithdrawalAmount(1000, 999)).toMatchObject({
      ok: false,
      reason: 'insufficient_balance',
    })

    expect(validateWithdrawalAmount(1000, 1000)).toMatchObject({ ok: true })
    expect(canRequestWithdrawal(999)).toBe(false)
    expect(canRequestWithdrawal(1000)).toBe(true)
  })
})
