import { describe, expect, it } from 'vitest'
import {
  areMessageAttachmentMimesCompatible,
  buildFinalMessageAttachmentKey,
  buildPendingMessageAttachmentKey,
  classifyMessageAttachmentSignature,
  isSafePrivateMessageAttachmentKey,
  normalizeHeadMetadata,
  normalizePrivateMessageAttachmentKey,
  parseFinalMessageAttachmentKey,
  parseLegacyMessageAttachmentKey,
  parsePendingMessageAttachmentKey,
  validatePendingMessageAttachmentKey,
  validateStoredMessageAttachmentKey,
} from '../../lib/message-attachments/r2'
import {
  enforcePrepareRateLimit,
  jsonNoStore,
  parseMessageAttachmentMediaType,
  parseMessageAttachmentPosition,
  parsePrepareRequest,
  parseSupabaseStorageReference,
  parseUuid,
  requireConversationParticipant,
  requireOwnedMessage,
} from '../../lib/message-attachments/security'

const conversationId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const objectId = '44444444-4444-4444-8444-444444444444'
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
const wav = new TextEncoder().encode('RIFFxxxxWAVE')

describe('private message attachment metadata and keys', () => {
  it('accepts only supported media types, positions and UUIDs', () => {
    expect(parseMessageAttachmentMediaType('image')).toBe('image')
    expect(parseMessageAttachmentMediaType('video')).toBe('video')
    expect(parseMessageAttachmentMediaType('audio')).toBe('audio')
    expect(parseMessageAttachmentMediaType('document')).toBeNull()

    expect([0, 1, 2].map(parseMessageAttachmentPosition)).toEqual([0, 1, 2])
    for (const value of [-1, 3, 1.5, '1', null]) {
      expect(parseMessageAttachmentPosition(value)).toBeNull()
    }

    expect(parseUuid(messageId)).toBe(messageId)
    expect(parseUuid('../message')).toBeNull()
    expect(parseUuid('not-a-uuid')).toBeNull()
  })

  it('parses and sanitizes a valid prepare payload through S1.6A', async () => {
    const result = await parsePrepareRequest(prepareRequest({
      conversationId,
      messageId,
      filename: 'João férias.PNG',
      declaredMime: 'IMAGE/PNG; charset=binary',
      declaredSize: png.byteLength,
      mediaType: 'image',
      position: 0,
    }))

    expect(result).toEqual({
      body: {
        conversationId,
        messageId,
        fileName: 'João-férias.png',
        declaredMime: 'image/png',
        declaredSize: png.byteLength,
        mediaType: 'image',
        position: 0,
      },
    })
  })

  it.each([
    [{ filename: '../photo.png' }, 'file_name_invalid', 400],
    [{ filename: 'photo.exe' }, 'file_extension_not_allowed', 400],
    [{ declaredMime: 'text/html' }, 'file_type_not_allowed', 400],
    [{ declaredSize: 50 * 1024 * 1024 + 1 }, 'file_too_large', 413],
    [{ position: 3 }, 'INVALID_PAYLOAD', 400],
  ])('rejects an unsafe prepare override %#', async (override, error, status) => {
    const result = await parsePrepareRequest(prepareRequest({
      conversationId,
      messageId,
      filename: 'photo.png',
      declaredMime: 'image/png',
      declaredSize: png.byteLength,
      mediaType: 'image',
      position: 0,
      ...override,
    }))

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.status).toBe(status)
      await expect(result.error.json()).resolves.toMatchObject({ error })
    }
  })

  it('builds a server-controlled scoped key and rejects malformed keys', () => {
    const pendingKey = buildPendingMessageAttachmentKey({
      conversationId,
      messageId,
      userId,
      pendingId: objectId,
      mediaType: 'image',
      fileName: 'Minha-Foto.png',
    })
    expect(pendingKey).toBe(`private/messages/pending/${conversationId}/${messageId}/${userId}/${objectId}/Minha-Foto.png`)
    expect(parsePendingMessageAttachmentKey(pendingKey)).toMatchObject({
      conversationId,
      messageId,
      userId,
      pendingId: objectId,
    })
    expect(isSafePrivateMessageAttachmentKey(pendingKey)).toBe(false)

    const key = buildFinalMessageAttachmentKey({
      conversationId,
      messageId,
      userId,
      mediaType: 'image',
      fileName: 'Minha-Foto.png',
      uuid: () => objectId,
    })
    expect(key).toBe(`private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/Minha-Foto.png`)
    expect(isSafePrivateMessageAttachmentKey(key)).toBe(true)
    expect(normalizePrivateMessageAttachmentKey(`r2://${key}`)).toBe(key)
    expect(parseFinalMessageAttachmentKey(key)).toMatchObject({ conversationId, messageId, userId, objectId })

    for (const unsafe of [
      `public/messages/${conversationId}/file.png`,
      'private/messages/../../file.png',
      `private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/a\\b.png`,
      `private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/a.png?token=1`,
      `private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/a.png#fragment`,
      `private/messages/final/${conversationId}/${messageId}/${userId}/${objectId}/a\0.png`,
    ]) {
      expect(isSafePrivateMessageAttachmentKey(unsafe)).toBe(false)
    }
  })

  it('keeps compatibility with safe keys created by the existing migration script', () => {
    const migrated = `private/messages/${conversationId}/${messageId}/${objectId}/migrated-abcd-photo.jpg`
    expect(normalizePrivateMessageAttachmentKey(migrated)).toBe(migrated)
    expect(parseLegacyMessageAttachmentKey(migrated)).toMatchObject({
      conversationId,
      messageId,
      attachmentId: objectId,
    })
  })

  it('rejects syntactically valid keys whose semantic scope differs from their row', () => {
    const finalKey = buildFinalMessageAttachmentKey({
      conversationId,
      messageId,
      userId,
      mediaType: 'image',
      fileName: 'photo.png',
      uuid: () => objectId,
    })
    const row = {
      id: objectId,
      conversation_id: conversationId,
      message_id: messageId,
      sender_id: userId,
      storage_path: finalKey,
      file_name: 'photo.png',
      mime_type: 'image/png',
      media_type: 'image' as const,
      file_size: png.byteLength,
      position: 0,
    }
    expect(validateStoredMessageAttachmentKey(row)).toMatchObject({ kind: 'final' })
    expect(validateStoredMessageAttachmentKey({ ...row, conversation_id: objectId })).toBeNull()
    expect(validateStoredMessageAttachmentKey({ ...row, message_id: objectId })).toBeNull()
    expect(validateStoredMessageAttachmentKey({ ...row, sender_id: objectId })).toBeNull()

    const pending = {
      id: objectId,
      user_id: userId,
      conversation_id: conversationId,
      message_id: messageId,
      storage_provider: 'cloudflare-r2' as const,
      storage_bucket: 'private-bucket',
      storage_key: buildPendingMessageAttachmentKey({
        conversationId,
        messageId,
        userId,
        pendingId: objectId,
        mediaType: 'image',
        fileName: 'photo.png',
      }),
      final_storage_key: null,
      attachment_id: null,
      media_type: 'image' as const,
      file_name: 'photo.png',
      declared_mime: 'image/png',
      declared_size: png.byteLength,
      position: 0,
      status: 'pending' as const,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      confirmed_at: null,
      created_at: new Date().toISOString(),
    }
    expect(validatePendingMessageAttachmentKey(pending)).toBeTruthy()
    expect(validatePendingMessageAttachmentKey({ ...pending, conversation_id: objectId })).toBeNull()
    expect(validatePendingMessageAttachmentKey({ ...pending, message_id: objectId })).toBeNull()
    expect(validatePendingMessageAttachmentKey({ ...pending, user_id: conversationId })).toBeNull()
  })
})

