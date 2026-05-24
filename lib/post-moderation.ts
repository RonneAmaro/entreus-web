export type ModerationStatus = 'active' | 'hidden' | 'removed'

export type ModeratedPostFields = {
  moderation_status?: string | null
  moderated_at?: string | null
  moderated_by?: string | null
  moderation_reason?: string | null
}

export const POST_MODERATION_SELECT = `
  moderation_status,
  moderated_at,
  moderated_by,
  moderation_reason,
`

export function normalizeModerationStatus(status: string | null | undefined): ModerationStatus {
  if (status === 'hidden' || status === 'removed') return status
  return 'active'
}

export function isModeratedHidden(post: ModeratedPostFields | null | undefined) {
  const status = normalizeModerationStatus(post?.moderation_status)
  return status === 'hidden' || status === 'removed'
}

export function isMissingPostModerationColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message || '').toLowerCase()
  return (
    message.includes('moderation_status') ||
    message.includes('moderated_at') ||
    message.includes('moderated_by') ||
    message.includes('moderation_reason')
  )
}
