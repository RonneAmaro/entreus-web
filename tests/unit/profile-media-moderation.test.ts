import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildProfileMediaStoragePrefix, isProfileMediaReviewDecision, isProfileMediaType, ownsProfileMediaStorageKey, publicProfileFieldFor, requiresProfileMediaReview, sanitizeProfileMediaReviewResult } from '../../lib/profile-media-moderation'
import { buildApprovedProfileMediaKey, buildApprovedProfileMediaUrl, buildR2CopySource, validateProfileMediaObject } from '../../lib/profile-media-r2'

const submissionRoute = readFileSync('app/api/profile/media-submissions/route.ts', 'utf8')
const adminListRoute = readFileSync('app/api/admin/profile-media-submissions/route.ts', 'utf8')
const reviewRoute = readFileSync('app/api/admin/profile-media-submissions/[id]/review/route.ts', 'utf8')
const presignRoute = readFileSync('app/api/r2/presign/route.ts', 'utf8')
const profilePage = readFileSync('app/profile/page.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260712_create_profile_media_moderation.sql', 'utf8')
const r2Copy = readFileSync('lib/profile-media-r2.ts', 'utf8')

describe('profile media moderation', () => {
  it('sends adult and mixed profiles to manual review while general stays on the existing path', () => {
    expect(requiresProfileMediaReview('adult')).toBe(true)
    expect(requiresProfileMediaReview('mixed')).toBe(true)
    expect(requiresProfileMediaReview('general')).toBe(false)
    expect(migration).toContain("'pending_review', now(), now(), now()")
  })
  it('accepts only avatar/banner and valid review decisions', () => {
    expect(isProfileMediaType('avatar')).toBe(true); expect(isProfileMediaType('banner')).toBe(true); expect(isProfileMediaType('post')).toBe(false)
    expect(isProfileMediaReviewDecision('approved')).toBe(true); expect(isProfileMediaReviewDecision('rejected')).toBe(true); expect(isProfileMediaReviewDecision('change_requested')).toBe(true); expect(isProfileMediaReviewDecision('cancelled')).toBe(false)
  })
  it('binds protected keys to the authenticated owner and never accepts userId', () => {
    expect(buildProfileMediaStoragePrefix('user-a')).toBe('protected/profile-media/user-a/')
    expect(ownsProfileMediaStorageKey('user-a', 'protected/profile-media/user-a/file.webp')).toBe(true)
    expect(ownsProfileMediaStorageKey('user-a', 'protected/profile-media/user-b/file.webp')).toBe(false)
    expect(submissionRoute).not.toContain('body.userId')
    expect(submissionRoute).toContain('auth.user.id')
  })
  it('requires authentication and keeps personalized responses private', () => {
    expect(submissionRoute).toContain('requireUser(request)')
    expect(adminListRoute).toContain('requireUser(request)')
    expect(reviewRoute).toContain('requireUser(request)')
    for (const source of [submissionRoute, adminListRoute, reviewRoute]) {
      expect(source).toContain('PRIVATE_NO_STORE_HEADERS')
      expect(source).toContain("export const fetchCache = 'force-no-store'")
      expect(source).toContain('export const revalidate = 0')
    }
  })
  it('does not expose storage keys in user or admin payloads', () => {
    expect(submissionRoute).toContain("select('id, media_type, status, moderation_reason, submitted_at, reviewed_at')")
    expect(adminListRoute).toContain('...item, profile:')
    expect(adminListRoute).toContain('({ storage_key, content_type, ...item })')
    const safe = sanitizeProfileMediaReviewResult([{ id: 'review-1', user_id: 'user-1', media_type: 'avatar', status: 'approved', storage_key: 'secret', storage_bucket: 'secret-bucket', storage_provider: 'r2', reviewed_by: 'admin-1' }])
    expect(JSON.stringify(safe)).not.toContain('storage_key')
    expect(JSON.stringify(safe)).not.toContain('storage_bucket')
    expect(JSON.stringify(safe)).not.toContain('secret')
  })
  it('keeps pending and rejected media out of the public profile', () => {
    expect(profilePage).toContain('setAvatarPreview(profile?.avatar_url')
    expect(profilePage).toContain('setBannerPreview(profile?.banner_url')
    expect(migration).toContain("if decision = 'approved' then")
    expect(migration).not.toMatch(/if decision = 'rejected'[\s\S]{0,300}update public\.profiles/)
  })
  it('updates only the field selected by media type and prevents double review', () => {
    expect(publicProfileFieldFor('avatar')).toBe('avatar_url'); expect(publicProfileFieldFor('banner')).toBe('banner_url')
    expect(migration).toContain("if item.media_type = 'avatar' then update public.profiles set avatar_url")
    expect(migration).toContain('else update public.profiles set banner_url')
    expect(migration).toContain("item.status <> 'pending_review'")
  })
  it('prevents self-review through admin authorization and protected RPC grants', () => {
    expect(reviewRoute).toContain('isAdminRole(reviewer?.role)')
    expect(migration).toContain('revoke all on function public.review_profile_media_submission')
    expect(migration).toContain('grant execute on function public.review_profile_media_submission')
    expect(migration).toContain('to service_role')
    expect(migration).toContain("p.role = 'admin'")
    expect(readFileSync('lib/admin.ts', 'utf8')).toContain("role === 'admin'")
  })
  it('blocks direct browser inserts and keeps creation server-side', () => {
    expect(migration).toContain('No authenticated INSERT policy')
    expect(migration).not.toContain('create policy "Users create own pending profile media submissions"')
    expect(migration).not.toContain('create policy "Users read own profile media submissions"')
    expect(migration).not.toContain('for all to authenticated')
    expect(migration).not.toMatch(/create policy[\s\S]{0,160}for (insert|update|delete)/i)
    expect(submissionRoute).toContain('headPrivateProfileMediaObject')
    expect(submissionRoute).toContain("profile_content_mode")
    expect(submissionRoute).toContain("forbiddenFields = ['userId', 'status', 'contentType'")
    expect(migration).not.toContain('storage_bucket text')
  })
  it('creates submissions atomically through a service-role-only RPC', () => {
    expect(migration).toContain('function public.create_profile_media_submission(')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("set status = 'cancelled'")
    expect(migration).toContain('return query insert into public.profile_media_submissions')
    expect(migration).toContain('preserving the previous pending row')
    expect(migration).toContain('grant execute on function public.create_profile_media_submission(uuid,text,text,text) to service_role')
    expect(migration).toContain('revoke all on function public.create_profile_media_submission(uuid,text,text,text) from public, authenticated')
    expect(submissionRoute).toContain("admin.rpc('create_profile_media_submission'")
    expect(submissionRoute).not.toContain("from('profile_media_submissions').update")
    expect(submissionRoute).not.toContain("from('profile_media_submissions').insert")
  })
  it('revalidates profile mode, owner prefix, MIME and media type inside the creation RPC', () => {
    expect(migration).toContain("p.profile_content_mode in ('adult', 'mixed')")
    expect(migration).toContain("requested_media_type not in ('avatar', 'banner')")
    expect(migration).toContain("verified_content_type not in ('image/jpeg', 'image/png', 'image/webp')")
    expect(migration).toContain("'protected/profile-media/' || authenticated_user_id::text || '/'")
  })
  it('copies approved media to a separate public key and creates the URL only on the server', () => {
    expect(r2Copy).toContain('CopyObjectCommand')
    expect(r2Copy).toContain('HeadObjectCommand')
    expect(r2Copy).toContain('profile-media/public/${userId}/')
    expect(reviewRoute).toContain('copyProfileMediaToApprovedPublicKey')
    expect(reviewRoute).toContain('buildApprovedProfileMediaUrl(process.env.R2_PUBLIC_BASE_URL')
    expect(migration).not.toContain("public_base_url || '/' || item.storage_key")
    expect(migration).toContain('approved_public_url')
  })
  it('validates private object MIME and size and derives extension only from MIME', () => {
    expect(validateProfileMediaObject({ ContentType: 'image/jpeg', ContentLength: 10 }, 'avatar').contentType).toBe('image/jpeg')
    expect(validateProfileMediaObject({ ContentType: 'image/png', ContentLength: 10 }, 'banner').contentType).toBe('image/png')
    expect(validateProfileMediaObject({ ContentType: 'image/webp', ContentLength: 10 }, 'avatar').contentType).toBe('image/webp')
    expect(() => validateProfileMediaObject({ ContentType: 'text/html', ContentLength: 10 }, 'avatar')).toThrow()
    expect(() => validateProfileMediaObject({ ContentType: 'image/svg+xml', ContentLength: 10 }, 'avatar')).toThrow()
    expect(() => validateProfileMediaObject({ ContentType: 'image/png', ContentLength: 0 }, 'avatar')).toThrow()
    const userId = '11111111-1111-4111-8111-111111111111'
    expect(buildApprovedProfileMediaKey(userId, `protected/profile-media/${userId}/deceptive.svg`, 'image/jpeg')).toMatch(/\.jpg$/)
  })
  it('URL-encodes every CopySource segment while preserving path separators', () => {
    expect(buildR2CopySource('my bucket', 'folder/file name+.jpg')).toBe('my%20bucket/folder/file%20name%2B.jpg')
    expect(buildR2CopySource('bucket', 'pasta/ação 世界.webp')).toBe('bucket/pasta/a%C3%A7%C3%A3o%20%E4%B8%96%E7%95%8C.webp')
  })
  it('accepts only a clean HTTPS public base and matching approved key', () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const key = `profile-media/public/${userId}/22222222-2222-4222-8222-222222222222.jpg`
    expect(buildApprovedProfileMediaUrl('https://media.example.com/base/', userId, key)).toBe(`https://media.example.com/base/${key}`)
    expect(() => buildApprovedProfileMediaUrl('http://media.example.com', userId, key)).toThrow()
    expect(() => buildApprovedProfileMediaUrl('https://user:pass@media.example.com', userId, key)).toThrow()
    expect(() => buildApprovedProfileMediaUrl('https://media.example.com?x=1', userId, key)).toThrow()
    expect(() => buildApprovedProfileMediaUrl('https://media.example.com#x', userId, key)).toThrow()
    expect(() => buildApprovedProfileMediaUrl('https://media.example.com', 'other-user', key)).toThrow()
  })
  it('requires safe category for approval and preserves orphan records', () => {
    expect(reviewRoute).toContain("if (!category) return jsonNoStore")
    expect(reviewRoute).toContain("body.decision === 'approved' && category !== 'safe'")
    expect(migration).toContain("decision = 'approved' and category <> 'safe'")
    expect(migration).toContain('on delete set null')
    expect(migration).toContain("check (storage_key like 'profile-media/public/%'")
    expect(migration).toContain('submission_id uuid null references public.profile_media_submissions(id) on delete set null')
  })
  it('contains no concatenated storage_key column typo', () => {
    expect(migration).not.toContain('storage_keytext')
    expect(migration).toContain('storage_key text not null unique')
  })
  it('does not review when copy fails and registers a copied orphan when the RPC fails', () => {
    const copyCatch = reviewRoute.indexOf("error: 'Nao foi possivel publicar a copia aprovada.'")
    const rpcCall = reviewRoute.indexOf("admin.rpc('review_profile_media_submission'")
    expect(copyCatch).toBeLessThan(rpcCall)
    expect(reviewRoute).toContain("from('profile_media_copy_orphans').insert")
    expect(reviewRoute).not.toContain('console.log')
    expect(reviewRoute).not.toContain('console.error')
  })
  it('does not activate 18+, alter post ratings, or require an external provider', () => {
    expect(submissionRoute).not.toContain('wants_18_plus')
    expect(submissionRoute).not.toContain("from('posts')")
    expect(submissionRoute).not.toMatch(/fetch\(['"]https?:/)
    expect(presignRoute).toContain("profileMediaReview = profile?.profile_content_mode === 'adult'")
  })
})