describe('message attachment authorization primitives', () => {
  it('distinguishes participants from non-participants', async () => {
    expect(await requireConversationParticipant({
      supabase: lookupClient({ conversation_id: conversationId }),
      conversationId,
      userId,
    })).toBe(true)
    expect(await requireConversationParticipant({
      supabase: lookupClient(null),
      conversationId,
      userId,
    })).toBe(false)
  })

  it('requires the message to belong to both the conversation and user', async () => {
    expect(await requireOwnedMessage({
      supabase: lookupClient({ id: messageId, conversation_id: conversationId, sender_id: userId }),
      conversationId,
      messageId,
      userId,
    })).toBe(true)
    expect(await requireOwnedMessage({
      supabase: lookupClient({ id: messageId, conversation_id: conversationId, sender_id: objectId }),
      conversationId,
      messageId,
      userId,
    })).toBe(false)
  })

  it('uses the shared rate limiter and returns private headers when exhausted', async () => {
    let response: Response | null = null
    for (let index = 0; index < 21; index += 1) {
      response = await enforcePrepareRateLimit(new Request('http://localhost/prepare', {
        headers: { 'x-forwarded-for': `203.0.113.${index}` },
      }), 'isolated-rate-limit-user')
    }

    expect(response?.status).toBe(429)
    expect(response?.headers.get('cache-control')).toContain('private')
    expect(response?.headers.get('cache-control')).toContain('no-store')
    expect(response?.headers.get('retry-after')).toBeTruthy()
  })
})

