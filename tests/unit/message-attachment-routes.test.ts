import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: { id: '33333333-3333-4333-8333-333333333333' } as { id: string } | null,
  authError: null as Response | null,
  admin: null as unknown,
  send: vi.fn(),
  getSignedUrl: vi.fn(),
  signedUrl: 'https://r2.example.test/signed',
}))

vi.mock('../../lib/meet-server', () => ({
  requireUser: vi.fn(async () => mocks.authError ? { error: mocks.authError } : { user: mocks.user }),
  getSupabaseAdmin: vi.fn(() => mocks.admin),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(
      public readonly kind: string,
      public readonly input: Record<string, unknown>,
    ) {}
  }

  return {
    S3Client: vi.fn(function S3Client() {
      return { send: mocks.send }
    }),
    PutObjectCommand: class PutObjectCommand extends Command {
      constructor(input: Record<string, unknown>) { super('put', input) }
    },
    CopyObjectCommand: class CopyObjectCommand extends Command {
      constructor(input: Record<string, unknown>) { super('copy', input) }
    },
    GetObjectCommand: class GetObjectCommand extends Command {
      constructor(input: Record<string, unknown>) { super('get', input) }
    },
    HeadObjectCommand: class HeadObjectCommand extends Command {
      constructor(input: Record<string, unknown>) { super('head', input) }
    },
    DeleteObjectCommand: class DeleteObjectCommand extends Command {
      constructor(input: Record<string, unknown>) { super('delete', input) }
    },
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.getSignedUrl,
}))

import { DELETE as deleteAttachment } from '../../app/api/messages/attachments/[attachmentId]/route'
import { POST as confirmAttachment } from '../../app/api/messages/attachments/confirm/route'
import { GET as downloadAttachment } from '../../app/api/messages/attachments/download/route'
import { GET as listAttachments } from '../../app/api/messages/attachments/message/[messageId]/route'
import { POST as prepareAttachment } from '../../app/api/messages/attachments/prepare/route'

const conversationId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const otherUserId = '55555555-5555-4555-8555-555555555555'
const pendingId = '66666666-6666-4666-8666-666666666666'
const attachmentId = '77777777-7777-4777-8777-777777777777'
const objectId = '88888888-8888-4888-8888-888888888888'
const pendingKey = `private/messages/pending/${conversationId}/${messageId}/${userId}/${pendingId}/photo.png`
const finalKey = `private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/photo.png`
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
const originalEnv = { ...process.env }

let database: FakeDatabase
let requestSequence = 0
let headMetadata: { ContentType?: string; ContentLength?: number; ETag?: string }
let signatureSample: Uint8Array
let finalHeadMetadata: { ContentType?: string; ContentLength?: number; ETag?: string } | null
let finalSignatureSample: Uint8Array | null
let deleteMissing: boolean

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = 'test-account'
  process.env.R2_ACCESS_KEY_ID = 'test-access-key'
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
  process.env.R2_BUCKET_NAME = 'private-bucket'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'

  mocks.user = { id: userId }
  mocks.authError = null
  mocks.signedUrl = 'https://r2.example.test/signed'
  mocks.getSignedUrl.mockReset().mockImplementation(async () => mocks.signedUrl)

  database = new FakeDatabase({
    conversation_participants: [{ conversation_id: conversationId, user_id: userId }],
    messages: [{ id: messageId, conversation_id: conversationId, sender_id: userId }],
    private_message_attachment_uploads: [],
    message_attachments: [],
  })
  mocks.admin = database.client

  headMetadata = { ContentType: 'image/png', ContentLength: png.byteLength, ETag: '"pending-etag"' }
  signatureSample = png
  finalHeadMetadata = null
  finalSignatureSample = null
  deleteMissing = false
  mocks.send.mockReset().mockImplementation(async (command: { kind: string; input: Record<string, unknown> }) => {
    const key = String(command.input.Key || '')
    if (command.kind === 'head') return key.includes('/final/') ? (finalHeadMetadata || headMetadata) : headMetadata
    if (command.kind === 'get') {
      const sample = key.includes('/final/') ? (finalSignatureSample || signatureSample) : signatureSample
      return { Body: { transformToByteArray: async () => sample } }
    }
    if (command.kind === 'copy') {
      finalHeadMetadata ||= { ...headMetadata }
      finalSignatureSample ||= Uint8Array.from(signatureSample)
      return {}
    }
    if (command.kind === 'delete' && deleteMissing) {
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
    }
    return {}
  })
})

