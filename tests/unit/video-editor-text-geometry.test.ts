import { describe, expect, it } from 'vitest'
import { imageWorldPoint, rotatedImageAngle } from '@/lib/video-editor/overlay-geometry'
import { resizedTextBox, wrapTextLines } from '@/lib/video-editor/text-geometry'

describe('text transform geometry', () => {
  for (const angle of [0, 45, 90, -45, 180]) {
    it(`keeps the rotated upper-left corner fixed while resizing at ${angle} degrees`, () => {
      const initial = { x: 25, y: 15, width: 60, height: 32, rotation: angle }
      const start = imageWorldPoint(initial, { x: 30, y: 16 })
      const finish = imageWorldPoint(initial, { x: 45, y: 20 })
      const next = resizedTextBox(initial, start, finish, { width: 160, height: 90 }, { width: 40, height: 28 })
      expect(next.width).toBeCloseTo(75)
      expect(next.height).toBeCloseTo(36)
      const firstAnchor = imageWorldPoint(initial, { x: -30, y: -16 })
      const nextAnchor = imageWorldPoint({ ...next, rotation: angle }, { x: -next.width / 2, y: -next.height / 2 })
      expect(nextAnchor.x).toBeCloseTo(firstAnchor.x)
      expect(nextAnchor.y).toBeCloseTo(firstAnchor.y)
    })
  }

  it('turns the handle in both directions around the text center', () => {
    const box = { x: 30, y: 20, width: 60, height: 30, rotation: 0 }
    const start = { x: 60, y: 5 }
    expect(rotatedImageAngle(box, start, { x: 75, y: 20 })).toBe(45)
    expect(rotatedImageAngle(box, start, { x: 45, y: 20 })).toBe(-45)
  })

  it('bounds width and height independently', () => {
    const box = { x: 0, y: 0, width: 50, height: 30, rotation: 0 }
    const start = { x: 50, y: 30 }
    expect(resizedTextBox(box, start, { x: -100, y: -100 }, { width: 160, height: 90 }, { width: 40, height: 28 })).toMatchObject({ width: 40, height: 28 })
    expect(resizedTextBox(box, start, { x: 200, y: 200 }, { width: 160, height: 90 }, { width: 40, height: 28 })).toMatchObject({ width: 160, height: 90 })
  })

  it('wraps words, explicit newlines and long words deterministically', () => {
    const measure = (value: string) => value.length * 10
    expect(wrapTextLines('um dois três', 45, measure)).toEqual(['um', 'dois', 'três'])
    expect(wrapTextLines('abcde\nfim', 30, measure)).toEqual(['abc', 'de', 'fim'])
    expect(wrapTextLines('linha\n\nfinal', 80, measure)).toEqual(['linha', '', 'final'])
  })
})
