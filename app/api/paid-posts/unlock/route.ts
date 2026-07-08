import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getPaidPostErrorMessage,
  normalizePaidPostRpcError,
  validatePaidPostUnlockPayload,
  type PaidPostErrorReason,
} from '@/lib/paid-posts'

type UnlockPaidPostBody = {
  postId?: unknown
  post_id?: unknown
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

function jsonPaidPostError(reason: PaidPostErrorReason, status: number) {
  return NextResponse.json(
    { ok: false, reason, error: getPaidPostErrorMessage(reason) },
    { status },
  )
}

function statusForReason(reason: PaidPostErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'adult_blocked') return 403
  if (reason === 'post_not_found' || reason === 'missing_post' || reason === 'invalid_post') return 404
  if (reason === 'unlock_unavailable') return 503
  if (
    reason === 'not_paid' ||
    reason === 'already_unlocked' ||
    reason === 'locked' ||
    reason === 'self_unlock' ||
    reason === 'insufficient_balance'
  ) return 400
  return 500
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UnlockPaidPostBody
    const validation = validatePaidPostUnlockPayload({ postId: body.postId ?? body.post_id })

    if (!validation.ok) {
      return jsonPaidPostError(validation.reason, statusForReason(validation.reason))
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonPaidPostError('not_authenticated', 401)
    }

    const { data, error } = await supabase.rpc('unlock_paid_post', {
      p_post_id: validation.value.postId,
    })

    if (error) {
      const reason = normalizePaidPostRpcError(error)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PaidPosts] unlock_paid_post failed:', { reason, code: error.code })
      }
      return jsonPaidPostError(reason, statusForReason(reason))
    }

    const result = (data || {}) as {
      already_unlocked?: unknown
      amount?: unknown
      gross_amount?: unknown
      creator_amount?: unknown
      platform_fee_amount?: unknown
      platform_fee_bps?: unknown
      buyer_balance_after?: unknown
    }
    const amount = typeof result.amount === 'number' ? result.amount : null
    const grossAmount = typeof result.gross_amount === 'number' ? result.gross_amount : amount
    const alreadyUnlocked = result.already_unlocked === true

    return NextResponse.json({
      ok: true,
      alreadyUnlocked,
      amount: grossAmount,
      grossAmount,
      creatorAmount: typeof result.creator_amount === 'number' ? result.creator_amount : null,
      platformFeeAmount: typeof result.platform_fee_amount === 'number' ? result.platform_fee_amount : null,
      platformFeeBps: typeof result.platform_fee_bps === 'number' ? result.platform_fee_bps : null,
      buyerBalanceAfter: typeof result.buyer_balance_after === 'number' ? result.buyer_balance_after : null,
      message: alreadyUnlocked
        ? getPaidPostErrorMessage('already_unlocked')
        : grossAmount
          ? `Post desbloqueado por ${grossAmount} ItaCash.`
          : 'Post desbloqueado.',
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[PaidPosts] unexpected unlock error:', error)
    }
    return jsonPaidPostError('internal', 500)
  }
}
