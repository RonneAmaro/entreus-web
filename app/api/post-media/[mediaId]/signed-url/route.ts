import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { BLOCKED_CONTENT_MESSAGE, canViewAdultContent } from '@/lib/content-access'
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
    .select('id, community_type, content_rating')
    .eq('id', media.post_id)
    .maybeSingle()
  if (postError || !post) return unavailable()

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_minor, wants_18_plus, age_verification_status, parental_consent_status')
    .eq('id', user.id)
    .maybeSingle()
  const isAdult = post.community_type === 'adult_18plus' || post.content_rating === 'adult_18plus' || media.access_level === 'adult_private'
  if (isAdult && !canViewAdultContent(profile ? {
    isMinor: profile.is_minor,
    wants18Plus: profile.wants_18_plus,
    ageVerificationStatus: profile.age_verification_status,
    parentalConsentStatus: profile.parental_consent_status,
  } : null)) return unavailable()

  if (media.access_level !== 'adult_private' || media.storage_provider !== 'r2' || !media.storage_bucket || !media.storage_key) return unavailable()

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
