import { describe, expect, it } from 'vitest'
import { nextVisibleLayerId, nudgeCanvasPosition, resolveEditorShortcut, seekByKeyboard } from '../../lib/video-editor/editor-shortcuts'

const key = (value: string, overrides: Partial<Parameters<typeof resolveEditorShortcut>[0]> = {}) => ({
  key: value, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides,
})

describe('atalhos contextuais do Studio', () => {
  it('resolve os comandos sem competir com campos, modificadores, modais e composição', () => {
    expect(resolveEditorShortcut(key(' '), 'studio', false, false)).toBe('play')
    expect(resolveEditorShortcut(key('s'), 'timeline', false, false)).toBe('split')
    expect(resolveEditorShortcut(key('Delete'), 'preview', false, false)).toBe('delete')
    expect(resolveEditorShortcut(key('?'), 'studio', false, true)).toBe('help')
    expect(resolveEditorShortcut(key('Escape'), 'timeline', false, true)).toBe('escape')
    expect(resolveEditorShortcut(key(' '), 'studio', true, false)).toBeNull()
    expect(resolveEditorShortcut(key('s', { isComposing: true }), 'studio', false, false)).toBeNull()
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(resolveEditorShortcut(key('Delete', { [modifier]: true }), 'timeline', false, false)).toBeNull()
    }
    expect(resolveEditorShortcut(key(' '), 'studio', false, true)).toBeNull()
  })

  it('separa setas de tempo, camadas e posição; ignora repetição no deslocamento', () => {
    expect(resolveEditorShortcut(key('ArrowRight'), 'timeline', false, false)).toBe('seek-forward')
    expect(resolveEditorShortcut(key('ArrowUp'), 'timeline', false, false)).toBe('layer-up')
    expect(resolveEditorShortcut(key('ArrowRight'), 'preview', false, false)).toBe('nudge-right')
    expect(resolveEditorShortcut(key('ArrowUp', { shiftKey: true }), 'preview', false, false)).toBe('nudge-up')
    expect(resolveEditorShortcut(key('ArrowRight', { repeat: true }), 'preview', false, false)).toBeNull()
    expect(resolveEditorShortcut(key('ArrowRight'), 'studio', false, false)).toBeNull()
  })

  it('limita tempo e posição em unidades do projeto', () => {
    expect(seekByKeyboard(0.2, 2, -1, false)).toBe(0.1)
    expect(seekByKeyboard(1.5, 2, 1, true)).toBe(2)
    expect(nudgeCanvasPosition(4, 160, -1, false)).toBe(3)
    expect(nudgeCanvasPosition(4, 160, 1, true)).toBe(14)
    expect(nudgeCanvasPosition(157, 160, 1, true)).toBe(160)
  })

  it('seleciona somente camadas visíveis, de modo determinístico na ordem fornecida', () => {
    const layers = [
      { id: 'photo', startTime: 0, endTime: 2 },
      { id: 'pip', startTime: 1, endTime: 3 },
      { id: 'text', startTime: 1, endTime: 2 },
    ]
    expect(nextVisibleLayerId(layers, null, 1.5, 1)).toBe('photo')
    expect(nextVisibleLayerId(layers, 'photo', 1.5, 1)).toBe('pip')
    expect(nextVisibleLayerId(layers, 'pip', 1.5, 1)).toBe('text')
    expect(nextVisibleLayerId(layers, 'text', 1.5, 1)).toBe('text')
    expect(nextVisibleLayerId(layers, null, 2.5, -1)).toBe('pip')
    expect(nextVisibleLayerId(layers, null, 4, 1)).toBeNull()
  })
})
