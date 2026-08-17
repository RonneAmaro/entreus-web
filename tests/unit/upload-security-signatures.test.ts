import { describe, expect, it } from 'vitest'
import { detectFileSignature, detectOfficeOpenXmlType } from '../../lib/upload-security'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => new TextEncoder().encode(value)

function zipFixture(names: string[]) {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const write16 = (bytes: Uint8Array, at: number, value: number) => {
    bytes[at] = value & 0xff
    bytes[at + 1] = value >>> 8
  }
  const write32 = (bytes: Uint8Array, at: number, value: number) => {
    bytes[at] = value & 0xff
    bytes[at + 1] = (value >>> 8) & 0xff
    bytes[at + 2] = (value >>> 16) & 0xff
    bytes[at + 3] = (value >>> 24) & 0xff
  }
  const join = (items: Uint8Array[]) => {
    const result = new Uint8Array(items.reduce((total, item) => total + item.length, 0))
    let at = 0
    for (const item of items) {
      result.set(item, at)
      at += item.length
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
    parts.push(local)

    const entry = new Uint8Array(46 + nameBytes.length)
    write32(entry, 0, 0x02014b50)
    write16(entry, 4, 20)
    write16(entry, 6, 20)
    write16(entry, 28, nameBytes.length)
    write32(entry, 42, offset)
    entry.set(nameBytes, 46)
    central.push(entry)
    offset += local.length
  }

  const localBytes = join(parts)
  const centralBytes = join(central)
  const end = new Uint8Array(22)
  write32(end, 0, 0x06054b50)
  write16(end, 8, names.length)
  write16(end, 10, names.length)
  write32(end, 12, centralBytes.length)
  write32(end, 16, localBytes.length)
  return join([localBytes, centralBytes, end])
}

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

  it('identifies structurally valid OOXML containers by their root part', () => {
    expect(detectOfficeOpenXmlType(zipFixture(['[Content_Types].xml', 'word/document.xml']))).toBe('docx')
    expect(detectOfficeOpenXmlType(zipFixture(['[Content_Types].xml', 'xl/workbook.xml']))).toBe('xlsx')
    expect(detectOfficeOpenXmlType(zipFixture(['[Content_Types].xml', 'ppt/presentation.xml']))).toBe('pptx')
  })

  it('rejects generic, incomplete and cross-type ZIP containers', () => {
    expect(detectOfficeOpenXmlType(zipFixture(['[Content_Types].xml', 'content.bin']))).toBeNull()
    expect(detectOfficeOpenXmlType(zipFixture(['word/document.xml']))).toBeNull()
    expect(detectOfficeOpenXmlType(zipFixture(['[Content_Types].xml', 'word/document.xml', 'xl/workbook.xml']))).toBeNull()
    expect(detectOfficeOpenXmlType(text('PK\u0003\u0004'))).toBeNull()
  })
})
