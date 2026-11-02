export type ImageBounds = { x: number; y: number; width: number; height: number }
export type CanvasPoint = { x: number; y: number }
export type RotatedImageBounds = ImageBounds & { rotation?: number }
export type ImageCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function imageCornerPoint(image: RotatedImageBounds, corner: ImageCorner): CanvasPoint {
  const x = corner.endsWith('right') ? image.width / 2 : -image.width / 2
  const y = corner.startsWith('bottom') ? image.height / 2 : -image.height / 2
  return imageWorldPoint(image, { x, y })
}

export function imageCenter(image: ImageBounds): CanvasPoint {
  return { x: image.x + image.width / 2, y: image.y + image.height / 2 }
}

export function imageLocalPoint(image: RotatedImageBounds, point: CanvasPoint): CanvasPoint {
  const center = imageCenter(image)
  const radians = ((image.rotation || 0) * Math.PI) / 180
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: dx * Math.cos(radians) + dy * Math.sin(radians), y: -dx * Math.sin(radians) + dy * Math.cos(radians) }
}

export function imageWorldPoint(image: RotatedImageBounds, local: CanvasPoint): CanvasPoint {
  const center = imageCenter(image)
  const radians = ((image.rotation || 0) * Math.PI) / 180
  return { x: center.x + local.x * Math.cos(radians) - local.y * Math.sin(radians), y: center.y + local.x * Math.sin(radians) + local.y * Math.cos(radians) }
}

export function pointInRotatedImage(image: RotatedImageBounds, point: CanvasPoint, padding = 0): boolean {
  const local = imageLocalPoint(image, point)
  return Math.abs(local.x) <= image.width / 2 + padding && Math.abs(local.y) <= image.height / 2 + padding
}

export function normalizeImageAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0
  const normalized = ((angle + 180) % 360 + 360) % 360 - 180
  return normalized === -180 ? 180 : normalized
}

export function rotatedImageAngle(initial: RotatedImageBounds, start: CanvasPoint, point: CanvasPoint): number {
  const center = imageCenter(initial)
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const currentAngle = Math.atan2(point.y - center.y, point.x - center.x)
  return normalizeImageAngle((initial.rotation || 0) + (currentAngle - startAngle) * 180 / Math.PI)
}

export function rotatedImageSize(image: RotatedImageBounds): { width: number; height: number } {
  const radians = ((image.rotation || 0) * Math.PI) / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  return { width: image.width * cosine + image.height * sine, height: image.width * sine + image.height * cosine }
}

/** Preserve the opposite, rotated corner while changing aspect-locked size. */
export function resizeRotatedImageFromBottomRight(
  initial: RotatedImageBounds,
  start: CanvasPoint,
  point: CanvasPoint,
  canvas: { width: number; height: number },
): ImageBounds {
  if (!initial.rotation) return resizeImageFromBottomRight(initial, start, point, canvas)
  const aspect = initial.width / initial.height
  if (!Number.isFinite(aspect) || aspect <= 0) return initial
  const startLocal = imageLocalPoint(initial, start)
  const currentLocal = imageLocalPoint(initial, point)
  const horizontalDelta = currentLocal.x - startLocal.x
  const verticalDeltaAsWidth = (currentLocal.y - startLocal.y) * aspect
  const delta = Math.abs(horizontalDelta) >= Math.abs(verticalDeltaAsWidth) ? horizontalDelta : verticalDeltaAsWidth
  const anchor = imageWorldPoint(initial, { x: -initial.width / 2, y: -initial.height / 2 })
  const radians = initial.rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const boxWidthPerWidth = Math.abs(cosine) + Math.abs(sine) / aspect
  const boxHeightPerWidth = Math.abs(sine) + Math.abs(cosine) / aspect
  // Keep the expanded box inside the project when it already fits. A layer
  // moved beyond the frame remains clipped by the frame, as in the preview.
  const maximum = Math.max(initial.width, Math.min(canvas.width / boxWidthPerWidth, canvas.height / boxHeightPerWidth))
  const width = Math.max(Math.min(32, maximum), Math.min(maximum, initial.width + delta))
  const height = width / aspect
  const center = { x: anchor.x + (width * cosine - height * sine) / 2, y: anchor.y + (width * sine + height * cosine) / 2 }
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

/** Resize from any corner while keeping the opposite corner fixed and the aspect ratio intact. */
export function resizeRotatedImageFromCorner(
  initial: RotatedImageBounds,
  corner: ImageCorner,
  start: CanvasPoint,
  point: CanvasPoint,
  canvas: { width: number; height: number },
): ImageBounds {
  if (corner === 'bottom-right') return resizeRotatedImageFromBottomRight(initial, start, point, canvas)
  const aspect = initial.width / initial.height
  if (!Number.isFinite(aspect) || aspect <= 0) return initial
  const sx = corner.endsWith('right') ? 1 : -1
  const sy = corner.startsWith('bottom') ? 1 : -1
  const first = imageLocalPoint(initial, start)
  const current = imageLocalPoint(initial, point)
  const dx = sx * (current.x - first.x)
  const dy = sy * (current.y - first.y) * aspect
  const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy
  const anchor = imageWorldPoint(initial, { x: -sx * initial.width / 2, y: -sy * initial.height / 2 })
  const radians = ((initial.rotation || 0) * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const maximum = initial.rotation
    ? Math.max(initial.width, Math.min(canvas.width / (Math.abs(cosine) + Math.abs(sine) / aspect), canvas.height / (Math.abs(sine) + Math.abs(cosine) / aspect)))
    : Math.max(initial.width, Math.min(sx > 0 ? canvas.width - anchor.x : anchor.x, (sy > 0 ? canvas.height - anchor.y : anchor.y) * aspect))
  const width = Math.max(Math.min(32, maximum), Math.min(maximum, initial.width + delta))
  const height = width / aspect
  const center = {
    x: anchor.x + (sx * width * cosine - sy * height * sine) / 2,
    y: anchor.y + (sx * width * sine + sy * height * cosine) / 2,
  }
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

/** Keep the top-left corner fixed while resizing from the opposite corner. */
export function resizeImageFromBottomRight(
  initial: ImageBounds,
  start: CanvasPoint,
  point: CanvasPoint,
  canvas: { width: number; height: number },
): ImageBounds {
  const aspect = initial.width / initial.height
  if (!Number.isFinite(aspect) || aspect <= 0) return initial

  const horizontalDelta = point.x - start.x
  const verticalDeltaAsWidth = (point.y - start.y) * aspect
  const delta = Math.abs(horizontalDelta) >= Math.abs(verticalDeltaAsWidth)
    ? horizontalDelta
    : verticalDeltaAsWidth
  const availableWidth = Math.max(2, Math.min(canvas.width - initial.x, (canvas.height - initial.y) * aspect))
  const minimumWidth = Math.min(32, availableWidth)
  const width = Math.min(availableWidth, Math.max(minimumWidth, initial.width + delta))

  return { x: initial.x, y: initial.y, width, height: width / aspect }
}
