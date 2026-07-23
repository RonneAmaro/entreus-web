import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  userError: null as { message: string } | null,
  signedUrl: 'https://r2.example.com/upload',
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user },
        error: state.userError,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function S3Client() {
    return {}
  }),
  PutObjectCommand: vi.fn(function PutObjectCommand(input: Record<string, unknown>) {
    return { input }
  }),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => state.signedUrl),
}))

import { POST } from '../../app/api/r2/presign/route'

const originalEnv = { ...process.env }

function setValidEnv() {
  process.env.R2_ACCOUNT_ID = 'account'
  process.env.R2_ACCESS_KEY_ID = 'access'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  process.env.R2_BUCKET_NAME = 'bucket'
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/r2/presign', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  })
}

describe('r2 presign route', () => {
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }

    Object.assign(process.env, originalEnv)
    setValidEnv()
    state.user = { id: 'user-1' }
    state.userError = null
    state.signedUrl = 'https://r2.example.com/upload'
  })

  it('fails safely when R2 config is missing', async () => {
    delete process.env.R2_BUCKET_NAME

    const response = await POST(buildRequest({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      folder: 'posts',
      fileSize: 1024,
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'SERVER_UPLOAD_CONFIG_MISSING',
      message: expect.stringContaining('Tente novamente'),
    })
  })

  it('rejects unauthenticated requests', async () => {
    state.user = null

    const response = await POST(buildRequest({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      folder: 'posts',
      fileSize: 1024,
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'UNAUTHORIZED',
    })
  })

  it('rejects invalid file types with a stable safe response', async () => {
    const response = await POST(buildRequest({
      fileName: 'notes.txt',
      contentType: 'text/plain',
      folder: 'posts',
      fileSize: 512,
    }))

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'INVALID_FILE_TYPE',
      message: expect.any(String),
    })
  })

  it('rejects files that exceed the allowed size', async () => {
    const response = await POST(buildRequest({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      folder: 'posts',
      fileSize: 6 * 1024 * 1024,
    }))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'FILE_TOO_LARGE',
      maxFileSize: 5 * 1024 * 1024,
    })
  })

  it('returns a signed upload URL for an authorized valid request', async () => {
    const response = await POST(buildRequest({
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      folder: 'posts',
      fileSize: 1024,
      communityType: 'general',
      contentRating: 'safe',
      accessLevel: 'public',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      uploadUrl: 'https://r2.example.com/upload',
      publicUrl: expect.stringContaining('https://cdn.example.com/'),
      contentType: 'image/jpeg',
    })
  })
})
