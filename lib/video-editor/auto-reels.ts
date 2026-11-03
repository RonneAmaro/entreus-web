import { positionClips, type PositionedClip } from './timeline'
import { projectCanvasSize } from './video-format'
import type { SavedLibraryAsset } from './audio-library'
import type { SavedAudioClip } from './audio-clips'

export type AutoReelsPhoto = { id: string; name: string; previewUrl: string }
export type AutoReelsMedia = AutoReelsPhoto & ({ type?: 'image' } | { type: 'video'; sourceDuration: number; trimStart: number; trimEnd: number })
export type AutoReelsOptions = {
  format: '16:9' | '9:16'
  timing: 'per-photo' | 'total'
  seconds: number
}
export type AutoReelsProposal = {
  format: AutoReelsOptions['format']
  size: { width: number; height: number }
  duration: number
  photoCount: number
  videoCount: number
  clips: Array<PositionedClip & { sourceId: string }>
}

// A proposal is data only: no project mutation, object URLs, storage or network.
export function generateAutoReels(media: AutoReelsMedia[], options: AutoReelsOptions): AutoReelsProposal {
  if (!media.length || media.length > 10 || media.some((item) => !item.id || !item.name || !item.previewUrl || item.type !== undefined && item.type !== 'image' && item.type !== 'video')
    || new Set(media.map((item) => item.id)).size !== media.length) throw new Error('Selecione de 1 a 10 itens disponíveis, sem repetir clipes.')
  if (!['16:9', '9:16'].includes(options.format) || !['per-photo', 'total'].includes(options.timing)
    || !Number.isFinite(options.seconds) || options.seconds <= 0) throw new Error('Configuração de montagem inválida.')
  const videos = media.filter((item) => item.type === 'video')
  for (const video of videos) {
    if (![video.sourceDuration, video.trimStart, video.trimEnd].every(Number.isFinite) || video.sourceDuration <= 0
      || video.trimStart < 0 || video.trimEnd > video.sourceDuration || video.trimEnd - video.trimStart < 0.5) throw new Error('Um vídeo tem duração ou recorte inválido. Revise o trecho no editor.')
  }
  const photoCount = media.length - videos.length
  const videoDuration = videos.reduce((sum, video) => sum + video.trimEnd - video.trimStart, 0)
  const requestedPerPhoto = options.timing === 'total' ? (options.seconds - videoDuration) / (photoCount || 1) : options.seconds
  if (photoCount && (requestedPerPhoto < 1 - 1e-9 || requestedPerPhoto > 8 + 1e-9)) throw new Error('Reserve de 1 a 8 segundos por foto além da duração dos vídeos. Os vídeos não serão cortados para ajustar o total.')
  const perPhoto = Math.max(1, Math.min(8, requestedPerPhoto))
  const clips = positionClips(media.map((item, index) => ({
    id: `autoreels-${index}-${item.id}`, sourceId: item.id, type: item.type || 'image',
    name: item.name, previewUrl: item.previewUrl, transition: 'none' as const,
    ...(item.type === 'video' ? { sourceDuration: item.sourceDuration, trimStart: item.trimStart, trimEnd: item.trimEnd, duration: item.trimEnd - item.trimStart } : { duration: perPhoto }),
  }))) as AutoReelsProposal['clips']
  return { format: options.format, size: projectCanvasSize(options.format, { width: 1280, height: 720 }), duration: clips.at(-1)!.endTime, photoCount, videoCount: videos.length, clips }
}

export function autoReelsMusic(asset: SavedLibraryAsset, id: string, startTime: number, montageDuration: number): SavedAudioClip {
  if (!Number.isFinite(startTime) || startTime < 0 || !Number.isFinite(montageDuration) || montageDuration <= 0
    || !Number.isFinite(asset.duration) || asset.duration <= 0) throw new Error('Duração da música inválida.')
  return { id, assetId: asset.assetId, media: { ...asset.media, id }, sourceDuration: asset.duration,
    startTime, trimStart: 0, trimEnd: Math.min(asset.duration, montageDuration), volume: 0.45, muted: false, fadeIn: 0, fadeOut: 0 }
}
