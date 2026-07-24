import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import {
  CREATOR_CONTENT_PAGE_SIZE,
  buildCreatorChecklist,
  decodeCreatorCursor,
  encodeCreatorCursor,
  parseCreatorPeriod,
  sumIntegerAmounts,
  type CreatorStudioPost,
} from '@/lib/creator/creator-studio'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

export const dynamic = 'force-dynamic'

function clientFor(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase public environment variables are missing.')
  const authorization = request.headers.get('authorization') || ''
  return createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } })
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

type PostRow = {
  id: string; content?: string | null; created_at: string; category?: string | null
  visibility?: string | null; moderation_status?: string | null; is_paid?: boolean | null
}

export async function GET(request: NextRequest) {
  const requestId = getRequestCorrelationId(request)
  try {
    const period = parseCreatorPeriod(request.nextUrl.searchParams.get('period') || '30')
    if (!period) return privateJson({ ok: false, error: 'invalid_period' }, 400)
    const rawCursor = request.nextUrl.searchParams.get('cursor')
    const cursor = decodeCreatorCursor(rawCursor)
    if (rawCursor && !cursor) return privateJson({ ok: false, error: 'invalid_cursor' }, 400)

    const supabase = clientFor(request)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logServerEvent('warn', {
        event: 'creator_studio_overview.auth_failed',
        requestId,
        error: authError,
      })
      return privateJson({ ok: false, error: 'not_authenticated' }, 401)
    }

    const partialErrors: string[] = []
    const profileQuery = supabase.from('profiles')
      .select('username, display_name, avatar_url, bio, age_verification_status')
      .eq('id', user.id).maybeSingle()
    let postsQuery = supabase.from('posts')
      .select('id, content, created_at, category, visibility, moderation_status, is_paid', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(CREATOR_CONTENT_PAGE_SIZE + 1)
    if (cursor) postsQuery = postsQuery.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)

    const [profileResult, postsResult, followersResult, walletResult, tipsResult, paidResult, withdrawalsResult] = await Promise.all([
      profileQuery,
      postsQuery,
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('itacash_wallets').select('balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('itacash_transactions').select('amount').eq('user_id', user.id).eq('type', 'tip_received'),
      supabase.from('itacash_transactions').select('amount').eq('user_id', user.id).eq('type', 'paid_post_received'),
      supabase.from('creator_withdrawal_requests').select('amount_itacash').eq('user_id', user.id).in('status', ['pending', 'approved']),
    ])
    if (profileResult.error || !profileResult.data) {
      logServerEvent('warn', {
        event: 'creator_studio_overview.profile_unavailable',
        requestId,
        context: { userId: user.id },
        error: profileResult.error,
      })
      return privateJson({ ok: false, error: 'profile_unavailable' }, 403)
    }
    if (postsResult.error) {
      logServerEvent('error', {
        event: 'creator_studio_overview.posts_unavailable',
        requestId,
        context: { userId: user.id, period, hasCursor: Boolean(cursor) },
        error: postsResult.error,
      })
      return privateJson({ ok: false, error: 'content_unavailable' }, 503)
    }

    const allRows = (postsResult.data || []) as PostRow[]
    const pageRows = allRows.slice(0, CREATOR_CONTENT_PAGE_SIZE)
    const postIds = pageRows.map(({ id }) => id)
    const since = new Date(Date.now() - period * 86_400_000).toISOString()
    const empty = Promise.resolve({ data: [], error: null, count: 0 })
    const [likesResult, commentsResult, viewsResult] = await Promise.all([
      postIds.length ? supabase.from('likes').select('post_id').in('post_id', postIds) : empty,
      postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : empty,
      postIds.length ? supabase.from('post_views').select('post_id').eq('creator_id', user.id).gte('created_at', since).in('post_id', postIds) : empty,
    ])
    const counts = (rows: Array<{ post_id?: string | null }> | null) => (rows || []).reduce<Record<string, number>>((map, row) => {
      if (row.post_id) map[row.post_id] = (map[row.post_id] || 0) + 1
      return map
    }, {})
    const likes = likesResult.error ? null : counts(likesResult.data)
    const comments = commentsResult.error ? null : counts(commentsResult.data)
    const views = viewsResult.error ? null : counts(viewsResult.data)
    if (likesResult.error) partialErrors.push('likes')
    if (commentsResult.error) partialErrors.push('comments')
    if (viewsResult.error) partialErrors.push('views')

    const content: CreatorStudioPost[] = pageRows.map((post) => ({
      id: post.id,
      content: (post.content || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      createdAt: post.created_at,
      category: post.category || 'cotidiano',
      visibility: post.visibility === 'followers' || post.visibility === 'private' ? post.visibility : 'public',
      moderationStatus: post.moderation_status === 'hidden' || post.moderation_status === 'removed' ? post.moderation_status : 'active',
      isPaid: post.is_paid === true,
      likes: likes?.[post.id] || 0,
      comments: comments?.[post.id] || 0,
      views: views ? views[post.id] || 0 : null,
    }))
    for (const [name, result] of [['followers', followersResult], ['wallet', walletResult], ['tips', tipsResult], ['paidPosts', paidResult], ['withdrawals', withdrawalsResult]] as const) {
      if (result.error) partialErrors.push(name)
    }
    if (partialErrors.length > 0) {
      logServerEvent('warn', {
        event: 'creator_studio_overview.partial_data',
        requestId,
        context: { userId: user.id, partialErrors, period, postCount: pageRows.length },
      })
    }
    const profile = profileResult.data
    const totalPosts = postsResult.count ?? pageRows.length
    const next = allRows.length > CREATOR_CONTENT_PAGE_SIZE ? pageRows[pageRows.length - 1] : null
    return privateJson({
      ok: true,
      overview: {
        profile: {
          username: profile.username || '',
          displayName: profile.display_name || profile.username || 'Criador',
          avatarUrl: profile.avatar_url || null,
          bio: profile.bio || '',
          ageVerificationStatus: profile.age_verification_status || 'not_started',
        },
        metrics: {
          posts: totalPosts,
          followers: followersResult.error ? null : followersResult.count || 0,
          likes: likes ? Object.values(likes).reduce((a, b) => a + b, 0) : null,
          comments: comments ? Object.values(comments).reduce((a, b) => a + b, 0) : null,
          views: views ? Object.values(views).reduce((a, b) => a + b, 0) : null,
        },
        earnings: {
          availableBalance: walletResult.error ? null : Math.max(0, Number(walletResult.data?.balance) || 0),
          tipsReceived: tipsResult.error ? null : sumIntegerAmounts(tipsResult.data || []),
          paidPostsReceived: paidResult.error ? null : sumIntegerAmounts(paidResult.data || []),
          pendingWithdrawals: withdrawalsResult.error ? null : sumIntegerAmounts((withdrawalsResult.data || []).map((row) => ({ amount: row.amount_itacash }))),
        },
        checklist: buildCreatorChecklist({
          avatarUrl: profile.avatar_url, displayName: profile.display_name, username: profile.username,
          bio: profile.bio, postCount: totalPosts,
        }),
        content,
        nextCursor: next ? encodeCreatorCursor(next.created_at, next.id) : null,
        partialErrors,
        period,
      },
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'creator_studio_overview.unexpected_error',
      requestId,
      context: {
        period: request.nextUrl.searchParams.get('period') || '30',
        hasCursor: Boolean(request.nextUrl.searchParams.get('cursor')),
      },
      error,
    })
    return privateJson({ ok: false, error: 'internal' }, 500)
  }
}
