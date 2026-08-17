import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findRequest: vi.fn(),
  columnCheck: vi.fn(),
  updateRequest: vi.fn(),
  updateResult: { data: [{ id: 'consent-update' }], error: null },
  updatePayload: vi.fn(),
  latestRequest: vi.fn(),
  profileUpdate: vi.fn(),
  storageUpload: vi.fn(),
  storageList: vi.fn(),
  storageDownload: vi.fn(),
  storageRemove: vi.fn(),
  log: vi.fn(),
  uploadedPath: '',
  uploadedFile: null as File | null,
  missingStoredFile: false,
  storedMime: null as string | null,
  storedSize: null as number | null,
  storedBytes: null as Uint8Array | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mocks.storageUpload,
        list: mocks.storageList,
        download: mocks.storageDownload,
        remove: mocks.storageRemove,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { update: vi.fn(() => ({ eq: mocks.profileUpdate })) }
      }
      return {
        select: vi.fn((columns: string) => {
          if (columns === 'guardian_selfie_path, guardian_selfie_uploaded_at, approval_user_agent') {
            return { limit: mocks.columnCheck }
          }
          if (columns === 'status') return { eq: vi.fn(() => ({ maybeSingle: mocks.latestRequest })) }
          return { eq: vi.fn(() => ({ maybeSingle: mocks.findRequest })) }
        }),
        update: vi.fn((payload: unknown) => {
          mocks.updatePayload(payload)
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => mocks.updateRequest),
              })),
            })),
          }
        }),
      }
    }),
  })),
}))

vi.mock('@/lib/logging/safe-logger', () => ({
  getRequestCorrelationId: () => 'parental-test-request',
  logServerEvent: mocks.log,
}))

import { createClient } from '@supabase/supabase-js'
import { POST, parseGuardianSelfiePath } from '@/app/api/parental-consent/respond/route'

const consentId = '22222222-2222-4222-8222-222222222222'
const token = 'parental-secret-token'
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

function requestWith(file: File) {
  const form = new FormData()
  form.set('token', token)
  form.set('decision', 'approved')
  form.set('signed_name', 'Responsavel de Teste')
  form.set('guardian_selfie', file)
  return new Request('https://entreus.vercel.app/api/parental-consent/respond', { method: 'POST', body: form })
}

function file(bytes: Uint8Array, name: string, type: string) {
  return new File([bytes], name, { type })
}

async function expectInvalid(selfie: File) {
  const response = await POST(requestWith(selfie))
  expect(response.status).toBe(400)
  expect(mocks.updateRequest).not.toHaveBeenCalled()
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key')
  mocks.uploadedPath = ''
  mocks.uploadedFile = null
  mocks.missingStoredFile = false
  mocks.storedMime = null
  mocks.storedSize = null
  mocks.storedBytes = null
  mocks.findRequest.mockResolvedValue({
    data: {
      id: consentId,
      child_user_id: '11111111-1111-4111-8111-111111111111',
      guardian_email: 'guardian@example.invalid',
      status: 'pending',
      child_birth_date: '2012-01-01',
      consent_text: 'Consentimento',
      approved_at: null,
      rejected_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  })
  mocks.columnCheck.mockResolvedValue({ error: null })
  mocks.updateRequest.mockResolvedValue({ error: null })
  mocks.latestRequest.mockResolvedValue({ data: { status: 'approved' }, error: null })
  mocks.updateResult = { data: [{ id: 'consent-update' }], error: null }
  mocks.updateRequest.mockImplementation(async () => mocks.updateResult)
  mocks.profileUpdate.mockResolvedValue({ error: null })
  mocks.storageUpload.mockImplementation(async (path: string, uploadedFile: File) => {
    mocks.uploadedPath = path
    mocks.uploadedFile = uploadedFile
    return { error: null }
  })
  mocks.storageList.mockImplementation(async (_folder: string, options: { search: string }) => ({
    data: mocks.missingStoredFile || !mocks.uploadedFile
      ? []
      : [{
          name: options.search,
          metadata: {
            size: mocks.storedSize ?? mocks.uploadedFile.size,
            mimetype: mocks.storedMime ?? mocks.uploadedFile.type,
          },
        }],
    error: null,
  }))
  mocks.storageDownload.mockImplementation(async () => {
    if (!mocks.uploadedFile) return { data: null, error: new Error('missing') }
    const bytes = mocks.storedBytes ?? new Uint8Array(await mocks.uploadedFile.arrayBuffer())
    return { data: new Blob([bytes], { type: mocks.storedMime ?? mocks.uploadedFile.type }), error: null }
  })
  mocks.storageRemove.mockResolvedValue({ data: [], error: null })
})

