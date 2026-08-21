import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  insertSingle: vi.fn(),
  insertPayload: vi.fn(),
}))

const room = {
  id: '22222222-2222-4222-8222-222222222222',
  room_name: 'sala-segura',
  status: 'active',
  expires_at: '2099-01-01T00:00:00.000Z',
}

const membership = {
  status: 'approved',
  display_name: 'Participante',
}

const supabase = {
  storage: {
    from: vi.fn(() => ({
      upload: mocks.storageUpload,
      remove: mocks.storageRemove,
    })),
  },
  from: vi.fn(() => ({
    insert: vi.fn((payload: unknown) => {
      mocks.insertPayload(payload)
      return {
        select: vi.fn(() => ({ single: mocks.insertSingle })),
      }
    }),
  })),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
  },
}))

vi.mock('@/lib/meet-server', async () => {
  const { NextResponse } = await import('next/server')

  return {
    requireUser: vi.fn(async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } })),
    getSupabaseAdmin: vi.fn(() => supabase),
    getRoomByName: vi.fn(async () => room),
    expireRoomIfNeeded: vi.fn(async () => room),
    hasRoomExpired: vi.fn(() => false),
    getMembership: vi.fn(async () => membership),
    canJoinRoom: vi.fn(() => true),
    jsonError: (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status }),
  }
})

import { POST } from '@/app/api/meet/rooms/[roomName]/messages/attachments/route'
import {
  canPreviewMeetAttachment,
  getMeetAttachmentPreviewCacheKey,
  removeMeetAttachmentPreviewUrl,
  shouldRefreshMeetAttachmentPreview,
} from '@/app/meet/[roomName]/MeetRoomClient'
import { detectFileSignature } from '@/lib/upload-security'
import { TextReader, Uint8ArrayWriter, ZipWriter, type ZipWriterAddDataOptions } from '@zip.js/zip.js'

const context = { params: Promise.resolve({ roomName: room.room_name }) }
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
const completePng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99,
  0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])
const humanDisguisedTxtBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
const fiveMiB = 5 * 1024 * 1024

type TestOfficeType = 'docx' | 'xlsx' | 'pptx'

const officeFixtureConfig: Record<TestOfficeType, { mainPart: string; mainRoot: string; contentType: string; mime: string }> = {
  docx: {
    mainPart: 'word/document.xml',
    mainRoot: 'w:document',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    mainPart: 'xl/workbook.xml',
    mainRoot: 'workbook',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    mainPart: 'ppt/presentation.xml',
    mainRoot: 'p:presentation',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
}

async function createZip(entries: Array<{ name: string; content?: string; options?: ZipWriterAddDataOptions }>) {
  const output = new Uint8ArrayWriter()
  const writer = new ZipWriter(output, { useWebWorkers: false })
  for (const entry of entries) {
    await writer.add(entry.name, entry.content === undefined ? undefined : new TextReader(entry.content), {
      useWebWorkers: false,
      ...entry.options,
    })
  }
  return writer.close()
}

async function createOfficeFixture(
  type: TestOfficeType,
  overrides: Partial<{ contentTypes: string; relationships: string; main: string }> = {},
) {
  const config = officeFixtureConfig[type]
  const contentTypes = overrides.contentTypes ?? `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/${config.mainPart}" ContentType="${config.contentType}"/>
    </Types>`
  const relationships = overrides.relationships ?? `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${config.mainPart}"/>
    </Relationships>`
  const main = overrides.main ?? `<?xml version="1.0" encoding="UTF-8"?><${config.mainRoot} xmlns:w="urn:w" xmlns:p="urn:p"></${config.mainRoot}>`

  return createZip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: relationships },
    { name: config.mainPart, content: main },
  ])
}

function zipFixture(names: string[]) {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  const write16 = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >>> 8) & 0xff
  }
  const write32 = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >>> 8) & 0xff
    target[offset + 2] = (value >>> 16) & 0xff
    target[offset + 3] = (value >>> 24) & 0xff
  }
  const concat = (parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }

  for (const name of names) {
    const nameBytes = encoder.encode(name)
    const local = new Uint8Array(30 + nameBytes.length)
    write32(local, 0, 0x04034b50)
    write16(local, 4, 20)
    write16(local, 26, nameBytes.length)
    local.set(nameBytes, 30)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    write32(central, 0, 0x02014b50)
    write16(central, 4, 20)
    write16(central, 6, 20)
    write16(central, 28, nameBytes.length)
    write32(central, 42, localOffset)
    central.set(nameBytes, 46)
    centralParts.push(central)
    localOffset += local.length
  }

  const localBytes = concat(localParts)
  const centralBytes = concat(centralParts)
  const end = new Uint8Array(22)
  write32(end, 0, 0x06054b50)
  write16(end, 8, names.length)
  write16(end, 10, names.length)
  write32(end, 12, centralBytes.length)
  write32(end, 16, localBytes.length)
  return concat([localBytes, centralBytes, end])
}

