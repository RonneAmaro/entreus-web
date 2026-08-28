import type { ExpressionAsset } from './expressions/expression-types'

export const ROOT_COMMENT_PAGE_SIZE = 10
export const REPLY_PAGE_SIZE = 3
export const MAX_LOGICAL_COMMENT_DEPTH = 6
export const MAX_VISUAL_COMMENT_DEPTH = 3

export type ThreadedCommentsViewState =
  | 'LOADING'
  | 'SUCCESS_EMPTY'
  | 'SUCCESS_WITH_DATA'
  | 'ERROR'

export type ThreadedCommentErrorKey =
  | 'post.comments.errors.authentication'
  | 'post.comments.replyRequired'
  | 'post.comments.errors.tooLong'
  | 'post.comments.errors.rateLimited'
  | 'post.comments.errors.blocked'
  | 'post.comments.errors.postUnavailable'
  | 'post.comments.errors.parentUnavailable'
  | 'post.comments.errors.maxDepth'
  | 'post.comments.errors.editForbidden'
  | 'post.comments.errors.deleteForbidden'
  | 'post.comments.errors.reportSelf'
  | 'post.comments.errors.reportReason'
  | 'post.comments.errors.reportRateLimited'
  | 'post.comments.errors.generic'

export type CommentCursor = { createdAt: string; id: string }

export type ThreadedComment = {
  id: string
  post_id: string
  user_id: string
  parent_comment_id: string | null
  content: string
  expression?: ExpressionAsset | null
  depth: number
  reply_count: number
  deleted_at: string | null
  edited_at: string | null
  created_at: string
  profiles: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
}

type ThreadedCommentWithProfileVariants = Omit<ThreadedComment, 'profiles'> & {
  profiles: ThreadedComment['profiles'] | ThreadedComment['profiles'][]
}

export function normalizeThreadedComment(row: ThreadedCommentWithProfileVariants): ThreadedComment {
  return {
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] || null : row.profiles,
  }
}

export function getThreadedCommentsViewState({
  loading,
  hasError,
  commentCount,
}: {
  loading: boolean
  hasError: boolean
  commentCount: number
}): ThreadedCommentsViewState {
  if (loading && commentCount === 0) return 'LOADING'
  if (hasError && commentCount === 0) return 'ERROR'
  return commentCount === 0 ? 'SUCCESS_EMPTY' : 'SUCCESS_WITH_DATA'
}

export function getThreadedCommentErrorKey(
  error: { message?: string | null; code?: string | null } | null | undefined,
): ThreadedCommentErrorKey {
  const technicalValue = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  const knownErrors: Array<[string, ThreadedCommentErrorKey]> = [
    ['authentication_required', 'post.comments.errors.authentication'],
    ['comment_empty', 'post.comments.replyRequired'],
    ['comment_too_long', 'post.comments.errors.tooLong'],
    ['comment_rate_limited', 'post.comments.errors.rateLimited'],
    ['comment_blocked', 'post.comments.errors.blocked'],
    ['post_unavailable', 'post.comments.errors.postUnavailable'],
    ['parent_comment_removed', 'post.comments.errors.parentUnavailable'],
    ['parent_comment_not_found', 'post.comments.errors.parentUnavailable'],
    ['parent_comment_post_mismatch', 'post.comments.errors.parentUnavailable'],
    ['comment_max_depth', 'post.comments.errors.maxDepth'],
    ['comment_edit_forbidden', 'post.comments.errors.editForbidden'],
    ['comment_delete_forbidden', 'post.comments.errors.deleteForbidden'],
    ['comment_report_self', 'post.comments.errors.reportSelf'],
    ['comment_report_reason_invalid', 'post.comments.errors.reportReason'],
    ['comment_report_rate_limited', 'post.comments.errors.reportRateLimited'],
  ]
  return knownErrors.find(([code]) => technicalValue.includes(code))?.[1]
    || 'post.comments.errors.generic'
}

export function encodeCommentCursor(comment: Pick<ThreadedComment, 'created_at' | 'id'>) {
  return btoa(JSON.stringify({ createdAt: comment.created_at, id: comment.id }))
}

export function decodeCommentCursor(value: string): CommentCursor | null {
  try {
    const parsed = JSON.parse(atob(value)) as Partial<CommentCursor>
    if (
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

export function getVisualCommentDepth(depth: number) {
  return Math.max(0, Math.min(MAX_VISUAL_COMMENT_DEPTH - 1, depth))
}

export function mergeComments(current: ThreadedComment[], incoming: ThreadedComment[]) {
  const merged = new Map(current.map((comment) => [comment.id, comment]))
  for (const comment of incoming) merged.set(comment.id, comment)
  return [...merged.values()].sort((left, right) => {
    const dateOrder = left.created_at.localeCompare(right.created_at)
    return dateOrder || left.id.localeCompare(right.id)
  })
}

export function commentHasContent(content: string, expression: ExpressionAsset | null) {
  return Boolean(content.trim() || expression)
}
