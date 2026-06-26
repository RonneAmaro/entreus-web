import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import type { PostVisibilityContext } from '@/lib/post-visibility'
import {
  authorizePostsForViewer,
  type ProtectedPostLike,
  type ProtectedPostMedia,
} from '@/lib/protected-post-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProfileRow = {
  role?: string | null
  is_minor?: boolean | null
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
  parental_consent_status?: string | null
}

const ALLOWED_CONTEXTS = new Set<PostVisibilityContext>([
  'general-feed',
  'public-list',
  'saved',
  'post-detail',
  'admin',
])

const POST_SELECT = `
  id,
  content,
  category,
  created_at,
  user_id,
  image_url,
  video_url,
  visibility,
  is_sensitive,
  community_type,
  content_rating,
  is_paid,
  price_itacash,
  moderation_status,
  moderated_at,
  moderated_by,
  moderation_reason,
  profiles (
    username,
    display_name,
    avatar_url,
    vip_status,
    vip_expires_at
  )
`

function getSupabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) throw new Error('Supabase configuration missing.')

  const authorization = request.headers.get('authorization') || ''

  return createClient(url, key, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function normalizePostIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 80),
    ),
  )
}

function normalizeContext(value: unknown): PostVisibilityContext {
  return typeof value === 'string' && ALLOWED_CONTEXTS.has(value as PostVisibilityContext)
    ? value as PostVisibilityContext
    : 'public-list'
}

function normalizePostRow(row: ProtectedPostLike) {
  return {
    ...row,
    visibility: row.visibility || 'public',
    is_sensitive: Boolean(row.is_sensitive),
    profiles: Array.isArray(row.profiles)
      ? row.profiles[0] || null
      : row.profiles || null,
  }
}

export async function POST(request: Request) {
  let supabase

  try {
    supabase = getSupabaseForRequest(request)
  } catch {
    return NextResponse.json({ error: 'Supabase indisponivel.' }, { status: 500 })
  }

  const body = await request.json().catch(() => null) as {
    postIds?: unknown
    context?: unknown
  } | null

  const postIds = normalizePostIds(body?.postIds)
  const context = normalizeContext(body?.context)

  if (postIds.length === 0) {
    return NextResponse.json({ posts: [], access: [] })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: ProfileRow | null = null

  if (user?.id) {
    const { data } = await supabase
      .from('profiles')
      .select('role, is_minor, wants_18_plus, age_verification_status, parental_consent_status')
      .eq('id', user.id)
      .maybeSingle()

    profile = data as ProfileRow | null
  }

  const { data: postRows, error: postsError } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .in('id', postIds)

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 })
  }

  const posts = ((postRows || []) as ProtectedPostLike[]).map(normalizePostRow)
  const authorIds = Array.from(new Set(posts.map((post) => post.user_id).filter(Boolean)))
  const foundPostIds = posts.map((post) => post.id)

  const [
    followsResult,
    unlocksResult,
    mediaResult,
  ] = await Promise.all([
    user?.id && authorIds.length > 0
      ? supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .in('following_id', authorIds)
      : Promise.resolve({ data: [], error: null }),
    user?.id && foundPostIds.length > 0
      ? supabase
          .from('paid_post_unlocks')
          .select('post_id')
          .eq('buyer_id', user.id)
          .in('post_id', foundPostIds)
      : Promise.resolve({ data: [], error: null }),
    foundPostIds.length > 0
      ? supabase
          .from('post_media')
          .select('id, post_id, user_id, media_url, media_type, position, created_at, access_level')
          .in('post_id', foundPostIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (mediaResult.error) {
    return NextResponse.json({ error: mediaResult.error.message }, { status: 500 })
  }

  const mediaByPostId = ((mediaResult.data || []) as ProtectedPostMedia[]).reduce(
    (acc, media) => {
      if (!media.post_id) return acc
      if (!acc[media.post_id]) acc[media.post_id] = []
      acc[media.post_id].push(media)
      return acc
    },
    {} as Record<string, ProtectedPostMedia[]>,
  )

  const followingUserIds = (followsResult.data || [])
    .map((row: { following_id?: string | null }) => row.following_id)
    .filter(Boolean) as string[]
  const unlockedPostIds = (unlocksResult.data || [])
    .map((row: { post_id?: string | null }) => row.post_id)
    .filter(Boolean) as string[]

  const results = authorizePostsForViewer(
    posts.map((post) => ({
      ...post,
      media: mediaByPostId[post.id] || [],
    })),
    {
      userId: user?.id || null,
      isAdmin: isAdminRole(profile?.role),
      profile: profile
        ? {
            isMinor: profile.is_minor,
            wants18Plus: profile.wants_18_plus,
            ageVerificationStatus: profile.age_verification_status,
            parentalConsentStatus: profile.parental_consent_status,
          }
        : null,
      followingUserIds,
      unlockedPostIds,
    },
    context,
  )
  const authorizedPosts = results.flatMap((result) => result.post ? [result.post] : [])

  return NextResponse.json({
    posts: authorizedPosts,
    access: results.map(({ postId, visible, contentAllowed, reason }) => ({
      postId,
      visible,
      contentAllowed,
      reason,
    })),
  })
}
