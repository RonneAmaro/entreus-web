import { audioFileHash } from './audio-library'
import { loadMusicAsset, MAX_MUSIC_BYTES, saveMusicAsset } from './music-storage'
import type { ProjectMedia } from './project-persistence'

export const MAX_STORED_VIDEO_BYTES = MAX_MUSIC_BYTES
export function validVideoAssetId(id: string): boolean { return /^video-sha256-[0-9a-f]{64}$/.test(id) }
export async function videoAssetId(file: File): Promise<string> {
  if (!file.size || file.size > MAX_STORED_VIDEO_BYTES || !file.type.startsWith('video/')) throw new Error('Recuperação automática de vídeo limitada a 25 MB por arquivo.')
  return `video-sha256-${await audioFileHash(file)}`
}
export async function storeVideoAsset(projectId: string, file: File): Promise<string> {
  const id = await videoAssetId(file)
  const existing = await loadMusicAsset(projectId, id)
  if (!existing || `video-sha256-${await audioFileHash(existing)}` !== id) await saveMusicAsset(projectId, id, file)
  return id
}
export async function loadVideoAsset(projectId: string, media: ProjectMedia): Promise<File | null> {
  if (!media.assetId || !validVideoAssetId(media.assetId) || media.size > MAX_STORED_VIDEO_BYTES || !media.type.startsWith('video/')) return null
  const file = await loadMusicAsset(projectId, media.assetId)
  if (!file || file.size !== media.size || `video-sha256-${await audioFileHash(file)}` !== media.assetId) return null
  return new File([file], media.name, { type: media.type, lastModified: media.lastModified })
}
