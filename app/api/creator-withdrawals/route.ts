import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getCreatorWithdrawalErrorMessage,
  getWithdrawalPaymentMethodLabel,
  formatWithdrawalPaymentDetailsSummary,
  normalizeWithdrawalPaymentMethod,
  normalizeCreatorWithdrawalRpcError,
  validateWithdrawalRequestPayload,
  type CreatorWithdrawalErrorReason,
  type CreatorWithdrawalPaymentDetails,
  type CreatorWithdrawalValidationInput,
  type PixWithdrawalPaymentDetails,
} from '@/lib/creator-withdrawals'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

export const dynamic = 'force-dynamic'

type CreatorWithdrawalRequestBody = CreatorWithdrawalValidationInput

type CreatorWithdrawalDbRow = {
  payment_method?: string | null
  payment_details?: unknown
  pix_key?: string | null
  pix_key_type?: string | null
  holder_name?: string | null
}

const WITHDRAWAL_SELECT_WITH_PAYMENT = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, payment_method, payment_details, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_at, paid_at, created_at, updated_at'
const WITHDRAWAL_SELECT_LEGACY = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_at, paid_at, created_at, updated_at'

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
  if (
    reason === 'invalid_amount' ||
    reason === 'minimum_amount' ||
    reason === 'insufficient_balance' ||
    reason === 'invalid_payment_method' ||
    reason === 'invalid_payment_details' ||
    reason === 'invalid_pix_key' ||
    reason === 'invalid_pix_key_type' ||
    reason === 'invalid_holder_name' ||
    reason === 'action_not_allowed'
  ) {
    return 400
  }

  return 500
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

function jsonWithdrawalError(reason: CreatorWithdrawalErrorReason, status = statusForReason(reason)) {
  return NextResponse.json(
    { ok: false, reason, error: getCreatorWithdrawalErrorMessage(reason) },
    { status },
  )
}

export async function GET(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonWithdrawalError('not_authenticated', 401)
    }

    const initialResult = await supabase
      .from('creator_withdrawal_requests')
      .select(WITHDRAWAL_SELECT_WITH_PAYMENT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25)
    let data = initialResult.data as CreatorWithdrawalDbRow[] | null
    let error = initialResult.error

    if (error && isMissingPaymentSchemaError(error)) {
      const legacyResult = await supabase
        .from('creator_withdrawal_requests')
        .select(WITHDRAWAL_SELECT_LEGACY)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25)

      data = legacyResult.data as CreatorWithdrawalDbRow[] | null
      error = legacyResult.error
    }

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({
      ok: true,
      withdrawals: (data || []).map((row) => normalizeWithdrawalRow(row as CreatorWithdrawalDbRow)),
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      logServerEvent('warn', {
        event: 'creator_withdrawals.get_failed',
        requestId,
        error,
      })
    }
    return jsonWithdrawalError('internal', 500)
  }
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const body = (await request.json().catch(() => ({}))) as CreatorWithdrawalRequestBody
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonWithdrawalError('not_authenticated', 401)
    }

    const validation = validateWithdrawalRequestPayload(body)

    if (!validation.ok) {
      return jsonWithdrawalError(validation.reason, statusForReason(validation.reason))
    }

    const payload = validation.value
    let { data, error } = await supabase.rpc('request_creator_withdrawal', {
      p_amount_itacash: payload.amountItacash,
      p_payment_method: payload.paymentMethod,
      p_payment_details: payload.paymentDetails,
    })

    if (error && normalizeCreatorWithdrawalRpcError(error) === 'rpc_unavailable' && payload.paymentMethod === 'pix') {
      const pixDetails = payload.paymentDetails as PixWithdrawalPaymentDetails
      const legacyResult = await supabase.rpc('request_creator_withdrawal', {
        p_amount_itacash: payload.amountItacash,
        p_pix_key: pixDetails.pixKey,
        p_pix_key_type: pixDetails.pixKeyType,
        p_holder_name: pixDetails.holderName,
      })

      data = legacyResult.data
      error = legacyResult.error
    }

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({
      ok: true,
      withdrawal: data || null,
      message: `Solicitacao de saque de ${payload.amountItacash} ItaCash via ${getWithdrawalPaymentMethodLabel(payload.paymentMethod)} enviada.`,
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      logServerEvent('warn', {
        event: 'creator_withdrawals.post_failed',
        requestId,
        error,
      })
    }
    return jsonWithdrawalError('internal', 500)
  }
}
