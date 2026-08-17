import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileLookup: vi.fn(),
  insert: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpdateEq: vi.fn(),
  storageList: vi.fn(),
  storageDownload: vi.fn(),
  files: new Map<string, { bytes: Uint8Array; mime: string; size: number }>(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, key: string) => {
    if (key === 'anon-test-key') return { auth: { getUser: mocks.getUser } }
    return {
      storage: { from: vi.fn(() => ({ list: mocks.storageList, download: mocks.storageDownload })) },
      from: vi.fn((table: string) => {
        if (table === 'age_verification_requests') return { insert: mocks.insert }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.profileLookup })) })),
          update: vi.fn((payload: unknown) => {
            mocks.profileUpdate(payload)
            return { eq: mocks.profileUpdateEq }
          }),
        }
      }),
    }
  }),
}))

import { POST, parseOwnedAgeVerificationPath } from '@/app/api/age-verification/submit/route'

const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const frontPath = `${userId}/${requestId}/document-front-1700000000000.pdf`
const selfiePath = `${userId}/${requestId}/selfie-1700000000001.png`
const pdf = new TextEncoder().encode('%PDF-1.7')
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])

function body(overrides: Record<string, unknown> = {}) {
  return {
    requestId,
    documentType: 'rg',
    documentFrontPath: frontPath,
    documentBackPath: null,
    selfiePath,
    userStatement: 'Documento para verificacao.',
    privacyAccepted: true,
    ...overrides,
  }
}

function post(payload: Record<string, unknown> = body()) {
  return new Request('https://entreus.vercel.app/api/age-verification/submit', {
    method: 'POST',
    headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function addFile(path: string, bytes: Uint8Array, mime: string, size = bytes.byteLength) {
  mocks.files.set(path, { bytes, mime, size })
}

async function expectRejected(payload: Record<string, unknown>) {
  const response = await POST(post(payload))
  expect(response.status).toBe(400)
  expect(mocks.insert).not.toHaveBeenCalled()
  return response.json()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key')
  mocks.files.clear()
  addFile(frontPath, pdf, 'application/pdf')
  addFile(selfiePath, png, 'image/png')
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  mocks.profileLookup.mockResolvedValue({
    data: { birth_date: '1990-01-01', is_minor: false, age_verification_status: 'not_started' },
    error: null,
  })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.profileUpdateEq.mockResolvedValue({ error: null })
  mocks.storageList.mockImplementation(async (folder: string, options: { search: string }) => {
    const path = `${folder}/${options.search}`
    const file = mocks.files.get(path)
    return {
      data: file ? [{ name: options.search, metadata: { size: file.size, mimetype: file.mime } }] : [],
      error: null,
    }
  })
  mocks.storageDownload.mockImplementation(async (path: string) => {
    const file = mocks.files.get(path)
    return { data: file ? new Blob([file.bytes], { type: file.mime }) : null, error: file ? null : new Error('missing') }
  })
})

describe('age verification upload hardening', () => {
  it('accepts a valid PDF document and PNG selfie, then persists server-owned fields', async () => {
    const response = await POST(post())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, requestId })
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: requestId,
      user_id: userId,
      document_front_path: frontPath,
      document_back_path: null,
      selfie_path: selfiePath,
      birth_date: '1990-01-01',
      status: 'pending',
    }))
  })

  it.each([
    ['jpg', 'image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
    ['png', 'image/png', png],
    ['webp', 'image/webp', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  ])('keeps valid %s selfies working', async (extension, mime, bytes) => {
    const path = `${userId}/${requestId}/selfie-1700000000001.${extension}`
    mocks.files.delete(selfiePath)
    addFile(path, bytes, mime)
    expect((await POST(post(body({ selfiePath: path })))).status).toBe(200)
  })

  it('rejects another user path and traversal before storage access', async () => {
    await expectRejected(body({ documentFrontPath: `33333333-3333-4333-8333-333333333333/${requestId}/document-front-1700000000000.pdf` }))
    await expectRejected(body({ documentFrontPath: `${userId}/${requestId}/../document-front-1700000000000.pdf` }))
    expect(mocks.storageList).not.toHaveBeenCalled()
  })

  it('rejects a missing object without persistence', async () => {
    mocks.files.delete(frontPath)
    expect(await expectRejected(body())).toMatchObject({ error: 'UPLOAD_NOT_FOUND' })
  })

  it('rejects oversized metadata before downloading content', async () => {
    addFile(frontPath, pdf, 'application/pdf', 5 * 1024 * 1024 + 1)
    expect(await expectRejected(body())).toMatchObject({ error: 'INVALID_UPLOAD' })
    expect(mocks.storageDownload).not.toHaveBeenCalled()
  })

  it('rejects incompatible MIME and extension metadata', async () => {
    const mismatchedPath = `${userId}/${requestId}/document-front-1700000000000.png`
    addFile(mismatchedPath, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg')
    expect(await expectRejected(body({ documentFrontPath: mismatchedPath }))).toMatchObject({ error: 'INVALID_UPLOAD' })

    const forbiddenPath = `${userId}/${requestId}/document-front-1700000000000.gif`
    addFile(forbiddenPath, png, 'image/gif')
    expect(await expectRejected(body({ documentFrontPath: forbiddenPath }))).toMatchObject({ error: 'INVALID_UPLOAD' })
  })

  it('rejects spoofed PDF and selfie magic bytes', async () => {
    const fakePdf = new TextEncoder().encode('<html>not a pdf</html>')
    addFile(frontPath, fakePdf, 'application/pdf')
    expect(await expectRejected(body())).toMatchObject({ error: 'INVALID_UPLOAD' })

    addFile(frontPath, pdf, 'application/pdf')
    const fakePng = new TextEncoder().encode('<script>not an image</script>')
    addFile(selfiePath, fakePng, 'image/png')
    expect(await expectRejected(body())).toMatchObject({ error: 'INVALID_UPLOAD' })
  })

  it('validates the optional back document consistently', async () => {
    const backPath = `${userId}/${requestId}/document-back-1700000000002.pdf`
    addFile(backPath, pdf, 'application/pdf')
    expect((await POST(post(body({ documentBackPath: backPath })))).status).toBe(200)

    mocks.insert.mockClear()
    addFile(backPath, png, 'application/pdf')
    expect(await expectRejected(body({ documentBackPath: backPath }))).toMatchObject({ error: 'INVALID_UPLOAD' })
  })

  it('parses only the exact user, request and kind path shape', () => {
    expect(parseOwnedAgeVerificationPath({ value: frontPath, userId, requestId, kind: 'document-front' })).toMatchObject({ path: frontPath })
    expect(parseOwnedAgeVerificationPath({ value: frontPath, userId, requestId, kind: 'selfie' })).toBeNull()
  })
})
