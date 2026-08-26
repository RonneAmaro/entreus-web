import { describe, expect, it } from 'vitest'
import {
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
} from '../../lib/media/upload-limits'
import {
  MAX_UPLOAD_FILENAME_LENGTH,
  OFFICE_OPEN_XML_MIME_BY_TYPE,
  PRIVATE_UPLOAD_RESPONSE_HEADERS,
  UPLOAD_CONTEXTS,
  buildUploadObjectKey,
  detectFileSignature,
  detectOfficeOpenXmlType,
  getUploadPolicy,
  isOfficeOpenXmlType,
  isSafeObjectKeySegment,
  isUploadContext,
  isValidUploadFileName,
  isValidUploadObjectId,
  normalizeDeclaredMime,
  sanitizeUploadFileName,
  validateFileContent,
  validateOfficeOpenXml,
  validateUploadMetadata,
} from '../../lib/upload-security'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => new TextEncoder().encode(value)
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0))
const jpeg = bytes(0xff, 0xd8, 0xff, 0xd9)
const pdf = text('%PDF-1.7')

describe('central upload policies', () => {
  it('defines only the known upload contexts', () => {
    expect(UPLOAD_CONTEXTS).toEqual([
      'post_image',
      'post_video',
      'message_image',
      'message_video',
      'message_audio',
      'profile_avatar',
      'profile_banner',
      'payment_proof',
      'age_document',
      'age_selfie',
      'parental_selfie',
      'meet_attachment',
    ])
    expect(isUploadContext('post_image')).toBe(true)
    expect(isUploadContext('invented_upload')).toBe(false)
    expect(getUploadPolicy('invented_upload')).toBeNull()
  })

  it('reuses authoritative post media limits and supports tier entitlements', () => {
    expect(getUploadPolicy('post_image').maxBytes).toBe(IMAGE_UPLOAD_MAX_SIZE_BYTES)
    expect(getUploadPolicy('post_video').maxBytes).toBe(VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES)
    expect(getUploadPolicy('post_video', { badgeSlugs: ['vip'] }).maxBytes).toBe(200 * 1024 * 1024)
    expect(getUploadPolicy('post_video', { badgeSlugs: ['elder'] }).maxBytes).toBe(500 * 1024 * 1024)
  })

  it('records category, content checks and public/private intent', () => {
    expect(getUploadPolicy('message_audio')).toMatchObject({
      category: 'audio',
      magicBytesRequired: true,
      mayBePublic: false,
    })
    expect(getUploadPolicy('profile_avatar').mayBePublic).toBe(true)
    expect(getUploadPolicy('payment_proof')).toMatchObject({
      maxBytes: 10 * 1024 * 1024,
      allowedMimes: ['image/png', 'image/jpeg', 'application/pdf'],
      mayBePublic: false,
    })
  })

  it('does not allow active or executable formats in any policy', () => {
    for (const context of UPLOAD_CONTEXTS) {
      const policy = getUploadPolicy(context)
      expect(policy.allowedMimes).not.toContain('text/html')
      expect(policy.allowedMimes).not.toContain('image/svg+xml')
      expect(policy.allowedMimes).not.toContain('application/javascript')
      expect(policy.allowedMimes).not.toContain('application/zip')
      expect(policy.allowedExtensions).not.toContain('exe')
    }
  })
})

describe('upload filename safety', () => {
  const policy = getUploadPolicy('post_image')

  it.each([
    'photo.jpg',
    'Foto de Perfil.JPEG',
    'foto-férias.jpg',
    'João Silva.png',
    'documento-日本語.webp',
  ])('accepts a legitimate filename: %s', (fileName) => {
    expect(isValidUploadFileName(fileName, policy)).toBe(true)
  })

  it.each([
    '',
    '   ',
    '.',
    '..',
    '../photo.jpg',
    '..\\photo.jpg',
    'folder/photo.jpg',
    'folder\\photo.jpg',
    'photo.jpg?download=1',
    'photo.jpg#fragment',
    'photo\r\n.jpg',
    'photo\0.jpg',
  ])('rejects an unsafe filename: %s', (fileName) => {
    expect(isValidUploadFileName(fileName, policy)).toBe(false)
  })

  it('rejects oversized names and extensions outside the policy', () => {
    expect(isValidUploadFileName(`${'a'.repeat(MAX_UPLOAD_FILENAME_LENGTH)}.jpg`, policy)).toBe(false)
    expect(isValidUploadFileName('payload.svg', policy)).toBe(false)
    expect(isValidUploadFileName('payload.exe', policy)).toBe(false)
  })

  it('sanitizes traversal and dangerous characters without destroying Unicode', () => {
    expect(sanitizeUploadFileName('../João <> 日本語?.PNG', policy)).toBe('João-日本語.png')
    expect(sanitizeUploadFileName('foto-férias.jpg', policy)).toBe('foto-férias.jpg')
    expect(sanitizeUploadFileName('payload.svg', policy)).toBeNull()
  })
})

