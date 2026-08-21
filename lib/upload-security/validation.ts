import { detectFileSignature } from './file-signatures'
import { getNormalizedExtension, isValidUploadFileName } from './filename'
import { getUploadPolicy, type UploadContext, type UploadPolicy } from './policies'

export type UploadValidationCode =
  | 'file_empty'
  | 'file_too_large'
  | 'file_type_not_allowed'
  | 'file_extension_not_allowed'
  | 'file_signature_mismatch'
  | 'file_name_invalid'
  | 'file_content_unverified'
  | 'file_size_mismatch'

export type UploadValidationResult =
  | { ok: true; policy: UploadPolicy; mime: string; extension: string; requiresPostUploadVerification: boolean }
  | { ok: false; code: UploadValidationCode }

const unknownMimes = new Set(['', 'application/octet-stream'])

export function normalizeDeclaredMime(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.split(';', 1)[0].trim().toLowerCase()
  return !normalized || unknownMimes.has(normalized) ? null : normalized
}

const expectedMimesByExtension: Readonly<Record<string, readonly string[]>> = {
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], gif: ['image/gif'], pdf: ['application/pdf'],
  mp4: ['video/mp4', 'audio/mp4'], mov: ['video/quicktime'], webm: ['video/webm', 'audio/webm'], ogg: ['video/ogg', 'audio/ogg'], ogv: ['video/ogg'],
  mp3: ['audio/mpeg'], m4a: ['audio/mp4'], wav: ['audio/wav', 'audio/x-wav'], txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
}

const minimumRecognizableBytes: Readonly<Record<string, number>> = {
  'image/jpeg': 4,
  'image/png': 24,
  'image/webp': 12,
  'image/gif': 13,
  'application/pdf': 8,
  'audio/wav': 12,
  'audio/mpeg': 4,
}

function validateMetadata(policy: UploadPolicy, fileName: unknown, declaredMime: unknown, declaredSize: unknown): UploadValidationResult {
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.trim().length > 120) return { ok: false, code: 'file_name_invalid' }
  const extension = getNormalizedExtension(fileName)
  if (!policy.allowedExtensions.includes(extension)) return { ok: false, code: 'file_extension_not_allowed' }
  if (!isValidUploadFileName(fileName, policy)) return { ok: false, code: 'file_name_invalid' }
  const mime = normalizeDeclaredMime(declaredMime)
  if (!mime || !policy.allowedMimes.includes(mime)) return { ok: false, code: 'file_type_not_allowed' }
  if (!expectedMimesByExtension[extension]?.includes(mime)) return { ok: false, code: 'file_signature_mismatch' }
  if (typeof declaredSize !== 'number' || !Number.isSafeInteger(declaredSize) || declaredSize <= 0) return { ok: false, code: 'file_empty' }
  if (declaredSize > policy.maxBytes) return { ok: false, code: 'file_too_large' }
  return { ok: true, policy, mime, extension, requiresPostUploadVerification: policy.magicBytesRequired }
}

export function validateUploadMetadata(input: { context: UploadContext; fileName: unknown; declaredMime: unknown; declaredSize: unknown; policy?: UploadPolicy }): UploadValidationResult {
  return validateMetadata(input.policy || getUploadPolicy(input.context), input.fileName, input.declaredMime, input.declaredSize)
}

export function validateFileContent(input: { context: UploadContext; bytes: ArrayBuffer | Uint8Array; declaredSize: number; declaredMime: unknown; fileName: unknown; policy?: UploadPolicy }): UploadValidationResult {
  const policy = input.policy || getUploadPolicy(input.context)
  const metadata = validateMetadata(policy, input.fileName, input.declaredMime, input.declaredSize)
  if (!metadata.ok) return metadata
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes)
  if (bytes.byteLength === 0) return { ok: false, code: 'file_empty' }
  if (bytes.byteLength !== input.declaredSize) return { ok: false, code: 'file_size_mismatch' }
  const signature = detectFileSignature(bytes)
  if (signature.confidence !== 'high' || !signature.detectedMime) return { ok: false, code: 'file_content_unverified' }
  if (bytes.byteLength < (minimumRecognizableBytes[signature.detectedMime] || 1)) return { ok: false, code: 'file_content_unverified' }
  const compatibleMimes = metadata.mime === 'audio/x-wav' ? ['audio/wav', 'audio/x-wav'] : [metadata.mime]
  if (!compatibleMimes.includes(signature.detectedMime)) return { ok: false, code: 'file_signature_mismatch' }
  return { ...metadata, requiresPostUploadVerification: false }
}
