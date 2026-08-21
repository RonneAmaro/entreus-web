import {
  Uint8ArrayReader,
  ZipReader,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js'
import type { OfficeOpenXmlType } from './file-signatures'

export const OOXML_MIME_BY_EXTENSION: Readonly<Record<OfficeOpenXmlType, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const OOXML_GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
])

export const OOXML_LIMITS = Object.freeze({
  maxEntries: 512,
  maxTotalUncompressedBytes: 40 * 1024 * 1024,
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxRelevantXmlBytes: 8 * 1024 * 1024,
  maxEntryCompressionRatio: 200,
  maxTotalCompressionRatio: 100,
  maxPathLength: 240,
  maxPathDepth: 12,
  maxXmlElements: 100_000,
})

type OfficeOpenXmlConfig = Readonly<{
  mainPart: string
  mainRoot: string
  mainContentType: string
}>

const OOXML_CONFIG: Readonly<Record<OfficeOpenXmlType, OfficeOpenXmlConfig>> = {
  docx: {
    mainPart: 'word/document.xml',
    mainRoot: 'document',
    mainContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  },
  xlsx: {
    mainPart: 'xl/workbook.xml',
    mainRoot: 'workbook',
    mainContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  },
  pptx: {
    mainPart: 'ppt/presentation.xml',
    mainRoot: 'presentation',
    mainContentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  },
}

const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
])

export type OfficeOpenXmlValidationCode =
  | 'invalid_zip'
  | 'unsafe_entry'
  | 'encrypted_entry'
  | 'zip_limits_exceeded'
  | 'missing_structure'
  | 'invalid_xml'
  | 'wrong_document_type'

export type OfficeOpenXmlValidationResult =
  | { ok: true; type: OfficeOpenXmlType; mimeType: string }
  | { ok: false; code: OfficeOpenXmlValidationCode }

type ParsedXmlElement = Readonly<{
  localName: string
  attributes: ReadonlyMap<string, string>
}>

type ParsedXml = Readonly<{
  rootLocalName: string
  elements: readonly ParsedXmlElement[]
}>

function localName(name: string) {
  const colon = name.lastIndexOf(':')
  return colon >= 0 ? name.slice(colon + 1) : name
}

function hasOnlyValidXmlEntities(value: string) {
  let index = 0
  while (true) {
    const entityStart = value.indexOf('&', index)
    if (entityStart < 0) return true
    const match = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/.exec(value.slice(entityStart))
    if (!match) return false
    const entity = match[0]
    if (entity.startsWith('&#')) {
      const hexadecimal = entity.startsWith('&#x')
      const digits = entity.slice(hexadecimal ? 3 : 2, -1)
      const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10)
      const isValidXmlCodePoint =
        codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      if (!isValidXmlCodePoint) return false
    }
    index = entityStart + entity.length
  }
}

function findTagEnd(xml: string, start: number) {
  let quote = ''
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index]
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '>') return index
  }
  return -1
}

function parseAttributes(source: string) {
  const attributes = new Map<string, string>()
  let index = 0

  while (index < source.length) {
    while (/\s/.test(source[index] || '')) index += 1
    if (index >= source.length) break

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(index))
    if (!nameMatch) return null
    const name = nameMatch[0]
    index += name.length

    while (/\s/.test(source[index] || '')) index += 1
    if (source[index] !== '=') return null
    index += 1
    while (/\s/.test(source[index] || '')) index += 1

    const quote = source[index]
    if (quote !== '"' && quote !== "'") return null
    index += 1
    const valueEnd = source.indexOf(quote, index)
    if (valueEnd < 0) return null
    const value = source.slice(index, valueEnd)
    if (value.includes('<') || !hasOnlyValidXmlEntities(value) || attributes.has(name)) return null
    attributes.set(name, value)
    index = valueEnd + 1
  }

  return attributes
}

