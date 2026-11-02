import { describe, expect, it } from 'vitest'
import { alignmentGuides, moveVisualLayer, orderVisualLayers, snapLayerTime, type VisualLayer } from '@/lib/video-editor/visual-layers'

const layers: VisualLayer[] = [
  { id: 'pip', type: 'video', startTime: 1, endTime: 3 },
  { id: 'photo', type: 'image', startTime: 2, endTime: 5 },
  { id: 'text', type: 'text', startTime: 2, endTime: 4 },
]

describe('camadas visuais do Studio', () => {
  it('preserva ordem legada e desempata IDs em ordem estável', () => {
    expect(orderVisualLayers(layers, []).map((layer) => layer.id)).toEqual(['pip', 'photo', 'text'])
    expect(orderVisualLayers(layers, ['text', 'pip', 'photo']).map((layer) => layer.id)).toEqual(['text', 'pip', 'photo'])
    expect(orderVisualLayers([...layers, { ...layers[1], id: 'photo-2' }], []).map((layer) => layer.id)).toEqual(['pip', 'photo', 'photo-2', 'text'])
  })

  it('move uma camada um nível ou até as extremidades sem alterar os clipes', () => {
    expect(moveVisualLayer(layers, [], 'photo', 'front')).toEqual(['pip', 'text', 'photo'])
    expect(moveVisualLayer(layers, [], 'photo', 'back')).toEqual(['photo', 'pip', 'text'])
    expect(moveVisualLayer(layers, [], 'pip', 'top')).toEqual(['photo', 'text', 'pip'])
    expect(moveVisualLayer(layers, [], 'text', 'bottom')).toEqual(['text', 'pip', 'photo'])
    expect(layers[0].startTime).toBe(1)
  })

  it('encaixa pela escala em pixels, incluindo começo, fim e bordas alheias', () => {
    expect(snapLayerTime(1.08, [0, 1, 5, 10], 60)).toBe(1)
    expect(snapLayerTime(1.08, [0, 1, 5, 10], 120)).toBe(1.08)
    expect(snapLayerTime(9.95, [0, 1, 5, 10], 60)).toBe(10)
  })

  it('mostra guias nos centros e nas bordas sem deslocar o elemento', () => {
    expect(alignmentGuides({ x: 40, y: 25, width: 20, height: 50 }, { width: 100, height: 100 }, 2)).toEqual({ x: 50, y: 50 })
    expect(alignmentGuides({ x: 1, y: 79, width: 20, height: 20 }, { width: 100, height: 100 }, 2)).toEqual({ x: 0, y: 100 })
  })
})
