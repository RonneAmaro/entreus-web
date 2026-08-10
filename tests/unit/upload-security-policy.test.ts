import { describe, expect, it } from 'vitest'
import {
  UPLOAD_CONTEXTS,
  UPLOAD_MEGABYTE,
  getUploadPolicy,
} from '../../lib/upload-security'

describe('central upload policies', () => {
  it('defines every required upload context', () => {
    expect(UPLOAD_CONTEXTS).toEqual(expect.arrayContaining([
      'post_image', 'post_video', 'message_image', 'message_video', 'message_audio',
      'profile_avatar', 'profile_banner', 'payment_proof', 'age_document',
      'age_selfie', 'parental_selfie', 'meet_attachment',
    ]))
    expect(UPLOAD_CONTEXTS).toHaveLength(12)
  })

  it('preserves approved limits and private/public intent', () => {
    expect(getUploadPolicy('post_image').maxBytes).toBe(5 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('post_video').maxBytes).toBe(50 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('profile_avatar').maxBytes).toBe(5 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('profile_banner').maxBytes).toBe(10 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('message_audio').maxBytes).toBe(50 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('age_document').maxBytes).toBe(5 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('parental_selfie').mayBePublic).toBe(false)
  })

  it('caps sensitive payment proofs at a documented conservative 10 MB', () => {
    const policy = getUploadPolicy('payment_proof')
    expect(policy.maxBytes).toBe(10 * UPLOAD_MEGABYTE)
    expect(policy.allowedMimes).toEqual(['image/png', 'image/jpeg', 'application/pdf'])
    expect(policy.mayBePublic).toBe(false)
  })

  it('reuses existing VIP and Elder video entitlement limits', () => {
    expect(getUploadPolicy('post_video', { badgeSlugs: ['vip'] }).maxBytes).toBe(200 * UPLOAD_MEGABYTE)
    expect(getUploadPolicy('post_video', { badgeSlugs: ['elder'] }).maxBytes).toBe(500 * UPLOAD_MEGABYTE)
  })

  it('explicitly rejects active formats from contexts that do not allow them', () => {
    for (const context of UPLOAD_CONTEXTS) {
      const policy = getUploadPolicy(context)
      expect(policy.allowedMimes).not.toContain('text/html')
      expect(policy.allowedMimes).not.toContain('image/svg+xml')
      expect(policy.allowedMimes).not.toContain('application/javascript')
      expect(policy.allowedMimes).not.toContain('application/zip')
      expect(policy.allowedExtensions).not.toContain('exe')
    }
  })
})
