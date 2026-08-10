import { describe, expect, it } from 'vitest'
import { detectFileSignature } from '../../lib/upload-security'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('file signature detection', () => {
  it.each([
    [bytes(0xff, 0xd8, 0xff, 0xd9), 'image/jpeg', 'image'],
    [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(16).fill(0)), 'image/png', 'image'],
    [text('RIFFxxxxWEBP'), 'image/webp', 'image'],
    [text('GIF89a0000000'), 'image/gif', 'image'],
    [text('%PDF-1.7'), 'application/pdf', 'document'],
    [text('RIFFxxxxWAVE'), 'audio/wav', 'audio'],
    [text('ID3sample'), 'audio/mpeg', 'audio'],
  ])('detects a supported signature', (input, detectedMime, kind) => {
    expect(detectFileSignature(input as Uint8Array)).toMatchObject({ detectedMime, kind, confidence: 'high' })
  })

  it.each([
    [bytes(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70), 'video'],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), 'video'],
    [text('OggS'), 'audio'],
  ])('does not overclaim complex container verification', (input, kind) => {
    expect(detectFileSignature(input as Uint8Array)).toEqual({
      detectedMime: null,
      confidence: 'needs_deeper_inspection',
      kind,
    })
  })

  it('returns unknown for HTML and JavaScript disguised as media', () => {
    expect(detectFileSignature(text('<html><script>alert(1)</script>'))).toEqual({
      detectedMime: null,
      confidence: 'unknown',
      kind: 'unknown',
    })
  })
})
