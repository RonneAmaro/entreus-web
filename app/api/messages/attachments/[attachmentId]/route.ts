import { deleteStoredMessageAttachment } from '@/lib/message-attachments/delete'
import {
  jsonNoStore,
  loadMessageAttachment,
  parseUuid,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  responseForMessageAttachmentError,
} from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function DELETE(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { attachmentId: rawAttachmentId } = await context.params
  const attachmentId = parseUuid(rawAttachmentId)
  if (!attachmentId) return jsonNoStore({ ok: false, error: 'INVALID_ATTACHMENT' }, 400)

  try {
    const attachment = await loadMessageAttachment({
      supabase: access.supabase,
      attachmentId,
    })
    if (!attachment) return jsonNoStore({ ok: false, error: 'ATTACHMENT_NOT_FOUND' }, 404)

    const isParticipant = await requireConversationParticipant({
      supabase: access.supabase,
      conversationId: attachment.conversation_id,
      userId: access.auth.user.id,
    })
    if (!isParticipant || attachment.sender_id !== access.auth.user.id) {
      return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    }

    const storageResult = await deleteStoredMessageAttachment(access.supabase, attachment)
    if (!storageResult.ok) {
      return jsonNoStore({
        ok: false,
        error: 'STORAGE_DELETE_FAILED',
        storageError: storageResult.error,
      }, 502)
    }

    const { error } = await access.supabase
      .from('message_attachments')
      .delete()
      .eq('id', attachment.id)
      .eq('sender_id', access.auth.user.id)
    if (error) return jsonNoStore({ ok: false, error: 'ATTACHMENT_DELETE_FAILED' }, 500)

    return jsonNoStore({
      ok: true,
      storageDeleted: storageResult.storageDeleted,
      storageMissing: storageResult.storageMissing,
    })
  } catch (error) {
    return responseForMessageAttachmentError(error, 'DELETE_FAILED')
  }
}
