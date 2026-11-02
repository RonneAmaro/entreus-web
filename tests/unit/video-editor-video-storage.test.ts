import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, File>())
vi.mock('@/lib/video-editor/music-storage', () => ({
  MAX_MUSIC_BYTES: 25 * 1024 * 1024,
  loadMusicAsset: vi.fn(async (project: string, id: string) => files.get(`${project}:${id}`) || null),
  saveMusicAsset: vi.fn(async (project: string, id: string, file: File) => { files.set(`${project}:${id}`, file) }),
}))
import { saveMusicAsset } from '@/lib/video-editor/music-storage'
import { loadVideoAsset, storeVideoAsset, videoAssetId } from '@/lib/video-editor/video-storage'

beforeEach(() => { files.clear(); vi.clearAllMocks() })
const source = () => new File([new Uint8Array([1, 2, 3, 4])], 'clip.webm', { type: 'video/webm', lastModified: 12 })
const media = (file: File, assetId: string) => ({ id: 'clip', assetId, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified })

describe('assets de vídeo do AutoReels', () => {
  it('reutiliza o conteúdo no mesmo projeto e recupera nomes de utilizações diferentes', async () => {
    const file = source(), id = await storeVideoAsset('project', file)
    const alias = new File([file], 'outro.webm', { type: file.type, lastModified: 20 })
    expect(await storeVideoAsset('project', alias)).toBe(id)
    expect(saveMusicAsset).toHaveBeenCalledTimes(1)
    const restored = await loadVideoAsset('project', media(alias, id))
    expect(restored?.name).toBe(alias.name)
    expect(await restored?.arrayBuffer()).toEqual(await file.arrayBuffer())
  })
  it('recusa conteúdo alterado de mesmo tamanho e mantém arquivos ausentes como ausentes', async () => {
    const file = source(), id = await storeVideoAsset('project', file)
    expect(await loadVideoAsset('other-project', media(file, id))).toBeNull()
    files.set(`project:${id}`, new File([new Uint8Array([4, 3, 2, 1])], file.name, { type: file.type }))
    expect(await loadVideoAsset('project', media(file, id))).toBeNull()
    files.clear()
    expect(await loadVideoAsset('project', media(file, id))).toBeNull()
  })
  it('limita a recuperação automática a vídeos de até 25 MB', async () => {
    const large = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.webm', { type: 'video/webm' })
    await expect(videoAssetId(large)).rejects.toThrow('25 MB')
    await expect(videoAssetId(new File(['bad'], 'photo.png', { type: 'image/png' }))).rejects.toThrow()
    expect(saveMusicAsset).not.toHaveBeenCalled()
  })
  it('não devolve uma referência gravada quando a cota falha', async () => {
    vi.mocked(saveMusicAsset).mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'))
    await expect(storeVideoAsset('project', source())).rejects.toThrow('quota')
    expect(files.size).toBe(0)
  })
})
