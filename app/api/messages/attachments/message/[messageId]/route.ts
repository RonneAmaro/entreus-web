import { jsonNoStore, requireConversationParticipant, requireMessageAttachmentAuth } from '@/lib/message-attachments/security'
import { deleteStoredMessageAttachment } from '@/lib/message-attachments/delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ messageId: string }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { messageId } = await context.params
  if (!messageId) return jsonNoStore({ ok: false, error: 'INVALID_MESSAGE' }, 400)

  const { data: message, error: messageError } = await access.supabase
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', messageId)
    .maybeSingle()

  if (messageError || !message) return jsonNoStore({ ok: false, error: 'MESSAGE_NOT_FOUND' }, 404)

  const isParticipant = await requireConversationParticipant({
    supabase: access.supabase,
    conversationId: message.conversation_id,
    userId: access.auth.user.id,
  })
  if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
  if (message.sender_id !== access.auth.user.id) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

  const { data: attachments } = await access.supabase
    .from('message_attachments')
    .select('id, storage_path')
    .eq('message_id', messageId)
    .eq('sender_id', access.auth.user.id)

  const results = []
  for (const attachment of attachments || []) {
    results.push(await deleteStoredMessageAttachment(access.supabase, attachment))
  }

  const { error: deleteError } = await access.supabase
    .from('message_attachments')
    .delete()
    .eq('message_id', messageId)
    .eq('sender_id', access.auth.user.id)

  if (deleteError) return jsonNoStore({ ok: false, error: 'DELETE_FAILED' }, 500)

  return jsonNoStore({ ok: true, results })
}
