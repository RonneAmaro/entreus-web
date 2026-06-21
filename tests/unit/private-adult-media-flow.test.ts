import { describe, expect, it } from 'vitest'
import { canPreparePostMediaUpload, resolvePostMediaAccessLevel } from '../../lib/media/post-media-access'

describe('private adult media upload policy', () => {
  it('classifies a coherent adult request as adult_private', () => {
    expect(resolvePostMediaAccessLevel({ communityType: 'adult_18plus', contentRating: 'adult_18plus' })).toBe('adult_private')
  })

  it('rejects mixed adult classification and blocks unapproved creators', () => {
    expect(resolvePostMediaAccessLevel({ communityType: 'adult_18plus', contentRating: 'safe' })).toBeNull()
    expect(canPreparePostMediaUpload('adult_private', null)).toBe(false)
    expect(canPreparePostMediaUpload('adult_private', { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' })).toBe(true)
  })

  it('keeps ordinary uploads public', () => {
    expect(resolvePostMediaAccessLevel({ communityType: 'general', contentRating: 'safe' })).toBe('public')
  })
})
