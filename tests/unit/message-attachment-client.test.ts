import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MessageAttachmentClientError,
  deleteMessageAttachment,
  getMessageAttachmentDownload,
  prepareMessageAttachment,
  uploadAndConfirmMessageAttachment,
} from '@/lib/message-attachments/client'

const accessToken = 'access-token'
const conversationId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const attachmentId = '33333333-3333-4333-8333-333333333333'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('message attachment client', () => {
  it('fails before a request when the browser session has no access token', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    await expect(prepareMessageAttachment({
      accessToken: '',
      conversationId,
      messageId,
      file: file(),
      mediaType: 'image',
      position: 0,
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the exact prepare contract with bearer authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      pendingUploadId: attachmentId,
      uploadUrl: 'https://r2.example.test/pending-put',
      contentType: 'image/png',
      contentLength: 4,
      expiresIn: 300,
      expiresAt: '2026-08-27T12:00:00.000Z',
    }, 201))
    globalThis.fetch = fetchMock

    await prepareMessageAttachment({
      accessToken,
      conversationId,
      messageId,
      file: file('Vacation.PNG', 'image/png'),
      mediaType: 'image',
      position: 2,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/messages/attachments/prepare', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      conversationId,
      messageId,
      filename: 'Vacation.PNG',
      declaredMime: 'image/png',
      declaredSize: 4,
      mediaType: 'image',
      position: 2,
    })
  })

  it('uses only the server URL for PUT and confirms only after a successful PUT', async () => {
    const selectedFile = file('voice.webm', 'audio/webm;codecs=opus')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        pendingUploadId: attachmentId,
        uploadUrl: 'https://r2.example.test/pending-put',
        contentType: 'audio/webm',
        contentLength: 4,
        expiresIn: 300,
        expiresAt: '2026-08-27T12:00:00.000Z',
      }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({
        attachment: attachment({ media_type: 'audio', mime_type: 'audio/webm' }),
        alreadyConfirmed: false,
        needsDeeperInspection: true,
      }))
    globalThis.fetch = fetchMock

    const result = await uploadAndConfirmMessageAttachment({
      accessToken,
      conversationId,
      messageId,
      file: selectedFile,
      mediaType: 'audio',
      position: 1,
    })

    expect(result.attachment.id).toBe(attachmentId)
    expect(fetchMock.mock.calls).toHaveLength(3)
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://r2.example.test/pending-put',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'audio/webm' },
        body: selectedFile,
      }),
    ])
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Authorization')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/messages/attachments/confirm')
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ Authorization: `Bearer ${accessToken}` })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ pendingUploadId: attachmentId })
  })

  it.each([
    ['prepare', [jsonResponse({ error: 'INVALID_PAYLOAD' }, 400)]],
    ['put', [jsonResponse({
      pendingUploadId: attachmentId,
      uploadUrl: 'https://r2.example.test/pending-put',
      contentType: 'image/png',
      contentLength: 4,
      expiresIn: 300,
      expiresAt: '2026-08-27T12:00:00.000Z',
    }, 201), new Response(null, { status: 403 })]],
    ['confirm', [jsonResponse({
      pendingUploadId: attachmentId,
      uploadUrl: 'https://r2.example.test/pending-put',
      contentType: 'image/png',
      contentLength: 4,
      expiresIn: 300,
      expiresAt: '2026-08-27T12:00:00.000Z',
    }, 201), new Response(null, { status: 200 }), jsonResponse({ error: 'FINAL_COPY_FAILED' }, 502)]],
  ])('does not report success when %s fails', async (_stage, responses) => {
    const fetchMock = vi.fn()
    for (const response of responses) fetchMock.mockResolvedValueOnce(response)
    globalThis.fetch = fetchMock

    await expect(uploadAndConfirmMessageAttachment({
      accessToken,
      conversationId,
      messageId,
      file: file(),
      mediaType: 'image',
      position: 0,
    })).rejects.toBeInstanceOf(MessageAttachmentClientError)

    if (_stage === 'prepare') expect(fetchMock).toHaveBeenCalledTimes(1)
    if (_stage === 'put') expect(fetchMock).toHaveBeenCalledTimes(2)
    if (_stage === 'confirm') expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses authorized download and delete APIs without a storage path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ url: 'https://r2.example.test/signed-get' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, storageDeleted: true }))
    globalThis.fetch = fetchMock

    await expect(getMessageAttachmentDownload({ accessToken, attachmentId })).resolves.toBe('https://r2.example.test/signed-get')
    await deleteMessageAttachment({ accessToken, attachmentId })

    expect(fetchMock.mock.calls[0]).toEqual([
      `/api/messages/attachments/download?attachmentId=${attachmentId}`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }) }),
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      `/api/messages/attachments/${attachmentId}`,
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }) }),
    ])
    expect(JSON.stringify(fetchMock.mock.calls[1][1])).not.toContain('storage_path')
  })
})

function file(name = 'photo.png', type = 'image/png') {
  const blob = new Blob([Uint8Array.from([1, 2, 3, 4])], { type })
  return new File([blob], name, { type })
}

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: attachmentId,
    message_id: messageId,
    conversation_id: conversationId,
    sender_id: '44444444-4444-4444-8444-444444444444',
    media_type: 'image',
    file_name: 'photo.png',
    file_size: 4,
    mime_type: 'image/png',
    position: 0,
    created_at: '2026-08-27T12:00:00.000Z',
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
