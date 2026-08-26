import type { SupabaseClient } from '@supabase/supabase-js'
import {
  classifyMessageAttachmentSignature,
  copyPendingMessageAttachmentToFinal,
  deleteMessageAttachmentObject,
  getMessageAttachmentsBucketName,
  headMessageAttachmentObject,
  readMessageAttachmentSignatureSample,
  validateFinalMessageAttachmentKeyForPending,
  validatePendingMessageAttachmentKey,
  validateStoredMessageAttachmentKey,
  type MessageAttachmentSignatureStatus,
} from '@/lib/message-attachments/r2'
import {
  claimPendingMessageAttachment,
  createConfirmedMessageAttachment,
  enforceConfirmRateLimit,
  hasMessageAttachmentAtPosition,
  jsonNoStore,
  loadAttachmentByStorageKey,
  loadPendingMessageAttachment,
  markPendingMessageAttachment,
  parseUuid,
  publicMessageAttachment,
  requireConversationParticipant,
  requireMessageAttachmentAuth,
  requireOwnedMessage,
  responseForMessageAttachmentError,
  validatePendingMessageAttachmentMetadata,
  type PendingAttachmentRow,
} from '@/lib/message-attachments/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  const pendingUploadId = parseUuid(body.pendingUploadId)
  if (!pendingUploadId) return jsonNoStore({ ok: false, error: 'INVALID_PENDING_UPLOAD' }, 400)

  let claimed: PendingAttachmentRow | null = null
  let attachmentPersisted = false
  try {
    const pending = await loadPendingMessageAttachment(access.supabase, pendingUploadId)
    if (!pending) return jsonNoStore({ ok: false, error: 'PENDING_NOT_FOUND' }, 404)
    if (pending.user_id !== access.auth.user.id) {
      return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    }

    const authorized = await revalidatePendingAuthorization(access.supabase, pending, access.auth.user.id)
    if (!authorized) return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)

    if (pending.status === 'confirmed') {
      return responseForConfirmedPending(access.supabase, pending)
    }
    if (pending.status === 'confirming') {
      const existing = await loadAttachmentByStorageKey({ supabase: access.supabase, pending })
      if (!existing) {
        if (!Number.isFinite(Date.parse(pending.expires_at)) || Date.parse(pending.expires_at) <= Date.now()) {
          await cleanupClaimedObjects(access.supabase, pending)
          return jsonNoStore({ ok: false, error: 'PENDING_EXPIRED' }, 410)
        }
        return jsonNoStore({ ok: false, error: 'CONFIRM_IN_PROGRESS' }, 409)
      }
      if (!validateStoredMessageAttachmentKey(existing)) {
        return jsonNoStore({ ok: false, error: 'INVALID_STORAGE_SCOPE' }, 409)
      }
      await markPendingMessageAttachment(access.supabase, pending.id, 'confirmed', existing.id)
      await deleteObjectBestEffort(pending.storage_key)
      return jsonNoStore({
        ok: true,
        attachment: publicMessageAttachment(existing),
        alreadyConfirmed: true,
      })
    }
    if (pending.status === 'cleanup_required') {
      return jsonNoStore({ ok: false, error: 'UPLOAD_CLEANUP_REQUIRED' }, 409)
    }
    if (pending.status !== 'pending') {
      return jsonNoStore({ ok: false, error: 'INVALID_PENDING_STATUS' }, 409)
    }
    if (!Number.isFinite(Date.parse(pending.expires_at)) || Date.parse(pending.expires_at) <= Date.now()) {
      await rejectPendingObject(access.supabase, pending)
      return jsonNoStore({ ok: false, error: 'PENDING_EXPIRED' }, 410)
    }
    if (!validatePendingMessageAttachmentMetadata(pending)) {
      await rejectPendingObject(access.supabase, pending)
      return jsonNoStore({ ok: false, error: 'PENDING_METADATA_INVALID' }, 409)
    }
    if (
      !validatePendingMessageAttachmentKey(pending)
      || pending.storage_provider !== 'cloudflare-r2'
      || !getMessageAttachmentsBucketName()
      || pending.storage_bucket !== getMessageAttachmentsBucketName()
    ) {
      await rejectPendingObject(access.supabase, pending)
      return jsonNoStore({ ok: false, error: 'INVALID_STORAGE_TARGET' }, 409)
    }

    if (await hasMessageAttachmentAtPosition({
      supabase: access.supabase,
      messageId: pending.message_id,
      position: pending.position,
    })) {
      await rejectPendingObject(access.supabase, pending)
      return jsonNoStore({ ok: false, error: 'ATTACHMENT_POSITION_OCCUPIED' }, 409)
    }

    claimed = await claimPendingMessageAttachment(access.supabase, pending)
    if (!claimed) return jsonNoStore({ ok: false, error: 'CONFIRM_IN_PROGRESS' }, 409)
    const finalKey = validateFinalMessageAttachmentKeyForPending(claimed)
    if (!finalKey) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return jsonNoStore({ ok: false, error: 'INVALID_FINAL_STORAGE_TARGET' }, 409)
    }

    const pendingValidation = await validateStoredObject(claimed.storage_key, claimed, 'UPLOAD')
    if ('error' in pendingValidation) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return pendingValidation.error
    }

    try {
      await copyPendingMessageAttachmentToFinal({
        pendingKey: claimed.storage_key,
        finalKey: finalKey.key,
        contentType: claimed.declared_mime,
        sourceEtag: pendingValidation.head.etag,
      })
    } catch {
      await cleanupClaimedObjects(access.supabase, claimed)
      return jsonNoStore({ ok: false, error: 'FINAL_COPY_FAILED' }, 502)
    }

    const finalValidation = await validateStoredObject(finalKey.key, claimed, 'FINAL')
    if ('error' in finalValidation) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return finalValidation.error
    }

    const finallyAuthorized = await revalidatePendingAuthorization(
      access.supabase,
      claimed,
      access.auth.user.id,
    )
    if (!finallyAuthorized) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return jsonNoStore({ ok: false, error: 'FORBIDDEN' }, 403)
    }
    if (await hasMessageAttachmentAtPosition({
      supabase: access.supabase,
      messageId: claimed.message_id,
      position: claimed.position,
    })) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return jsonNoStore({ ok: false, error: 'ATTACHMENT_POSITION_OCCUPIED' }, 409)
    }

    const confirmation = await createConfirmedMessageAttachment({
      supabase: access.supabase,
      pending: claimed,
      needsDeeperInspection: finalValidation.signatureStatus === 'needs_deeper_inspection',
    })
    attachmentPersisted = true
    if (!validateStoredMessageAttachmentKey(confirmation.attachment)) {
      await cleanupClaimedObjects(access.supabase, claimed)
      return jsonNoStore({ ok: false, error: 'INVALID_STORAGE_SCOPE' }, 409)
    }

    await markPendingMessageAttachment(
      access.supabase,
      claimed.id,
      'confirmed',
      confirmation.attachment.id,
    )
    await deleteObjectBestEffort(claimed.storage_key)

    return jsonNoStore({
      ok: true,
      attachment: publicMessageAttachment(confirmation.attachment),
      alreadyConfirmed: confirmation.alreadyConfirmed,
      needsDeeperInspection: finalValidation.signatureStatus === 'needs_deeper_inspection',
    })
  } catch (error) {
    if (claimed && !attachmentPersisted) {
      await cleanupClaimedObjectsBestEffort(access.supabase, claimed)
    }
    return responseForMessageAttachmentError(error, 'CONFIRM_FAILED')
  }
}

