import { imageLocalPoint, imageWorldPoint, type CanvasPoint, type ImageBounds, type RotatedImageBounds } from './overlay-geometry'

/** The resize handle changes only the text box; font size remains a property control. */
export function resizedTextBox(
  initialBox: RotatedImageBounds,
  start: CanvasPoint,
  point: CanvasPoint,
  canvas: { width: number; height: number },
  minimum: { width: number; height: number },
): ImageBounds {
  const first = imageLocalPoint(initialBox, start)
  const current = imageLocalPoint(initialBox, point)
  const width = Math.min(Math.max(canvas.width, initialBox.width), Math.max(minimum.width, initialBox.width + current.x - first.x))
  const height = Math.min(Math.max(canvas.height, initialBox.height), Math.max(minimum.height, initialBox.height + current.y - first.y))
  return anchoredTextBox(initialBox, { width, height })
}

/** Keep the rotated upper-left corner fixed after browser font metrics change. */
export function anchoredTextBox(initialBox: RotatedImageBounds, nextSize: { width: number; height: number }): ImageBounds {
  const anchor = imageWorldPoint(initialBox, { x: -initialBox.width / 2, y: -initialBox.height / 2 })
  const radians = (initialBox.rotation || 0) * Math.PI / 180
  const halfX = (nextSize.width * Math.cos(radians) - nextSize.height * Math.sin(radians)) / 2
  const halfY = (nextSize.width * Math.sin(radians) + nextSize.height * Math.cos(radians)) / 2
  return { x: anchor.x + halfX - nextSize.width / 2, y: anchor.y + halfY - nextSize.height / 2, width: nextSize.width, height: nextSize.height }
}

/** Wrap at word boundaries, splitting a word only when it cannot fit on a line. */
export function wrapTextLines(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return ['']
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= maxWidth) { line = candidate; continue }
      if (line) { lines.push(line); line = '' }
      for (const character of Array.from(word)) {
        if (line && measure(line + character) > maxWidth) { lines.push(line); line = '' }
        line += character
      }
    }
    lines.push(line)
  }
  return lines
}