describe('upload object keys', () => {
  const policy = getUploadPolicy('message_image')
  const deterministicUuid = '123e4567-e89b-42d3-a456-426614174000'

  it.each(['', '.', '..', 'abc..def', 'a/b', 'a\\b', 'a?b', 'a#b', 'a\0b', 'a\nb'])('rejects a dangerous segment: %s', (segment) => {
    expect(isSafeObjectKeySegment(segment)).toBe(false)
  })

  it('builds a server-shaped key with a validated UUID', () => {
    expect(buildUploadObjectKey({
      area: 'messages',
      ownerId: 'user-123',
      fileName: 'Minha Foto.JPG',
      policy,
      uuid: () => deterministicUuid,
    })).toBe(`messages/user-123/${deterministicUuid}/Minha-Foto.jpg`)
    expect(isValidUploadObjectId(deterministicUuid)).toBe(true)
  })

  it('uses an internally generated UUID by default', () => {
    const key = buildUploadObjectKey({
      area: 'proofs',
      ownerId: 'owner-1',
      fileName: 'proof.jpg',
      policy,
    })
    expect(isValidUploadObjectId(key.split('/')[2])).toBe(true)
  })

  it('rejects invalid area, owner, filename and injected identifier', () => {
    expect(() => buildUploadObjectKey({ area: '../messages', ownerId: 'owner', fileName: 'photo.jpg', policy, uuid: () => deterministicUuid })).toThrow('Invalid object key segment.')
    expect(() => buildUploadObjectKey({ area: 'messages', ownerId: 'owner/id', fileName: 'photo.jpg', policy, uuid: () => deterministicUuid })).toThrow('Invalid object key segment.')
    expect(() => buildUploadObjectKey({ area: 'messages', ownerId: 'owner', fileName: 'payload.exe', policy, uuid: () => deterministicUuid })).toThrow('Invalid upload filename.')
    expect(() => buildUploadObjectKey({ area: 'messages', ownerId: 'owner', fileName: 'photo.jpg', policy, uuid: () => '../object' })).toThrow('Invalid object key identifier.')
    expect(() => buildUploadObjectKey({ area: 'messages', ownerId: 'owner', fileName: 'photo.jpg', policy, uuid: () => 'not-a-uuid' })).toThrow('Invalid object key identifier.')
  })
})

describe('upload metadata validation', () => {
  it('normalizes MIME casing and parameters and treats generic MIME as unknown', () => {
    expect(normalizeDeclaredMime(' IMAGE/PNG; charset=binary ')).toBe('image/png')
    expect(normalizeDeclaredMime('APPLICATION/OCTET-STREAM')).toBeNull()
    expect(normalizeDeclaredMime('')).toBeNull()
    expect(normalizeDeclaredMime(undefined)).toBeNull()
  })

  it('accepts coherent allowed metadata and requires content verification', () => {
    expect(validateUploadMetadata({
      context: 'post_image',
      fileName: 'photo.PNG',
      declaredMime: 'IMAGE/PNG; charset=binary',
      declaredSize: png.byteLength,
    })).toMatchObject({
      ok: true,
      mime: 'image/png',
      extension: 'png',
      requiresPostUploadVerification: true,
    })
  })

  it.each([
    ['text/html', 'photo.jpg', 'file_type_not_allowed'],
    ['image/svg+xml', 'photo.svg', 'file_extension_not_allowed'],
    ['application/javascript', 'photo.png', 'file_type_not_allowed'],
    ['application/octet-stream', 'photo.png', 'file_type_not_allowed'],
    ['image/png', 'photo.exe', 'file_extension_not_allowed'],
    ['image/png', 'photo.jpg', 'file_signature_mismatch'],
  ])('rejects invalid MIME/extension metadata: %s / %s', (declaredMime, fileName, code) => {
    expect(validateUploadMetadata({
      context: 'post_image',
      fileName,
      declaredMime,
      declaredSize: 10,
    })).toEqual({ ok: false, code })
  })

  it('rejects unsafe names, empty files and oversized files with typed codes', () => {
    expect(validateUploadMetadata({ context: 'post_image', fileName: '../photo.png', declaredMime: 'image/png', declaredSize: 10 })).toEqual({ ok: false, code: 'file_name_invalid' })
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.png', declaredMime: 'image/png', declaredSize: 0 })).toEqual({ ok: false, code: 'file_empty' })
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.png', declaredMime: 'image/png', declaredSize: getUploadPolicy('post_image').maxBytes + 1 })).toEqual({ ok: false, code: 'file_too_large' })
  })
})

describe('file signature detection', () => {
  it.each([
    [jpeg, 'image/jpeg', 'image'],
    [png, 'image/png', 'image'],
    [text('RIFFxxxxWEBP'), 'image/webp', 'image'],
    [text('GIF87a0000000'), 'image/gif', 'image'],
    [text('GIF89a0000000'), 'image/gif', 'image'],
    [pdf, 'application/pdf', 'document'],
    [text('RIFFxxxxWAVE'), 'audio/wav', 'audio'],
    [text('ID3sample'), 'audio/mpeg', 'audio'],
  ])('detects a supported signature with high confidence', (input, detectedMime, kind) => {
    expect(detectFileSignature(input as Uint8Array)).toEqual({
      detectedMime,
      confidence: 'high',
      kind,
    })
  })

  it.each([
    [bytes(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70), 'video'],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), 'video'],
    [text('OggS'), 'audio'],
  ])('does not overclaim verification of a complex container', (input, kind) => {
    expect(detectFileSignature(input as Uint8Array)).toEqual({
      detectedMime: null,
      confidence: 'needs_deeper_inspection',
      kind,
    })
  })

  it('returns unknown for random or active content', () => {
    expect(detectFileSignature(text('<html><script>alert(1)</script>'))).toEqual({
      detectedMime: null,
      confidence: 'unknown',
      kind: 'unknown',
    })
    expect(detectFileSignature(bytes(1, 2, 3, 4))).toMatchObject({ confidence: 'unknown' })
  })
})

