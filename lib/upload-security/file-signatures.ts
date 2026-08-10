export type SignatureConfidence = 'high' | 'needs_deeper_inspection' | 'unknown'
export type SignatureKind = 'image' | 'document' | 'video' | 'audio' | 'unknown'

export type FileSignatureResult = Readonly<{
  detectedMime: string | null
  confidence: SignatureConfidence
  kind: SignatureKind
}>

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
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
