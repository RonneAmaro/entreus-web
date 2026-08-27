export type MessageAttachmentMediaType = 'image' | 'video' | 'audio'

export type MessageAttachmentApiAttachment = Readonly<{
  id: string
  message_id: string
  conversation_id: string
  sender_id: string
  media_type: MessageAttachmentMediaType
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  position: number
  needs_deeper_inspection?: boolean
  created_at: string
}>

export type PrepareMessageAttachmentInput = Readonly<{
  accessToken: string
  conversationId: string
  messageId: string
  file: File
  mediaType: MessageAttachmentMediaType
  position: number
}>

export type PreparedMessageAttachment = Readonly<{
  pendingUploadId: string
  uploadUrl: string
  contentType: string
  contentLength: number
  expiresIn: number
  expiresAt: string
}>

export type ConfirmedMessageAttachment = Readonly<{
  attachment: MessageAttachmentApiAttachment
  alreadyConfirmed: boolean
  needsDeeperInspection?: boolean
}>

export class MessageAttachmentClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null = null,
  ) {
    super(code)
    this.name = 'MessageAttachmentClientError'
  }
}

export async function prepareMessageAttachment(
  input: PrepareMessageAttachmentInput,
): Promise<PreparedMessageAttachment> {
  const response = await fetch('/api/messages/attachments/prepare', {
    method: 'POST',
    headers: apiHeaders(input.accessToken),
    body: JSON.stringify({
      conversationId: input.conversationId,
      messageId: input.messageId,
      filename: input.file.name,
      declaredMime: input.file.type,
      declaredSize: input.file.size,
      mediaType: input.mediaType,
      position: input.position,
    }),
  })

  const data = await readApiResponse<Partial<PreparedMessageAttachment>>(response, 'PREPARE_FAILED')
  if (
    typeof data.pendingUploadId !== 'string'
    || typeof data.uploadUrl !== 'string'
    || typeof data.contentType !== 'string'
    || typeof data.contentLength !== 'number'
    || typeof data.expiresIn !== 'number'
    || typeof data.expiresAt !== 'string'
  ) {
    throw new MessageAttachmentClientError('PREPARE_RESPONSE_INVALID', response.status)
  }

  return data as PreparedMessageAttachment
}

export async function uploadPreparedMessageAttachment(input: Readonly<{
  uploadUrl: string
  contentType: string
  file: File
}>) {
  const response = await fetch(input.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': input.contentType },
    body: input.file,
  })

  if (!response.ok) {
    throw new MessageAttachmentClientError('UPLOAD_FAILED', response.status)
  }
}

export async function confirmMessageAttachment(input: Readonly<{
  accessToken: string
  pendingUploadId: string
}>): Promise<ConfirmedMessageAttachment> {
  const response = await fetch('/api/messages/attachments/confirm', {
    method: 'POST',
    headers: apiHeaders(input.accessToken),
    body: JSON.stringify({ pendingUploadId: input.pendingUploadId }),
  })

  const data = await readApiResponse<Partial<ConfirmedMessageAttachment>>(response, 'CONFIRM_FAILED')
  if (!isMessageAttachment(data.attachment)) {
    throw new MessageAttachmentClientError('CONFIRM_RESPONSE_INVALID', response.status)
  }

  return {
    attachment: data.attachment,
    alreadyConfirmed: Boolean(data.alreadyConfirmed),
    needsDeeperInspection: Boolean(data.needsDeeperInspection),
  }
}

export async function uploadAndConfirmMessageAttachment(
  input: PrepareMessageAttachmentInput,
): Promise<ConfirmedMessageAttachment> {
  const prepared = await prepareMessageAttachment(input)
  await uploadPreparedMessageAttachment({
    uploadUrl: prepared.uploadUrl,
    contentType: prepared.contentType,
    file: input.file,
  })
  return confirmMessageAttachment({
    accessToken: input.accessToken,
    pendingUploadId: prepared.pendingUploadId,
  })
}

export async function getMessageAttachmentDownload(input: Readonly<{
  accessToken: string
  attachmentId: string
}>): Promise<string> {
  const response = await fetch(
    `/api/messages/attachments/download?attachmentId=${encodeURIComponent(input.attachmentId)}`,
    { headers: apiHeaders(input.accessToken), cache: 'no-store' },
  )
  const data = await readApiResponse<{ url?: unknown }>(response, 'DOWNLOAD_FAILED')
  if (typeof data.url !== 'string' || !data.url) {
    throw new MessageAttachmentClientError('DOWNLOAD_RESPONSE_INVALID', response.status)
  }
  return data.url
}

export async function deleteMessageAttachment(input: Readonly<{
  accessToken: string
  attachmentId: string
}>) {
  const response = await fetch(
    `/api/messages/attachments/${encodeURIComponent(input.attachmentId)}`,
    { method: 'DELETE', headers: apiHeaders(input.accessToken) },
  )
  await readApiResponse(response, 'DELETE_FAILED')
}

function apiHeaders(accessToken: string): HeadersInit {
  if (!accessToken.trim()) {
    throw new MessageAttachmentClientError('AUTH_REQUIRED')
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function readApiResponse<T>(response: Response, fallbackCode: string): Promise<T> {
  const data = await response.json().catch(() => null) as { error?: unknown } | T | null
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : fallbackCode
    throw new MessageAttachmentClientError(code, response.status)
  }
  if (!data || typeof data !== 'object') {
    throw new MessageAttachmentClientError(`${fallbackCode}_RESPONSE_INVALID`, response.status)
  }
  return data as T
}

function isMessageAttachment(value: unknown): value is MessageAttachmentApiAttachment {
  if (!value || typeof value !== 'object') return false
  const attachment = value as Partial<MessageAttachmentApiAttachment>
  return (
    typeof attachment.id === 'string'
    && typeof attachment.message_id === 'string'
    && typeof attachment.conversation_id === 'string'
    && typeof attachment.sender_id === 'string'
    && (attachment.media_type === 'image' || attachment.media_type === 'video' || attachment.media_type === 'audio')
    && typeof attachment.position === 'number'
    && typeof attachment.created_at === 'string'
  )
}
