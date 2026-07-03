import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import {
  FINANCIAL_RECORD_KINDS,
  calculateFinancialSummary,
  isFinancialCategory,
  validateFinancialRecordInput,
  type FinancialRecord,
  type FinancialRecordKind,
} from '@/lib/admin-finance'

export const dynamic = 'force-dynamic'

type AdminFinanceErrorReason =
  | 'not_authenticated'
  | 'admin_required'
  | 'invalid_payload'
  | 'table_unavailable'
  | 'internal'

const ADMIN_FINANCE_ERROR_MESSAGES: Record<AdminFinanceErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para acessar o financeiro.',
  admin_required: 'Acao permitida apenas para administradores.',
  invalid_payload: 'Revise os dados do lancamento financeiro.',
  table_unavailable: 'Tabela financeira ainda nao disponivel. Aplique a migration admin_financial_records no Supabase.',
  internal: 'Nao foi possivel processar o financeiro agora.',
}

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function statusForReason(reason: AdminFinanceErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'admin_required') return 403
  if (reason === 'table_unavailable') return 503
  if (reason === 'internal') return 500
  return 400
}

function jsonFinanceError(reason: AdminFinanceErrorReason, status = statusForReason(reason), details?: unknown) {
  return NextResponse.json(
    { ok: false, reason, error: ADMIN_FINANCE_ERROR_MESSAGES[reason], details },
    { status },
  )
}

function isMissingFinanceTableError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '').toLowerCase()
    : ''
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''

  return code === '42P01' || message.includes('admin_financial_records') || message.includes('schema cache')
}

async function validateAdmin(request: Request) {
  const supabase = getSupabaseForRequest(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false as const, reason: 'not_authenticated' as const, status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !isAdminRole(profile?.role)) {
    return { ok: false as const, reason: 'admin_required' as const, status: 403 }
  }

  return { ok: true as const, supabase, userId: user.id }
}

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function normalizeKindFilter(value: string | null): FinancialRecordKind | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return (FINANCIAL_RECORD_KINDS as readonly string[]).includes(normalized)
    ? normalized as FinancialRecordKind
    : null
}

export async function GET(request: Request) {
  try {
    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonFinanceError(admin.reason, admin.status)
    }

    const url = new URL(request.url)
    const year = Number.parseInt(url.searchParams.get('year') || '', 10)
    const month = Number.parseInt(url.searchParams.get('month') || '', 10)
    const kind = normalizeKindFilter(url.searchParams.get('kind'))
    const category = url.searchParams.get('category')?.trim() || ''
    let query = admin.supabase
      .from('admin_financial_records')
      .select('id, kind, category, description, amount_cents, currency, occurred_on, payment_method, reference_type, reference_id, notes, created_by, created_at, updated_at')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      const range = getMonthRange(year, month)
      query = query.gte('occurred_on', range.start).lt('occurred_on', range.end)
    }

    if (kind) {
      query = query.eq('kind', kind)
    }

    if (category && isFinancialCategory(category)) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingFinanceTableError(error)) {
        return jsonFinanceError('table_unavailable', 503)
      }

      return jsonFinanceError('internal', 500)
    }

    const records = (data || []) as FinancialRecord[]

    return NextResponse.json({
      ok: true,
      records,
      summary: calculateFinancialSummary(records),
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminFinanceRecords] GET failed:', error)
    }
    return jsonFinanceError('internal', 500)
  }
}

export async function POST(request: Request) {
  try {
    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonFinanceError(admin.reason, admin.status)
    }

    const body = await request.json().catch(() => ({}))
    const validation = validateFinancialRecordInput(body)

    if (!validation.ok) {
      return jsonFinanceError('invalid_payload', 400, validation.errors)
    }

    const { data, error } = await admin.supabase
      .from('admin_financial_records')
      .insert({
        ...validation.value,
        created_by: admin.userId,
      })
      .select('id, kind, category, description, amount_cents, currency, occurred_on, payment_method, reference_type, reference_id, notes, created_by, created_at, updated_at')
      .single()

    if (error) {
      if (isMissingFinanceTableError(error)) {
        return jsonFinanceError('table_unavailable', 503)
      }

      return jsonFinanceError('internal', 500)
    }

    return NextResponse.json({ ok: true, record: data as FinancialRecord })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminFinanceRecords] POST failed:', error)
    }
    return jsonFinanceError('internal', 500)
  }
}
