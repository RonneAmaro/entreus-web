import { jsonNoStore, requireConversationParticipant, requireMessageAttachmentAuth } from '@/lib/message-attachments/security'
import { deleteStoredMessageAttachment } from '@/lib/message-attachments/delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ attachmentId: string }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { attachmentId } = await context.params
  if (!attachmentId) return jsonNoStore({ ok: false, error: 'INVALID_ATTACHMENT' }, 400)

  const { data: attachment, error } = await access.supabase
    .from('message_attachments')
    .select('id, message_id, conversation_id, sender_id, storage_path, file_name, mime_type, media_type, file_size')
    .eq('id', attachmentId)
    .maybeSingle()

  if (error || !attachment) return jsonNoStore({ ok: false, error: 'ATTACHMENT_NOT_FOUND' }, 404)

  const isParticipant = await requireConversationParticipant({
    supabase: access.supabase,
    conversationId: attachment.conversation_id,
    userId: access.auth.user.id,
  })
  if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
  if (attachment.sender_id !== access.auth.user.id) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

  const storageResult = await deleteStoredMessageAttachment(access.supabase, attachment)
  const { error: deleteError } = await access.supabase.from('message_attachments').delete().eq('id', attachment.id)
  if (deleteError) {
    return jsonNoStore({ ok: false, error: 'DELETE_FAILED', storageError: storageResult.error }, 500)
  }

  return jsonNoStore({ ok: true, storageDeleted: storageResult.storageDeleted, storageMissing: storageResult.storageMissing, storageError: storageResult.error })
}
