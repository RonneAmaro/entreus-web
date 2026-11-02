import { describe, expect, it } from 'vitest'
import { validLibraryAsset } from '@/lib/video-editor/audio-library'

const asset = { source: 'local', assetId: 'old-id', category: 'music', media: { id: 'old-id', name: 'old.wav', type: 'audio/wav', size: 100, lastModified: 1 }, duration: 2 }

describe('metadados de origem de áudio', () => {
  it('aceita assets antigos e campos opcionais sem atribuir licença automaticamente', () => {
    expect(validLibraryAsset(asset)).toBe(true)
    expect(validLibraryAsset({ ...asset, licenseInfo: { source: 'Pixabay', creator: 'Autor', originalUrl: 'https://pixabay.com/', license: 'Conferir licença' } })).toBe(true)
    expect(validLibraryAsset({ ...asset, licenseInfo: { creator: 42 } })).toBe(false)
  })
})
