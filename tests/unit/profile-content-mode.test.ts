import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProfileContentModeUpdate,
  canSaveProfileContentMode,
  getSafeProfileContentMode,
  isProfileContentMode,
  profileContentModeRequiresConfirmation,
} from '../../lib/profile-content-mode'
import {
  getComposerProfileContentModeGuidance,
  getComposerPublishSummary,
} from '../../lib/post-composer-ux'
import {
  isPublicCreatorProfilePost,
  prepareCreatorExclusivePosts,
} from '../../lib/creator-profile-access'

function makeSafePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    user_id: 'creator-1',
    content: 'conteudo seguro',
    visibility: 'public',
    is_paid: false,
    price_itacash: null,
    paid_unlocked: false,
    community_type: 'general',
    content_rating: 'safe',
    category: 'daily',
    moderation_status: 'active',
    media: [],
    ...overrides,
  }
}

describe('creator profile content mode', () => {
  it('falls back to general for absent or invalid values', () => {
    expect(getSafeProfileContentMode(undefined)).toBe('general')
    expect(getSafeProfileContentMode(null)).toBe('general')
    expect(getSafeProfileContentMode('invalid')).toBe('general')
  })

  it('accepts general, adult, and mixed values', () => {
    expect(isProfileContentMode('general')).toBe(true)
    expect(isProfileContentMode('adult')).toBe(true)
    expect(isProfileContentMode('mixed')).toBe(true)
    expect(getSafeProfileContentMode('general')).toBe('general')
    expect(getSafeProfileContentMode('adult')).toBe('adult')
    expect(getSafeProfileContentMode('mixed')).toBe('mixed')
  })

  it('requires interface confirmation for adult and mixed modes', () => {
    expect(profileContentModeRequiresConfirmation('general')).toBe(false)
    expect(profileContentModeRequiresConfirmation('adult')).toBe(true)
    expect(profileContentModeRequiresConfirmation('mixed')).toBe(true)
    expect(canSaveProfileContentMode('adult', false)).toBe(false)
    expect(canSaveProfileContentMode('mixed', true)).toBe(true)
  })

  it('does not let profile mode mutate age opt-in or verification fields', () => {
    const update = buildProfileContentModeUpdate('adult')

    expect(update).toMatchObject({ profile_content_mode: 'adult' })
    expect(update).not.toHaveProperty('wants_18_plus')
    expect(update).not.toHaveProperty('age_verification_status')
    expect(update).not.toHaveProperty('age_verified_at')
  })

  it('does not transform safe posts into adult posts for adult or mixed profiles', () => {
    const safePost = makeSafePost()

    expect(getSafeProfileContentMode('adult')).toBe('adult')
    expect(isPublicCreatorProfilePost(safePost)).toBe(true)
    expect(getSafeProfileContentMode('mixed')).toBe('mixed')
    expect(isPublicCreatorProfilePost(safePost)).toBe(true)
  })

  it('allows a general profile to create a safe premium post classification', () => {
    const paidSafePost = makeSafePost({ is_paid: true, price_itacash: 30 })
    const posts = prepareCreatorExclusivePosts([paidSafePost], {
      viewerId: 'viewer-1',
      viewerProfile: { isMinor: false, wants18Plus: false, ageVerificationStatus: 'not_started' },
    })

    expect(getSafeProfileContentMode('general')).toBe('general')
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBeNull()
    expect(posts[0].price_itacash).toBe(30)
  })

  it('keeps the Composer safe by default while adding profile guidance', () => {
    expect(getComposerPublishSummary({
      communityLabel: 'Geral',
      visibilityLabel: 'Publica',
      contentRatingLabel: 'Seguro',
      isPaidPost: false,
    })).toContainEqual({ label: 'Classificacao', value: 'Seguro' })
    expect(getComposerProfileContentModeGuidance('general')).toBeNull()
    expect(getComposerProfileContentModeGuidance('adult')).toContain('seguro por padrao')
    expect(getComposerProfileContentModeGuidance('mixed')).toContain('publica ou 18+')
  })

  it('keeps settings usable when the column is absent', () => {
    const settingsPage = fs.readFileSync(path.join(process.cwd(), 'app/settings/page.tsx'), 'utf8')

    expect(settingsPage).toContain('profile_content_mode')
    expect(settingsPage).toContain("select('username, display_name, avatar_url')")
    expect(settingsPage).toContain('getSafeProfileContentMode')
  })

  it('uses a private no-store API response and rejects invalid values', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/profile/content-mode/route.ts'), 'utf8')

    expect(route).toContain('PRIVATE_NO_STORE_HEADERS')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('export const revalidate = 0')
    expect(route).toContain("export const fetchCache = 'force-no-store'")
    expect(route).toContain('!isProfileContentMode(requestedMode)')
  })

  it('requires authentication and only updates the authenticated profile', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/profile/content-mode/route.ts'), 'utf8')

    expect(route).toContain('supabaseResult.supabase.auth.getUser()')
    expect(route).toContain(".eq('id', user.id)")
    expect(route).not.toContain('userId')
    expect(route).not.toContain('buyerId')
  })
})
