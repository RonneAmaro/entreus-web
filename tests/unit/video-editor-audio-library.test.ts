import { beforeEach, describe, expect, it, vi } from 'vitest'
import { audioFileHash, storeLibraryAsset, validLibraryAsset, verifyLibraryFile, type LocalLibraryAsset } from '@/lib/video-editor/audio-library'
import { parseSavedProject, type SavedProject } from '@/lib/video-editor/project-persistence'

const storage = vi.hoisted(() => ({ files: new Map<string, File>(), saves: 0 }))
vi.mock('@/lib/video-editor/music-storage', () => ({
  MAX_MUSIC_BYTES: 25 * 1024 * 1024,
  saveMusicAsset: async (project: string, id: string, file: File) => { storage.saves++; storage.files.set(`${project}:${id}`, file) },
  loadMusicAsset: async (project: string, id: string) => storage.files.get(`${project}:${id}`) ?? null,
}))

function legacy(): SavedProject {
  return { version: 1, id: 'p', createdAt: 1, updatedAt: 1, name: 'Projeto', editorMode: 'video', canvasSize: { width: 160, height: 90 }, baseVideo: null, baseVideoDuration: 0,
    baseTrim: { trimStart: 0, trimEnd: 1 }, extraVideos: [], photoSlides: [], imageOverlays: [], videoOverlays: [], texts: [], stickers: [], sequenceOrder: [], excludedClipIds: [], clipTransitions: {}, photoTransition: 'none', filter: 'normal', videoVolume: 1,
    music: { media: null, name: '', selectedMusicId: null, duration: 0, startTime: 0, trimStart: 0, trimEnd: 0, volume: 0.5, volumeTouched: false },
    voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: '', currentTime: 0 }
}
beforeEach(() => { storage.files.clear(); storage.saves = 0 })
describe('biblioteca local de áudio', () => {
  it('reutiliza um binário entre categorias e reimportações por conteúdo', async () => {
    const file = new File(['audio bytes'], 'tone.wav', { type: 'audio/wav', lastModified: 1 })
    const music = await storeLibraryAsset('p', file, 2, 'music', [])
    const duplicate = await storeLibraryAsset('p', file, 2, 'music', [music])
    const effect = await storeLibraryAsset('p', file, 2, 'effect', [music])
    expect(duplicate.assetId).toBe(music.assetId)
    expect(effect.assetId).toBe(music.assetId)
    expect(effect.category).toBe('effect')
    expect(storage.saves).toBe(1)
    expect(storage.files.size).toBe(1)
    expect(await verifyLibraryFile(music)).toBe(true)
    expect(await verifyLibraryFile({ ...music, file: new File(['bad bytes!!'], 'tone.wav', { type: 'audio/wav' }) })).toBe(false)
    expect(music.assetId).toBe(`sha256-${await audioFileHash(file)}`)
  })
  it('reutiliza arquivo legado com UUID quando o conteúdo coincide', async () => {
    const file = new File(['abc'], 'antigo.wav', { type: 'audio/wav', lastModified: 1 })
    const old: LocalLibraryAsset = { source: 'local', category: 'music', assetId: 'legacy-id', media: { id: 'legacy-id', name: file.name, type: file.type, size: file.size, lastModified: 1 }, duration: 2, file }
    const reused = await storeLibraryAsset('p', file, 2, 'effect', [old])
    expect(reused.assetId).toBe('legacy-id')
    expect(storage.saves).toBe(0)
  })
  it('mantém projetos antigos e valida categorias e referências persistidas', async () => {
    const old = legacy()
    expect(parseSavedProject(JSON.stringify(old)).audioLibrary).toBeUndefined()
    const file = new File(['abc'], 'tone.wav', { type: 'audio/wav', lastModified: 1 })
    const { file: ignored, ...asset } = await storeLibraryAsset('p', file, 2, 'music', [])
    void ignored
    old.audioLibrary = [asset, { ...asset, category: 'effect' }]
    expect(parseSavedProject(JSON.stringify(old)).audioLibrary).toEqual(old.audioLibrary)
    expect(validLibraryAsset({ ...asset, source: 'external' })).toBe(false)
    expect(validLibraryAsset({ ...asset, category: 'unknown' })).toBe(false)
    expect(() => parseSavedProject(JSON.stringify({ ...old, audioLibrary: [asset, asset] }))).toThrow()
    expect(() => parseSavedProject(JSON.stringify({ ...old, audioLibrary: [{ ...asset, duration: -1 }] }))).toThrow()
  })
})
