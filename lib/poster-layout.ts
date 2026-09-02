export type PaperKey = 'a4' | 'a3' | 'letter'
export type Orientation = 'portrait' | 'landscape'
export type UnitKey = 'mm' | 'cm' | 'm'

export const PAPER_SIZES_MM: Record<PaperKey, { label: string; width: number; height: number }> = {
  a4: { label: 'A4', width: 210, height: 297 },
  a3: { label: 'A3', width: 297, height: 420 },
  letter: { label: 'Letter', width: 215.9, height: 279.4 },
}

export function unitToMm(value: number, unit: UnitKey) {
  if (unit === 'cm') return value * 10
  if (unit === 'm') return value * 1000
  return value
}

export function mmToUnit(valueMm: number, unit: UnitKey) {
  if (unit === 'cm') return valueMm / 10
  if (unit === 'm') return valueMm / 1000
  return valueMm
}

export function getUnitInputStep(unit: UnitKey) {
  if (unit === 'm') return 0.01
  if (unit === 'cm') return 0.1
  return 1
}

export function getPaperSize(paper: PaperKey, orientation: Orientation) {
  const base = PAPER_SIZES_MM[paper]

  return orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : { width: base.width, height: base.height }
}

export type PosterLayoutInput = {
  paperWidthMm: number
  paperHeightMm: number
  marginMm: number
  overlapMm: number
  columns: number
  rows: number
}

export type PosterLayout = {
  printableWidthMm: number
  printableHeightMm: number
  posterWidthMm: number
  posterHeightMm: number
  pageCount: number
  horizontalStepMm: number
  verticalStepMm: number
}

export function calculatePosterLayout(input: PosterLayoutInput): PosterLayout | null {
  const columns = Math.floor(input.columns)
  const rows = Math.floor(input.rows)
  const printableWidthMm = input.paperWidthMm - input.marginMm * 2
  const printableHeightMm = input.paperHeightMm - input.marginMm * 2

  if (
    !Number.isFinite(printableWidthMm) ||
    !Number.isFinite(printableHeightMm) ||
    columns < 1 ||
    rows < 1 ||
    printableWidthMm <= 0 ||
    printableHeightMm <= 0 ||
    input.overlapMm < 0 ||
    input.overlapMm >= printableWidthMm ||
    input.overlapMm >= printableHeightMm
  ) {
    return null
  }

  const horizontalStepMm = printableWidthMm - input.overlapMm
  const verticalStepMm = printableHeightMm - input.overlapMm

  return {
    printableWidthMm,
    printableHeightMm,
    posterWidthMm: columns * printableWidthMm - (columns - 1) * input.overlapMm,
    posterHeightMm: rows * printableHeightMm - (rows - 1) * input.overlapMm,
    pageCount: columns * rows,
    horizontalStepMm,
    verticalStepMm,
  }
}

export type AutomaticPosterGridInput = Omit<PosterLayoutInput, 'columns' | 'rows'> & {
  targetWidthMm: number
  targetHeightMm: number
  sourceAspectRatio?: number
  maxColumns?: number
  maxRows?: number
}

export type AutomaticPosterGridResult =
  | {
      ok: true
      columns: number
      rows: number
      layout: PosterLayout
      artworkWidthMm: number
      artworkHeightMm: number
    }
  | {
      ok: false
      reason: 'invalid_target' | 'invalid_printable_area' | 'target_smaller_than_page'
    }

function containArtwork(widthMm: number, heightMm: number, aspectRatio: number) {
  const canvasRatio = widthMm / heightMm

  return canvasRatio > aspectRatio
    ? { widthMm: heightMm * aspectRatio, heightMm }
    : { widthMm, heightMm: widthMm / aspectRatio }
}

export function calculateAutomaticPosterGrid(input: AutomaticPosterGridInput): AutomaticPosterGridResult {
  if (
    !Number.isFinite(input.targetWidthMm) ||
    !Number.isFinite(input.targetHeightMm) ||
    input.targetWidthMm <= 0 ||
    input.targetHeightMm <= 0
  ) {
    return { ok: false, reason: 'invalid_target' }
  }

  const singlePage = calculatePosterLayout({ ...input, columns: 1, rows: 1 })
  if (!singlePage) return { ok: false, reason: 'invalid_printable_area' }

  if (
    singlePage.posterWidthMm > input.targetWidthMm ||
    singlePage.posterHeightMm > input.targetHeightMm
  ) {
    return { ok: false, reason: 'target_smaller_than_page' }
  }

  const sourceAspectRatio = input.sourceAspectRatio && input.sourceAspectRatio > 0
    ? input.sourceAspectRatio
    : input.targetWidthMm / input.targetHeightMm
  const maxColumns = Math.max(1, Math.floor(input.maxColumns || 10))
  const maxRows = Math.max(1, Math.floor(input.maxRows || 10))
  let best: Extract<AutomaticPosterGridResult, { ok: true }> | null = null

  for (let columns = 1; columns <= maxColumns; columns++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      const layout = calculatePosterLayout({ ...input, columns, rows })
      if (!layout || layout.posterWidthMm > input.targetWidthMm || layout.posterHeightMm > input.targetHeightMm) continue

      const artwork = containArtwork(layout.posterWidthMm, layout.posterHeightMm, sourceAspectRatio)
      const candidate = {
        ok: true as const,
        columns,
        rows,
        layout,
        artworkWidthMm: artwork.widthMm,
        artworkHeightMm: artwork.heightMm,
      }

      if (!best) {
        best = candidate
        continue
      }

      const candidateArea = layout.posterWidthMm * layout.posterHeightMm
      const bestArea = best.layout.posterWidthMm * best.layout.posterHeightMm
      const candidateRatioDistance = Math.abs(Math.log((layout.posterWidthMm / layout.posterHeightMm) / sourceAspectRatio))
      const bestRatioDistance = Math.abs(Math.log((best.layout.posterWidthMm / best.layout.posterHeightMm) / sourceAspectRatio))

      if (
        candidateArea > bestArea + 0.01 ||
        (Math.abs(candidateArea - bestArea) <= 0.01 && candidateRatioDistance < bestRatioDistance - 0.0001) ||
        (Math.abs(candidateArea - bestArea) <= 0.01 && Math.abs(candidateRatioDistance - bestRatioDistance) <= 0.0001 && candidate.layout.pageCount < best.layout.pageCount)
      ) {
        best = candidate
      }
    }
  }

  return best || { ok: false, reason: 'target_smaller_than_page' }
}
