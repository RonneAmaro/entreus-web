import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOAD_FILENAME_LENGTH,
  getUploadPolicy,
  isValidUploadFileName,
  sanitizeUploadFileName,
} from '../../lib/upload-security'

const policy = getUploadPolicy('post_image')

describe('upload filename safety', () => {
  it('accepts uppercase allowed extensions and normalizes sanitized output', () => {
    expect(isValidUploadFileName('Foto de Perfil.JPEG', policy)).toBe(true)
    expect(sanitizeUploadFileName('Foto de Perfil.JPEG', policy)).toBe('Foto-de-Perfil.jpeg')
  })

  it.each(['../photo.jpg', '..\\photo.jpg', 'folder/photo.jpg', 'folder\\photo.jpg', 'photo.jpg?x=1', 'photo.jpg#x', 'photo\r\n.jpg', 'photo\0.jpg', '', '..'])('rejects an unsafe name: %s', (name) => {
    expect(isValidUploadFileName(name, policy)).toBe(false)
  })

  it('rejects giant names and forbidden extensions', () => {
    expect(isValidUploadFileName(`${'a'.repeat(MAX_UPLOAD_FILENAME_LENGTH)}.jpg`, policy)).toBe(false)
    expect(isValidUploadFileName('payload.svg', policy)).toBe(false)
    expect(isValidUploadFileName('payload.exe', policy)).toBe(false)
    expect(isValidUploadFileName('payload.zip', policy)).toBe(false)
  })

  it('neutralizes dangerous characters without preserving unauthorized extensions', () => {
    expect(sanitizeUploadFileName('minha<>foto?.PNG', policy)).toBe('minha-foto.png')
    expect(sanitizeUploadFileName('payload.svg', policy)).toBeNull()
  })
})
