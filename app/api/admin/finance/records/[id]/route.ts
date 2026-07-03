import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import {
  validateFinancialRecordInput,
  type FinancialRecord,
} from '@/lib/admin-finance'

export const dynamic = 'force-dynamic'

type AdminFinanceErrorReason =
  | 'not_authenticated'
  | 'admin_required'
  | 'invalid_payload'
  | 'record_not_found'
  | 'table_unavailable'
  | 'internal'

const ADMIN_FINANCE_ERROR_MESSAGES: Record<AdminFinanceErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para acessar o financeiro.',
  admin_required: 'Acao permitida apenas para administradores.',
  invalid_payload: 'Revise os dados do lancamento financeiro.',
  record_not_found: 'Lancamento financeiro nao encontrado.',
  table_unavailable: 'Tabela financeira ainda nao disponivel. Aplique a migration admin_financial_records no Supabase.',
  internal: 'Nao foi possivel processar o financeiro agora.',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  if (reason === 'record_not_found') return 404
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

function isUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
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

  return { ok: true as const, supabase }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    if (!isUuid(id)) {
      return jsonFinanceError('record_not_found', 404)
    }

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
      .update(validation.value)
      .eq('id', id)
      .select('id, kind, category, description, amount_cents, currency, occurred_on, payment_method, reference_type, reference_id, notes, created_by, created_at, updated_at')
      .maybeSingle()

    if (error) {
      if (isMissingFinanceTableError(error)) {
        return jsonFinanceError('table_unavailable', 503)
      }

      return jsonFinanceError('internal', 500)
    }

    if (!data) {
      return jsonFinanceError('record_not_found', 404)
    }

    return NextResponse.json({ ok: true, record: data as FinancialRecord })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminFinanceRecords] PATCH failed:', error)
    }
    return jsonFinanceError('internal', 500)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    if (!isUuid(id)) {
      return jsonFinanceError('record_not_found', 404)
    }

    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonFinanceError(admin.reason, admin.status)
    }

    const { error } = await admin.supabase
      .from('admin_financial_records')
      .delete()
      .eq('id', id)

    if (error) {
      if (isMissingFinanceTableError(error)) {
        return jsonFinanceError('table_unavailable', 503)
      }

      return jsonFinanceError('internal', 500)
    }

    return NextResponse.json({ ok: true, message: 'Lancamento removido.' })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminFinanceRecords] DELETE failed:', error)
    }
    return jsonFinanceError('internal', 500)
  }
}
