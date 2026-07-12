import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { getSupabaseAdmin, requireUser } from '@/lib/meet-server'
import { isProfileMediaReviewDecision, isProfileMediaType, ownsProfileMediaStorageKey, sanitizeProfileMediaReviewResult } from '@/lib/profile-media-moderation'
import { buildApprovedProfileMediaUrl, copyProfileMediaToApprovedPublicKey, ProfileMediaCopyError } from '@/lib/profile-media-r2'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
const jsonNoStore = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request); if (auth.error) return jsonNoStore({ ok: false, error: 'Entre na sua conta para continuar.' }, 401)
  const admin = getSupabaseAdmin(); if (!admin) return jsonNoStore({ ok: false, error: 'Servico indisponivel.' }, 503)
  const { data: reviewer } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (!isAdminRole(reviewer?.role)) return jsonNoStore({ ok: false, error: 'Acesso negado.' }, 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !isProfileMediaReviewDecision(body.decision)) return jsonNoStore({ ok: false, error: 'Decisao invalida.' }, 400)
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (body.decision !== 'approved' && !reason) return jsonNoStore({ ok: false, error: 'Informe o motivo.' }, 400)
  const category = body.category === 'safe' || body.category === 'review' || body.category === 'prohibited' ? body.category : null
  if (!category) return jsonNoStore({ ok: false, error: 'Informe uma categoria de moderacao valida.' }, 400)
  if (body.decision === 'approved' && category !== 'safe') return jsonNoStore({ ok: false, error: 'A aprovacao exige categoria segura.' }, 400)
  const { id } = await params
  const { data: pending } = await admin.from('profile_media_submissions').select('id,user_id,media_type,status,storage_provider,storage_key').eq('id', id).maybeSingle()
  if (!pending || pending.status !== 'pending_review' || pending.storage_provider !== 'r2' || !isProfileMediaType(pending.media_type) || !ownsProfileMediaStorageKey(pending.user_id, pending.storage_key)) {
    return jsonNoStore({ ok: false, error: 'Submissao pendente invalida.' }, 409)
  }

  let approvedKey: string | null = null; let approvedUrl: string | null = null
  if (body.decision === 'approved') {
    try {
      const copied = await copyProfileMediaToApprovedPublicKey({ userId: pending.user_id, sourceKey: pending.storage_key, mediaType: pending.media_type })
      approvedKey = copied.approvedKey
      approvedUrl = buildApprovedProfileMediaUrl(process.env.R2_PUBLIC_BASE_URL || '', pending.user_id, approvedKey)
    } catch (error) {
      if (error instanceof ProfileMediaCopyError && error.copyMayExist && error.approvedKey) {
        await admin.from('profile_media_copy_orphans').insert({ submission_id: id, storage_provider: 'r2', storage_key: error.approvedKey })
      }
      return jsonNoStore({ ok: false, error: 'Nao foi possivel publicar a copia aprovada.' }, 502)
    }
  }

  const { data, error } = await admin.rpc('review_profile_media_submission', {
    submission_id: id, decision: body.decision, reviewer_id: auth.user.id,
    approved_public_url: approvedUrl, approved_public_storage_key: approvedKey, reason: reason || null, category,
  })
  if (error) {
    if (approvedKey) await admin.from('profile_media_copy_orphans').insert({ submission_id: id, storage_provider: 'r2', storage_key: approvedKey })
    return jsonNoStore({ ok: false, error: 'A solicitacao ja foi revisada ou e invalida.' }, 409)
  }
  const submission = sanitizeProfileMediaReviewResult(data)
  if (!submission) return jsonNoStore({ ok: false, error: 'Resposta de revisao invalida.' }, 500)
  return jsonNoStore({ ok: true, submission })
}
