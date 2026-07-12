import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, requireUser } from '@/lib/meet-server'
import { createR2GetSignedUrl } from '@/lib/r2/signed-url'
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
const jsonNoStore = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
export async function GET(request: Request) {
  const auth = await requireUser(request); if (auth.error) return jsonNoStore({ ok: false, error: 'Entre na sua conta para continuar.' }, 401)
  const admin = getSupabaseAdmin(); if (!admin) return jsonNoStore({ ok: false }, 503)
  const { data: reviewer } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (!isAdminRole(reviewer?.role)) return jsonNoStore({ ok: false, error: 'Acesso negado.' }, 403)
  const { data, error } = await admin.from('profile_media_submissions').select('id,user_id,media_type,status,moderation_category,moderation_reason,submitted_at,reviewed_at,storage_key,content_type').order('submitted_at', { ascending: false }).limit(100)
  if (error) return jsonNoStore({ ok: false, error: 'Falha ao carregar fila.' }, 500)
  const userIds = [...new Set((data || []).map((item) => item.user_id))]
  const { data: profiles } = userIds.length ? await admin.from('profiles').select('id,username,display_name,profile_content_mode').in('id', userIds) : { data: [] }
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const bucket = process.env.R2_BUCKET_NAME
  const submissions = await Promise.all((data || []).map(async ({ storage_key, content_type, ...item }) => ({
    ...item, profile: profileMap.get(item.user_id) || null,
    previewUrl: bucket ? await createR2GetSignedUrl({ key: storage_key, bucket, contentType: content_type }).catch(() => null) : null,
  })))
  return jsonNoStore({ ok: true, submissions })
}
