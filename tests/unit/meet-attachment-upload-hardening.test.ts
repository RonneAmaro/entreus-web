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

const context = { params: Promise.resolve({ roomName: room.room_name }) }
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])

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
const genericZip = zipFixture(['[Content_Types].xml', 'content.bin'])

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
    ['DOCX', docx, 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['XLSX', xlsx, 'planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['PPTX', pptx, 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('accepts valid %s content before Storage', async (_label, bytes, name, type) => {
    const response = await POST(
      requestWith(new File([bytes], name, { type })),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['HTML as DOCX', new TextEncoder().encode('<html>bad</html>'), 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['JavaScript as XLSX', new TextEncoder().encode('alert(1)'), 'dados.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['generic ZIP as PPTX', genericZip, 'slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['DOCX as XLSX', docx, 'dados.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['PDF as DOCX', new TextEncoder().encode('%PDF-1.7'), 'ata.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('rejects %s before Storage', async (_label, bytes, name, type) => {
    const response = await POST(requestWith(new File([bytes], name, { type })), context)

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
