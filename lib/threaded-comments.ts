import type { ExpressionAsset } from './expressions/expression-types'

export const ROOT_COMMENT_PAGE_SIZE = 10
export const REPLY_PAGE_SIZE = 3
export const MAX_LOGICAL_COMMENT_DEPTH = 6
export const MAX_VISUAL_COMMENT_DEPTH = 3

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
