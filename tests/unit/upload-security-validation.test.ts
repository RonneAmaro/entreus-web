import { describe, expect, it } from 'vitest'
import {
  PRIVATE_UPLOAD_RESPONSE_HEADERS,
  getUploadPolicy,
  normalizeDeclaredMime,
  validateFileContent,
  validateUploadMetadata,
} from '../../lib/upload-security'

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
const pdf = new TextEncoder().encode('%PDF-1.7')

function content(bytes: Uint8Array, overrides: Partial<Parameters<typeof validateFileContent>[0]> = {}) {
  return validateFileContent({ context: 'post_image', bytes, declaredSize: bytes.byteLength, declaredMime: 'image/png', fileName: 'photo.png', ...overrides })
}

describe('upload metadata validation', () => {
  it('normalizes MIME casing and parameters but treats octet-stream as unknown', () => {
    expect(normalizeDeclaredMime(' IMAGE/PNG; charset=binary ')).toBe('image/png')
    expect(normalizeDeclaredMime('APPLICATION/OCTET-STREAM')).toBeNull()
  })

  it('marks metadata-only checks as requiring content verification', () => {
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.PNG', declaredMime: 'IMAGE/PNG; charset=binary', declaredSize: 8 })).toMatchObject({ ok: true, requiresPostUploadVerification: true })
  })

  it.each([
    ['text/html', 'photo.jpg'],
    ['image/svg+xml', 'photo.svg'],
    ['application/javascript', 'photo.png'],
    ['application/zip', 'photo.zip'],
    ['application/octet-stream', 'photo.png'],
  ])('rejects forbidden or unknown metadata %s', (declaredMime, fileName) => {
    expect(validateUploadMetadata({ context: 'post_image', fileName, declaredMime, declaredSize: 10 }).ok).toBe(false)
  })

  it('rejects extension/MIME mismatch and traversal', () => {
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.png', declaredMime: 'image/jpeg', declaredSize: 10 })).toEqual({ ok: false, code: 'file_signature_mismatch' })
    expect(validateUploadMetadata({ context: 'post_image', fileName: '../photo.png', declaredMime: 'image/png', declaredSize: 10 })).toEqual({ ok: false, code: 'file_name_invalid' })
  })

  it('rejects empty and oversized metadata', () => {
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.png', declaredMime: 'image/png', declaredSize: 0 })).toEqual({ ok: false, code: 'file_empty' })
    expect(validateUploadMetadata({ context: 'post_image', fileName: 'photo.png', declaredMime: 'image/png', declaredSize: getUploadPolicy('post_image').maxBytes + 1 })).toEqual({ ok: false, code: 'file_too_large' })
  })
})

describe('upload content validation', () => {
  it('accepts supported image and PDF signatures', () => {
    expect(content(png).ok).toBe(true)
    expect(content(jpeg, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' }).ok).toBe(true)
    expect(content(pdf, { context: 'payment_proof', declaredMime: 'application/pdf', fileName: 'proof.pdf' }).ok).toBe(true)
  })

  it.each([
    [new TextEncoder().encode('<html>not an image</html>'), 'image/jpeg', 'photo.jpg'],
    [new TextEncoder().encode('alert(1)'), 'image/png', 'photo.png'],
  ])('rejects active content renamed as media', (bytes, declaredMime, fileName) => {
    expect(content(bytes, { declaredMime, fileName })).toEqual({ ok: false, code: 'file_content_unverified' })
  })

  it('rejects PDF renamed as JPEG and PNG declared as JPEG', () => {
    expect(content(pdf, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toEqual({ ok: false, code: 'file_signature_mismatch' })
    expect(content(png, { declaredMime: 'image/jpeg', fileName: 'photo.jpg' })).toEqual({ ok: false, code: 'file_signature_mismatch' })
  })

  it('rejects empty, mismatched size and complex unverified containers', () => {
    expect(content(new Uint8Array(), { declaredSize: 0 })).toEqual({ ok: false, code: 'file_empty' })
    expect(content(png, { declaredSize: png.byteLength + 1 })).toEqual({ ok: false, code: 'file_size_mismatch' })
    const mp4 = Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])
    expect(content(mp4, { context: 'post_video', declaredMime: 'video/mp4', fileName: 'video.mp4' })).toEqual({ ok: false, code: 'file_content_unverified' })
    const truncatedPng = png.slice(0, 8)
    expect(content(truncatedPng)).toEqual({ ok: false, code: 'file_content_unverified' })
  })

  it('provides private no-store response headers', () => {
    expect(PRIVATE_UPLOAD_RESPONSE_HEADERS).toMatchObject({
      'Cache-Control': expect.stringContaining('private'),
      Pragma: 'no-cache',
    })
  })
})
