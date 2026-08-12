import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyMessageAttachmentSignature,
  isSafePrivateMessageAttachmentKey,
  normalizeHeadMetadata,
} from '../../lib/message-attachments/r2'
import {
  parseMessageAttachmentMediaType,
  parseMessageAttachmentPosition,
  parseSupabaseStorageReference,
} from '../../lib/message-attachments/security'
import { getUploadPolicy, validateUploadMetadata } from '../../lib/upload-security'

const migration = readFileSync('supabase/migrations/20260810_harden_private_message_attachments.sql', 'utf8')
const downloadRoute = readFileSync('app/api/messages/attachments/download/route.ts', 'utf8')
const prepareRoute = readFileSync('app/api/messages/attachments/prepare/route.ts', 'utf8')
const confirmRoute = readFileSync('app/api/messages/attachments/confirm/route.ts', 'utf8')
const messagePage = readFileSync('app/messages/[id]/page.tsx', 'utf8')

describe('private message attachment hardening', () => {
  it('reuses the central 50 MiB server-side upload policy', () => {
    const policy = getUploadPolicy('message_video')
    expect(policy.maxBytes).toBe(50 * 1024 * 1024)
    expect(validateUploadMetadata({
      context: 'message_audio',
      fileName: 'audio.webm',
      declaredMime: 'audio/webm',
      declaredSize: 50 * 1024 * 1024,
    })).toMatchObject({ ok: true })
    expect(validateUploadMetadata({
      context: 'message_audio',
      fileName: 'audio.webm',
      declaredMime: 'audio/webm',
      declaredSize: 50 * 1024 * 1024 + 1,
    })).toEqual({ ok: false, code: 'file_too_large' })
  })

  it('rejects spoofing vectors in metadata and storage references', () => {
    expect(validateUploadMetadata({
      context: 'message_image',
      fileName: '../evil.png',
      declaredMime: 'image/png',
      declaredSize: 10,
    })).toEqual({ ok: false, code: 'file_name_invalid' })
    expect(parseSupabaseStorageReference('../private/messages/../../evil')).toBeNull()
    expect(parseSupabaseStorageReference('https://example.com/storage/v1/object/sign/another-bucket/file.png')).toBeNull()
  })

  it('allows only the expected private R2 prefix', () => {
    expect(isSafePrivateMessageAttachmentKey('private/messages/conversation/message/user/object/file.png')).toBe(true)
    expect(isSafePrivateMessageAttachmentKey('public/messages/conversation/file.png')).toBe(false)
    expect(isSafePrivateMessageAttachmentKey('private/messages/../../file.png')).toBe(false)
  })

  it('classifies matching, mismatched and inconclusive file signatures safely', () => {
    const mp4Header = Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70])
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
    const pdfHeader = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])
    const wavHeader = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
    const mp3Header = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0])

    expect(classifyMessageAttachmentSignature({
      mediaType: 'image',
      declaredMime: 'image/png',
      sampleBytes: pngHeader,
    })).toBe('verified')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'image',
      declaredMime: 'image/jpeg',
      sampleBytes: pngHeader,
    })).toBe('rejected')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'audio',
      declaredMime: 'audio/mpeg',
      sampleBytes: pdfHeader,
    })).toBe('rejected')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'audio',
      declaredMime: 'audio/wav',
      sampleBytes: wavHeader,
    })).toBe('verified')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'audio',
      declaredMime: 'audio/mpeg',
      sampleBytes: wavHeader,
    })).toBe('rejected')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'audio',
      declaredMime: 'audio/mpeg',
      sampleBytes: mp3Header,
    })).toBe('verified')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'video',
      declaredMime: 'video/mp4',
      sampleBytes: mp4Header,
    })).toBe('needs_deeper_inspection')
    expect(classifyMessageAttachmentSignature({
      mediaType: 'audio',
      declaredMime: 'audio/mpeg',
      sampleBytes: Uint8Array.from([1, 2, 3, 4]),
    })).toBe('file_content_unverified')
  })

  it('rejects signature mismatches before attachment lookup or insertion', () => {
    const rejectionStart = confirmRoute.indexOf("if (signatureStatus === 'rejected')")
    const insertStart = confirmRoute.indexOf('const insertPayload')
    const rejectionBranch = confirmRoute.slice(rejectionStart, insertStart)

    expect(rejectionStart).toBeGreaterThan(-1)
    expect(insertStart).toBeGreaterThan(rejectionStart)
    expect(rejectionBranch).toContain('deleteStoredMessageAttachment')
    expect(rejectionBranch).toContain("update({ status: 'cleanup_required' })")
    expect(rejectionBranch).toContain("error: 'UPLOAD_SIGNATURE_MISMATCH'")
    expect(rejectionBranch).not.toContain(".from('message_attachments')")
    expect(confirmRoute).toContain("pending.status === 'cleanup_required'")
  })

  it('normalizes head metadata before confirm checks', () => {
    expect(normalizeHeadMetadata({
      ContentType: 'image/png; charset=binary',
      ContentLength: 123,
    })).toEqual({ contentType: 'image/png', contentLength: 123 })
  })

  it('uses server routes for prepare, confirm and delete instead of direct client writes', () => {
    expect(prepareRoute).toContain("requireOwnedMessage")
    expect(confirmRoute).toContain("HeadObjectCommand")
    expect(messagePage).toContain("/api/messages/attachments/prepare")
    expect(messagePage).toContain("/api/messages/attachments/confirm")
    expect(messagePage).toContain("/api/messages/attachments/message/")
    expect(messagePage).toContain("/api/messages/attachments/")
    expect(messagePage).not.toContain(".from('message_attachments')\r\n      .insert(attachmentsToInsert)")
    expect(messagePage).not.toContain(".from('message-media')\r\n        .upload(")
  })

  it('keeps download limited to attachmentId with a short signed URL TTL', () => {
    expect(downloadRoute).toContain("searchParams.get('attachmentId')")
    expect(downloadRoute).not.toContain("searchParams.get('path')")
    expect(downloadRoute).toContain('expiresIn: download.expiresIn')
  })

  it('versions RLS without permissive true policies', () => {
    expect(migration).toContain('private_message_attachment_uploads')
    expect(migration).toContain('Participants can read private message attachments')
    expect(migration).not.toContain('USING (true)')
    expect(migration).not.toContain('WITH CHECK (true)')
  })

  it('accepts only supported logical media types', () => {
    expect(parseMessageAttachmentMediaType('image')).toBe('image')
    expect(parseMessageAttachmentMediaType('video')).toBe('video')
    expect(parseMessageAttachmentMediaType('audio')).toBe('audio')
    expect(parseMessageAttachmentMediaType('document')).toBeNull()
  })

  it('preserves the zero-based order for one, two and three attachments', () => {
    expect([0].map(parseMessageAttachmentPosition)).toEqual([0])
    expect([0, 1].map(parseMessageAttachmentPosition)).toEqual([0, 1])
    expect([0, 1, 2].map(parseMessageAttachmentPosition)).toEqual([0, 1, 2])
  })

  it('rejects invalid attachment positions', () => {
    for (const value of [-1, 3, 1.5, '1', null, undefined]) {
      expect(parseMessageAttachmentPosition(value)).toBeNull()
    }
  })

  it('binds ordering to the pending upload and reuses it during confirm and retries', () => {
    expect(prepareRoute).toContain('position: parsed.body.position')
    expect(confirmRoute).toContain('position: pending.position')
    expect(confirmRoute).not.toContain('body.position')
    expect(confirmRoute).toContain("pending.status === 'confirmed'")
    expect(messagePage).toContain('for (const [position, item] of files.entries())')
    expect(messagePage).toContain('position,')
  })

  it('keeps separate storage metadata for multiple attachments', () => {
    expect(confirmRoute).toContain(".eq('storage_path', pending.storage_key)")
    expect(migration).toContain('position smallint not null check (position between 0 and 2)')
    expect(migration).toContain('private_message_attachment_uploads_message_position_idx')
    expect(migration).toContain('revoke insert, update, delete on table public.message_attachments')
  })
})
