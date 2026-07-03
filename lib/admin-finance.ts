export const FINANCIAL_RECORD_KINDS = ['income', 'expense'] as const
export const FINANCIAL_INCOME_CATEGORIES = ['itacash_sale', 'vip_sale', 'manual_income', 'other_income'] as const
export const FINANCIAL_EXPENSE_CATEGORIES = [
  'creator_payout',
  'server',
  'domain',
  'tool',
  'marketing',
  'tax',
  'developer_salary',
  'manual_expense',
  'other_expense',
] as const

export type FinancialRecordKind = (typeof FINANCIAL_RECORD_KINDS)[number]
export type FinancialIncomeCategory = (typeof FINANCIAL_INCOME_CATEGORIES)[number]
export type FinancialExpenseCategory = (typeof FINANCIAL_EXPENSE_CATEGORIES)[number]
export type FinancialCategory = FinancialIncomeCategory | FinancialExpenseCategory

export type FinancialRecord = {
  id?: string
  kind: FinancialRecordKind
  category: FinancialCategory
  description: string
  amount_cents: number
  currency: 'BRL'
  occurred_on: string
  payment_method: string | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type FinancialRecordInput = {
  kind?: unknown
  category?: unknown
  description?: unknown
  amount?: unknown
  amount_cents?: unknown
  amountCents?: unknown
  currency?: unknown
  occurred_on?: unknown
  occurredOn?: unknown
  payment_method?: unknown
  paymentMethod?: unknown
  reference_type?: unknown
  referenceType?: unknown
  reference_id?: unknown
  referenceId?: unknown
  notes?: unknown
}

export type FinancialSummary = {
  incomeCents: number
  expenseCents: number
  netCents: number
  recordCount: number
}

export type FinancialValidationResult =
  | { ok: true; value: FinancialRecord }
  | { ok: false; errors: string[] }

const KIND_LABELS: Record<FinancialRecordKind, string> = {
  income: 'Entrada',
  expense: 'Saida',
}

const CATEGORY_LABELS: Record<FinancialCategory, string> = {
  itacash_sale: 'Venda ItaCash',
  vip_sale: 'Venda VIP',
  manual_income: 'Receita manual',
  other_income: 'Outra receita',
  creator_payout: 'Repasse para criador',
  server: 'Servidor',
  domain: 'Dominio',
  tool: 'Ferramenta',
  marketing: 'Marketing',
  tax: 'Imposto',
  developer_salary: 'Salario/desenvolvimento',
  manual_expense: 'Despesa manual',
  other_expense: 'Outra despesa',
}

function sanitizeText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function normalizeKind(value: unknown): FinancialRecordKind | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return (FINANCIAL_RECORD_KINDS as readonly string[]).includes(normalized)
    ? normalized as FinancialRecordKind
    : null
}

function normalizeCategory(value: unknown): FinancialCategory | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return isFinancialCategory(normalized) ? normalized : null
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toISOString().slice(0, 10)
  }

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''

  return parsed.toISOString().slice(0, 10)
}

export function isFinancialCategory(value: unknown): value is FinancialCategory {
  return typeof value === 'string' && (
    (FINANCIAL_INCOME_CATEGORIES as readonly string[]).includes(value) ||
    (FINANCIAL_EXPENSE_CATEGORIES as readonly string[]).includes(value)
  )
}

export function isCategoryAllowedForKind(kind: FinancialRecordKind, category: FinancialCategory) {
  return (getFinancialCategoriesForKind(kind) as readonly string[]).includes(category)
}

export function formatCurrencyFromCents(value: number, currency = 'BRL') {
  const cents = Number.isFinite(value) ? Math.trunc(value) : 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(cents / 100).replace(/[\u00a0\u202f]/g, ' ')
}

