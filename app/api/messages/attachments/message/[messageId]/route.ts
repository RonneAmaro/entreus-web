import {
  jsonNoStore,
  listMessageAttachments,
  loadMessageForAttachmentAccess,
  parseUuid,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  responseForMessageAttachmentError,
} from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { messageId: rawMessageId } = await context.params
  const messageId = parseUuid(rawMessageId)
  if (!messageId) return jsonNoStore({ ok: false, error: 'INVALID_MESSAGE' }, 400)

  try {
    const message = await loadMessageForAttachmentAccess({
      supabase: access.supabase,
      messageId,
    })
    if (!message) return jsonNoStore({ ok: false, error: 'MESSAGE_NOT_FOUND' }, 404)

    const isParticipant = await requireConversationParticipant({
      supabase: access.supabase,
      conversationId: message.conversation_id,
      userId: access.auth.user.id,
    })
    if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

    const attachments = await listMessageAttachments({
      supabase: access.supabase,
      messageId,
    })
    return jsonNoStore({ ok: true, messageId, attachments })
  } catch (error) {
    return responseForMessageAttachmentError(error, 'ATTACHMENT_LIST_FAILED')
  }
}
