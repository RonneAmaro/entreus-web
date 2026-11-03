export type VideoOverlayTiming = {
  startTime: number
  endTime: number
  trimStart: number
  trimEnd: number
  sourceDuration: number
}

export function videoOverlaySourceTime(overlay: VideoOverlayTiming, time: number): number | null {
  if (![overlay.startTime, overlay.endTime, overlay.trimStart, overlay.trimEnd, overlay.sourceDuration, time].every(Number.isFinite)) return null
  if (overlay.sourceDuration <= 0 || overlay.trimStart < 0 || overlay.trimEnd > overlay.sourceDuration || overlay.trimEnd <= overlay.trimStart) return null
  if (time < overlay.startTime || time >= overlay.endTime) return null
  return Math.min(overlay.trimEnd, Math.max(overlay.trimStart, overlay.trimStart + time - overlay.startTime))
}

export function retimeVideoOverlay<T extends VideoOverlayTiming>(overlay: T, mode: 'move' | 'trim-start' | 'trim-end', startTime: number, endTime: number): T {
  if (![startTime, endTime, overlay.sourceDuration, overlay.trimStart, overlay.trimEnd].every(Number.isFinite) || startTime < 0 || endTime - startTime < 0.5 || overlay.trimStart < 0 || overlay.trimEnd > overlay.sourceDuration || overlay.trimEnd <= overlay.trimStart) return overlay
  if (mode === 'move') return { ...overlay, startTime, endTime }
  if (mode === 'trim-start') {
    const delta = startTime - overlay.startTime
    const trimStart = Math.min(overlay.trimEnd - 0.5, Math.max(0, overlay.trimStart + delta))
    return { ...overlay, startTime: overlay.startTime + trimStart - overlay.trimStart, trimStart }
  }
  const trimEnd = Math.min(overlay.sourceDuration, Math.max(overlay.trimStart + 0.5, overlay.trimStart + endTime - overlay.startTime))
  return { ...overlay, endTime: overlay.startTime + trimEnd - overlay.trimStart, trimEnd }
}
