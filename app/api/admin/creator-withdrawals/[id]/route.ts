import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import {
  formatWithdrawalPaymentDetailsSummary,
  getCreatorWithdrawalErrorMessage,
  getWithdrawalPaymentMethodLabel,
  isUuid,
  normalizeAdminCreatorWithdrawalAction,
  normalizeCreatorWithdrawalRpcError,
  normalizeWithdrawalPaymentMethod,
  type CreatorWithdrawalErrorReason,
  type CreatorWithdrawalPaymentDetails,
  type PixWithdrawalPaymentDetails,
} from '@/lib/creator-withdrawals'

export const dynamic = 'force-dynamic'

type AdminWithdrawalPatchBody = {
  action?: unknown
  status?: unknown
  reason?: unknown
  rejectionReason?: unknown
  rejection_reason?: unknown
  adminNotes?: unknown
  admin_notes?: unknown
}

type CreatorWithdrawalDbRow = {
  payment_method?: string | null
  payment_details?: unknown
  pix_key?: string | null
  pix_key_type?: string | null
  holder_name?: string | null
}

const WITHDRAWAL_SELECT_WITH_PAYMENT = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, payment_method, payment_details, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_by, reviewed_at, paid_at, created_at, updated_at'
const WITHDRAWAL_SELECT_LEGACY = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_by, reviewed_at, paid_at, created_at, updated_at'

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

function statusForReason(reason: CreatorWithdrawalErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'admin_required') return 403
  if (reason === 'request_not_found') return 404
  if (reason === 'rpc_unavailable') return 503
  if (reason === 'internal') return 500
  return 400
}

function jsonWithdrawalError(reason: CreatorWithdrawalErrorReason, status = statusForReason(reason)) {
  return NextResponse.json(
    { ok: false, reason, error: getCreatorWithdrawalErrorMessage(reason) },
    { status },
  )
}

function sanitizeText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function isMissingPaymentSchemaError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '').toLowerCase()
    : ''

  return message.includes('payment_method') || message.includes('payment_details')
}

function asPaymentDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function buildLegacyPixDetails(row: CreatorWithdrawalDbRow): PixWithdrawalPaymentDetails {
  return {
    method: 'pix',
    pixKey: row.pix_key || '',
    pixKeyType: row.pix_key_type === 'cnpj' || row.pix_key_type === 'email' || row.pix_key_type === 'phone' || row.pix_key_type === 'random'
      ? row.pix_key_type
      : 'cpf',
    holderName: row.holder_name || '',
  }
}

function normalizeWithdrawalRow<T extends CreatorWithdrawalDbRow>(row: T) {
  const paymentMethod = normalizeWithdrawalPaymentMethod(row.payment_method) || 'pix'
  const paymentDetails = Object.keys(asPaymentDetails(row.payment_details)).length > 0
    ? row.payment_details as CreatorWithdrawalPaymentDetails
    : buildLegacyPixDetails(row)

  return {
    ...row,
    payment_method: paymentMethod,
    payment_details: paymentDetails,
    payment_method_label: getWithdrawalPaymentMethodLabel(paymentMethod),
    payment_summary: formatWithdrawalPaymentDetailsSummary(paymentMethod, paymentDetails),
  }
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    if (!isUuid(id)) {
      return jsonWithdrawalError('request_not_found', 404)
    }

    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonWithdrawalError(admin.reason, admin.status)
    }

    const initialResult = await admin.supabase
      .from('creator_withdrawal_requests')
      .select(WITHDRAWAL_SELECT_WITH_PAYMENT)
      .eq('id', id)
      .maybeSingle()
    let data = initialResult.data as CreatorWithdrawalDbRow | null
    let error = initialResult.error

    if (error && isMissingPaymentSchemaError(error)) {
      const legacyResult = await admin.supabase
        .from('creator_withdrawal_requests')
        .select(WITHDRAWAL_SELECT_LEGACY)
        .eq('id', id)
        .maybeSingle()

      data = legacyResult.data as CreatorWithdrawalDbRow | null
      error = legacyResult.error
    }

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    if (!data) {
      return jsonWithdrawalError('request_not_found', 404)
    }

    return NextResponse.json({
      ok: true,
      withdrawal: normalizeWithdrawalRow(data as CreatorWithdrawalDbRow),
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminCreatorWithdrawals] GET detail failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    if (!isUuid(id)) {
      return jsonWithdrawalError('request_not_found', 404)
    }

    const body = (await request.json().catch(() => ({}))) as AdminWithdrawalPatchBody
    const action = normalizeAdminCreatorWithdrawalAction(body.action ?? body.status)

    if (!action) {
      return jsonWithdrawalError('action_not_allowed', 400)
    }

    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonWithdrawalError(admin.reason, admin.status)
    }

    const adminNotes = sanitizeText(body.adminNotes ?? body.admin_notes, 1000) || null

    if (action === 'reviewing') {
      const { data, error } = await admin.supabase.rpc('set_creator_withdrawal_reviewing', {
        p_request_id: id,
        p_admin_notes: adminNotes,
      })

      if (error) {
        const reason = normalizeCreatorWithdrawalRpcError(error)
        return jsonWithdrawalError(reason, statusForReason(reason))
      }

      return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao marcada em analise.' })
    }

    if (action === 'approved') {
      const { data, error } = await admin.supabase.rpc('approve_creator_withdrawal', {
        p_request_id: id,
        p_admin_notes: adminNotes,
      })

      if (error) {
        const reason = normalizeCreatorWithdrawalRpcError(error)
        return jsonWithdrawalError(reason, statusForReason(reason))
      }

      return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao aprovada para pagamento manual.' })
    }

    if (action === 'paid') {
      const { data, error } = await admin.supabase.rpc('mark_creator_withdrawal_paid', {
        p_request_id: id,
        p_admin_notes: adminNotes,
      })

      if (error) {
        const reason = normalizeCreatorWithdrawalRpcError(error)
        return jsonWithdrawalError(reason, statusForReason(reason))
      }

      return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao marcada como paga.' })
    }

    const reasonText = sanitizeText(
      body.reason ?? body.rejectionReason ?? body.rejection_reason ?? body.adminNotes ?? body.admin_notes,
      1000,
    )

    if (!reasonText) {
      return jsonWithdrawalError('action_not_allowed', 400)
    }

    const { data, error } = await admin.supabase.rpc('reject_creator_withdrawal', {
      p_request_id: id,
      p_reason: reasonText,
    })

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao recusada e saldo estornado.' })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminCreatorWithdrawals] PATCH failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}
