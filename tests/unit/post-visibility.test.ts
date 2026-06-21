import { describe, expect, it } from 'vitest'
import { applyPostVisibilityFilters, canReceiveRenderablePost } from '../../lib/post-visibility'

class Query {
  filters: string[] = []
  eq(column: string, value: string) { this.filters.push(`eq:${column}:${value}`); return this }
  neq(column: string, value: string) { this.filters.push(`neq:${column}:${value}`); return this }
}

const adult = { community_type: 'adult_18plus', content_rating: 'adult_18plus' }
const approved = { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' }

describe('post visibility', () => {
  it('limits the general feed at query time', () => {
    expect(applyPostVisibilityFilters(new Query(), null, 'general-feed').filters).toEqual([
      'eq:community_type:general', 'eq:content_rating:safe',
    ])
    expect(canReceiveRenderablePost(null, adult, 'general-feed')).toBe(false)
  })

  it('excludes adult rows for anonymous, minor, parental-consent and unverified viewers', () => {
    for (const viewer of [null, { isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' }, { isMinor: false, wants18Plus: true, parentalConsentStatus: 'approved', ageVerificationStatus: 'pending' }]) {
      expect(applyPostVisibilityFilters(new Query(), viewer, 'post-detail').filters).toEqual([
        'neq:community_type:adult_18plus', 'neq:content_rating:adult_18plus',
      ])
      expect(canReceiveRenderablePost(viewer, adult, 'public-list')).toBe(false)
    }
  })

  it('allows approved opted-in adults and admins in their moderation context', () => {
    expect(applyPostVisibilityFilters(new Query(), approved, 'saved').filters).toEqual([])
    expect(canReceiveRenderablePost(approved, adult, 'saved')).toBe(true)
    expect(canReceiveRenderablePost(null, adult, 'admin')).toBe(true)
  })
})
