import { NextResponse } from 'next/server'
import {
  createPendingMessageAttachment,
  enforcePrepareRateLimit,
  jsonNoStore,
  parsePrepareRequest,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  requireOwnedMessage,
} from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const rateLimited = await enforcePrepareRateLimit(request, access.auth.user.id)
  if (rateLimited) return rateLimited

  const parsed = await parsePrepareRequest(request)
  if ('error' in parsed) return parsed.error

  try {
    const isParticipant = await requireConversationParticipant({
      supabase: access.supabase,
      conversationId: parsed.body.conversationId,
      userId: access.auth.user.id,
    })
    if (!isParticipant) {
      return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    }

    const ownsMessage = await requireOwnedMessage({
      supabase: access.supabase,
      conversationId: parsed.body.conversationId,
      messageId: parsed.body.messageId,
      userId: access.auth.user.id,
    })
    if (!ownsMessage) {
      return jsonNoStore({ ok: false, error: 'MESSAGE_NOT_OWNED' }, 403)
    }

    const prepared = await createPendingMessageAttachment({
      supabase: access.supabase,
      userId: access.auth.user.id,
      conversationId: parsed.body.conversationId,
      messageId: parsed.body.messageId,
      mediaType: parsed.body.mediaType,
      fileName: parsed.body.fileName,
      declaredMime: parsed.body.declaredMime,
      declaredSize: parsed.body.declaredSize,
      position: parsed.body.position,
    })

    return jsonNoStore({
      ok: true,
      pendingUploadId: prepared.pending.id,
      uploadUrl: prepared.uploadUrl,
      storageProvider: prepared.pending.storage_provider,
      storageBucket: prepared.pending.storage_bucket,
      storageKey: prepared.pending.storage_key,
      expiresIn: 300,
      expiresAt: prepared.expiresAt,
      maxBytes: parsed.body.declaredSize,
      mediaType: parsed.body.mediaType,
      contentType: parsed.body.declaredMime,
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'PREPARE_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    )
  }
}
