export function insertAtSelection(value: string, insertion: string, start: number, end: number, maxLength = Infinity) {
  const safeStart = Math.max(0, Math.min(value.length, start))
  const safeEnd = Math.max(safeStart, Math.min(value.length, end))
  const nextValue = `${value.slice(0, safeStart)}${insertion}${value.slice(safeEnd)}`.slice(0, maxLength)
  const cursor = Math.min(nextValue.length, safeStart + insertion.length)
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor }
}
