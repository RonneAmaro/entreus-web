'use client'

import { supabase } from '@/lib/supabase'
import type { PostVisibilityContext } from './post-visibility'
import type { ProtectedPostAccessReason } from './protected-post-access'

export type AuthorizedPostAccess = {
  postId: string
  visible: boolean
  contentAllowed: boolean
  reason: ProtectedPostAccessReason
}

export type AuthorizedPostContentResult<T> = {
  postsById: Map<string, T>
  accessByPostId: Map<string, AuthorizedPostAccess>
}

export async function loadAuthorizedPostContent<T extends { id: string }>(
  postIds: readonly string[],
  context: PostVisibilityContext,
): Promise<AuthorizedPostContentResult<T>> {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)))

  if (uniquePostIds.length === 0) {
    return {
      postsById: new Map(),
      accessByPostId: new Map(),
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch('/api/posts/authorized-content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ postIds: uniquePostIds, context }),
  })

  const payload = await response.json().catch(() => null) as {
    posts?: T[]
    access?: AuthorizedPostAccess[]
    error?: string
  } | null

  if (!response.ok || !payload) {
    throw new Error(payload?.error || 'Nao foi possivel carregar conteudo autorizado.')
  }

  return {
    postsById: new Map((payload.posts || []).map((post) => [post.id, post])),
    accessByPostId: new Map((payload.access || []).map((item) => [item.postId, item])),
  }
}
