import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  calculateAutomaticPosterGrid,
  calculatePosterLayout,
  getPaperSize,
  mmToUnit,
  unitToMm,
} from '@/lib/poster-layout'

describe('poster layout calculations', () => {
  it('converts centimetres and metres to millimetres', () => {
    expect(unitToMm(25, 'cm')).toBe(250)
    expect(unitToMm(1.25, 'm')).toBe(1250)
    expect(mmToUnit(1250, 'm')).toBe(1.25)
    expect(mmToUnit(250, 'cm')).toBe(25)
  })

  it('calculates printable area, overlap steps and final mosaic size', () => {
    expect(calculatePosterLayout({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 10,
      overlapMm: 5,
      columns: 3,
      rows: 2,
    })).toEqual({
      printableWidthMm: 190,
      printableHeightMm: 277,
      posterWidthMm: 560,
      posterHeightMm: 549,
      pageCount: 6,
      horizontalStepMm: 185,
      verticalStepMm: 272,
    })
  })

  it('uses the selected orientation when calculating the printable area', () => {
    expect(getPaperSize('a4', 'landscape')).toEqual({ width: 297, height: 210 })
  })

  it('covers a 100 by 50 cm target with A4 portrait sheets', () => {
    const result = calculateAutomaticPosterGrid({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 8,
      overlapMm: 0,
      targetWidthMm: 1000,
      targetHeightMm: 500,
      sourceAspectRatio: 2,
    })

    expect(result).toMatchObject({ ok: true, columns: 6, rows: 2 })
    if (result.ok) {
      expect(result.layout.posterWidthMm).toBe(1164)
      expect(result.layout.posterHeightMm).toBe(562)
      expect(result.targetWidthMm).toBe(1000)
      expect(result.targetHeightMm).toBe(500)
      expect(result.trimWidthMm).toBe(164)
      expect(result.trimHeightMm).toBe(62)
    }
  })

  it('covers a 100 by 50 cm target with A4 landscape sheets', () => {
    const result = calculateAutomaticPosterGrid({
      paperWidthMm: 297,
      paperHeightMm: 210,
      marginMm: 8,
      overlapMm: 0,
      targetWidthMm: 1000,
      targetHeightMm: 500,
    })

    expect(result).toMatchObject({ ok: true, columns: 4, rows: 3 })
    if (result.ok) {
      expect(result.layout.posterWidthMm).toBe(1124)
      expect(result.layout.posterHeightMm).toBe(582)
      expect(result.trimWidthMm).toBe(124)
      expect(result.trimHeightMm).toBe(82)
    }
  })

  it('recalculates the covering grid when margin or overlap changes', () => {
    const withMargin = calculateAutomaticPosterGrid({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 30,
      overlapMm: 0,
      targetWidthMm: 1000,
      targetHeightMm: 600,
    })
    const withOverlap = calculateAutomaticPosterGrid({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 8,
      overlapMm: 20,
      targetWidthMm: 1100,
      targetHeightMm: 300,
    })

    expect(withMargin).toMatchObject({ ok: true, columns: 7, rows: 3 })
    expect(withOverlap).toMatchObject({ ok: true, columns: 7, rows: 2 })
  })

  it('keeps the source artwork proportion while fitting it in the automatic grid', () => {
    const result = calculateAutomaticPosterGrid({
      paperWidthMm: 297,
      paperHeightMm: 210,
      marginMm: 8,
      overlapMm: 5,
      targetWidthMm: 1000,
      targetHeightMm: 500,
      sourceAspectRatio: 16 / 9,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.artworkWidthMm / result.artworkHeightMm).toBeCloseTo(16 / 9, 8)
    }
  })

  it('uses one sheet and exposes both partial directions when the target is smaller than a sheet', () => {
    const result = calculateAutomaticPosterGrid({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 8,
      overlapMm: 0,
      targetWidthMm: 100,
      targetHeightMm: 100,
    })

    expect(result).toMatchObject({ ok: true, columns: 1, rows: 1, trimWidthMm: 94, trimHeightMm: 181 })
  })

  it('returns friendly invalid states instead of producing a broken grid', () => {
    expect(calculateAutomaticPosterGrid({
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 8,
      overlapMm: 0,
      targetWidthMm: 0,
      targetHeightMm: 500,
    })).toEqual({ ok: false, reason: 'invalid_target' })

  })
})

describe('poster page integration', () => {
  const source = readFileSync('app/lab/poster/page.tsx', 'utf8')

  it('renders the grid over the image and ties it to the effective grid dimensions', () => {
    expect(source).toContain('data-testid="poster-grid-overlay"')
    expect(source).toContain('data-testid="poster-artwork-bleed"')
    expect(source).toContain('gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`')
    expect(source).toContain('gridTemplateRows: `repeat(${effectiveRows}, minmax(0, 1fr))`')
    expect(source).toContain('previewOverlapX')
    expect(source).toContain('data-testid="poster-final-boundary"')
    expect(source).toContain('data-testid="poster-trim-right"')
    expect(source).toContain('data-testid="poster-trim-bottom"')
    expect(source).toContain('Área de recorte')
  })

  it('supports automatic calculation and returning to manual columns and rows', () => {
    expect(source).toContain("setCalculationMode('automatic')")
    expect(source).toContain("setCalculationMode('manual')")
    expect(source).toContain("disabled={calculationMode === 'automatic'}")
    expect(source).toContain('calculateAutomaticPosterGrid')
  })

  it('uses the full physical coverage as PDF bleed while retaining overlap-aware crop steps', () => {
    expect(source).toContain('? posterWidth')
    expect(source).toContain('? posterHeight')
    expect(source).toContain('const posterPixelWidth = Math.round(pdfCanvasWidth * pxPerMm)')
    expect(source).toContain('const posterPixelHeight = Math.round(pdfCanvasHeight * pxPerMm)')
    expect(source).toContain('column * (pagePixelWidth - overlapPixels)')
    expect(source).toContain('row * (pagePixelHeight - overlapPixels)')
    expect(source).toContain('pageCanvas.width = pagePixelWidth')
    expect(source).toContain('pageContext.fillRect(0, 0, pagePixelWidth, pagePixelHeight)')
  })
})
