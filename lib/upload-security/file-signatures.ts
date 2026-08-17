export type SignatureConfidence = 'high' | 'needs_deeper_inspection' | 'unknown'
export type SignatureKind = 'image' | 'document' | 'video' | 'audio' | 'unknown'

export type FileSignatureResult = Readonly<{
  detectedMime: string | null
  confidence: SignatureConfidence
  kind: SignatureKind
}>

export type OfficeOpenXmlType = 'docx' | 'xlsx' | 'pptx'

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function hasBytes(bytes: Uint8Array, offset: number, length: number) {
  return offset >= 0 && length >= 0 && offset <= bytes.length - length
}

function findZipEndOfCentralDirectory(bytes: Uint8Array) {
  const firstOffset = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= firstOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset
  }
  return -1
}

function readZipEntryNames(bytes: Uint8Array) {
  const endOffset = findZipEndOfCentralDirectory(bytes)
  if (endOffset < 0 || !hasBytes(bytes, endOffset, 22)) return null
  if (readUint16(bytes, endOffset + 4) !== 0 || readUint16(bytes, endOffset + 6) !== 0) return null

  const entriesOnDisk = readUint16(bytes, endOffset + 8)
  const totalEntries = readUint16(bytes, endOffset + 10)
  const centralSize = readUint32(bytes, endOffset + 12)
  const centralOffset = readUint32(bytes, endOffset + 16)
  if (entriesOnDisk !== totalEntries || totalEntries === 0 || totalEntries > 2048) return null
  if (!hasBytes(bytes, centralOffset, centralSize) || centralOffset + centralSize > endOffset) return null

  const decoder = new TextDecoder()
  const names: string[] = []
  let offset = centralOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (!hasBytes(bytes, offset, 46) || readUint32(bytes, offset) !== 0x02014b50) return null

    const nameLength = readUint16(bytes, offset + 28)
    const extraLength = readUint16(bytes, offset + 30)
    const commentLength = readUint16(bytes, offset + 32)
    const localHeaderOffset = readUint32(bytes, offset + 42)
    const recordLength = 46 + nameLength + extraLength + commentLength
    if (!hasBytes(bytes, offset, recordLength)) return null

    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    if (!name || name.includes('\\') || name.includes('\u0000') || name.split('/').includes('..')) return null
    if (!hasBytes(bytes, localHeaderOffset, 30) || readUint32(bytes, localHeaderOffset) !== 0x04034b50) return null

    const localNameLength = readUint16(bytes, localHeaderOffset + 26)
    const localExtraLength = readUint16(bytes, localHeaderOffset + 28)
    if (!hasBytes(bytes, localHeaderOffset, 30 + localNameLength + localExtraLength)) return null
    const localName = decoder.decode(bytes.slice(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength))
    if (localName !== name) return null

    names.push(name)
    offset += recordLength
  }

  return names
}

export function detectOfficeOpenXmlType(input: ArrayBuffer | Uint8Array): OfficeOpenXmlType | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return null

  const names = readZipEntryNames(bytes)
  if (!names?.includes('[Content_Types].xml')) return null

  const candidates: Array<{ type: OfficeOpenXmlType; marker: string }> = [
    { type: 'docx', marker: 'word/document.xml' },
    { type: 'xlsx', marker: 'xl/workbook.xml' },
    { type: 'pptx', marker: 'ppt/presentation.xml' },
  ]
  const matching = candidates.filter(({ marker }) => names.includes(marker))
  if (matching.length !== 1) return null

  return matching[0].type
}

export function detectFileSignature(input: ArrayBuffer | Uint8Array): FileSignatureResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { detectedMime: 'image/jpeg', confidence: 'high', kind: 'image' }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { detectedMime: 'image/png', confidence: 'high', kind: 'image' }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { detectedMime: 'image/webp', confidence: 'high', kind: 'image' }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { detectedMime: 'image/gif', confidence: 'high', kind: 'image' }
  if (ascii(bytes, 0, 5) === '%PDF-') return { detectedMime: 'application/pdf', confidence: 'high', kind: 'document' }
  if (ascii(bytes, 4, 4) === 'ftyp') return { detectedMime: null, confidence: 'needs_deeper_inspection', kind: 'video' }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { detectedMime: null, confidence: 'needs_deeper_inspection', kind: 'video' }
  if (ascii(bytes, 0, 4) === 'OggS') return { detectedMime: null, confidence: 'needs_deeper_inspection', kind: 'audio' }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return { detectedMime: 'audio/wav', confidence: 'high', kind: 'audio' }
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { detectedMime: 'audio/mpeg', confidence: 'high', kind: 'audio' }
  return { detectedMime: null, confidence: 'unknown', kind: 'unknown' }
}
