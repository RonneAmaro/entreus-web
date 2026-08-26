import {
  MessageAttachmentServerError,
  createPendingMessageAttachment,
  enforcePrepareRateLimit,
  jsonNoStore,
  parsePrepareRequest,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  requireOwnedMessage,
  responseForMessageAttachmentError,
} from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
    if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

    const ownsMessage = await requireOwnedMessage({
      supabase: access.supabase,
      conversationId: parsed.body.conversationId,
      messageId: parsed.body.messageId,
      userId: access.auth.user.id,
    })
    if (!ownsMessage) return jsonNoStore({ ok: false, error: 'MESSAGE_NOT_OWNED' }, 403)

    const prepared = await createPendingMessageAttachment({
      supabase: access.supabase,
      userId: access.auth.user.id,
      prepared: parsed.body,
    })

    return jsonNoStore({
      ok: true,
      pendingUploadId: prepared.pending.id,
      uploadUrl: prepared.uploadUrl,
      expiresIn: prepared.expiresIn,
      expiresAt: prepared.expiresAt,
      contentType: parsed.body.declaredMime,
      contentLength: parsed.body.declaredSize,
    }, 201)
  } catch (error) {
    if (error instanceof MessageAttachmentServerError) {
      return responseForMessageAttachmentError(error, 'PREPARE_FAILED')
    }
    return jsonNoStore({ ok: false, error: 'PREPARE_FAILED' }, 500)
  }
}
