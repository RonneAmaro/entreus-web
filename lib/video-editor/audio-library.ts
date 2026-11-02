import { validAudioClip } from './audio-clips'
import { loadMusicAsset, saveMusicAsset } from './music-storage'
import type { ProjectMedia } from './project-persistence'

export type AudioCategory = 'music' | 'effect'
export type AudioLicenseInfo = { source?: string; creator?: string; originalUrl?: string; license?: string }
export type SavedLibraryAsset = { source: 'local'; assetId: string; category: AudioCategory; media: ProjectMedia; duration: number; licenseInfo?: AudioLicenseInfo }
export type LocalLibraryAsset = SavedLibraryAsset & { file: File | null }
export const MAX_LIBRARY_ASSETS = 100

export function validLibraryAsset(value: unknown): value is SavedLibraryAsset {
  if (!value || typeof value !== 'object') return false
  const item = value as SavedLibraryAsset
  if (item.source !== 'local' || (item.category !== 'music' && item.category !== 'effect') || !item.media || item.media.id !== item.assetId) return false
  if (item.licenseInfo !== undefined && (!item.licenseInfo || typeof item.licenseInfo !== 'object' || Array.isArray(item.licenseInfo)
    || (['source', 'creator', 'originalUrl', 'license'] as const).some((key) => item.licenseInfo?.[key] !== undefined && typeof item.licenseInfo[key] !== 'string'))) return false
  return validAudioClip({ id: 'audio-library', assetId: item.assetId, media: { ...item.media, id: 'audio-library' }, sourceDuration: item.duration, startTime: 0, trimStart: 0, trimEnd: item.duration, volume: 1, muted: false })
}

export async function audioFileHash(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyLibraryFile(asset: LocalLibraryAsset): Promise<boolean> {
  if (!asset.file || asset.file.name !== asset.media.name || asset.file.size !== asset.media.size || asset.file.type !== asset.media.type) return false
  return !asset.assetId.startsWith('sha256-') || asset.assetId === `sha256-${await audioFileHash(asset.file)}`
}

// A content hash reuses both newly imported files and equivalent legacy assets.
export async function storeLibraryAsset(projectId: string, file: File, duration: number, category: AudioCategory, known: LocalLibraryAsset[]): Promise<LocalLibraryAsset> {
  const digest = await audioFileHash(file)
  const candidates = known.filter((item, index) => item.file && item.file.size === file.size && known.findIndex((other) => other.assetId === item.assetId) === index)
  let matching: LocalLibraryAsset | undefined
  for (const item of candidates) {
    if (await audioFileHash(item.file!) === digest) { matching = item; break }
  }
  const assetId = matching?.assetId || `sha256-${digest}`
  const existing = known.find((item) => item.assetId === assetId && item.category === category)
  if (existing?.file && await verifyLibraryFile(existing)) return existing
  let stored = matching?.file || await loadMusicAsset(projectId, assetId).catch(() => null)
  if (stored && await audioFileHash(stored) !== digest) stored = null
  if (!stored) { stored = file; await saveMusicAsset(projectId, assetId, stored) }
  const canonical = existing || matching
  const media = canonical ? { ...canonical.media, id: assetId } : { id: assetId, name: stored.name, type: stored.type, size: stored.size, lastModified: stored.lastModified, duration }
  if (stored.name !== media.name || stored.type !== media.type || stored.size !== media.size) {
    stored = new File([stored], media.name, { type: media.type, lastModified: media.lastModified })
    await saveMusicAsset(projectId, assetId, stored)
  }
  return { source: 'local', category, assetId, media, duration: canonical?.duration ?? duration, file: stored }
}
