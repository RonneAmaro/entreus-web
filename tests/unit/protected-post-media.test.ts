import { describe, expect, it } from 'vitest'
import { sanitizePostMediaForViewer } from '../../lib/media/protected-post-media'
const adult = { community_type: 'adult_18plus', content_rating: 'adult_18plus' }
const media = { id: 'media-1', media_url: 'https://example.invalid/public-file', storage_key: 'secret-key' }
describe('protected post media', () => {
  it('keeps safe media public but strips every adult locator when blocked', () => {
    expect(sanitizePostMediaForViewer(media, { community_type: 'general', content_rating: 'safe' }, null).media_url).toBe(media.media_url)
    expect(sanitizePostMediaForViewer(media, adult, null)).toEqual(expect.objectContaining({ protected: true, blocked: true }))
    expect(sanitizePostMediaForViewer(media, adult, null)).not.toHaveProperty('media_url')
    expect(sanitizePostMediaForViewer(media, adult, null)).not.toHaveProperty('storage_key')
  })
  it('requires a signed URL for approved opted-in adults or admin context', () => {
    const privateMedia = { ...media, access_level: 'adult_private', storage_provider: 'r2', storage_bucket: 'private', storage_key: 'protected/adult-post-media/user/file' }
    const payload = sanitizePostMediaForViewer(privateMedia, adult, { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' })
    expect(payload).toEqual(expect.objectContaining({ requiresSignedUrl: true }))
    expect(payload).not.toHaveProperty('storage_key')
    expect(payload).not.toHaveProperty('storage_bucket')
    expect(payload).not.toHaveProperty('storage_provider')
  })
  it('does not expose a legacy adult URL without trusted private metadata', () => {
    const payload = sanitizePostMediaForViewer(media, adult, { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' })
    expect(payload).toEqual(expect.objectContaining({ legacyUnavailable: true }))
    expect(payload).not.toHaveProperty('media_url')
  })
})
