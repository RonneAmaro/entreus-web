import { describe, expect, it } from 'vitest'
import { createEmptyCreatorMetrics, normalizeCreatorPosts, summarizeCreatorPosts } from '../../lib/creator-dashboard/creator-metrics'

describe('creator dashboard metrics', () => {
  it('uses safe empty fallbacks', () => expect(createEmptyCreatorMetrics().posts).toBe(0))
  it('removes media and storage fields from recent posts', () => {
    const result = normalizeCreatorPosts([{ id: 'p1', content: 'teste', created_at: '2026-01-01', media_url: 'x', storage_key: 'x', image_url: 'x', video_url: 'x' }])
    expect(result[0]).toEqual({ id: 'p1', excerpt: 'teste', createdAt: '2026-01-01', classification: 'Seguro' })
  })
  it('counts adult posts safely', () => expect(summarizeCreatorPosts([{ community_type: 'adult_18plus' }]).adultPosts).toBe(1))
})
