export type SignatureConfidence = 'high' | 'needs_deeper_inspection' | 'unknown'
export type SignatureKind = 'image' | 'document' | 'video' | 'audio' | 'unknown'
export type OfficeOpenXmlType = 'docx' | 'xlsx' | 'pptx'

export type FileSignatureResult = Readonly<{
  detectedMime: string | null
  confidence: SignatureConfidence
  kind: SignatureKind
}>

export const OFFICE_OPEN_XML_MIME_BY_TYPE: Readonly<Record<OfficeOpenXmlType, string>> = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
})

const officeMarkers: ReadonlyArray<Readonly<{ type: OfficeOpenXmlType; marker: string }>> = [
  { type: 'docx', marker: 'word/document.xml' },
  { type: 'xlsx', marker: 'xl/workbook.xml' },
  { type: 'pptx', marker: 'ppt/presentation.xml' },
]

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return hasBytes(bytes, offset, signature.length)
    && signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (!hasBytes(bytes, offset, length)) return ''
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readUint16(bytes: Uint8Array, offset: number) {
  if (!hasBytes(bytes, offset, 2)) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array, offset: number) {
  if (!hasBytes(bytes, offset, 4)) return null
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0
}

function hasBytes(bytes: Uint8Array, offset: number, length: number) {
  return offset >= 0 && length >= 0 && offset <= bytes.length - length
}

function findZipEndOfCentralDirectory(bytes: Uint8Array) {
  if (bytes.length < 22) return -1

  const firstOffset = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= firstOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset
  }
  return -1
}

function readZipEntryNames(bytes: Uint8Array) {
  const endOffset = findZipEndOfCentralDirectory(bytes)
  if (endOffset < 0 || !hasBytes(bytes, endOffset, 22)) return null

  const diskNumber = readUint16(bytes, endOffset + 4)
  const centralDirectoryDisk = readUint16(bytes, endOffset + 6)
  const entriesOnDisk = readUint16(bytes, endOffset + 8)
  const totalEntries = readUint16(bytes, endOffset + 10)
  const centralSize = readUint32(bytes, endOffset + 12)
  const centralOffset = readUint32(bytes, endOffset + 16)
  const commentLength = readUint16(bytes, endOffset + 20)

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk === null
    || totalEntries === null
    || centralSize === null
    || centralOffset === null
    || commentLength === null
    || endOffset + 22 + commentLength !== bytes.length
    || entriesOnDisk !== totalEntries
    || totalEntries === 0
    || totalEntries > 2048
    || !hasBytes(bytes, centralOffset, centralSize)
    || centralOffset + centralSize !== endOffset
  ) {
    return null
  }

  const decoder = new TextDecoder('utf-8', { fatal: true })
  const names: string[] = []
  let offset = centralOffset

  try {
    for (let index = 0; index < totalEntries; index += 1) {
      if (!hasBytes(bytes, offset, 46) || readUint32(bytes, offset) !== 0x02014b50) return null

      const nameLength = readUint16(bytes, offset + 28)
      const extraLength = readUint16(bytes, offset + 30)
      const entryCommentLength = readUint16(bytes, offset + 32)
      const localHeaderOffset = readUint32(bytes, offset + 42)
      if (nameLength === null || extraLength === null || entryCommentLength === null || localHeaderOffset === null) return null

      const recordLength = 46 + nameLength + extraLength + entryCommentLength
      if (!hasBytes(bytes, offset, recordLength)) return null

      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
      if (!isSafeZipEntryName(name)) return null
      if (!hasBytes(bytes, localHeaderOffset, 30) || readUint32(bytes, localHeaderOffset) !== 0x04034b50) return null

      const localNameLength = readUint16(bytes, localHeaderOffset + 26)
      const localExtraLength = readUint16(bytes, localHeaderOffset + 28)
      if (localNameLength === null || localExtraLength === null) return null
      if (!hasBytes(bytes, localHeaderOffset, 30 + localNameLength + localExtraLength)) return null

      const localName = decoder.decode(bytes.subarray(
        localHeaderOffset + 30,
        localHeaderOffset + 30 + localNameLength,
      ))
      if (localName !== name) return null

      names.push(name)
      offset += recordLength
    }
  } catch {
    return null
  }

  return offset === endOffset ? names : null
}

function isSafeZipEntryName(name: string) {
  return (
    name.length > 0
    && !name.startsWith('/')
    && !name.includes('\\')
    && !name.includes('\u0000')
    && !name.split('/').includes('..')
  )
}

export function isOfficeOpenXmlType(value: unknown): value is OfficeOpenXmlType {
  return value === 'docx' || value === 'xlsx' || value === 'pptx'
}

export function detectOfficeOpenXmlType(input: ArrayBuffer | Uint8Array): OfficeOpenXmlType | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return null

  const names = readZipEntryNames(bytes)
  if (!names?.includes('[Content_Types].xml')) return null

  const matches = officeMarkers.filter(({ marker }) => names.includes(marker))
  return matches.length === 1 ? matches[0].type : null
}

export function validateOfficeOpenXml(
  input: ArrayBuffer | Uint8Array,
  expectedType: OfficeOpenXmlType,
) {
  return detectOfficeOpenXmlType(input) === expectedType
}

export function detectFileSignature(input: ArrayBuffer | Uint8Array): FileSignatureResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return result('image/jpeg', 'high', 'image')
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return result('image/png', 'high', 'image')
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return result('image/webp', 'high', 'image')
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return result('image/gif', 'high', 'image')
  if (ascii(bytes, 0, 5) === '%PDF-') return result('application/pdf', 'high', 'document')
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return result('audio/wav', 'high', 'audio')
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return result('audio/mpeg', 'high', 'audio')
  }

  const officeType = detectOfficeOpenXmlType(bytes)
  if (officeType) return result(OFFICE_OPEN_XML_MIME_BY_TYPE[officeType], 'high', 'document')

  if (ascii(bytes, 4, 4) === 'ftyp') return result(null, 'needs_deeper_inspection', 'video')
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return result(null, 'needs_deeper_inspection', 'video')
  if (ascii(bytes, 0, 4) === 'OggS') return result(null, 'needs_deeper_inspection', 'audio')

  return result(null, 'unknown', 'unknown')
}

function result(
  detectedMime: string | null,
  confidence: SignatureConfidence,
  kind: SignatureKind,
): FileSignatureResult {
  return { detectedMime, confidence, kind }
}