export function parseCurrencyToCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.round(value * 100)
  }

  if (typeof value !== 'string') return null

  const cleaned = value.trim().replace(/[^\d,.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null

  const negative = cleaned.startsWith('-')
  const unsigned = cleaned.replace(/^-/, '')
  const lastComma = unsigned.lastIndexOf(',')
  const lastDot = unsigned.lastIndexOf('.')
  let normalized = unsigned

  if (lastComma >= 0 && lastComma > lastDot) {
    const decimalDigits = unsigned.length - lastComma - 1
    normalized = decimalDigits <= 2
      ? unsigned.replace(/\./g, '').replace(',', '.')
      : unsigned.replace(/[,.]/g, '')
  } else if (lastDot >= 0) {
    const decimalDigits = unsigned.length - lastDot - 1
    normalized = decimalDigits <= 2
      ? unsigned.replace(/,/g, '')
      : unsigned.replace(/[,.]/g, '')
  } else {
    normalized = unsigned.replace(/[,.]/g, '')
  }

  const parsed = Number.parseFloat(`${negative ? '-' : ''}${normalized}`)
  if (!Number.isFinite(parsed)) return null

  return Math.round(parsed * 100)
}

export function getFinancialRecordKindLabel(kind: FinancialRecordKind | string) {
  return KIND_LABELS[kind as FinancialRecordKind] || 'Desconhecido'
}

export function getFinancialCategoryLabel(category: FinancialCategory | string) {
  return CATEGORY_LABELS[category as FinancialCategory] || 'Categoria desconhecida'
}

export function getFinancialCategoriesForKind(kind: FinancialRecordKind) {
  return kind === 'income'
    ? [...FINANCIAL_INCOME_CATEGORIES]
    : [...FINANCIAL_EXPENSE_CATEGORIES]
}

export function calculateFinancialSummary(records: FinancialRecord[]): FinancialSummary {
  return records.reduce(
    (summary, record) => {
      if (record.kind === 'income') {
        summary.incomeCents += record.amount_cents
      } else {
        summary.expenseCents += record.amount_cents
      }

      summary.netCents = summary.incomeCents - summary.expenseCents
      summary.recordCount += 1
      return summary
    },
    { incomeCents: 0, expenseCents: 0, netCents: 0, recordCount: 0 },
  )
}

export function groupFinancialRecordsByMonth(records: FinancialRecord[]) {
  return records.reduce(
    (groups, record) => {
      const monthKey = String(record.occurred_on || '').slice(0, 7) || 'sem-data'
      groups[monthKey] = groups[monthKey] || []
      groups[monthKey].push(record)
      return groups
    },
    {} as Record<string, FinancialRecord[]>,
  )
}

export function normalizeFinancialRecordInput(input: FinancialRecordInput): FinancialRecord {
  const kind = normalizeKind(input.kind) || 'expense'
  const category = normalizeCategory(input.category) || (kind === 'income' ? 'manual_income' : 'manual_expense')
  const rawAmount = input.amount_cents ?? input.amountCents
  const amountFromCents = typeof rawAmount === 'number'
    ? rawAmount
    : typeof rawAmount === 'string' && /^\d+$/.test(rawAmount.trim())
      ? Number.parseInt(rawAmount.trim(), 10)
      : null
  const amountCents = amountFromCents ?? parseCurrencyToCents(input.amount) ?? 0

  return {
    kind,
    category,
    description: sanitizeText(input.description, 220),
    amount_cents: Number.isFinite(amountCents) ? Math.trunc(amountCents) : 0,
    currency: 'BRL',
    occurred_on: normalizeDate(input.occurred_on ?? input.occurredOn),
    payment_method: sanitizeText(input.payment_method ?? input.paymentMethod, 80) || null,
    reference_type: sanitizeText(input.reference_type ?? input.referenceType, 80) || null,
    reference_id: sanitizeText(input.reference_id ?? input.referenceId, 80) || null,
    notes: sanitizeText(input.notes, 1200) || null,
  }
}

export function validateFinancialRecordInput(input: FinancialRecordInput): FinancialValidationResult {
  const normalized = normalizeFinancialRecordInput(input)
  const errors: string[] = []

  if (!normalizeKind(input.kind)) {
    errors.push('Selecione se o lancamento e entrada ou saida.')
  }

  if (!normalizeCategory(input.category) || !isCategoryAllowedForKind(normalized.kind, normalized.category)) {
    errors.push('Selecione uma categoria valida para o tipo escolhido.')
  }

  if (!normalized.description) {
    errors.push('Informe uma descricao para o lancamento.')
  }

  if (!Number.isSafeInteger(normalized.amount_cents) || normalized.amount_cents <= 0) {
    errors.push('Informe um valor maior que zero.')
  }

  if (!normalized.occurred_on) {
    errors.push('Informe uma data valida.')
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, value: normalized }
}
