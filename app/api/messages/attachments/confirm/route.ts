import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { deleteStoredMessageAttachment } from '@/lib/message-attachments/delete'
import {
  enforceConfirmRateLimit,
  jsonNoStore,
  loadPendingMessageAttachment,
  readMessageAttachmentSignatureSample,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  requireOwnedMessage,
} from '@/lib/message-attachments/security'
import {
  classifyMessageAttachmentSignature,
  getMessageAttachmentsBucketName,
  getMessageAttachmentsR2Client,
  isSafePrivateMessageAttachmentKey,
  normalizeHeadMetadata,
} from '@/lib/message-attachments/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const access = await requireMessageAttachmentAuth(request)
  if ('error' in access) return access.error

  const rateLimited = await enforceConfirmRateLimit(request, access.auth.user.id)
  if (rateLimited) return rateLimited

  let body: { pendingUploadId?: unknown }
  try {
    body = (await request.json()) as { pendingUploadId?: unknown }
  } catch {
    return jsonNoStore({ ok: false, error: 'INVALID_JSON' }, 400)
  }

  const pendingUploadId = typeof body.pendingUploadId === 'string' ? body.pendingUploadId.trim() : ''
  if (!pendingUploadId) return jsonNoStore({ ok: false, error: 'INVALID_PENDING_UPLOAD' }, 400)

  try {
    const pending = await loadPendingMessageAttachment(access.supabase, pendingUploadId)
    if (!pending) return jsonNoStore({ ok: false, error: 'PENDING_NOT_FOUND' }, 404)
    if (pending.user_id !== access.auth.user.id) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    if (pending.status === 'confirmed') {
      const existing = await access.supabase
        .from('message_attachments')
        .select('id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, created_at')
        .eq('message_id', pending.message_id)
        .eq('sender_id', pending.user_id)
        .eq('storage_path', pending.storage_key)
        .maybeSingle()
      return jsonNoStore({ ok: true, attachment: existing.data || null, alreadyConfirmed: true })
    }
    if (pending.status === 'cleanup_required') {
      return jsonNoStore({ ok: false, error: 'UPLOAD_CLEANUP_REQUIRED' }, 409)
    }
    if (Date.parse(pending.expires_at) <= Date.now()) {
      return jsonNoStore({ ok: false, error: 'PENDING_EXPIRED' }, 410)
    }

    const isParticipant = await requireConversationParticipant({
      supabase: access.supabase,
      conversationId: pending.conversation_id,
      userId: access.auth.user.id,
    })
    if (!isParticipant) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

    const ownsMessage = await requireOwnedMessage({
      supabase: access.supabase,
      conversationId: pending.conversation_id,
      messageId: pending.message_id,
      userId: access.auth.user.id,
    })
    if (!ownsMessage) return jsonNoStore({ ok: false, error: 'MESSAGE_NOT_OWNED' }, 403)
    if (!isSafePrivateMessageAttachmentKey(pending.storage_key)) {
      return jsonNoStore({ ok: false, error: 'INVALID_STORAGE_KEY' }, 400)
    }

    const client = getMessageAttachmentsR2Client()
    const bucket = getMessageAttachmentsBucketName()
    if (!client || !bucket) return jsonNoStore({ ok: false, error: 'R2_CONFIG_MISSING' }, 503)

    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: pending.storage_key }))
    const normalized = normalizeHeadMetadata(head)

    if (bucket !== pending.storage_bucket || normalized.contentLength !== pending.declared_size || normalized.contentType !== pending.declared_mime) {
      await access.supabase
        .from('private_message_attachment_uploads')
        .update({ status: 'cleanup_required' })
        .eq('id', pending.id)
      return jsonNoStore({ ok: false, error: 'UPLOAD_METADATA_MISMATCH' }, 409)
    }

    const sample = await readMessageAttachmentSignatureSample(pending.storage_key).catch(() => new Uint8Array())
    const signatureStatus = sample.byteLength > 0
      ? classifyMessageAttachmentSignature({
          mediaType: pending.media_type,
          declaredMime: pending.declared_mime,
          sampleBytes: sample,
        })
      : 'file_content_unverified'

    if (signatureStatus === 'rejected') {
      await deleteStoredMessageAttachment(access.supabase, { storage_path: pending.storage_key })
      await access.supabase
        .from('private_message_attachment_uploads')
        .update({ status: 'cleanup_required' })
        .eq('id', pending.id)
      return jsonNoStore({ ok: false, error: 'UPLOAD_SIGNATURE_MISMATCH' }, 415)
    }

    const insertPayload = {
      message_id: pending.message_id,
      conversation_id: pending.conversation_id,
      sender_id: access.auth.user.id,
      storage_path: pending.storage_key,
      media_type: pending.media_type,
      file_name: pending.file_name,
      file_size: pending.declared_size,
      mime_type: pending.declared_mime,
      position: pending.position,
      needs_deeper_inspection: signatureStatus === 'needs_deeper_inspection',
      file_content_unverified: signatureStatus === 'file_content_unverified',
    }

    const { data: existingAttachment } = await access.supabase
      .from('message_attachments')
      .select('id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, created_at')
      .eq('message_id', pending.message_id)
      .eq('sender_id', access.auth.user.id)
      .eq('storage_path', pending.storage_key)
      .maybeSingle()

    const attachmentResult = existingAttachment
      ? { data: existingAttachment, error: null }
      : await access.supabase
          .from('message_attachments')
          .insert(insertPayload)
          .select('id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, created_at')
          .single()

    if (attachmentResult.error || !attachmentResult.data) {
      await deleteStoredMessageAttachment(access.supabase, { storage_path: pending.storage_key })
      await access.supabase
        .from('private_message_attachment_uploads')
        .update({ status: 'cleanup_required' })
        .eq('id', pending.id)
      return jsonNoStore({ ok: false, error: 'ATTACHMENT_INSERT_FAILED' }, 500)
    }

    await access.supabase
      .from('private_message_attachment_uploads')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', pending.id)

    return jsonNoStore({ ok: true, attachment: attachmentResult.data, alreadyConfirmed: Boolean(existingAttachment) })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'CONFIRM_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    )
  }
}
