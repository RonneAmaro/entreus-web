import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { BLOCKED_CONTENT_MESSAGE } from '@/lib/content-access'
import { isAdminRole } from '@/lib/admin'
import { isMissingPaidPostColumnError, isPaidPost } from '@/lib/paid-posts'
import { isMissingPostModerationColumnError } from '@/lib/post-moderation'
import { evaluateProtectedPostAccess } from '@/lib/protected-post-access'
import { createR2GetSignedUrl, R2_SIGNED_GET_EXPIRATION_SECONDS } from '@/lib/r2/signed-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase configuration missing.')
  const authorization = request.headers.get('authorization') || ''
  return createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } })
}

function unavailable(status = 403) {
  return NextResponse.json({ error: BLOCKED_CONTENT_MESSAGE }, { status })
}

const POST_SELECT_WITH_ACCESS = 'id, user_id, visibility, community_type, content_rating, category, is_paid, price_itacash, moderation_status, moderated_at, moderated_by, moderation_reason'
const POST_SELECT_WITHOUT_PAID = 'id, user_id, visibility, community_type, content_rating, category, moderation_status, moderated_at, moderated_by, moderation_reason'
const POST_SELECT_WITHOUT_MODERATION = 'id, user_id, visibility, community_type, content_rating, category, is_paid, price_itacash'
const POST_SELECT_MINIMAL = 'id, user_id, visibility, community_type, content_rating, category'

export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  let supabase
  try { supabase = getSupabaseForRequest(request) } catch { return unavailable(500) }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return unavailable()

  const { mediaId } = await context.params
  const { data: media, error: mediaError } = await supabase
    .from('post_media')
    .select('id, post_id, media_type, storage_provider, storage_bucket, storage_key, access_level')
    .eq('id', mediaId)
    .maybeSingle()
  if (mediaError || !media) return unavailable()

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(POST_SELECT_WITH_ACCESS)
    .eq('id', media.post_id)
    .maybeSingle()
  let safePost = post
  let safePostError = postError

  if (safePostError && isMissingPaidPostColumnError(safePostError)) {
    const fallback = await supabase
      .from('posts')
      .select(POST_SELECT_WITHOUT_PAID)
      .eq('id', media.post_id)
      .maybeSingle()

    safePost = fallback.data as typeof safePost
    safePostError = fallback.error
  }

  if (safePostError && isMissingPostModerationColumnError(safePostError)) {
    const fallback = await supabase
      .from('posts')
      .select(POST_SELECT_WITHOUT_MODERATION)
      .eq('id', media.post_id)
      .maybeSingle()

    safePost = fallback.data as typeof safePost
    safePostError = fallback.error

    if (safePostError && isMissingPaidPostColumnError(safePostError)) {
      const paidFallback = await supabase
        .from('posts')
        .select(POST_SELECT_MINIMAL)
        .eq('id', media.post_id)
        .maybeSingle()

      safePost = paidFallback.data as typeof safePost
      safePostError = paidFallback.error
    }
  }

  if (safePostError || !safePost) return unavailable()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_minor, wants_18_plus, age_verification_status, parental_consent_status')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = isAdminRole(profile?.role)
  const isAuthor = safePost.user_id === user.id
  const viewerProfile = profile ? {
    isMinor: profile.is_minor,
    wants18Plus: profile.wants_18_plus,
    ageVerificationStatus: profile.age_verification_status,
    parentalConsentStatus: profile.parental_consent_status,
  } : null

  let isFollowingAuthor = false
  if (safePost.visibility === 'followers' && !isAuthor && !isAdmin) {
    const { data: follow, error: followError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', safePost.user_id)
      .maybeSingle()

    if (followError) return unavailable()
    isFollowingAuthor = Boolean(follow)
  }

  const signedAccessLevel = media.access_level === 'adult_private' || media.access_level === 'protected'

  if (!signedAccessLevel || media.storage_provider !== 'r2' || !media.storage_bucket || !media.storage_key) return unavailable()

  const requiresPaidUnlock = media.access_level === 'protected' || isPaidPost(safePost)
  let hasPaidUnlock = !requiresPaidUnlock || isAuthor || isAdmin

  if (requiresPaidUnlock && !hasPaidUnlock) {
    const { data: unlock, error: unlockError } = await supabase
      .from('paid_post_unlocks')
      .select('id')
      .eq('post_id', safePost.id)
      .eq('buyer_id', user.id)
      .maybeSingle()

    if (unlockError || !unlock) return unavailable()
    hasPaidUnlock = true
  }

  const accessPost = {
    ...safePost,
    community_type: media.access_level === 'adult_private' ? 'adult_18plus' : safePost.community_type,
    content_rating: media.access_level === 'adult_private' ? 'adult_18plus' : safePost.content_rating,
    visibility: safePost.visibility || 'public',
    paid_unlocked: hasPaidUnlock,
  }
  const access = evaluateProtectedPostAccess({
    post: accessPost,
    viewerId: user.id,
    viewerProfile,
    isAdmin,
    isAuthor,
    isFollowingAuthor,
    hasPaidUnlock,
  })

  if (!access.allowed) return unavailable()

  try {
    const url = await createR2GetSignedUrl({
      bucket: media.storage_bucket,
      key: media.storage_key,
      contentType: media.media_type === 'video' ? 'video/mp4' : undefined,
      expiresInSeconds: R2_SIGNED_GET_EXPIRATION_SECONDS,
    })
    return NextResponse.json({ url, expiresIn: R2_SIGNED_GET_EXPIRATION_SECONDS, mediaType: media.media_type })
  } catch {
    return unavailable(502)
  }
}
