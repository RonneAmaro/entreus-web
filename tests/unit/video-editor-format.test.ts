import { describe, expect, it } from 'vitest'
import { fitMediaFilter, projectCanvasSize, reframeBounds, reframePoint, reframeScale, VIDEO_ASPECT_PRESETS, type VideoAspectPreset } from '@/lib/video-editor/video-format'
import { buildMediaSequenceGraph } from '@/lib/video-editor/render-plan'

describe('formato do projeto', () => {
  it('seleciona os cinco formatos sem perder a dimensão original', () => {
    const original = { width: 160, height: 90 }
    expect(VIDEO_ASPECT_PRESETS.map(({ id }) => id)).toEqual(['original', '16:9', '9:16', '1:1', '4:3'])
    expect(projectCanvasSize('original', original)).toEqual(original)
    expect(projectCanvasSize('16:9', original)).toEqual({ width: 1280, height: 720 })
    expect(projectCanvasSize('9:16', original)).toEqual({ width: 720, height: 1280 })
    expect(projectCanvasSize('1:1', original)).toEqual({ width: 1080, height: 1080 })
    expect(projectCanvasSize('4:3', original)).toEqual({ width: 1280, height: 960 })
  })

  it('usa pad no Fit e crop central no Fill também no grafo da sequência', () => {
    const target = { width: 720, height: 1280 }
    expect(fitMediaFilter(target, 'fit')).toContain('force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2')
    expect(fitMediaFilter(target, 'fill')).toContain('force_original_aspect_ratio=increase,crop=720:1280:(iw-ow)/2:(ih-oh)/2')
    const clip = { id: 'base', type: 'video' as const, duration: 1, trimStart: 0, transition: 'none' as const, inputName: 'base.webm', inputIndex: 0, hasAudio: false }
    const graph = buildMediaSequenceGraph([clip], { ...target, frameMode: 'fill', visualFilter: 'null', videoVolume: 1 })
    expect(graph.videoFilters[0]).toContain(fitMediaFilter(target, 'fill'))
  })

  it('preserva o centro relativo e a proporção de uma camada ao mudar o quadro', () => {
    const from = { width: 160, height: 90 }
    const to = { width: 720, height: 1280 }
    const next = reframeBounds({ id: 'foto', x: 60, y: 30, width: 40, height: 20 }, from, to)
    expect(next.width / next.height).toBe(2)
    expect(next.x + next.width / 2).toBeCloseTo(360)
    expect(next.y + next.height / 2).toBeCloseTo(1280 * 40 / 90)
    expect(reframePoint({ x: 80, y: 45 }, from, to)).toEqual({ x: 360, y: 640 })
  })

  it.each([
    ['16:9', '1:1', '16:9'],
    ['16:9', '9:16', '16:9'],
    ['4:3', '9:16', '1:1', '4:3'],
    ['original', '1:1', '9:16', 'original'],
  ] as VideoAspectPreset[][])('retorna sem deriva após o ciclo %j', (...cycle) => {
    const original = { width: 160, height: 90 }
    const first = projectCanvasSize(cycle[0], original)
    const start = { x: first.width * 0.2, y: first.height * 0.3, width: first.width * 0.25, height: first.width * 0.125, rotation: 37, startTime: 0.4, endTime: 1.8, layerOrder: 3 }
    let current = start
    for (let repeat = 0; repeat < 10; repeat++) {
      for (let index = 1; index < cycle.length; index++) {
        current = reframeBounds(current, projectCanvasSize(cycle[index - 1], original), projectCanvasSize(cycle[index], original), original)
      }
    }
    // Floating point roundoff is far below one rendered pixel even after ten cycles.
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(current[key] - start[key])).toBeLessThan(1e-7)
    expect(current).toMatchObject({ rotation: 37, startTime: 0.4, endTime: 1.8, layerOrder: 3 })
  })

  it('preserva uma edição manual feita entre duas mudanças de formato', () => {
    const original = { width: 1280, height: 720 }
    const square = projectCanvasSize('1:1', original)
    const wide = projectCanvasSize('16:9', original)
    const edited = { x: 230, y: 260, width: 360, height: 180, rotation: -25 }
    const restored = reframeBounds(edited, square, wide, original)
    const roundTrip = reframeBounds(restored, wide, square, original)
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(roundTrip[key]).toBeCloseTo(edited[key], 7)
    expect(roundTrip.rotation).toBe(-25)
    expect(reframeScale(wide, square, original) * reframeScale(square, wide, original)).toBeCloseTo(1, 12)
  })
})