afterAll(() => {
  for (const key of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]) {
    if (key in originalEnv) process.env[key] = originalEnv[key]
    else delete process.env[key]
  }
})

describe('message attachment prepare route', () => {
  it.each(['missing', 'invalid'])('rejects %s authentication', async () => {
    mocks.user = null
    mocks.authError = Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

    const response = await prepareAttachment(request('/prepare', validPrepareBody()))
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('rejects a non-participant before creating a pending upload', async () => {
    database.tables.conversation_participants = []
    const response = await prepareAttachment(request('/prepare', validPrepareBody()))
    expect(response.status).toBe(403)
    expect(database.tables.private_message_attachment_uploads).toHaveLength(0)
  })

  it('rejects a message owned by another user', async () => {
    database.tables.messages[0].sender_id = otherUserId
    const response = await prepareAttachment(request('/prepare', validPrepareBody()))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'MESSAGE_NOT_OWNED' })
  })

  it('creates a pending upload and exposes only a short server-signed PUT contract', async () => {
    const response = await prepareAttachment(request('/prepare', {
      ...validPrepareBody(),
      filename: 'João férias.PNG',
      storageKey: 'client-controlled/evil',
      storageBucket: 'public-bucket',
    }))
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      ok: true,
      uploadUrl: mocks.signedUrl,
      expiresIn: 300,
      contentType: 'image/png',
      contentLength: png.byteLength,
    })
    expect(body).not.toHaveProperty('storageKey')
    expect(body).not.toHaveProperty('storageBucket')

    const pending = database.tables.private_message_attachment_uploads[0]
    expect(pending.storage_bucket).toBe('private-bucket')
    expect(pending.storage_key).toMatch(new RegExp(`^private/messages/pending/${conversationId}/${messageId}/${userId}/`))
    expect(pending.storage_key).not.toContain('/final/')
    expect(pending.final_storage_key).toBeNull()
    expect(pending.storage_key).not.toContain('client-controlled')
    expect(pending.file_name).toBe('João-férias.png')
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'put' }),
      { expiresIn: 300 },
    )
  })

  it.each([
    [{ declaredMime: 'text/html' }, 400, 'file_type_not_allowed'],
    [{ filename: 'payload.exe' }, 400, 'file_extension_not_allowed'],
    [{ declaredSize: 50 * 1024 * 1024 + 1 }, 413, 'file_too_large'],
    [{ position: 3 }, 400, 'INVALID_PAYLOAD'],
    [{ filename: '../photo.png' }, 400, 'file_name_invalid'],
  ])('rejects invalid prepare metadata %#', async (override, status, error) => {
    const response = await prepareAttachment(request('/prepare', { ...validPrepareBody(), ...override }))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject({ error })
    expect(database.tables.private_message_attachment_uploads).toHaveLength(0)
  })
})

