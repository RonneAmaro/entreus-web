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

export type UploadValidationSuccess = Readonly<{
  ok: true
  policy: UploadPolicy
  mime: string
  extension: string
  requiresPostUploadVerification: boolean
}>

export type UploadValidationFailure = Readonly<{
  ok: false
  code: UploadValidationCode
}>

export type UploadValidationResult = UploadValidationSuccess | UploadValidationFailure

export type UploadMetadataInput = Readonly<{
  context: UploadContext
  fileName: unknown
  declaredMime: unknown
  declaredSize: unknown
  policy?: UploadPolicy
}>

export type UploadContentInput = Readonly<{
  context: UploadContext
  bytes: ArrayBuffer | Uint8Array
  declaredSize: number
  declaredMime: unknown
  fileName: unknown
  policy?: UploadPolicy
}>

const unknownMimes = new Set(['', 'application/octet-stream'])

const expectedMimesByExtension: Readonly<Record<string, readonly string[]>> = Object.freeze({
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  mp4: ['video/mp4', 'audio/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm', 'audio/webm'],
  ogg: ['video/ogg', 'audio/ogg'],
  ogv: ['video/ogg'],
  mp3: ['audio/mpeg'],
  m4a: ['audio/mp4'],
  wav: ['audio/wav', 'audio/x-wav'],
  txt: ['text/plain'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
})

const minimumRecognizableBytes: Readonly<Record<string, number>> = Object.freeze({
  'image/jpeg': 4,
  'image/png': 24,
  'image/webp': 12,
  'image/gif': 13,
  'application/pdf': 8,
  'audio/wav': 12,
  'audio/mpeg': 4,
})

const compatibleDetectedMimes: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'audio/x-wav': ['audio/wav', 'audio/x-wav'],
})

export function normalizeDeclaredMime(value: unknown) {
  if (typeof value !== 'string') return null

  const normalized = value.split(';', 1)[0].trim().toLowerCase()
  return unknownMimes.has(normalized) ? null : normalized
}

export function validateUploadMetadata(input: UploadMetadataInput): UploadValidationResult {
  const selectedPolicy = input.policy ?? getUploadPolicy(input.context)
  if (!selectedPolicy) return failure('file_type_not_allowed')

  return validateMetadata(
    selectedPolicy,
    input.fileName,
    input.declaredMime,
    input.declaredSize,
  )
}

export function validateFileContent(input: UploadContentInput): UploadValidationResult {
  const selectedPolicy = input.policy ?? getUploadPolicy(input.context)
  if (!selectedPolicy) return failure('file_type_not_allowed')

  const metadata = validateMetadata(
    selectedPolicy,
    input.fileName,
    input.declaredMime,
    input.declaredSize,
  )
  if (!metadata.ok) return metadata

  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes)
  if (bytes.byteLength === 0) return failure('file_empty')
  if (bytes.byteLength !== input.declaredSize) return failure('file_size_mismatch')
  if (!selectedPolicy.magicBytesRequired) {
    return { ...metadata, requiresPostUploadVerification: false }
  }

  const signature = detectFileSignature(bytes)
  if (signature.confidence !== 'high' || !signature.detectedMime) {
    return failure('file_content_unverified')
  }

  const minimumBytes = minimumRecognizableBytes[signature.detectedMime]
  if (minimumBytes && bytes.byteLength < minimumBytes) return failure('file_content_unverified')

  const compatibleMimes = compatibleDetectedMimes[metadata.mime] ?? [metadata.mime]
  if (!compatibleMimes.includes(signature.detectedMime)) return failure('file_signature_mismatch')

  return { ...metadata, requiresPostUploadVerification: false }
}

function validateMetadata(
  policy: UploadPolicy,
  fileName: unknown,
  declaredMime: unknown,
  declaredSize: unknown,
): UploadValidationResult {
  if (typeof fileName !== 'string' || !fileName.trim()) return failure('file_name_invalid')

  const extension = getNormalizedExtension(fileName)
  if (!extension || !policy.allowedExtensions.includes(extension)) {
    return failure('file_extension_not_allowed')
  }
  if (!isValidUploadFileName(fileName, policy)) return failure('file_name_invalid')

  const mime = normalizeDeclaredMime(declaredMime)
  if (!mime || !policy.allowedMimes.includes(mime)) return failure('file_type_not_allowed')
  if (!expectedMimesByExtension[extension]?.includes(mime)) return failure('file_signature_mismatch')

  if (typeof declaredSize !== 'number' || !Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    return failure('file_empty')
  }
  if (declaredSize > policy.maxBytes) return failure('file_too_large')

  return {
    ok: true,
    policy,
    mime,
    extension,
    requiresPostUploadVerification: policy.magicBytesRequired,
  }
}

function failure(code: UploadValidationCode): UploadValidationFailure {
  return { ok: false, code }
}
