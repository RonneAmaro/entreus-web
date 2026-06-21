import { canViewAdultContent, isAdultPost, type ContentAccessProfile } from '../content-access'

type Post = { community_type?: unknown; content_rating?: unknown }
type Media = { id: string; media_url?: string | null; storage_key?: string | null; storage_bucket?: string | null; storage_provider?: string | null; access_level?: string | null; path?: string | null; media_type?: string | null }

export function isAdultPostMedia(post: Post) { return isAdultPost(post) }
export function canRequestProtectedPostMedia(viewer: ContentAccessProfile | null | undefined, post: Post, adminContext = false) {
  return adminContext || !isAdultPostMedia(post) || canViewAdultContent(viewer)
}
export function shouldUseProtectedMedia(post: Post, media: Media) {
  return isAdultPostMedia(post) || media.access_level === 'adult_private'
}
export function getProtectedMediaPlaceholder() { return 'Mídia protegida' }
export function sanitizePostMediaForViewer(media: Media, post: Post, viewer: ContentAccessProfile | null | undefined, adminContext = false) {
  if (!isAdultPostMedia(post) && media.access_level !== 'adult_private') return { id: media.id, media_url: media.media_url || null, media_type: media.media_type || null, protected: false }
  if (!canRequestProtectedPostMedia(viewer, post, adminContext)) return { id: media.id, media_type: media.media_type || null, protected: true, blocked: true, placeholder: getProtectedMediaPlaceholder() }
  return { id: media.id, media_type: media.media_type || null, protected: true, requiresSignedUrl: true }
}