describe('upload content validation', () => {
  function validate(inputBytes: Uint8Array, overrides: Partial<Parameters<typeof validateFileContent>[0]> = {}) {
    return validateFileContent({
      context: 'post_image',
      bytes: inputBytes,
      declaredSize: inputBytes.byteLength,
      declaredMime: 'image/png',
      fileName: 'photo.png',
      ...overrides,
    })
  }

  it('accepts supported content whose metadata and signature agree', () => {
    expect(validate(png)).toMatchObject({ ok: true, requiresPostUploadVerification: false })
    expect(validate(jpeg, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toMatchObject({ ok: true })
    expect(validate(pdf, { context: 'payment_proof', declaredMime: 'application/pdf', fileName: 'proof.pdf' })).toMatchObject({ ok: true })
  })

  it('rejects real-size mismatches, unknown content and truncated signatures', () => {
    expect(validate(png, { declaredSize: png.byteLength + 1 })).toEqual({ ok: false, code: 'file_size_mismatch' })
    expect(validate(text('random content'), { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toEqual({ ok: false, code: 'file_content_unverified' })
    expect(validate(png.slice(0, 8))).toEqual({ ok: false, code: 'file_content_unverified' })
  })

  it('rejects a detected signature that conflicts with metadata', () => {
    expect(validate(pdf, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toEqual({ ok: false, code: 'file_signature_mismatch' })
    expect(validate(png, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toEqual({ ok: false, code: 'file_signature_mismatch' })
  })

  it('fails closed for containers that still require deeper inspection', () => {
    const mp4 = bytes(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70)
    expect(validate(mp4, { context: 'post_video', declaredMime: 'video/mp4', fileName: 'video.mp4' })).toEqual({ ok: false, code: 'file_content_unverified' })
  })
})

describe('Office Open XML inspection', () => {
  it.each([
    ['docx', 'word/document.xml'],
    ['xlsx', 'xl/workbook.xml'],
    ['pptx', 'ppt/presentation.xml'],
  ] as const)('detects a structurally identified %s container', (type, marker) => {
    const archive = makeZip(['[Content_Types].xml', marker])
    expect(isOfficeOpenXmlType(type)).toBe(true)
    expect(detectOfficeOpenXmlType(archive)).toBe(type)
    expect(validateOfficeOpenXml(archive, type)).toBe(true)
    expect(detectFileSignature(archive)).toEqual({
      detectedMime: OFFICE_OPEN_XML_MIME_BY_TYPE[type],
      confidence: 'high',
      kind: 'document',
    })
  })

  it('does not mistake a PK prefix or an ambiguous archive for OOXML', () => {
    expect(detectOfficeOpenXmlType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull()
    expect(detectOfficeOpenXmlType(makeZip(['[Content_Types].xml', 'word/document.xml', 'xl/workbook.xml']))).toBeNull()
    expect(detectOfficeOpenXmlType(makeZip(['[Content_Types].xml', '../word/document.xml']))).toBeNull()
  })

  it('accepts structurally verified OOXML content through the central validator', () => {
    const archive = makeZip(['[Content_Types].xml', 'word/document.xml'])
    expect(validateFileContent({
      context: 'meet_attachment',
      bytes: archive,
      declaredSize: archive.byteLength,
      declaredMime: OFFICE_OPEN_XML_MIME_BY_TYPE.docx,
      fileName: 'documento.docx',
    })).toMatchObject({ ok: true, requiresPostUploadVerification: false })
  })
})

describe('private upload response headers', () => {
  it('prevents private upload responses from being cached', () => {
    expect(PRIVATE_UPLOAD_RESPONSE_HEADERS).toEqual({
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
    })
  })
})

function makeZip(entryNames: readonly string[]) {
  const encoder = new TextEncoder()
  const localRecords: Uint8Array[] = []
  const centralRecords: Uint8Array[] = []
  let localOffset = 0

  for (const entryName of entryNames) {
    const name = encoder.encode(entryName)
    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    localRecords.push(local)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, localOffset, true)
    central.set(name, 46)
    centralRecords.push(central)
    localOffset += local.length
  }

  const centralOffset = localOffset
  const centralSize = centralRecords.reduce((total, record) => total + record.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entryNames.length, true)
  endView.setUint16(10, entryNames.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, centralOffset, true)

  return concatenate([...localRecords, ...centralRecords, end])
}

function concatenate(parts: readonly Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}
