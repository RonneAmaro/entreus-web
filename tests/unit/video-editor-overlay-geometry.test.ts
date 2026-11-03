import { describe, expect, it } from 'vitest'
import { imageCenter, imageCornerPoint, imageLocalPoint, imageWorldPoint, normalizeImageAngle, pointInRotatedImage, resizeImageFromBottomRight, resizeRotatedImageFromBottomRight, resizeRotatedImageFromCorner, rotatedImageAngle, rotatedImageSize, type ImageCorner } from '@/lib/video-editor/overlay-geometry'

describe('resizeImageFromBottomRight', () => {
  const initial = { x: 20, y: 10, width: 80, height: 40 }
  const start = { x: 100, y: 50 }
  const canvas = { width: 160, height: 90 }

  it('preserva posição e proporção sem salto no início do gesto', () => {
    expect(resizeImageFromBottomRight(initial, start, start, canvas)).toEqual(initial)
    expect(resizeImageFromBottomRight(initial, start, { x: 120, y: 60 }, canvas)).toEqual({
      x: 20, y: 10, width: 100, height: 50,
    })
  })

  it('respeita as bordas e o tamanho mínimo do projeto', () => {
    expect(resizeImageFromBottomRight(initial, start, { x: 500, y: 300 }, canvas)).toEqual({
      x: 20, y: 10, width: 140, height: 70,
    })
    expect(resizeImageFromBottomRight(initial, start, { x: -100, y: -100 }, canvas)).toEqual({
      x: 20, y: 10, width: 32, height: 16,
    })
  })

  it('limita imagem vertical pela altura sem distorcer', () => {
    const portrait = resizeImageFromBottomRight(
      { x: 50, y: 10, width: 30, height: 60 },
      { x: 80, y: 70 },
      { x: 130, y: 170 },
      canvas,
    )
    expect(portrait).toEqual({ x: 50, y: 10, width: 40, height: 80 })
  })
})

describe('rotated image geometry', () => {
  const image = { x: 40, y: 20, width: 40, height: 20, rotation: 90 }

  it('keeps the center and maps image corners consistently', () => {
    expect(imageCenter(image)).toEqual({ x: 60, y: 30 })
    expect(imageWorldPoint(image, { x: 20, y: 10 })).toEqual({ x: 50, y: 50 })
    const local = imageLocalPoint(image, { x: 50, y: 50 })
    expect(local.x).toBeCloseTo(20)
    expect(local.y).toBeCloseTo(10)
    expect(pointInRotatedImage(image, { x: 60, y: 48 })).toBe(true)
    expect(pointInRotatedImage(image, { x: 78, y: 30 })).toBe(false)
    expect(rotatedImageSize(image).width).toBeCloseTo(20)
    expect(rotatedImageSize(image).height).toBeCloseTo(40)
  })

  it('normalizes angles across zero and 360 degrees', () => {
    expect(normalizeImageAngle(405)).toBe(45)
    expect(normalizeImageAngle(-405)).toBe(-45)
    const initial = { x: 40, y: 20, width: 40, height: 20, rotation: 170 }
    expect(rotatedImageAngle(initial, { x: 80, y: 30 }, { x: 60, y: 50 })).toBe(-100)
  })

  it('resizes a rotated image without moving its opposite corner or changing its angle', () => {
    const initial = { x: 40, y: 20, width: 40, height: 20, rotation: 45 }
    const anchor = imageWorldPoint(initial, { x: -20, y: -10 })
    const start = imageWorldPoint(initial, { x: 20, y: 10 })
    expect(resizeRotatedImageFromBottomRight(initial, start, start, { width: 160, height: 90 })).toEqual({ x: 40, y: 20, width: 40, height: 20 })
    const next = resizeRotatedImageFromBottomRight(initial, start, { x: start.x + 12, y: start.y + 12 }, { width: 160, height: 90 })
    expect(next.width).toBeGreaterThan(40)
    expect(next.width / next.height).toBeCloseTo(2)
    const nextAnchor = imageWorldPoint({ ...next, rotation: 45 }, { x: -next.width / 2, y: -next.height / 2 })
    expect(nextAnchor.x).toBeCloseTo(anchor.x)
    expect(nextAnchor.y).toBeCloseTo(anchor.y)
  })
})

describe('four corner image resize', () => {
  const canvas = { width: 160, height: 90 }
  const corners: ImageCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

  for (const rotation of [0, 45, -45]) {
    for (const corner of corners) {
      it(`keeps the opposite corner fixed for ${corner} at ${rotation} degrees`, () => {
        const initial = { x: 50, y: 25, width: 40, height: 20, rotation }
        const start = imageCornerPoint(initial, corner)
        const opposite = corners.find((item) => item !== corner && item.startsWith('top') !== corner.startsWith('top') && item.endsWith('left') !== corner.endsWith('left'))!
        const anchor = imageCornerPoint(initial, opposite)
        const next = resizeRotatedImageFromCorner(initial, corner, start, {
          x: start.x + (start.x - anchor.x) * 0.25,
          y: start.y + (start.y - anchor.y) * 0.25,
        }, canvas)
        expect(next.width).toBeGreaterThan(initial.width)
        expect(next.width / next.height).toBeCloseTo(2)
        const fixed = imageCornerPoint({ ...next, rotation }, opposite)
        expect(fixed.x).toBeCloseTo(anchor.x)
        expect(fixed.y).toBeCloseTo(anchor.y)
        const unchanged = resizeRotatedImageFromCorner(initial, corner, start, start, canvas)
        expect(unchanged.x).toBeCloseTo(initial.x)
        expect(unchanged.y).toBeCloseTo(initial.y)
        expect(unchanged.width).toBeCloseTo(initial.width)
        expect(unchanged.height).toBeCloseTo(initial.height)
      })
    }
  }
})
