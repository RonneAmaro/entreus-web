import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getCreatorWithdrawalErrorMessage,
  normalizeCreatorWithdrawalRpcError,
  validateWithdrawalRequestPayload,
  type CreatorWithdrawalErrorReason,
} from '@/lib/creator-withdrawals'

export const dynamic = 'force-dynamic'

type CreatorWithdrawalRequestBody = {
  amountItacash?: unknown
  amount_itacash?: unknown
  pixKey?: unknown
  pix_key?: unknown
  pixKeyType?: unknown
  pix_key_type?: unknown
  holderName?: unknown
  holder_name?: unknown
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

function statusForReason(reason: CreatorWithdrawalErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'admin_required') return 403
  if (reason === 'request_not_found') return 404
  if (reason === 'rpc_unavailable') return 503
  if (
    reason === 'invalid_amount' ||
    reason === 'minimum_amount' ||
    reason === 'insufficient_balance' ||
    reason === 'invalid_pix_key' ||
    reason === 'invalid_pix_key_type' ||
    reason === 'invalid_holder_name' ||
    reason === 'action_not_allowed'
  ) {
    return 400
  }

  return 500
}

function jsonWithdrawalError(reason: CreatorWithdrawalErrorReason, status = statusForReason(reason)) {
  return NextResponse.json(
    { ok: false, reason, error: getCreatorWithdrawalErrorMessage(reason) },
    { status },
  )
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonWithdrawalError('not_authenticated', 401)
    }

    const { data, error } = await supabase
      .from('creator_withdrawal_requests')
      .select('id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_at, paid_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25)

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({ ok: true, withdrawals: data || [] })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[CreatorWithdrawals] GET failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}

export async function POST(request: Request) {
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
    const { data, error } = await supabase.rpc('request_creator_withdrawal', {
      p_amount_itacash: payload.amountItacash,
      p_pix_key: payload.pixKey,
      p_pix_key_type: payload.pixKeyType,
      p_holder_name: payload.holderName,
    })

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({
      ok: true,
      withdrawal: data || null,
      message: `Solicitacao de saque de ${payload.amountItacash} ItaCash enviada.`,
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[CreatorWithdrawals] POST failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}
