import { describe, expect, it } from 'vitest'
import {
  MIN_WITHDRAWAL_ITACASH,
  canAdminUpdateCreatorWithdrawalStatus,
  canRequestWithdrawal,
  convertItaCashToBrl,
  formatWithdrawalPaymentDetailsSummary,
  formatWithdrawalStatus,
  getWithdrawalPaymentDetailsForAdmin,
  getWithdrawalPaymentMethodLabel,
  normalizeAdminCreatorWithdrawalAction,
  validatePixKeyType,
  validateWithdrawalAmount,
  validateWithdrawalRequestPayload,
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
    expect(formatWithdrawalStatus('reviewing')).toBe('Em analise')
    expect(formatWithdrawalStatus('approved')).toBe('Aprovado')
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

  it('accepts a valid Pix payment method', () => {
    expect(validateWithdrawalRequestPayload({
      amountItacash: 1000,
      paymentMethod: 'pix',
      pixKeyType: 'cpf',
      pixKey: '12345678901',
      holderName: 'Criador Pix',
    })).toMatchObject({
      ok: true,
      value: {
        paymentMethod: 'pix',
        paymentDetails: {
          method: 'pix',
          pixKeyType: 'cpf',
          holderName: 'Criador Pix',
        },
      },
    })
  })

  it('accepts a valid national bank transfer method', () => {
    expect(validateWithdrawalRequestPayload({
      amountItacash: 1000,
      paymentMethod: 'bank_transfer',
      bankHolderName: 'Criador Banco',
      bankDocument: '12345678901',
      bankName: 'Banco Teste',
      bankAgency: '0001',
      bankAccount: '12345-6',
      bankAccountType: 'checking',
    })).toMatchObject({
      ok: true,
      value: {
        paymentMethod: 'bank_transfer',
        paymentDetails: {
          method: 'bank_transfer',
          accountType: 'checking',
        },
      },
    })
  })

  it('accepts a valid international manual method', () => {
    expect(validateWithdrawalRequestPayload({
      amountItacash: 1000,
      paymentMethod: 'international_manual',
      internationalHolderName: 'Creator Abroad',
      internationalCountry: 'Portugal',
      internationalDesiredMethod: 'Wise manual',
      internationalNotes: 'Dados completos sob conferencia manual.',
    })).toMatchObject({
      ok: true,
      value: {
        paymentMethod: 'international_manual',
        paymentDetails: {
          method: 'international_manual',
          country: 'Portugal',
        },
      },
    })
  })

  it('rejects invalid payment methods', () => {
    expect(validateWithdrawalRequestPayload({
      amountItacash: 1000,
      paymentMethod: 'automatic_pix',
      pixKeyType: 'cpf',
      pixKey: '12345678901',
      holderName: 'Criador Pix',
    })).toMatchObject({
      ok: false,
      reason: 'invalid_payment_method',
    })
  })

  it('normalizes admin actions and permissions', () => {
    expect(normalizeAdminCreatorWithdrawalAction('approve')).toBe('approved')
    expect(normalizeAdminCreatorWithdrawalAction('reject')).toBe('rejected')
    expect(canAdminUpdateCreatorWithdrawalStatus(true, 'pending', 'reviewing')).toBe(true)
    expect(canAdminUpdateCreatorWithdrawalStatus(true, 'reviewing', 'approved')).toBe(true)
    expect(canAdminUpdateCreatorWithdrawalStatus(true, 'approved', 'paid')).toBe(true)
    expect(canAdminUpdateCreatorWithdrawalStatus(true, 'paid', 'rejected')).toBe(false)
    expect(canAdminUpdateCreatorWithdrawalStatus(false, 'pending', 'paid')).toBe(false)
  })

  it('formats payment method labels and summaries', () => {
    expect(getWithdrawalPaymentMethodLabel('pix')).toBe('Pix')
    expect(getWithdrawalPaymentMethodLabel('bank_transfer')).toBe('Transferencia bancaria nacional')
    expect(formatWithdrawalPaymentDetailsSummary('bank_transfer', {
      method: 'bank_transfer',
      holderName: 'Criador Banco',
      document: '12345678901',
      bank: 'Banco Teste',
      agency: '0001',
      account: '12345-6',
      accountType: 'checking',
    })).toBe('Transferencia bancaria nacional - Banco Teste - Conta corrente')
    expect(getWithdrawalPaymentDetailsForAdmin('pix', {
      method: 'pix',
      pixKeyType: 'email',
      pixKey: 'criador@example.com',
      holderName: 'Criador Pix',
    })).toEqual(expect.arrayContaining([
      { label: 'Tipo da chave Pix', value: 'E-mail' },
      { label: 'Chave Pix', value: 'criador@example.com' },
    ]))
  })
})
