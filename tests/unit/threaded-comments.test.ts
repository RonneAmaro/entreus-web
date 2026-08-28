import { describe, expect, it } from 'vitest'
import {
  MAX_LOGICAL_COMMENT_DEPTH,
  MAX_VISUAL_COMMENT_DEPTH,
  REPLY_PAGE_SIZE,
  ROOT_COMMENT_PAGE_SIZE,
  commentHasContent,
  decodeCommentCursor,
  encodeCommentCursor,
  getThreadedCommentErrorKey,
  getThreadedCommentsViewState,
  getVisualCommentDepth,
  mergeComments,
  normalizeThreadedComment,
  type ThreadedComment,
} from '@/lib/threaded-comments'

const base = (overrides: Partial<ThreadedComment> = {}): ThreadedComment => ({
  id: '00000000-0000-4000-8000-000000000001',
  post_id: '00000000-0000-4000-8000-000000000002',
  user_id: '00000000-0000-4000-8000-000000000003',
  parent_comment_id: null,
  content: 'Comentário',
  expression: null,
  depth: 0,
  reply_count: 0,
  deleted_at: null,
  edited_at: null,
  created_at: '2026-07-17T10:00:00.000Z',
  profiles: null,
  ...overrides,
})

describe('threaded comment model', () => {
  it('treats a comment without parent as a root', () => {
    expect(base().parent_comment_id).toBeNull()
    expect(base().depth).toBe(0)
  })

  it('keeps a valid reply connected to its parent and post', () => {
    const reply = base({ parent_comment_id: base().id, depth: 1 })
    expect(reply.parent_comment_id).toBe(base().id)
    expect(reply.post_id).toBe(base().post_id)
  })

  it('defines six logical levels and three visual levels', () => {
    expect(MAX_LOGICAL_COMMENT_DEPTH).toBe(6)
    expect(MAX_VISUAL_COMMENT_DEPTH).toBe(3)
  })

  it.each([
    [0, 0], [1, 1], [2, 2], [3, 2], [5, 2], [99, 2],
  ])('caps visual depth %i at %i', (logical, visual) => {
    expect(getVisualCommentDepth(logical)).toBe(visual)
  })

  it('accepts text-only and expression-only content', () => {
    expect(commentHasContent('olá', null)).toBe(true)
    expect(commentHasContent('', {
      kind: 'gif', provider: 'tenor', providerId: 'gif',
      title: 'Festa', altText: 'Festa', contentRating: 'g',
      mediaUrl: 'https://media.tenor.com/a/a.mp4',
      previewUrl: 'https://media.tenor.com/a/a.webp',
    })).toBe(true)
  })

  it('accepts an emoji-only reply as Unicode text', () => {
    expect(commentHasContent('😀', null)).toBe(true)
  })

  it('rejects completely empty content', () => {
    expect(commentHasContent('   ', null)).toBe(false)
  })

  it('uses bounded root and reply pages', () => {
    expect(ROOT_COMMENT_PAGE_SIZE).toBe(10)
    expect(REPLY_PAGE_SIZE).toBe(3)
  })

  it('round-trips a stable date-and-id cursor', () => {
    const comment = base()
    expect(decodeCommentCursor(encodeCommentCursor(comment))).toEqual({
      createdAt: comment.created_at,
      id: comment.id,
    })
  })

  it.each(['', 'garbage', btoa('{}'), btoa('{"createdAt":"bad","id":"x"}')])(
    'rejects invalid cursor %s',
    (cursor) => expect(decodeCommentCursor(cursor)).toBeNull(),
  )

  it('merges retries without duplicates and preserves deterministic order', () => {
    const earlier = base({ id: '00000000-0000-4000-8000-000000000010' })
    const later = base({ id: '00000000-0000-4000-8000-000000000011', created_at: '2026-07-17T11:00:00.000Z' })
    const result = mergeComments([later], [earlier, later])
    expect(result.map(({ id }) => id)).toEqual([earlier.id, later.id])
  })

  it('normalizes embedded profiles returned as an object or array', () => {
    const profile = { username: 'criadora', display_name: 'Criadora', avatar_url: null }
    expect(normalizeThreadedComment(base({ profiles: profile })).profiles).toEqual(profile)
    expect(normalizeThreadedComment({ ...base(), profiles: [profile] }).profiles).toEqual(profile)
    expect(normalizeThreadedComment({ ...base(), profiles: [] }).profiles).toBeNull()
  })

  it.each([
    [{ loading: true, hasError: false, commentCount: 0 }, 'LOADING'],
    [{ loading: false, hasError: false, commentCount: 0 }, 'SUCCESS_EMPTY'],
    [{ loading: false, hasError: false, commentCount: 2 }, 'SUCCESS_WITH_DATA'],
    [{ loading: false, hasError: true, commentCount: 0 }, 'ERROR'],
    [{ loading: false, hasError: true, commentCount: 2 }, 'SUCCESS_WITH_DATA'],
  ] as const)('derives an explicit comments view state for %o', (input, expected) => {
    expect(getThreadedCommentsViewState(input)).toBe(expected)
  })

  it.each([
    ['authentication_required', 'post.comments.errors.authentication'],
    ['comment_empty', 'post.comments.replyRequired'],
    ['comment_too_long', 'post.comments.errors.tooLong'],
    ['comment_rate_limited', 'post.comments.errors.rateLimited'],
    ['comment_blocked', 'post.comments.errors.blocked'],
    ['post_unavailable', 'post.comments.errors.postUnavailable'],
    ['comment_max_depth', 'post.comments.errors.maxDepth'],
  ])('maps RPC code %s to a translated user-facing key', (message, key) => {
    expect(getThreadedCommentErrorKey({ message })).toBe(key)
  })

  it('does not expose an unknown backend message to the UI', () => {
    expect(getThreadedCommentErrorKey({ message: 'internal table detail' }))
      .toBe('post.comments.errors.generic')
  })
})
