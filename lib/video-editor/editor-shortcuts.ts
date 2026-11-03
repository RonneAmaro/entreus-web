export type EditorShortcut = 'play' | 'split' | 'delete' | 'seek-back' | 'seek-forward' | 'layer-up' | 'layer-down' | 'nudge-left' | 'nudge-right' | 'nudge-up' | 'nudge-down' | 'escape' | 'help' | null
export type ShortcutContext = 'timeline' | 'preview' | 'studio'

export function resolveEditorShortcut(event: {
  key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
  isComposing?: boolean; repeat?: boolean;
}, context: ShortcutContext, blocked: boolean, controlFocused: boolean): EditorShortcut {
  if (blocked || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.key === '?' || (event.shiftKey && event.key === '/')) return 'help'
  if (event.key === 'Escape') return 'escape'
  if (controlFocused) return null
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete'
  if (event.key.toLowerCase() === 's' && !event.shiftKey) return 'split'
  if (event.key === ' ' && !event.shiftKey) return 'play'
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (context === 'preview') return event.repeat ? null : event.key === 'ArrowLeft' ? 'nudge-left' : 'nudge-right'
    if (context === 'timeline') return event.key === 'ArrowLeft' ? 'seek-back' : 'seek-forward'
  }
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && context === 'timeline') return event.key === 'ArrowUp' ? 'layer-up' : 'layer-down'
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && context === 'preview' && !event.repeat) return event.key === 'ArrowUp' ? 'nudge-up' : 'nudge-down'
  return null
}

export function seekByKeyboard(time: number, duration: number, direction: -1 | 1, shift: boolean): number {
  return Math.min(duration, Math.max(0, Math.round((time + direction * (shift ? 1 : 0.1)) * 10) / 10))
}

export function nudgeCanvasPosition(value: number, limit: number, direction: -1 | 1, shift: boolean): number {
  return Math.min(limit, Math.max(0, value + direction * (shift ? 10 : 1)))
}

export function nextVisibleLayerId(layers: Array<{ id: string; startTime: number; endTime: number }>, selectedId: string | null, time: number, direction: -1 | 1): string | null {
  const visible = layers.filter((layer) => time >= layer.startTime && time <= layer.endTime)
  if (!visible.length) return null
  const index = visible.findIndex((layer) => layer.id === selectedId)
  return visible[Math.min(visible.length - 1, Math.max(0, index < 0 ? direction > 0 ? 0 : visible.length - 1 : index + direction))].id
}
