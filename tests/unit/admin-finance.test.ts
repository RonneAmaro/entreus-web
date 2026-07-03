import { describe, expect, it } from 'vitest'
import {
  calculateFinancialSummary,
  formatCurrencyFromCents,
  getFinancialCategoryLabel,
  getFinancialCategoriesForKind,
  getFinancialRecordKindLabel,
  groupFinancialRecordsByMonth,
  parseCurrencyToCents,
  validateFinancialRecordInput,
  type FinancialRecord,
} from '../../lib/admin-finance'

const records: FinancialRecord[] = [
  {
    id: 'income-1',
    kind: 'income',
    category: 'itacash_sale',
    description: 'Venda ItaCash',
    amount_cents: 12500,
    currency: 'BRL',
    occurred_on: '2026-07-02',
    payment_method: 'Pix',
    reference_type: null,
    reference_id: null,
    notes: null,
  },
  {
    id: 'income-2',
    kind: 'income',
    category: 'manual_income',
    description: 'Receita manual',
    amount_cents: 7500,
    currency: 'BRL',
    occurred_on: '2026-07-12',
    payment_method: null,
    reference_type: null,
    reference_id: null,
    notes: null,
  },
  {
    id: 'expense-1',
    kind: 'expense',
    category: 'server',
    description: 'Servidor',
    amount_cents: 4300,
    currency: 'BRL',
    occurred_on: '2026-07-15',
    payment_method: 'Cartao',
    reference_type: null,
    reference_id: null,
    notes: null,
  },
  {
    id: 'expense-2',
    kind: 'expense',
    category: 'domain',
    description: 'Dominio',
    amount_cents: 2200,
    currency: 'BRL',
    occurred_on: '2026-08-01',
    payment_method: null,
    reference_type: null,
    reference_id: null,
    notes: null,
  },
]

describe('admin finance helpers', () => {
  it('formats cents as BRL currency', () => {
    expect(formatCurrencyFromCents(123456)).toBe('R$ 1.234,56')
    expect(formatCurrencyFromCents(0)).toBe('R$ 0,00')
  })

  it('parses BRL currency strings to cents', () => {
    expect(parseCurrencyToCents('R$ 1.234,56')).toBe(123456)
    expect(parseCurrencyToCents('1234.56')).toBe(123456)
    expect(parseCurrencyToCents('12,34')).toBe(1234)
    expect(parseCurrencyToCents(19.9)).toBe(1990)
  })

  it('calculates income, expenses and net profit', () => {
    expect(calculateFinancialSummary(records)).toEqual({
      incomeCents: 20000,
      expenseCents: 6500,
      netCents: 13500,
      recordCount: 4,
    })
  })

  it('groups records by month', () => {
    expect(groupFinancialRecordsByMonth(records)).toMatchObject({
      '2026-07': [records[0], records[1], records[2]],
      '2026-08': [records[3]],
    })
  })

  it('validates zero and negative amounts', () => {
    expect(validateFinancialRecordInput({
      kind: 'income',
      category: 'manual_income',
      description: 'Receita',
      amount: '0',
      occurred_on: '2026-07-01',
    })).toMatchObject({ ok: false })

    expect(validateFinancialRecordInput({
      kind: 'expense',
      category: 'server',
      description: 'Servidor',
      amount: '-10',
      occurred_on: '2026-07-01',
    })).toMatchObject({ ok: false })
  })

  it('rejects invalid categories for the selected kind', () => {
    expect(validateFinancialRecordInput({
      kind: 'income',
      category: 'server',
      description: 'Servidor como receita',
      amount: '100',
      occurred_on: '2026-07-01',
    })).toMatchObject({ ok: false })
  })

  it('normalizes valid input in cents', () => {
    expect(validateFinancialRecordInput({
      kind: 'expense',
      category: 'creator_payout',
      description: 'Repasse manual para criador',
      amount: 'R$ 250,00',
      occurred_on: '2026-07-20',
      payment_method: 'Pix',
      notes: 'Pago manualmente fora da plataforma.',
    })).toMatchObject({
      ok: true,
      value: {
        kind: 'expense',
        category: 'creator_payout',
        amount_cents: 25000,
        currency: 'BRL',
        occurred_on: '2026-07-20',
        payment_method: 'Pix',
      },
    })
  })

  it('exposes labels and categories', () => {
    expect(getFinancialRecordKindLabel('income')).toBe('Entrada')
    expect(getFinancialRecordKindLabel('expense')).toBe('Saida')
    expect(getFinancialCategoryLabel('creator_payout')).toBe('Repasse para criador')
    expect(getFinancialCategoriesForKind('income')).toContain('itacash_sale')
    expect(getFinancialCategoriesForKind('expense')).toContain('developer_salary')
  })
})