const docx = zipFixture(['[Content_Types].xml', 'word/document.xml'])
const xlsx = zipFixture(['[Content_Types].xml', 'xl/workbook.xml'])
const pptx = zipFixture(['[Content_Types].xml', 'ppt/presentation.xml'])

function requestWith(file: File, messageId = '33333333-3333-4333-8333-333333333333') {
  const form = new FormData()
  form.set('id', messageId)
  form.set('file', file)
  return new Request('https://entreus.invalid/api/meet/rooms/sala-segura/messages/attachments', {
    method: 'POST',
    body: form,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.storageUpload.mockResolvedValue({ error: null })
  mocks.storageRemove.mockResolvedValue({ error: null })
  mocks.insertSingle.mockResolvedValue({
    data: {
      id: '33333333-3333-4333-8333-333333333333',
      sender_name: 'Participante',
      sender_identity: null,
      content: 'imagem.png',
      created_at: '2026-08-16T00:00:00.000Z',
      type: 'attachment',
      attachment_name: 'imagem.png',
      attachment_mime_type: 'image/png',
      attachment_size: png.byteLength,
    },
    error: null,
  })
})

describe('Meet attachment upload hardening', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('allows %s inline preview', (mimeType) => {
    expect(canPreviewMeetAttachment(mimeType)).toBe(true)
  })

  it.each(['application/pdf', 'text/plain'])('keeps %s as a generic file card', (mimeType) => {
    expect(canPreviewMeetAttachment(mimeType)).toBe(false)
  })

  it('keys preview cache by message id and refreshes expired URLs', () => {
    expect(getMeetAttachmentPreviewCacheKey('message-123')).toBe('message-123')
    expect(getMeetAttachmentPreviewCacheKey('message-123')).not.toBe('photo.png')
    expect(shouldRefreshMeetAttachmentPreview({ expiresAt: 1000 }, 1000)).toBe(true)
    expect(shouldRefreshMeetAttachmentPreview({ expiresAt: 1001 }, 1000)).toBe(false)
  })

  it('does not retry a failed preview entry automatically', () => {
    expect(shouldRefreshMeetAttachmentPreview(null, 1000)).toBe(false)
  })

  it('removes an expired preview URL when renewal fails and keeps the fallback stable', () => {
    const messageId = 'message-123'
    const cached = { url: 'https://signed.invalid/expired', expiresAt: 1000 }
    const previewUrls = { [messageId]: cached.url, other: 'https://signed.invalid/other' }

    expect(shouldRefreshMeetAttachmentPreview(cached, 1000)).toBe(true)
    const afterFailedRenewal = removeMeetAttachmentPreviewUrl(previewUrls, messageId)

    expect(afterFailedRenewal).toEqual({ other: 'https://signed.invalid/other' })
    expect(afterFailedRenewal).not.toHaveProperty(messageId)
    expect(removeMeetAttachmentPreviewUrl(afterFailedRenewal, messageId)).toBe(afterFailedRenewal)
  })

  it.each([
    ['JPEG', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), 'imagem.jpg', 'image/jpeg'],
    ['PNG', png, 'imagem.png', 'image/png'],
    ['WebP', new TextEncoder().encode('RIFFxxxxWEBP'), 'imagem.webp', 'image/webp'],
    ['PDF', new TextEncoder().encode('%PDF-1.7'), 'arquivo.pdf', 'application/pdf'],
  ])('accepts valid %s content after checking its real signature', async (_label, bytes, name, type) => {
    const response = await POST(
      requestWith(new File([bytes], name, { type })),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
    expect(mocks.insertPayload).toHaveBeenCalledWith(expect.objectContaining({
      attachment_mime_type: type,
      attachment_size: bytes.byteLength,
    }))
  })

  it('accepts a permitted file exactly at the 5 MiB file limit', async () => {
    const bytes = new Uint8Array(fiveMiB)
    bytes.set(png)

    const response = await POST(requestWith(new File([bytes], 'limite.png', { type: 'image/png' })), context)

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it('rejects a file above 5 MiB before Storage', async () => {
    const bytes = new Uint8Array(fiveMiB + 1)
    bytes.set(png)

    const response = await POST(requestWith(new File([bytes], 'grande.png', { type: 'image/png' })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('rejects Content-Length above the multipart limit with 413 before reading the body', async () => {
    const read = vi.fn()
    const request = {
      headers: new Headers({
        'content-type': 'multipart/form-data; boundary=unused',
        'content-length': String(fiveMiB + 32 * 1024 + 1),
      }),
      body: { getReader: () => ({ read }) },
    } as unknown as Request

    const response = await POST(request, context)

    expect(response.status).toBe(413)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('accepts a small multipart request when Content-Length is absent', async () => {
    const response = await POST(requestWith(new File([png], 'imagem.png', { type: 'image/png' })), context)

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized multipart request when Content-Length is absent', async () => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array(fiveMiB)], 'limite.txt', { type: 'text/plain' }))
    form.set('padding', 'x'.repeat(33 * 1024))

    const response = await POST(new Request('https://entreus.invalid/upload', { method: 'POST', body: form }), context)

    expect(response.status).toBe(413)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('enforces the streamed limit when Content-Length falsely understates the body', async () => {
    const form = new FormData()
    form.set('id', '33333333-3333-4333-8333-333333333333')
    form.set('file', new File([new Uint8Array(fiveMiB)], 'limite.txt', { type: 'text/plain' }))
    form.set('padding', 'x'.repeat(33 * 1024))
    const original = new Request('https://entreus.invalid/upload', { method: 'POST', body: form })
    const request = new Request(original.url, {
      method: 'POST',
      headers: {
        'content-type': original.headers.get('content-type')!,
        'content-length': '100',
      },
      body: await original.arrayBuffer(),
    })

    const response = await POST(request, context)

    expect(response.status).toBe(413)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('rejects a truncated multipart request without reaching Storage', async () => {
    const original = requestWith(new File([png], 'imagem.png', { type: 'image/png' }))
    const bytes = new Uint8Array(await original.arrayBuffer())
    const request = new Request(original.url, {
      method: 'POST',
      headers: { 'content-type': original.headers.get('content-type')! },
      body: bytes.slice(0, -8),
    })

    const response = await POST(request, context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it.each([
    ['HTML renamed as PNG', new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'imagem.png', 'image/png'],
    ['JavaScript renamed as JPEG', new TextEncoder().encode('alert(1)'), 'imagem.jpg', 'image/jpeg'],
    ['PDF renamed as JPEG', new TextEncoder().encode('%PDF-1.7'), 'imagem.jpg', 'image/jpeg'],
  ])('rejects %s before Storage', async (_label, bytes, name, type) => {
    const response = await POST(requestWith(new File([bytes], name, { type })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['TXT', new TextEncoder().encode('Ata da reuniao EntreUS'), 'ata.txt', 'text/plain'],
  ])('accepts valid %s content before Storage', async (_label, bytes, name, type) => {
    const response = await POST(
      requestWith(new File([bytes], name, { type })),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['ASCII', new TextEncoder().encode('Ata normal da reuniao EntreUS')],
    ['UTF-8 with accents', new TextEncoder().encode('Reunião com decisões, ações e próximos passos.')],
    ['TAB', new TextEncoder().encode('coluna 1\tcoluna 2')],
    ['LF', new TextEncoder().encode('linha 1\nlinha 2')],
    ['CRLF', new TextEncoder().encode('linha 1\r\nlinha 2')],
    ['UTF-8 BOM', Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Texto com BOM')])],
  ])('accepts legitimate %s plain text', async (_label, bytes) => {
    const response = await POST(requestWith(new File([bytes], 'legitimo.txt', { type: 'text/plain' })), context)

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['text/csv', 'nome,idade\nAna,30'],
    ['application/csv', 'nome;cidade\r\nAna;Manaus'],
    ['application/vnd.ms-excel', '\ufeffnome,valor\nItem,10'],
  ])('accepts legitimate UTF-8 CSV with browser MIME %s', async (mime, content) => {
    const response = await POST(
      requestWith(new File([new TextEncoder().encode(content)], 'dados.csv', { type: mime })),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it.each(['docx', 'xlsx', 'pptx'] as const)('accepts structurally valid %s before Storage', async (type) => {
    const bytes = await createOfficeFixture(type)
    const config = officeFixtureConfig[type]
    const response = await POST(requestWith(new File([bytes], `documento.${type}`, { type: config.mime })), context)

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
    expect(mocks.insertPayload).toHaveBeenCalledWith(expect.objectContaining({
      attachment_mime_type: config.mime,
      attachment_size: bytes.byteLength,
    }))
  })

  it('accepts valid DOCX with explicit safe directory entries', async () => {
    const config = officeFixtureConfig.docx
    const bytes = await createZip([
      { name: '_rels/', options: { directory: true } },
      { name: 'word/', options: { directory: true } },
      { name: '[Content_Types].xml', content: `<Types><Override PartName="/${config.mainPart}" ContentType="${config.contentType}"/></Types>` },
      { name: '_rels/.rels', content: `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${config.mainPart}"/></Relationships>` },
      { name: config.mainPart, content: '<w:document xmlns:w="urn:w"></w:document>' },
    ])
    const response = await POST(requestWith(new File([bytes], 'diretorios.docx', { type: config.mime })), context)

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it('accepts generic MIME for OOXML only after its internal structure proves DOCX', async () => {
    const bytes = await createOfficeFixture('docx')
    const response = await POST(
      requestWith(new File([bytes], 'documento.docx', { type: 'application/octet-stream' })),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
    expect(mocks.insertPayload).toHaveBeenCalledWith(expect.objectContaining({
      attachment_mime_type: officeFixtureConfig.docx.mime,
    }))
  })

  it('rejects the exact 12-byte human PNG-as-TXT case through the real multipart POST flow', async () => {
    const request = requestWith(
      new File([humanDisguisedTxtBytes], 'entreus-binario-disfarcado.txt', { type: 'text/plain' }),
    )
    const parsedFormData = await request.clone().formData()
    const parsedFile = parsedFormData.get('file')

    expect(parsedFile).toBeInstanceOf(File)
    if (!(parsedFile instanceof File)) throw new Error('Expected multipart file')

    const parsedBytes = new Uint8Array(await parsedFile.arrayBuffer())
    expect(parsedFile.name).toBe('entreus-binario-disfarcado.txt')
    expect(parsedFile.type).toBe('text/plain')
    expect(parsedBytes).toEqual(humanDisguisedTxtBytes)
    expect(detectFileSignature(parsedBytes)).toEqual({
      detectedMime: 'image/png',
      confidence: 'high',
      kind: 'image',
    })
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(parsedBytes)).toThrow()
    expect(parsedBytes).toContain(0x00)

    const response = await POST(request, context)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Tipo de arquivo nao permitido.' })
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['ZIP local header', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x74, 0x65, 0x78, 0x74])],
    ['DOCX OOXML container', docx],
    ['NUL byte', Uint8Array.from([...new TextEncoder().encode('texto'), 0x00, ...new TextEncoder().encode('oculto')])],
    ['invalid UTF-8', Uint8Array.from([0x74, 0x65, 0x78, 0x74, 0xc3, 0x28])],
    ['MZ executable', new TextEncoder().encode('MZfake executable payload')],
    ['random binary', Uint8Array.from([0xff, 0xfe, 0xfd, 0xfc, 0x01, 0x02])],
    ['PDF', new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')],
    ['JPEG', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])],
    ['complete PNG', completePng],
    ['WEBP', new TextEncoder().encode('RIFFxxxxWEBPbinary')],
  ])('rejects %s disguised as TXT before Storage', async (_label, bytes) => {
    const response = await POST(requestWith(new File([bytes], 'disfarcado.txt', { type: 'text/plain' })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects arbitrary binary disguised as CSV before Storage', async () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03])
    const response = await POST(requestWith(new File([bytes], 'dados.csv', { type: 'text/csv' })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects a generic ZIP renamed as DOCX before Storage', async () => {
    const bytes = await createZip([{ name: 'readme.txt', content: 'not an office document' }])
    const response = await POST(requestWith(new File([bytes], 'falso.docx', { type: officeFixtureConfig.docx.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects DOCX with invalid Content Types XML before Storage', async () => {
    const bytes = await createOfficeFixture('docx', { contentTypes: '<Types><Override></Types>' })
    const response = await POST(requestWith(new File([bytes], 'falso.docx', { type: officeFixtureConfig.docx.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects a false DOCX with an empty main document before Storage', async () => {
    const bytes = await createOfficeFixture('docx', { main: '' })
    const response = await POST(requestWith(new File([bytes], 'vazio.docx', { type: officeFixtureConfig.docx.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects a truncated DOCX before Storage', async () => {
    const complete = await createOfficeFixture('docx')
    const bytes = complete.slice(0, -12)
    const response = await POST(requestWith(new File([bytes], 'truncado.docx', { type: officeFixtureConfig.docx.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['xlsx', 'docx'],
    ['pptx', 'xlsx'],
    ['docx', 'pptx'],
  ] as const)('rejects %s structure renamed as %s before Storage', async (actualType, declaredType) => {
    const bytes = await createOfficeFixture(actualType)
    const declared = officeFixtureConfig[declaredType]
    const response = await POST(
      requestWith(new File([bytes], `tipo-errado.${declaredType}`, { type: declared.mime })),
      context,
    )

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects a high-ratio ZIP bomb candidate before Storage', async () => {
    const config = officeFixtureConfig.docx
    const base = await createOfficeFixture('docx')
    expect(base.byteLength).toBeGreaterThan(0)
    const bytes = await createZip([
      { name: '[Content_Types].xml', content: `<Types><Override PartName="/${config.mainPart}" ContentType="${config.contentType}"/></Types>` },
      { name: '_rels/.rels', content: `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${config.mainPart}"/></Relationships>` },
      { name: config.mainPart, content: '<w:document xmlns:w="urn:w"></w:document>' },
      { name: 'word/bomb.txt', content: 'A'.repeat(2 * 1024 * 1024) },
    ])
    const response = await POST(requestWith(new File([bytes], 'bomba.docx', { type: config.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects OOXML containing a traversal entry before Storage', async () => {
    const config = officeFixtureConfig.docx
    const bytes = await createZip([
      { name: '[Content_Types].xml', content: `<Types><Override PartName="/${config.mainPart}" ContentType="${config.contentType}"/></Types>` },
      { name: '_rels/.rels', content: `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${config.mainPart}"/></Relationships>` },
      { name: config.mainPart, content: '<w:document xmlns:w="urn:w"></w:document>' },
      { name: '../outside.txt', content: 'unsafe' },
    ])
    const response = await POST(requestWith(new File([bytes], 'traversal.docx', { type: config.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects encrypted OOXML entries before Storage', async () => {
    const config = officeFixtureConfig.docx
    const bytes = await createZip([
      { name: '[Content_Types].xml', content: '<Types/>', options: { password: 'secret' } },
      { name: '_rels/.rels', content: '<Relationships/>' },
      { name: config.mainPart, content: '<w:document xmlns:w="urn:w"/>' },
    ])
    const response = await POST(requestWith(new File([bytes], 'criptografado.docx', { type: config.mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['EXE renamed DOCX', new TextEncoder().encode('MZfake executable payload'), 'application/octet-stream'],
    ['PDF renamed DOCX', new TextEncoder().encode('%PDF-1.7 fake'), officeFixtureConfig.docx.mime],
    ['arbitrary octet-stream DOCX', new TextEncoder().encode('not a zip'), 'application/octet-stream'],
  ])('rejects %s before Storage', async (_label, bytes, mime) => {
    const response = await POST(requestWith(new File([bytes], 'falso.docx', { type: mime })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['DOCX', new TextEncoder().encode('not inspected as OOXML'), 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['XLSX', new TextEncoder().encode('not inspected as OOXML'), 'dados.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['PPTX', new TextEncoder().encode('not inspected as OOXML'), 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('rejects structurally fake %s content before Storage', async (_label, bytes, name, type) => {
    const response = await POST(requestWith(new File([bytes], name, { type })), context)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Tipo de arquivo nao permitido.' })
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it.each([
    ['artificial DOCX ZIP', docx, 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['artificial XLSX ZIP', xlsx, 'dados.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['artificial PPTX ZIP', pptx, 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('rejects %s before Storage', async (_label, bytes, name, type) => {
    const response = await POST(requestWith(new File([bytes], name, { type })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('rejects an unknown extension and MIME before Storage', async () => {
    const response = await POST(requestWith(new File(['unknown'], 'arquivo.bin', { type: 'application/octet-stream' })), context)

    expect(response.status).toBe(400)
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(mocks.insertPayload).not.toHaveBeenCalled()
  })

  it('does not allow the client message id to inject an arbitrary Storage path segment', async () => {
    const response = await POST(
      requestWith(new File([png], 'imagem.png', { type: 'image/png' }), '../../outro-path'),
      context,
    )

    expect(response.status).toBe(200)
    const [storagePath] = mocks.storageUpload.mock.calls[0] as [string]
    expect(storagePath).toMatch(/^meet\/sala-segura\/[0-9a-f-]{36}\//)
    expect(storagePath).not.toContain('..')
  })
})
