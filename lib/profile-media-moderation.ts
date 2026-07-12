import type { ProfileContentMode } from '@/lib/profile-content-mode'

export const PROFILE_MEDIA_TYPES = ['avatar', 'banner'] as const
export const PROFILE_MEDIA_STATUSES = ['pending_review', 'approved', 'rejected', 'change_requested', 'cancelled'] as const
export const PROFILE_MEDIA_REVIEW_DECISIONS = ['approved', 'rejected', 'change_requested'] as const
export const PROFILE_MEDIA_CATEGORIES = ['safe', 'review', 'prohibited'] as const

export type ProfileMediaType = (typeof PROFILE_MEDIA_TYPES)[number]
export type ProfileMediaStatus = (typeof PROFILE_MEDIA_STATUSES)[number]
export type ProfileMediaReviewDecision = (typeof PROFILE_MEDIA_REVIEW_DECISIONS)[number]
export type ProfileMediaCategory = (typeof PROFILE_MEDIA_CATEGORIES)[number]

export function isProfileMediaType(value: unknown): value is ProfileMediaType {
  return value === 'avatar' || value === 'banner'
}

export function isProfileMediaReviewDecision(value: unknown): value is ProfileMediaReviewDecision {
  return value === 'approved' || value === 'rejected' || value === 'change_requested'
}

export function requiresProfileMediaReview(mode: ProfileContentMode | string | null | undefined) {
  return mode === 'adult' || mode === 'mixed'
}

export function getProfileMediaStatusLabel(status: ProfileMediaStatus) {
  return {
    pending_review: 'Em analise',
    approved: 'Aprovada',
    rejected: 'Recusada',
    change_requested: 'Alteracao solicitada',
    cancelled: 'Cancelada',
  }[status]
}

export function buildProfileMediaStoragePrefix(userId: string) {
  return `protected/profile-media/${userId}/`
}

export function ownsProfileMediaStorageKey(userId: string, key: unknown) {
  return typeof key === 'string' && key.startsWith(buildProfileMediaStoragePrefix(userId)) && !key.includes('..') && !key.includes('\\')
}

export function publicProfileFieldFor(mediaType: ProfileMediaType) {
  return mediaType === 'avatar' ? 'avatar_url' as const : 'banner_url' as const
}

type ReviewResultRow = { id?: unknown; user_id?: unknown; media_type?: unknown; status?: unknown; moderation_category?: unknown; moderation_reason?: unknown; submitted_at?: unknown; reviewed_at?: unknown }
export function sanitizeProfileMediaReviewResult(data: unknown) {
  const raw = (Array.isArray(data) ? data[0] : data) as ReviewResultRow | null
  if (!raw || typeof raw.id !== 'string') return null
  return { id: raw.id, userId: raw.user_id, mediaType: raw.media_type, status: raw.status, moderationCategory: raw.moderation_category ?? null, moderationReason: raw.moderation_reason ?? null, submittedAt: raw.submitted_at, reviewedAt: raw.reviewed_at }
}