function parseRestrictedXml(bytes: Uint8Array, collectElements: boolean): ParsedXml | null {
  let xml: string
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }

  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(xml)) return null

  const stack: string[] = []
  const elements: ParsedXmlElement[] = []
  let rootName = ''
  let rootCount = 0
  let elementCount = 0
  let index = 0
  let sawDeclaration = false

  while (index < xml.length) {
    const tagStart = xml.indexOf('<', index)
    if (tagStart < 0) {
      const text = xml.slice(index)
      if ((!stack.length && text.trim()) || text.includes(']]>') || !hasOnlyValidXmlEntities(text)) return null
      break
    }

    const text = xml.slice(index, tagStart)
    if ((!stack.length && text.trim()) || text.includes(']]>') || !hasOnlyValidXmlEntities(text)) return null

    if (xml.startsWith('<!--', tagStart)) {
      const commentEnd = xml.indexOf('-->', tagStart + 4)
      if (commentEnd < 0 || xml.slice(tagStart + 4, commentEnd).includes('--')) return null
      index = commentEnd + 3
      continue
    }

    if (xml.startsWith('<![CDATA[', tagStart)) {
      if (!stack.length) return null
      const cdataEnd = xml.indexOf(']]>', tagStart + 9)
      if (cdataEnd < 0) return null
      index = cdataEnd + 3
      continue
    }

    if (xml.startsWith('<?', tagStart)) {
      const processingEnd = xml.indexOf('?>', tagStart + 2)
      if (processingEnd < 0) return null
      const processing = xml.slice(tagStart + 2, processingEnd).trim()
      if (rootCount > 0 || sawDeclaration || !/^xml(?:\s|$)/i.test(processing)) return null
      sawDeclaration = true
      index = processingEnd + 2
      continue
    }

    if (xml.startsWith('<!', tagStart)) return null

    const tagEnd = findTagEnd(xml, tagStart + 1)
    if (tagEnd < 0) return null
    let tag = xml.slice(tagStart + 1, tagEnd).trim()
    if (!tag) return null

    if (tag.startsWith('/')) {
      const closingName = tag.slice(1).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(closingName) || stack.pop() !== closingName) return null
      index = tagEnd + 1
      continue
    }

    const selfClosing = tag.endsWith('/')
    if (selfClosing) tag = tag.slice(0, -1).trimEnd()
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(tag)
    if (!nameMatch) return null
    const name = nameMatch[0]
    const attributes = parseAttributes(tag.slice(name.length))
    if (!attributes) return null

    elementCount += 1
    if (elementCount > OOXML_LIMITS.maxXmlElements) return null
    if (!stack.length) {
      rootCount += 1
      if (rootCount !== 1) return null
      rootName = localName(name)
    }
    if (collectElements) elements.push({ localName: localName(name), attributes })
    if (!selfClosing) stack.push(name)
    index = tagEnd + 1
  }

  if (stack.length || rootCount !== 1) return null
  return { rootLocalName: rootName, elements }
}

function isSafeEntryName(name: string, directory: boolean) {
  const normalized = directory && name.endsWith('/') ? name.slice(0, -1) : name
  if (!normalized || normalized.length > OOXML_LIMITS.maxPathLength || normalized.includes('\\') || /[\u0000-\u001f\u007f]/.test(normalized)) return false
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false
  const parts = normalized.split('/')
  if (parts.length > OOXML_LIMITS.maxPathDepth || parts.some((part) => !part || part === '.' || part === '..')) return false
  return true
}

function exceedsCompressionRatio(uncompressedSize: number, compressedSize: number, maximum: number) {
  if (uncompressedSize === 0) return false
  if (compressedSize === 0) return true
  return uncompressedSize / compressedSize > maximum
}

async function readEntryBytes(entry: FileEntry, maximumBytes: number) {
  const chunks: ArrayBuffer[] = []
  let total = 0
  const writable = new WritableStream<Uint8Array>({
    write(value) {
      total += value.byteLength
      if (total > maximumBytes) throw new Error('OOXML entry exceeded read limit')
      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      chunks.push(copy.buffer)
    },
  })

  await entry.getData(writable, {
    checkAmbiguity: true,
    checkCrc32: true,
    useWebWorkers: false,
  })

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset)
    offset += chunk.byteLength
  }
  return result
}

function findFile(entries: readonly Entry[], name: string): FileEntry | null {
  const entry = entries.find((candidate) => candidate.filename === name)
  return entry && !entry.directory ? entry : null
}

function hasExpectedContentType(xml: ParsedXml, config: OfficeOpenXmlConfig) {
  if (xml.rootLocalName !== 'Types') return false
  return xml.elements.some((element) =>
    element.localName === 'Override' &&
    element.attributes.get('PartName') === `/${config.mainPart}` &&
    element.attributes.get('ContentType') === config.mainContentType,
  )
}

