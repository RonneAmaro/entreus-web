import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getPostViewErrorMessage,
  normalizePostViewRpcError,
  validatePostViewPayload,
  type PostViewErrorReason,
} from '@/lib/post-analytics'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

type PostViewBody = {
  postId?: unknown
  post_id?: unknown
  source?: unknown
}

export const dynamic = 'force-dynamic'

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

function jsonPostViewError(reason: PostViewErrorReason, status: number) {
  return NextResponse.json(
    { ok: false, reason, error: getPostViewErrorMessage(reason) },
    { status },
  )
}

function statusForReason(reason: PostViewErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'adult_blocked' || reason === 'blocked') return 403
  if (reason === 'post_not_found' || reason === 'missing_post' || reason === 'invalid_post') return 404
  if (reason === 'analytics_unavailable') return 503
  return 500
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const body = (await request.json().catch(() => ({}))) as PostViewBody
    const validation = validatePostViewPayload({
      postId: body.postId ?? body.post_id,
      source: body.source,
    })

    if (!validation.ok) {
      return jsonPostViewError(validation.reason, statusForReason(validation.reason))
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonPostViewError('not_authenticated', 401)
    }

    const { data, error } = await supabase.rpc('record_post_view', {
      p_post_id: validation.value.postId,
      p_source: validation.value.source,
    })

    if (error) {
      const reason = normalizePostViewRpcError(error)
      if (process.env.NODE_ENV === 'development') {
        logServerEvent('warn', {
          event: 'post_analytics.record_post_view_failed',
          requestId,
          context: { reason, code: error.code ?? 'unknown' },
        })
      }
      return jsonPostViewError(reason, statusForReason(reason))
    }

    const result = (data || {}) as {
      counted?: unknown
      deduped?: unknown
    }

    return NextResponse.json({
      ok: true,
      counted: result.counted === true,
      deduped: result.deduped === true,
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      logServerEvent('warn', {
        event: 'post_analytics.unexpected_view_error',
        requestId,
        error,
      })
    }
    return jsonPostViewError('internal', 500)
  }
}