describe('message attachment confirm route', () => {
  it('rejects a missing pending upload', async () => {
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(404)
  })

  it('rejects a pending upload owned by another user', async () => {
    addPending({ user_id: otherUserId })
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(403)
  })

  it('rejects expired and cleanup-required pending uploads', async () => {
    addPending({ expires_at: '2020-01-01T00:00:00.000Z' })
    const expired = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(expired.status).toBe(410)
    expect(database.tables.private_message_attachment_uploads[0].status).toBe('cleanup_required')

    const cleanup = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(cleanup.status).toBe(409)
    await expect(cleanup.json()).resolves.toMatchObject({ error: 'UPLOAD_CLEANUP_REQUIRED' })
  })

  it('returns an already confirmed attachment idempotently after rechecking access', async () => {
    addPending({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      final_storage_key: finalKey,
      attachment_id: attachmentId,
    })
    addAttachment()
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, alreadyConfirmed: true })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each([
    [{ ContentType: 'image/png', ContentLength: png.byteLength + 1 }],
    [{ ContentType: 'image/jpeg', ContentLength: png.byteLength }],
  ])('rejects a HEAD metadata mismatch', async (head) => {
    addPending()
    headMetadata = head
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: 'UPLOAD_METADATA_MISMATCH' })
    expect(database.tables.message_attachments).toHaveLength(0)
  })

  it('rejects an incompatible signature and marks cleanup', async () => {
    addPending({
      file_name: 'photo.jpg',
      declared_mime: 'image/jpeg',
      declared_size: png.byteLength,
      storage_key: pendingKey.replace('photo.png', 'photo.jpg'),
    })
    headMetadata = { ContentType: 'image/jpeg', ContentLength: png.byteLength }
    signatureSample = png

    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({ error: 'UPLOAD_SIGNATURE_MISMATCH' })
    expect(database.tables.private_message_attachment_uploads[0].status).toBe('cleanup_required')
    expect(database.tables.message_attachments).toHaveLength(0)
  })

  it('fails closed for completely unknown content', async () => {
    addPending({ declared_size: 4 })
    headMetadata = { ContentType: 'image/png', ContentLength: 4 }
    signatureSample = Uint8Array.from([1, 2, 3, 4])
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({ error: 'UPLOAD_CONTENT_UNVERIFIED' })
    expect(database.tables.message_attachments).toHaveLength(0)
  })

  it.each([
    ['image/png', 'photo.png', png],
    ['image/jpeg', 'photo.jpg', jpeg],
  ] as const)('confirms valid %s content', async (mime, fileName, sample) => {
    const key = pendingKey.replace('photo.png', fileName)
    addPending({ file_name: fileName, declared_mime: mime, declared_size: sample.byteLength, storage_key: key })
    headMetadata = { ContentType: mime, ContentLength: sample.byteLength }
    signatureSample = sample

    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      needsDeeperInspection: false,
    })
    expect(database.tables.message_attachments).toHaveLength(1)
    expect(database.tables.private_message_attachment_uploads[0].status).toBe('confirmed')
  })

  it('accepts a valid WAV declared with the audio/x-wav alias', async () => {
    const sample = new TextEncoder().encode('RIFFxxxxWAVE')
    addPending({
      media_type: 'audio',
      file_name: 'voice.wav',
      declared_mime: 'audio/x-wav',
      declared_size: sample.byteLength,
      storage_key: pendingKey.replace('photo.png', 'voice.wav'),
    })
    headMetadata = { ContentType: 'audio/x-wav', ContentLength: sample.byteLength }
    signatureSample = sample

    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(200)
    expect(database.tables.message_attachments[0].needs_deeper_inspection).toBe(false)
  })

  it.each([
    ['video', 'video/mp4', 'clip.mp4', Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70])],
    ['video', 'video/webm', 'clip.webm', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])],
    ['audio', 'audio/ogg', 'voice.ogg', new TextEncoder().encode('OggS')],
  ] as const)('confirms coherent %s containers with an inspection flag', async (mediaType, mime, fileName, sample) => {
    addPending({
      media_type: mediaType,
      file_name: fileName,
      declared_mime: mime,
      declared_size: sample.byteLength,
      storage_key: pendingKey.replace('photo.png', fileName),
    })
    headMetadata = { ContentType: mime, ContentLength: sample.byteLength }
    signatureSample = sample

    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ needsDeeperInspection: true })
    expect(database.tables.message_attachments[0].needs_deeper_inspection).toBe(true)
  })

  it('copies pending to a distinct final key and validates the final object after copy', async () => {
    addPending()
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(200)

    const pending = database.tables.private_message_attachment_uploads[0]
    const attachment = database.tables.message_attachments[0]
    expect(pending.storage_key).toBe(pendingKey)
    expect(pending.final_storage_key).toMatch(new RegExp(`^private/messages/final/${conversationId}/${messageId}/${userId}/`))
    expect(attachment.storage_path).toBe(pending.final_storage_key)
    expect(attachment.storage_path).not.toBe(pending.storage_key)

    const operations = mocks.send.mock.calls.map(([command]) => command.kind)
    expect(operations).toEqual(['head', 'get', 'copy', 'head', 'get', 'delete'])
    expect(mocks.send.mock.calls.find(([command]) => command.kind === 'copy')?.[0].input).toMatchObject({
      CopySourceIfMatch: '"pending-etag"',
    })
  })

  it('does not reuse pending storage when a confirmed upload is retried', async () => {
    addPending()
    const first = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(first.status).toBe(200)
    const finalStoragePath = database.tables.message_attachments[0].storage_path

    signatureSample = Uint8Array.from([1, 2, 3, 4])
    mocks.send.mockClear()
    const retry = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(retry.status).toBe(200)
    await expect(retry.json()).resolves.toMatchObject({ alreadyConfirmed: true })
    expect(database.tables.message_attachments[0].storage_path).toBe(finalStoragePath)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('fails closed when the copied final object does not pass the second validation', async () => {
    addPending()
    finalSignatureSample = Uint8Array.from([1, 2, 3, 4])
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({ error: 'FINAL_CONTENT_UNVERIFIED' })
    expect(database.tables.message_attachments).toHaveLength(0)
    expect(database.tables.private_message_attachment_uploads[0].status).toBe('cleanup_required')
  })

  it('rejects a second final attachment in the same message position', async () => {
    addPending()
    const first = await confirmAttachment(request('/confirm', { pendingUploadId: pendingId }))
    expect(first.status).toBe(200)

    const secondPendingId = '99999999-9999-4999-8999-999999999999'
    addPending({
      id: secondPendingId,
      storage_key: pendingKey.replace(pendingId, secondPendingId),
    })
    mocks.send.mockClear()
    const response = await confirmAttachment(request('/confirm', { pendingUploadId: secondPendingId }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: 'ATTACHMENT_POSITION_OCCUPIED' })
    expect(database.tables.message_attachments).toHaveLength(1)
    expect(mocks.send.mock.calls.some(([command]) => command.kind === 'copy')).toBe(false)
  })
})