describe('parental selfie upload hardening', () => {
  it.each([
    ['JPEG', jpeg, 'guardian.jpg', 'image/jpeg'],
    ['PNG', png, 'guardian.png', 'image/png'],
    ['WebP', webp, 'guardian.webp', 'image/webp'],
  ])('accepts a valid %s selfie through private server-side confirmation', async (_label, bytes, name, type) => {
    const response = await POST(requestWith(file(bytes, name, type)))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ success: true, status: 'approved' })
    expect(result).not.toHaveProperty('publicUrl')
    expect(result).not.toHaveProperty('signedUrl')
    expect(mocks.storageDownload).toHaveBeenCalledTimes(1)
    expect(mocks.updatePayload).toHaveBeenCalledWith(expect.objectContaining({
      guardian_selfie_path: expect.stringMatching(new RegExp(`^parental-consent/${consentId}/guardian-selfie-[0-9]+\\.(?:jpg|png|webp)$`)),
    }))
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-test-key',
      expect.any(Object),
    )
  })

  it('rejects an object missing after upload and performs cleanup without finalization', async () => {
    mocks.missingStoredFile = true
    const response = await POST(requestWith(file(png, 'guardian.png', 'image/png')))
    expect(response.status).toBe(500)
    expect(mocks.storageRemove).toHaveBeenCalledWith([mocks.uploadedPath])
    expect(mocks.updateRequest).not.toHaveBeenCalled()
  })

  it('cleans up a losing selfie when the conditional update affects no rows, even for the same decision', async () => {
    mocks.updateResult = { data: [], error: null }

    const response = await POST(requestWith(file(png, 'guardian.png', 'image/png')))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: 'approved',
      message: 'Esta solicitacao ja foi respondida.',
    })
    expect(mocks.storageRemove).toHaveBeenCalledWith([mocks.uploadedPath])
    expect(mocks.profileUpdate).not.toHaveBeenCalled()
  })

  it('rejects oversized stored metadata before download', async () => {
    mocks.storedSize = 5 * 1024 * 1024 + 1
    await expectInvalid(file(png, 'guardian.png', 'image/png'))
    expect(mocks.storageDownload).not.toHaveBeenCalled()
    expect(mocks.storageRemove).toHaveBeenCalled()
  })

  it('rejects invalid MIME and extension before upload', async () => {
    await expectInvalid(file(png, 'guardian.png', 'text/html'))
    await expectInvalid(file(png, 'guardian.gif', 'image/png'))
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it.each([
    ['JPEG', 'fake.jpg', 'image/jpeg'],
    ['PNG', 'fake.png', 'image/png'],
    ['WebP', 'fake.webp', 'image/webp'],
  ])('rejects fake %s magic bytes before upload', async (_label, name, type) => {
    await expectInvalid(file(new TextEncoder().encode('<script>fake</script>'), name, type))
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('rejects stored MIME mismatch and actual-byte size mismatch with cleanup', async () => {
    mocks.storedMime = 'image/jpeg'
    await expectInvalid(file(png, 'guardian.png', 'image/png'))
    expect(mocks.storageRemove).toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.storedMime = null
    mocks.storedSize = png.byteLength
    mocks.storedBytes = png.slice(0, png.byteLength - 1)
    await expectInvalid(file(png, 'guardian.png', 'image/png'))
    expect(mocks.storageRemove).toHaveBeenCalled()
  })

  it('rejects foreign request paths, other token request paths and traversal', () => {
    const valid = `parental-consent/${consentId}/guardian-selfie-1700000000000.png`
    expect(parseGuardianSelfiePath(valid, consentId)).toMatchObject({ path: valid })
    expect(parseGuardianSelfiePath(valid, '33333333-3333-4333-8333-333333333333')).toBeNull()
    expect(parseGuardianSelfiePath(`parental-consent/${consentId}/../guardian-selfie-1700000000000.png`, consentId)).toBeNull()
    expect(parseGuardianSelfiePath(`other/${consentId}/guardian-selfie-1700000000000.png`, consentId)).toBeNull()
  })
})
