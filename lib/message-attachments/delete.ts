import { getSupabaseAdmin } from '@/lib/meet-server'
import {
  deleteMessageAttachmentObject,
  isMissingR2ObjectError,
  isSafePrivateMessageAttachmentKey,
} from './r2'
import { parseSupabaseStorageReference, type MessageAttachmentRow } from './security'

export async function deleteStoredMessageAttachment(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  attachment: Pick<MessageAttachmentRow, 'storage_path'>,
) {
  if (!attachment.storage_path) {
    return { storageDeleted: false, storageMissing: false, error: null as string | null }
  }

  if (isSafePrivateMessageAttachmentKey(attachment.storage_path)) {
    try {
      await deleteMessageAttachmentObject(attachment.storage_path)
      return { storageDeleted: true, storageMissing: false, error: null }
    } catch (error) {
      if (isMissingR2ObjectError(error)) {
        return { storageDeleted: false, storageMissing: true, error: null }
      }
      return { storageDeleted: false, storageMissing: false, error: 'R2_DELETE_FAILED' }
    }
  }

  const legacy = parseSupabaseStorageReference(attachment.storage_path)
  if (!legacy) {
    return { storageDeleted: false, storageMissing: false, error: 'INVALID_STORAGE_PATH' }
  }

  const { error } = await supabase.storage.from(legacy.bucket).remove([legacy.objectPath])
  return { storageDeleted: !error, storageMissing: false, error: error ? 'SUPABASE_DELETE_FAILED' : null }
}
