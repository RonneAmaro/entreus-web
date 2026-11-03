export type VisualLayerType = 'video' | 'image' | 'sticker' | 'text'
export type VisualLayer = { id: string; type: VisualLayerType; startTime: number; endTime: number }

const defaultRank: Record<VisualLayerType, number> = { video: 0, image: 1, sticker: 2, text: 3 }

export function orderVisualLayers<T extends VisualLayer>(layers: T[], savedOrder: string[]): T[] {
  const positions = new Map(savedOrder.map((id, index) => [id, index]))
  return layers.map((layer, index) => ({ layer, index })).sort((a, b) => {
    const aPosition = positions.get(a.layer.id)
    const bPosition = positions.get(b.layer.id)
    if (aPosition !== undefined && bPosition !== undefined) return aPosition - bPosition || a.index - b.index
    if (aPosition !== undefined) return -1
    if (bPosition !== undefined) return 1
    return defaultRank[a.layer.type] - defaultRank[b.layer.type] || a.index - b.index
  }).map(({ layer }) => layer)
}

export function moveVisualLayer<T extends VisualLayer>(layers: T[], savedOrder: string[], id: string, direction: 'front' | 'back' | 'top' | 'bottom'): string[] {
  const ids = orderVisualLayers(layers, savedOrder).map((layer) => layer.id)
  const source = ids.indexOf(id)
  if (source < 0) return ids
  const target = direction === 'top' ? ids.length - 1 : direction === 'bottom' ? 0 : source + (direction === 'front' ? 1 : -1)
  if (target < 0 || target >= ids.length || source === target) return ids
  ids.splice(source, 1)
  ids.splice(target, 0, id)
  return ids
}

export function snapLayerTime(value: number, points: number[], pixelsPerSecond: number, tolerancePx = 8): number {
  if (!Number.isFinite(value) || pixelsPerSecond <= 0) return value
  let best = value
  let distance = tolerancePx / pixelsPerSecond
  for (const point of points) {
    const nextDistance = Math.abs(value - point)
    if (Number.isFinite(point) && nextDistance <= distance) {
      best = point
      distance = nextDistance
    }
  }
  return best
}

export function alignmentGuides(bounds: { x: number; y: number; width: number; height: number }, canvas: { width: number; height: number }, tolerance: number) {
  const xTargets = [0, canvas.width / 2, canvas.width]
  const yTargets = [0, canvas.height / 2, canvas.height]
  const xEdges = [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]
  const yEdges = [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height]
  return {
    x: xTargets.find((target) => xEdges.some((edge) => Math.abs(edge - target) <= tolerance)) ?? null,
    y: yTargets.find((target) => yEdges.some((edge) => Math.abs(edge - target) <= tolerance)) ?? null,
  }
}
