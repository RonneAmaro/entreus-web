import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireUser } from '@/lib/meet-server'
import { isProfileMediaType, ownsProfileMediaStorageKey, requiresProfileMediaReview } from '@/lib/profile-media-moderation'
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { headPrivateProfileMediaObject } from '@/lib/profile-media-r2'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return reply({ ok: false, error: 'Entre na sua conta para continuar.' }, 401)
  const admin = getSupabaseAdmin()
  if (!admin) return reply({ ok: false, error: 'Servico indisponivel.' }, 503)
  const { data, error } = await admin.from('profile_media_submissions')
    .select('id, media_type, status, moderation_reason, submitted_at, reviewed_at')
    .eq('user_id', auth.user.id).order('submitted_at', { ascending: false }).limit(20)
  if (error) return reply({ ok: false, error: 'Nao foi possivel carregar as analises.' }, 500)
  return reply({ ok: true, submissions: data || [] })
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return reply({ ok: false, error: 'Entre na sua conta para continuar.' }, 401)
  const admin = getSupabaseAdmin()
  if (!admin) return reply({ ok: false, error: 'Servico indisponivel.' }, 503)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !isProfileMediaType(body.mediaType)) return reply({ ok: false, error: 'Tipo de midia invalido.' }, 400)
  const forbiddenFields = ['userId', 'status', 'contentType', 'reviewedBy', 'profileContentMode', 'submittedAt', 'reviewedAt']
  if (forbiddenFields.some((field) => field in body)) return reply({ ok: false, error: 'Payload contem campos nao permitidos.' }, 400)
  const storageKey = typeof body.storageKey === 'string' ? body.storageKey : ''
  if (!ownsProfileMediaStorageKey(auth.user.id, storageKey)) {
    return reply({ ok: false, error: 'Arquivo invalido.' }, 400)
  }
  const { data: profile } = await admin.from('profiles').select('profile_content_mode').eq('id', auth.user.id).maybeSingle()
  if (!requiresProfileMediaReview(profile?.profile_content_mode)) return reply({ ok: false, error: 'Este perfil usa o fluxo geral.' }, 409)
  const verifiedObject = await headPrivateProfileMediaObject({ userId: auth.user.id, sourceKey: storageKey, mediaType: body.mediaType }).catch(() => null)
  if (!verifiedObject) return reply({ ok: false, error: 'O objeto enviado nao existe ou nao e uma imagem valida.' }, 400)
  const { data, error } = await admin.rpc('create_profile_media_submission', {
    authenticated_user_id: auth.user.id,
    requested_media_type: body.mediaType,
    requested_storage_key: storageKey,
    verified_content_type: verifiedObject.contentType,
  })
  if (error) return reply({ ok: false, error: 'Nao foi possivel registrar a imagem para analise.' }, 500)
  return reply({ ok: true, submission: Array.isArray(data) ? data[0] || null : data }, 201)
}