describe('message attachment download and listing routes', () => {
  it('issues a short private R2 GET only for a participant', async () => {
    addAttachment()
    const response = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      provider: 'cloudflare-r2',
      url: mocks.signedUrl,
      expiresIn: 60,
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'get',
        input: expect.objectContaining({
          ResponseCacheControl: 'private, no-store, max-age=0',
        }),
      }),
      { expiresIn: 60 },
    )
  })

  it.each([
    [`private/messages/final/${otherUserId}/${messageId}/${userId}/${objectId}/photo.png`, 'conversation'],
    [`private/messages/final/${conversationId}/${otherUserId}/${userId}/${objectId}/photo.png`, 'message'],
    [`private/messages/final/${conversationId}/${messageId}/${otherUserId}/${objectId}/photo.png`, 'user'],
  ])('rejects a syntactically valid R2 key scoped to another %s', async (storagePath) => {
    addAttachment({ storage_path: storagePath })
    const response = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_STORAGE_SCOPE' })
    expect(mocks.getSignedUrl).not.toHaveBeenCalled()
  })

  it('supports only the exact semantically-bound legacy R2 migration layout', async () => {
    addAttachment({
      storage_path: `private/messages/${conversationId}/${messageId}/${attachmentId}/migrated-abcd-photo.png`,
    })
    const response = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(response.status).toBe(200)

    database.tables.message_attachments[0].storage_path =
      `private/messages/${conversationId}/${messageId}/${otherUserId}/migrated-abcd-photo.png`
    const invalid = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(invalid.status).toBe(400)
  })

  it('keeps legacy Supabase Storage signed downloads', async () => {
    addAttachment({ storage_path: `${conversationId}/${messageId}/legacy.png` })
    const response = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      provider: 'supabase-storage',
      url: 'https://supabase.example.test/signed',
      expiresIn: 60,
    })
  })

  it('rejects a non-participant and an invalid stored path', async () => {
    addAttachment()
    database.tables.conversation_participants = []
    const forbidden = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(forbidden.status).toBe(403)

    database.tables.conversation_participants = [{ conversation_id: conversationId, user_id: userId }]
    database.tables.message_attachments[0].storage_path = '../private/file.png'
    const invalid = await downloadAttachment(request(`/download?attachmentId=${attachmentId}`, undefined, 'GET'))
    expect(invalid.status).toBe(400)
  })

  it('lists attachments using the message conversation, not a client conversation id', async () => {
    addAttachment()
    const response = await listAttachments(
      request(`/message/${messageId}?conversationId=${otherUserId}`, undefined, 'GET'),
      { params: Promise.resolve({ messageId }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0]).not.toHaveProperty('storage_path')

    database.tables.conversation_participants = []
    const forbidden = await listAttachments(
      request(`/message/${messageId}`, undefined, 'GET'),
      { params: Promise.resolve({ messageId }) },
    )
    expect(forbidden.status).toBe(403)
  })
})

