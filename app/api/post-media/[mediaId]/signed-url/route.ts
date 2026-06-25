import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { BLOCKED_CONTENT_MESSAGE, canViewAdultContent, isAdultPost } from '@/lib/content-access'
import { isAdminRole } from '@/lib/admin'
import { isMissingPaidPostColumnError, isPaidPost } from '@/lib/paid-posts'
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
    .select('id, user_id, community_type, content_rating, category, is_paid, price_itacash')
    .eq('id', media.post_id)
    .maybeSingle()
  let safePost = post
  let safePostError = postError

  if (safePostError && isMissingPaidPostColumnError(safePostError)) {
    const fallback = await supabase
      .from('posts')
      .select('id, user_id, community_type, content_rating, category')
      .eq('id', media.post_id)
      .maybeSingle()

    safePost = fallback.data as typeof safePost
    safePostError = fallback.error
  }

  if (safePostError || !safePost) return unavailable()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_minor, wants_18_plus, age_verification_status, parental_consent_status')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = isAdminRole(profile?.role)
  const isAdult = isAdultPost(safePost) || media.access_level === 'adult_private'
  if (isAdult && !canViewAdultContent(profile ? {
    isMinor: profile.is_minor,
    wants18Plus: profile.wants_18_plus,
    ageVerificationStatus: profile.age_verification_status,
    parentalConsentStatus: profile.parental_consent_status,
  } : null)) return unavailable()

  const signedAccessLevel = media.access_level === 'adult_private' || media.access_level === 'protected'

  if (!signedAccessLevel || media.storage_provider !== 'r2' || !media.storage_bucket || !media.storage_key) return unavailable()

  const requiresPaidUnlock = media.access_level === 'protected' || isPaidPost(safePost)

  if (requiresPaidUnlock && safePost.user_id !== user.id && !isAdmin) {
    const { data: unlock, error: unlockError } = await supabase
      .from('paid_post_unlocks')
      .select('id')
      .eq('post_id', safePost.id)
      .eq('buyer_id', user.id)
      .maybeSingle()

    if (unlockError || !unlock) return unavailable()
  }

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