describe('message attachment signature classification', () => {
  it('accepts matching JPEG, PNG and WAV signatures', () => {
    expect(signature('image', 'image/jpeg', jpeg)).toBe('verified')
    expect(signature('image', 'image/png', png)).toBe('verified')
    expect(signature('audio', 'audio/wav', wav)).toBe('verified')
    expect(signature('audio', 'audio/x-wav', wav)).toBe('verified')
    expect(areMessageAttachmentMimesCompatible('audio/x-wav', 'audio/wav')).toBe(true)
  })

  it('rejects signature, category and MIME mismatches', () => {
    expect(signature('image', 'image/jpeg', png)).toBe('rejected')
    expect(signature('audio', 'audio/mpeg', png)).toBe('rejected')
    expect(signature('video', 'video/webm', mp4())).toBe('rejected')
    expect(signature('audio', 'audio/ogg', mp4())).toBe('rejected')
  })

  it.each([
    ['video', 'video/mp4', mp4()],
    ['video', 'video/webm', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])],
    ['audio', 'audio/ogg', new TextEncoder().encode('OggS')],
    ['video', 'video/ogg', new TextEncoder().encode('OggS')],
  ] as const)('marks a coherent %s/%s container for deeper inspection', (mediaType, mime, sample) => {
    expect(signature(mediaType, mime, sample)).toBe('needs_deeper_inspection')
  })

  it('fails closed for completely unknown content', () => {
    expect(signature('image', 'image/png', Uint8Array.from([1, 2, 3, 4]))).toBe('file_content_unverified')
  })

  it.each([
    ['image', 'image/png', png.slice(0, 8)],
    ['image', 'image/gif', new TextEncoder().encode('GIF89a')],
    ['image', 'image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff])],
    ['audio', 'audio/mpeg', Uint8Array.from([0xff, 0xe0])],
  ] as const)('does not verify a truncated %s/%s signature', (mediaType, mime, sample) => {
    expect(signature(mediaType, mime, sample)).toBe('file_content_unverified')
  })

  it('normalizes HEAD metadata without trusting generic MIME', () => {
    expect(normalizeHeadMetadata({ ContentType: ' IMAGE/PNG; charset=binary ', ContentLength: 123 })).toEqual({
      contentType: 'image/png',
      contentLength: 123,
      etag: null,
    })
    expect(normalizeHeadMetadata({ ContentType: 'application/octet-stream' })).toEqual({
      contentType: '',
      contentLength: null,
      etag: null,
    })
  })
})

describe('legacy Supabase Storage references and response privacy', () => {
  it('accepts only the private legacy bucket and safe object paths', () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    expect(parseSupabaseStorageReference(`${conversationId}/${messageId}/photo.png`)).toEqual({
      bucket: 'message-media',
      objectPath: `${conversationId}/${messageId}/photo.png`,
    })
    expect(parseSupabaseStorageReference(`https://project.supabase.co/storage/v1/object/sign/message-media/${conversationId}/photo.png`)).toEqual({
      bucket: 'message-media',
      objectPath: `${conversationId}/photo.png`,
    })
    expect(parseSupabaseStorageReference('../secret.png')).toBeNull()
    expect(parseSupabaseStorageReference('folder\\secret.png')).toBeNull()
    expect(parseSupabaseStorageReference('file.png?token=secret')).toBeNull()
    expect(parseSupabaseStorageReference('https://example.com/storage/v1/object/sign/another-bucket/file.png')).toBeNull()
    expect(parseSupabaseStorageReference(`https://evil.example/storage/v1/object/sign/message-media/${conversationId}/photo.png`)).toBeNull()
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
  })

  it('always emits private/no-store headers', () => {
    const response = jsonNoStore({ ok: true })
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('vary')).toBe('Authorization, Cookie')
  })
})

function prepareRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/messages/attachments/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function lookupClient(data: Record<string, unknown> | null) {
  const terminal = { maybeSingle: async () => ({ data, error: null }) }
  const secondEq = { eq: () => terminal }
  const firstEq = { eq: () => secondEq }
  const query = { select: () => firstEq }
  return { from: () => query } as never
}

function signature(
  mediaType: 'image' | 'video' | 'audio',
  declaredMime: string,
  sampleBytes: Uint8Array,
) {
  return classifyMessageAttachmentSignature({ mediaType, declaredMime, sampleBytes })
}

function mp4() {
  return Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70])
}
