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
    expect(sanitizePostMediaForViewer(media, adult, { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' })).toEqual(expect.objectContaining({ requiresSignedUrl: true }))
  })
})
