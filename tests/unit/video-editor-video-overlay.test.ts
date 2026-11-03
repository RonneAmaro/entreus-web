import { describe, expect, it } from 'vitest'
import { imageCenter, imageWorldPoint, normalizeImageAngle, resizeRotatedImageFromBottomRight, rotatedImageSize } from '@/lib/video-editor/overlay-geometry'
import { retimeVideoOverlay, videoOverlaySourceTime } from '@/lib/video-editor/video-overlay'

const timing = { startTime: 1, endTime: 3, trimStart: 0.5, trimEnd: 2.5, sourceDuration: 4 }

describe('vídeo sobreposto temporizado', () => {
  it('mapeia seek para o trecho de origem e desaparece fora da janela', () => {
    expect(videoOverlaySourceTime(timing, 0.99)).toBeNull()
    expect(videoOverlaySourceTime(timing, 1)).toBe(0.5)
    expect(videoOverlaySourceTime(timing, 2)).toBe(1.5)
    expect(videoOverlaySourceTime(timing, 3)).toBeNull()
    expect(videoOverlaySourceTime({ ...timing, startTime: NaN }, 2)).toBeNull()
  })

  it('move sem alterar trim e ajusta os cortes mantendo a correspondência temporal', () => {
    const moved = retimeVideoOverlay(timing, 'move', 2, 4)
    expect(moved).toEqual({ ...timing, startTime: 2, endTime: 4 })
    expect(retimeVideoOverlay(timing, 'trim-start', 1.5, 3)).toMatchObject({ startTime: 1.5, endTime: 3, trimStart: 1, trimEnd: 2.5 })
    expect(retimeVideoOverlay(timing, 'trim-end', 1, 2)).toMatchObject({ startTime: 1, endTime: 2, trimStart: 0.5, trimEnd: 1.5 })
    expect(retimeVideoOverlay(timing, 'trim-end', 1, 8)).toMatchObject({ endTime: 4.5, trimEnd: 4 })
    expect(retimeVideoOverlay(timing, 'move', NaN, 4)).toBe(timing)
    expect(retimeVideoOverlay(timing, 'trim-end', 1, 1.1)).toBe(timing)
  })

  it('reutiliza centro, rotação e redimensionamento proporcional das imagens', () => {
    const video = { x: 40, y: 20, width: 40, height: 20, rotation: 45 }
    expect(imageCenter(video)).toEqual({ x: 60, y: 30 })
    expect(normalizeImageAngle(-405)).toBe(-45)
    expect(rotatedImageSize(video).width).toBeCloseTo(42.426, 2)
    const corner = imageWorldPoint(video, { x: 20, y: 10 })
    const next = resizeRotatedImageFromBottomRight(video, corner, { x: corner.x + 10, y: corner.y + 10 }, { width: 160, height: 90 })
    expect(next.width).toBeGreaterThan(video.width)
    expect(next.width / next.height).toBeCloseTo(2)
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.y).toBeGreaterThanOrEqual(0)
  })
})