async function responseForConfirmedPending(supabase: SupabaseClient, pending: PendingAttachmentRow) {
  const attachment = await loadAttachmentByStorageKey({ supabase, pending })
  if (!attachment) return jsonNoStore({ ok: false, error: 'CONFIRMATION_INCOMPLETE' }, 409)
  if (!validateStoredMessageAttachmentKey(attachment)) {
    return jsonNoStore({ ok: false, error: 'INVALID_STORAGE_SCOPE' }, 409)
  }
  return jsonNoStore({
    ok: true,
    attachment: publicMessageAttachment(attachment),
    alreadyConfirmed: true,
  })
}

async function revalidatePendingAuthorization(
  supabase: SupabaseClient,
  pending: PendingAttachmentRow,
  userId: string,
) {
  const participant = await requireConversationParticipant({
    supabase,
    conversationId: pending.conversation_id,
    userId,
  })
  if (!participant) return false
  return requireOwnedMessage({
    supabase,
    conversationId: pending.conversation_id,
    messageId: pending.message_id,
    userId,
  })
}

type ValidatedStoredMessageObject =
  | { error: Response }
  | {
      head: Awaited<ReturnType<typeof headMessageAttachmentObject>>
      signatureStatus: Exclude<
        MessageAttachmentSignatureStatus,
        'rejected' | 'file_content_unverified'
      >
    }

async function validateStoredObject(
  key: string,
  pending: PendingAttachmentRow,
  phase: 'UPLOAD' | 'FINAL',
): Promise<ValidatedStoredMessageObject> {
  let head: Awaited<ReturnType<typeof headMessageAttachmentObject>>
  try {
    head = await headMessageAttachmentObject(key)
  } catch {
    return { error: jsonNoStore({ ok: false, error: `${phase}_OBJECT_UNAVAILABLE` }, 409) }
  }

  if (head.contentLength !== pending.declared_size || head.contentType !== pending.declared_mime) {
    return { error: jsonNoStore({ ok: false, error: `${phase}_METADATA_MISMATCH` }, 409) }
  }

  let sample: Uint8Array
  try {
    sample = await readMessageAttachmentSignatureSample(key)
  } catch {
    sample = new Uint8Array()
  }
  const signatureStatus = classifyMessageAttachmentSignature({
    mediaType: pending.media_type,
    declaredMime: pending.declared_mime,
    sampleBytes: sample,
  })
  if (signatureStatus === 'rejected' || signatureStatus === 'file_content_unverified') {
    return {
      error: jsonNoStore({
        ok: false,
        error: signatureStatus === 'rejected'
          ? `${phase}_SIGNATURE_MISMATCH`
          : `${phase}_CONTENT_UNVERIFIED`,
      }, 415),
    }
  }
  return { head, signatureStatus }
}

async function rejectPendingObject(supabase: SupabaseClient, pending: PendingAttachmentRow) {
  await deleteObjectBestEffort(pending.storage_key)
  await markPendingMessageAttachment(supabase, pending.id, 'cleanup_required')
}

async function cleanupClaimedObjects(supabase: SupabaseClient, pending: PendingAttachmentRow) {
  if (pending.final_storage_key) await deleteObjectBestEffort(pending.final_storage_key)
  await deleteObjectBestEffort(pending.storage_key)
  await markPendingMessageAttachment(supabase, pending.id, 'cleanup_required')
}

async function cleanupClaimedObjectsBestEffort(supabase: SupabaseClient, pending: PendingAttachmentRow) {
  try {
    await cleanupClaimedObjects(supabase, pending)
  } catch {
    // A later cleanup job can retry rows that remain in confirming/cleanup_required.
  }
}

async function deleteObjectBestEffort(key: string) {
  try {
    await deleteMessageAttachmentObject(key)
  } catch {
    // Cleanup is best-effort; database state remains available for a later retry.
  }
}
