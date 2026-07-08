import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getCreatorTipErrorMessage,
  normalizeCreatorTipRpcError,
  validateCreatorTipPayload,
  type CreatorTipErrorReason,
} from '@/lib/creator-tips'
import { canViewerSeePostClassification } from '@/lib/post-classification'

type CreatorTipRequestBody = {
  receiverUserId?: unknown
  receiver_user_id?: unknown
  amount?: unknown
  postId?: unknown
  post_id?: unknown
  message?: unknown
}

type ProfileAccessRow = {
  is_minor?: boolean | null
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
}

type PostValidationRow = {
  id: string
  user_id: string | null
  community_type?: string | null
  content_rating?: string | null
  category?: string | null
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

function jsonTipError(reason: CreatorTipErrorReason, status: number) {
  return NextResponse.json(
    { ok: false, error: getCreatorTipErrorMessage(reason), reason },
    { status },
  )
}

function statusForRpcReason(reason: CreatorTipErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'insufficient_balance' || reason === 'invalid_amount' || reason === 'self_tip') return 400
  if (reason === 'creator_not_found') return 404
  if (reason === 'rpc_unavailable') return 503
  return 500
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreatorTipRequestBody
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonTipError('not_authenticated', 401)
    }

    const validation = validateCreatorTipPayload({
      receiverUserId: body.receiverUserId ?? body.receiver_user_id,
      amount: body.amount,
      postId: body.postId ?? body.post_id,
      message: body.message,
      currentUserId: user.id,
    })

    if (!validation.ok) {
      const status = validation.reason === 'missing_receiver' || validation.reason === 'invalid_receiver' ? 404 : 400
      return jsonTipError(validation.reason, status)
    }

    const payload = validation.value
    const [{ data: receiverProfile, error: receiverError }, { data: currentProfile, error: currentProfileError }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id')
          .eq('id', payload.receiverUserId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('is_minor, wants_18_plus, age_verification_status')
          .eq('id', user.id)
          .maybeSingle(),
      ])

    if (receiverError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CreatorTips] receiver lookup failed:', receiverError.message)
      }
      return jsonTipError('creator_not_found', 404)
    }

    if (!receiverProfile) {
      return jsonTipError('creator_not_found', 404)
    }

    if (currentProfileError && process.env.NODE_ENV === 'development') {
      console.warn('[CreatorTips] current profile lookup failed:', currentProfileError.message)
    }

    if (payload.postId) {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('id, user_id, community_type, content_rating, category')
        .eq('id', payload.postId)
        .maybeSingle()

      if (postError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[CreatorTips] post lookup failed:', postError.message)
        }
        return jsonTipError('post_not_found', 404)
      }

      const post = postData as PostValidationRow | null

      if (!post || post.user_id !== payload.receiverUserId) {
        return jsonTipError('post_not_found', 404)
      }

      if (
        !canViewerSeePostClassification(
          currentProfile
            ? {
                isMinor: (currentProfile as ProfileAccessRow).is_minor,
                wants18Plus: (currentProfile as ProfileAccessRow).wants_18_plus,
                ageVerificationStatus: (currentProfile as ProfileAccessRow).age_verification_status,
              }
            : null,
          post.community_type,
          post.content_rating,
          post.category,
        )
      ) {
        return jsonTipError('blocked_adult_post', 403)
      }
    }

    const { data, error } = await supabase.rpc('send_itacash_tip', {
      p_receiver_id: payload.receiverUserId,
      p_amount: payload.amount,
      p_message: payload.message,
    })

    if (error) {
      const reason = normalizeCreatorTipRpcError(error)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CreatorTips] send_itacash_tip failed:', { reason, code: error.code })
      }
      return jsonTipError(reason, statusForRpcReason(reason))
    }

    const result = (data || {}) as {
      sender_balance_after?: unknown
      gross_amount?: unknown
      creator_amount?: unknown
      platform_fee_amount?: unknown
      platform_fee_bps?: unknown
    }
    const grossAmount = typeof result.gross_amount === 'number' ? result.gross_amount : payload.amount

    return NextResponse.json({
      ok: true,
      amount: grossAmount,
      grossAmount,
      creatorAmount: typeof result.creator_amount === 'number' ? result.creator_amount : null,
      platformFeeAmount: typeof result.platform_fee_amount === 'number' ? result.platform_fee_amount : null,
      platformFeeBps: typeof result.platform_fee_bps === 'number' ? result.platform_fee_bps : null,
      postId: payload.postId,
      senderBalanceAfter: typeof result.sender_balance_after === 'number' ? result.sender_balance_after : null,
      message: `Voce enviou ${grossAmount} ItaCash.`,
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[CreatorTips] unexpected error:', error)
    }
    return jsonTipError('internal', 500)
  }
}
