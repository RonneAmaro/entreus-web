import { jsonNoStore, requireConversationParticipant, requireMessageAttachmentAuth, type MessageAttachmentRow } from '@/lib/message-attachments/security'
import { createAuthorizedAttachmentDownload } from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isSafeId(value: string | null) {
  return Boolean(value && /^[0-9a-fA-F-]{20,80}$/.test(value))
}

export async function GET(request: Request) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { searchParams } = new URL(request.url)
  const attachmentId = searchParams.get('attachmentId')
  if (!isSafeId(attachmentId)) {
    return jsonNoStore({ ok: false, error: 'INVALID_ATTACHMENT' }, 400)
  }

  const { data, error } = await access.supabase
    .from('message_attachments')
    .select('id, conversation_id, message_id, sender_id, storage_path, file_name, mime_type, media_type, file_size, needs_deeper_inspection, file_content_unverified')
    .eq('id', attachmentId)
    .maybeSingle()

  if (error || !data) {
    return jsonNoStore({ ok: false, error: 'ATTACHMENT_NOT_FOUND' }, 404)
  }

  const attachment = data as MessageAttachmentRow
  try {
    const isParticipant = await requireConversationParticipant({
      supabase: access.supabase,
      conversationId: attachment.conversation_id,
      userId: access.auth.user.id,
    })
    if (!isParticipant) {
      return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    }

    const download = await createAuthorizedAttachmentDownload({
      supabase: access.supabase,
      attachment,
    })

    return jsonNoStore({
      ok: true,
      provider: download.provider,
      url: download.url,
      expiresIn: download.expiresIn,
    })
  } catch {
    return jsonNoStore({ ok: false, error: 'DOWNLOAD_FAILED' }, 500)
  }
}