function hasExpectedRootRelationship(xml: ParsedXml, config: OfficeOpenXmlConfig) {
  if (xml.rootLocalName !== 'Relationships') return false
  return xml.elements.some((element) => {
    if (element.localName !== 'Relationship') return false
    const target = element.attributes.get('Target')?.replace(/^\//, '')
    const targetMode = element.attributes.get('TargetMode')
    return target === config.mainPart &&
      (!targetMode || targetMode.toLowerCase() !== 'external') &&
      OFFICE_DOCUMENT_RELATIONSHIP_TYPES.has(element.attributes.get('Type') || '')
  })
}

export function isOfficeOpenXmlType(value: string): value is OfficeOpenXmlType {
  return value === 'docx' || value === 'xlsx' || value === 'pptx'
}

export async function validateOfficeOpenXml(
  bytes: Uint8Array,
  type: OfficeOpenXmlType,
): Promise<OfficeOpenXmlValidationResult> {
  const config = OOXML_CONFIG[type]
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    checkAmbiguity: true,
    strictness: 'strict',
    useWebWorkers: false,
  })

  try {
    const entries = await reader.getEntries({
      checkAmbiguity: true,
      filenameValidation: 'strict',
      strictness: 'strict',
      maxAppendedDataSize: 0,
    })

    if (entries.length === 0 || entries.length > OOXML_LIMITS.maxEntries) {
      return { ok: false, code: 'zip_limits_exceeded' }
    }

    let totalCompressed = 0
    let totalUncompressed = 0
    for (const entry of entries) {
      if (!isSafeEntryName(entry.filename, entry.directory) || entry.symlink) return { ok: false, code: 'unsafe_entry' }
      if (entry.encrypted) return { ok: false, code: 'encrypted_entry' }
      if (entry.directory) continue
      if (!Number.isSafeInteger(entry.compressedSize) || !Number.isSafeInteger(entry.uncompressedSize)) {
        return { ok: false, code: 'zip_limits_exceeded' }
      }
      if (entry.uncompressedSize > OOXML_LIMITS.maxEntryUncompressedBytes) {
        return { ok: false, code: 'zip_limits_exceeded' }
      }
      if (exceedsCompressionRatio(entry.uncompressedSize, entry.compressedSize, OOXML_LIMITS.maxEntryCompressionRatio)) {
        return { ok: false, code: 'zip_limits_exceeded' }
      }
      totalCompressed += entry.compressedSize
      totalUncompressed += entry.uncompressedSize
      if (totalUncompressed > OOXML_LIMITS.maxTotalUncompressedBytes) {
        return { ok: false, code: 'zip_limits_exceeded' }
      }
    }

    if (exceedsCompressionRatio(totalUncompressed, totalCompressed, OOXML_LIMITS.maxTotalCompressionRatio)) {
      return { ok: false, code: 'zip_limits_exceeded' }
    }

    const contentTypesEntry = findFile(entries, '[Content_Types].xml')
    const relationshipsEntry = findFile(entries, '_rels/.rels')
    const mainEntry = findFile(entries, config.mainPart)
    if (!contentTypesEntry || !relationshipsEntry || !mainEntry) {
      return { ok: false, code: 'missing_structure' }
    }

    if ([contentTypesEntry, relationshipsEntry, mainEntry].some(
      (entry) => entry.uncompressedSize > OOXML_LIMITS.maxRelevantXmlBytes,
    )) {
      return { ok: false, code: 'zip_limits_exceeded' }
    }

    const [contentTypesBytes, relationshipsBytes, mainBytes] = await Promise.all([
      readEntryBytes(contentTypesEntry, OOXML_LIMITS.maxRelevantXmlBytes),
      readEntryBytes(relationshipsEntry, OOXML_LIMITS.maxRelevantXmlBytes),
      readEntryBytes(mainEntry, OOXML_LIMITS.maxRelevantXmlBytes),
    ])
    const contentTypesXml = parseRestrictedXml(contentTypesBytes, true)
    const relationshipsXml = parseRestrictedXml(relationshipsBytes, true)
    const mainXml = parseRestrictedXml(mainBytes, false)
    if (!contentTypesXml || !relationshipsXml || !mainXml) {
      return { ok: false, code: 'invalid_xml' }
    }
    if (
      !hasExpectedContentType(contentTypesXml, config) ||
      !hasExpectedRootRelationship(relationshipsXml, config) ||
      mainXml.rootLocalName !== config.mainRoot
    ) {
      return { ok: false, code: 'wrong_document_type' }
    }

    return { ok: true, type, mimeType: OOXML_MIME_BY_EXTENSION[type] }
  } catch {
    return { ok: false, code: 'invalid_zip' }
  } finally {
    try {
      await reader.close()
    } catch {
      // Validation already fails closed if reading the archive itself throws.
    }
  }
}