describe('message attachment delete route', () => {
  it('lets the original sender delete private R2 metadata and storage', async () => {
    addAttachment()
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(200)
    expect(database.tables.message_attachments).toHaveLength(0)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete' }))
  })

  it('rejects another participant who is not the sender', async () => {
    addAttachment({ sender_id: otherUserId })
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(403)
    expect(database.tables.message_attachments).toHaveLength(1)
  })

  it('does not delete a syntactically valid R2 key bound to another user', async () => {
    addAttachment({
      storage_path: `private/messages/final/${conversationId}/${messageId}/${otherUserId}/${objectId}/photo.png`,
    })
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ storageError: 'INVALID_STORAGE_PATH' })
    expect(database.tables.message_attachments).toHaveLength(1)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('returns not found for an unknown attachment', async () => {
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(404)
  })

  it('treats an already missing R2 object as an idempotent delete', async () => {
    addAttachment()
    deleteMissing = true
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ storageMissing: true })
    expect(database.tables.message_attachments).toHaveLength(0)
  })

  it('preserves compatible deletion for a legacy Supabase object', async () => {
    const storagePath = `${conversationId}/${userId}/message-${messageId}-0-123.png`
    addAttachment({ storage_path: storagePath })
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(200)
    expect(database.removedLegacyPaths).toEqual([storagePath])
  })

  it('fails closed when a legacy Supabase delete path lacks sender binding', async () => {
    addAttachment({ storage_path: `${conversationId}/${messageId}/legacy.png` })
    const response = await deleteAttachment(
      request(`/attachments/${attachmentId}`, undefined, 'DELETE'),
      { params: Promise.resolve({ attachmentId }) },
    )
    expect(response.status).toBe(502)
    expect(database.tables.message_attachments).toHaveLength(1)
    expect(database.removedLegacyPaths).toHaveLength(0)
  })
})

type Row = Record<string, unknown>
type QueryResult = { data: Row | Row[] | null; error: { message: string } | null }

