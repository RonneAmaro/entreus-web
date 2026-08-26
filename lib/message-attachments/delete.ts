import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deleteMessageAttachmentObject,
  isPrivateMessageAttachmentR2Reference,
  isMissingR2ObjectError,
  validateStoredMessageAttachmentKey,
} from './r2'
import { validateSupabaseStorageReferenceForAttachment, type MessageAttachmentRow } from './security'

export type StoredMessageAttachmentDeleteResult = Readonly<{
  ok: boolean
  storageDeleted: boolean
  storageMissing: boolean
  error: 'INVALID_STORAGE_PATH' | 'R2_DELETE_FAILED' | 'SUPABASE_DELETE_FAILED' | null
}>

export async function deleteStoredMessageAttachment(
  supabase: SupabaseClient,
  attachment: MessageAttachmentRow,
): Promise<StoredMessageAttachmentDeleteResult> {
  if (!attachment.storage_path) {
    return failure('INVALID_STORAGE_PATH')
  }

  const privateKey = validateStoredMessageAttachmentKey(attachment)
  if (privateKey) {
    try {
      await deleteMessageAttachmentObject(privateKey.key)
      return success(true, false)
    } catch (error) {
      if (isMissingR2ObjectError(error)) return success(false, true)
      return failure('R2_DELETE_FAILED')
    }
  }

  if (isPrivateMessageAttachmentR2Reference(attachment.storage_path)) {
    return failure('INVALID_STORAGE_PATH')
  }

  const legacy = validateSupabaseStorageReferenceForAttachment(attachment, {
    requireSenderBinding: true,
  })
  if (!legacy) return failure('INVALID_STORAGE_PATH')

  const { error } = await supabase.storage.from(legacy.bucket).remove([legacy.objectPath])
  return error ? failure('SUPABASE_DELETE_FAILED') : success(true, false)
}

function success(storageDeleted: boolean, storageMissing: boolean): StoredMessageAttachmentDeleteResult {
  return { ok: true, storageDeleted, storageMissing, error: null }
}

function failure(error: Exclude<StoredMessageAttachmentDeleteResult['error'], null>): StoredMessageAttachmentDeleteResult {
  return { ok: false, storageDeleted: false, storageMissing: false, error }
}
