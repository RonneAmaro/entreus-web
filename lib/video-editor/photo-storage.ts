import { audioFileHash } from './audio-library'
import { loadMusicAsset, saveMusicAsset } from './music-storage'
import type { ProjectMedia } from './project-persistence'

const PREFIX = 'photo-sha256-'
export const MAX_STORED_PHOTO_BYTES = 8 * 1024 * 1024

export function validPhotoAssetId(id: string): boolean {
  return /^photo-sha256-[0-9a-f]{64}$/.test(id)
}

export async function photoAssetId(file: File): Promise<string> {
  if (!file.size || file.size > MAX_STORED_PHOTO_BYTES || !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Foto inválida para armazenamento.')
  return PREFIX + await audioFileHash(file)
}

export async function storePhotoAsset(projectId: string, file: File): Promise<string> {
  const id = await photoAssetId(file)
  const existing = await loadMusicAsset(projectId, id)
  if (!existing || await audioFileHash(existing) !== id.slice(PREFIX.length)) await saveMusicAsset(projectId, id, file)
  return id
}

export async function loadPhotoAsset(projectId: string, id: string, media: ProjectMedia): Promise<File | null> {
  if (!validPhotoAssetId(id) || !['image/png', 'image/jpeg'].includes(media.type) || media.size > MAX_STORED_PHOTO_BYTES) return null
  const stored = await loadMusicAsset(projectId, id)
  if (!stored || stored.size !== media.size || await audioFileHash(stored) !== id.slice(PREFIX.length)) return null
  return new File([stored], media.name, { type: media.type, lastModified: media.lastModified })
}
