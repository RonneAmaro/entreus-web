export type VideoAspectPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:3'
export type VideoFrameMode = 'fit' | 'fill'
export type VideoSize = { width: number; height: number }

export const VIDEO_ASPECT_PRESETS: Array<{ id: VideoAspectPreset; label: string; size?: VideoSize }> = [
  { id: 'original', label: 'Original' },
  { id: '16:9', label: '16:9', size: { width: 1280, height: 720 } },
  { id: '9:16', label: '9:16', size: { width: 720, height: 1280 } },
  { id: '1:1', label: '1:1', size: { width: 1080, height: 1080 } },
  { id: '4:3', label: '4:3', size: { width: 1280, height: 960 } },
]

export function projectCanvasSize(preset: VideoAspectPreset, original: VideoSize): VideoSize {
  const fixed = VIDEO_ASPECT_PRESETS.find((item) => item.id === preset)?.size
  return fixed || original
}

export function fitMediaFilter(size: VideoSize, mode: VideoFrameMode): string {
  const scale = `scale=${size.width}:${size.height}:force_original_aspect_ratio=${mode === 'fill' ? 'increase' : 'decrease'}`
  const frame = mode === 'fill'
    ? `crop=${size.width}:${size.height}:(iw-ow)/2:(ih-oh)/2`
    : `pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2`
  return `${scale},${frame},setsar=1`
}

export function reframeScale(from: VideoSize, to: VideoSize, reference: VideoSize): number {
  const relativeScale = (size: VideoSize) => Math.min(size.width / reference.width, size.height / reference.height)
  return relativeScale(to) / relativeScale(from)
}

export function reframeBounds<T extends { x: number; y: number; width: number; height: number }>(bounds: T, from: VideoSize, to: VideoSize, reference: VideoSize = from): T {
  const scale = reframeScale(from, to, reference)
  const width = bounds.width * scale
  const height = bounds.height * scale
  const centerX = (bounds.x + bounds.width / 2) / from.width * to.width
  const centerY = (bounds.y + bounds.height / 2) / from.height * to.height
  return {
    ...bounds,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }
}

export function reframePoint<T extends { x: number; y: number }>(point: T, from: VideoSize, to: VideoSize): T {
  return { ...point, x: point.x / from.width * to.width, y: point.y / from.height * to.height }
}
