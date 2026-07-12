import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profileMode: 'mixed',
  userId: 'user-a',
  rpc: vi.fn(),
  head: vi.fn(),
}))

vi.mock('../../lib/meet-server', () => ({
  requireUser: vi.fn(async () => ({ user: { id: state.userId } })),
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== 'profiles') throw new Error(`Unexpected table access: ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { profile_content_mode: state.profileMode } })) })),
        })),
      }
    }),
    rpc: state.rpc,
  })),
}))

vi.mock('../../lib/profile-media-r2', () => ({
  headPrivateProfileMediaObject: state.head,
}))

import { POST } from '../../app/api/profile/media-submissions/route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/profile/media-submissions', {
    method: 'POST',
    headers: { authorization: 'Bearer test-only' },
    body: JSON.stringify(body),
  })
}

describe('profile media submission route integration', () => {
  beforeEach(() => {
    state.profileMode = 'mixed'
    state.rpc.mockReset().mockResolvedValue({ data: [{ id: 'submission-1', media_type: 'avatar', status: 'pending_review', submitted_at: '2026-07-12T00:00:00Z' }], error: null })
    state.head.mockReset().mockResolvedValue({ contentType: 'image/jpeg', contentLength: 1024 })
  })

  it('creates a pending avatar submission for mixed without updating profiles directly', async () => {
    const response = await POST(request({ mediaType: 'avatar', storageKey: 'protected/profile-media/user-a/avatar' }))
    expect(response.status).toBe(201)
    expect(state.head).toHaveBeenCalledWith({ userId: 'user-a', sourceKey: 'protected/profile-media/user-a/avatar', mediaType: 'avatar' })
    expect(state.rpc).toHaveBeenCalledWith('create_profile_media_submission', expect.objectContaining({ authenticated_user_id: 'user-a', requested_media_type: 'avatar', verified_content_type: 'image/jpeg' }))
    await expect(response.json()).resolves.toMatchObject({ submission: { status: 'pending_review' } })
  })

  it('creates a pending WebP banner submission for adult', async () => {
    state.profileMode = 'adult'
    state.head.mockResolvedValue({ contentType: 'image/webp', contentLength: 2048 })
    const response = await POST(request({ mediaType: 'banner', storageKey: 'protected/profile-media/user-a/banner' }))
    expect(response.status).toBe(201)
    expect(state.rpc).toHaveBeenCalledWith('create_profile_media_submission', expect.objectContaining({ requested_media_type: 'banner', verified_content_type: 'image/webp' }))
  })

  it('keeps general on its existing flow and never creates a moderated submission', async () => {
    state.profileMode = 'general'
    const response = await POST(request({ mediaType: 'avatar', storageKey: 'protected/profile-media/user-a/avatar' }))
    expect(response.status).toBe(409)
    expect(state.head).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('rejects another owner key and browser-controlled review fields', async () => {
    const otherKey = await POST(request({ mediaType: 'avatar', storageKey: 'protected/profile-media/user-b/avatar' }))
    expect(otherKey.status).toBe(400)
    const controlled = await POST(request({ mediaType: 'avatar', storageKey: 'protected/profile-media/user-a/avatar', status: 'approved' }))
    expect(controlled.status).toBe(400)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('does not create a submission when source HEAD validation fails', async () => {
    state.head.mockRejectedValue(new Error('not found'))
    const response = await POST(request({ mediaType: 'avatar', storageKey: 'protected/profile-media/user-a/missing' }))
    expect(response.status).toBe(400)
    expect(state.rpc).not.toHaveBeenCalled()
  })
})
