import { describe, expect, it } from 'vitest'
import { stickerFileKind } from '@/lib/video-editor/sticker-storage'

describe('sticker image signatures', () => {
  it('accepts a structurally complete PNG and rejects APNG and truncation', () => {
    const header = [137,80,78,71,13,10,26,10, 0,0,0,0, 73,72,68,82, 0,0,0,0]
    const end = [0,0,0,0, 73,69,78,68, 0,0,0,0]
    expect(stickerFileKind(new Uint8Array([...header, ...end]))).toBe('png')
    expect(stickerFileKind(new Uint8Array([...header, 0,0,0,0, 97,99,84,76, 0,0,0,0, ...end]))).toBeNull()
    expect(stickerFileKind(new Uint8Array(header))).toBeNull()
  })
  it('accepts static WebP and rejects animated WebP and invalid lengths', () => {
    const riff = [82,73,70,70, 14,0,0,0, 87,69,66,80, 86,80,56,88, 1,0,0,0]
    expect(stickerFileKind(new Uint8Array([...riff, 0, 0]))).toBe('webp')
    expect(stickerFileKind(new Uint8Array([...riff, 2, 0]))).toBeNull()
    expect(stickerFileKind(new Uint8Array([...riff, 0]))).toBeNull()
  })
})

import { vi } from 'vitest'
import { saveStickerAsset } from '@/lib/video-editor/sticker-storage'
it('propaga falha de quota sem informar salvamento', async () => {
  const quota = new DOMException('Quota exceeded', 'QuotaExceededError')
  const transaction = { error: quota, objectStore: () => ({ put: () => {
    queueMicrotask(() => transaction.onabort?.())
    return {}
  } }), onabort: undefined as (() => void) | undefined, oncomplete: undefined, onerror: undefined }
  const request = { result: { transaction: () => transaction, close: () => {} }, onsuccess: undefined as (() => void) | undefined }
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => request.onsuccess?.()); return request } })
  try { await expect(saveStickerAsset('project', 'asset', new Blob(['image']))).rejects.toMatchObject({ name: 'QuotaExceededError' }) }
  finally { vi.unstubAllGlobals() }
})
it('fecha conexão que abre após solicitação bloqueada', async () => {
  const close = vi.fn()
  const request = { result: { close }, onblocked: undefined as (() => void) | undefined, onsuccess: undefined as (() => void) | undefined }
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => request.onblocked?.()); return request } })
  try {
    await expect(saveStickerAsset('project', 'asset', new Blob(['image']))).rejects.toThrow('bloqueado')
    request.onsuccess?.()
    expect(close).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