class FakeDatabase {
  readonly tables: Record<string, Row[]>
  readonly removedLegacyPaths: string[] = []
  readonly client: {
    from: (table: string) => FakeQuery
    storage: { from: (bucket: string) => Record<string, unknown> }
  }

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables
    this.client = {
      from: (table) => new FakeQuery(this, table),
      storage: {
        from: (bucket) => ({
          createSignedUrl: async (path: string, expiresIn: number) => ({
            data: bucket === 'message-media' && expiresIn === 60
              ? { signedUrl: 'https://supabase.example.test/signed' }
              : null,
            error: null,
          }),
          remove: async (paths: string[]) => {
            this.removedLegacyPaths.push(...paths)
            return { error: null }
          },
        }),
      },
    }
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private selectedColumns = '*'
  private payload: Row | Row[] | null = null
  private readonly filters: Array<{ kind: 'eq' | 'lt'; field: string; value: unknown }> = []
  private orderField: string | null = null

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: string,
  ) {}

  select(columns = '*') {
    this.selectedColumns = columns
    return this
  }

  insert(payload: Row | Row[]) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: 'eq', field, value })
    return this
  }

  is(field: string, value: unknown) {
    this.filters.push({ kind: 'eq', field, value })
    return this
  }

  lt(field: string, value: unknown) {
    this.filters.push({ kind: 'lt', field, value })
    return this
  }

  order(field: string) {
    this.orderField = field
    return this
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute()
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : []
    return { data: rows[0] || null, error: result.error }
  }

  async single(): Promise<QueryResult> {
    return this.maybeSingle()
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult> {
    const table = this.database.tables[this.table] ||= []

    if (this.operation === 'insert') {
      const values = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(Boolean) as Row[]
      const inserted = values.map((value) => ({
        ...value,
        id: value.id || crypto.randomUUID(),
        confirmed_at: value.confirmed_at ?? null,
        created_at: value.created_at || new Date().toISOString(),
      }))
      table.push(...inserted)
      return { data: inserted.map((row) => project(row, this.selectedColumns)), error: null }
    }

    const matching = table.filter((row) => this.matches(row))
    if (this.operation === 'update') {
      for (const row of matching) Object.assign(row, this.payload)
      return { data: matching.map((row) => project(row, this.selectedColumns)), error: null }
    }
    if (this.operation === 'delete') {
      for (const row of matching) table.splice(table.indexOf(row), 1)
      return { data: matching, error: null }
    }

    const selected = matching.map((row) => project(row, this.selectedColumns))
    if (this.orderField) {
      selected.sort((left, right) => Number(left[this.orderField as string]) - Number(right[this.orderField as string]))
    }
    return { data: selected, error: null }
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.field] === filter.value
      return String(row[filter.field]) < String(filter.value)
    })
  }
}

function project(row: Row, selectedColumns: string) {
  if (selectedColumns === '*') return { ...row }
  const output: Row = {}
  for (const column of selectedColumns.split(',').map((value) => value.trim())) {
    if (column) output[column] = row[column]
  }
  return output
}

function validPrepareBody() {
  return {
    conversationId,
    messageId,
    filename: 'photo.png',
    declaredMime: 'image/png',
    declaredSize: png.byteLength,
    mediaType: 'image',
    position: 0,
  }
}

function addPending(overrides: Row = {}) {
  database.tables.private_message_attachment_uploads.push({
    id: pendingId,
    user_id: userId,
    conversation_id: conversationId,
    message_id: messageId,
    storage_provider: 'cloudflare-r2',
    storage_bucket: 'private-bucket',
    storage_key: pendingKey,
    final_storage_key: null,
    attachment_id: null,
    media_type: 'image',
    file_name: 'photo.png',
    declared_mime: 'image/png',
    declared_size: png.byteLength,
    position: 0,
    status: 'pending',
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    confirmed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  })
}

function addAttachment(overrides: Row = {}) {
  database.tables.message_attachments.push({
    id: attachmentId,
    message_id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    storage_path: finalKey,
    media_type: 'image',
    file_name: 'photo.png',
    file_size: png.byteLength,
    mime_type: 'image/png',
    position: 0,
    needs_deeper_inspection: false,
    created_at: new Date().toISOString(),
    ...overrides,
  })
}

function request(path: string, body?: Record<string, unknown>, method = 'POST') {
  requestSequence += 1
  return new Request(`http://localhost/api/messages/attachments${path}`, {
    method,
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'x-forwarded-for': `198.51.100.${requestSequence}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
