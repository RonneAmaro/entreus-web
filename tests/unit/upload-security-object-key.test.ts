import { describe, expect, it } from 'vitest'
import { buildUploadObjectKey, getUploadPolicy, isSafeObjectKeySegment } from '../../lib/upload-security'

describe('upload object keys', () => {
  it.each(['..', '.', 'a/b', 'a\\b', 'a?b', 'a#b', 'a\0b', 'a\nb', ''])('rejects a dangerous segment: %s', (segment) => {
    expect(isSafeObjectKeySegment(segment)).toBe(false)
  })

  it('builds an owner-scoped key with UUID and sanitized filename', () => {
    const key = buildUploadObjectKey({
      area: 'messages',
      ownerId: 'user-123',
      fileName: 'Minha Foto.JPG',
      policy: getUploadPolicy('message_image'),
      uuid: () => '123e4567-e89b-42d3-a456-426614174000',
    })
    expect(key).toBe('messages/user-123/123e4567-e89b-42d3-a456-426614174000/Minha-Foto.jpg')
  })

  it('generates unique keys without relying on timestamps', () => {
    const policy = getUploadPolicy('payment_proof')
    const first = buildUploadObjectKey({ area: 'proofs', ownerId: 'owner', fileName: 'proof.pdf', policy })
    const second = buildUploadObjectKey({ area: 'proofs', ownerId: 'owner', fileName: 'proof.pdf', policy })
    expect(first).not.toBe(second)
    expect(first.split('/')).toHaveLength(4)
  })
})
