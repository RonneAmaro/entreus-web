import {
  createAuthorizedAttachmentDownload,
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

export async function GET(request: Request) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const { searchParams } = new URL(request.url)
  const attachmentId = parseUuid(searchParams.get('attachmentId'))
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
    if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

    const download = await createAuthorizedAttachmentDownload({
      supabase: access.supabase,
      attachment,
    })
    return jsonNoStore({ ok: true, ...download })
  } catch (error) {
    return responseForMessageAttachmentError(error, 'DOWNLOAD_FAILED')
  }
}
