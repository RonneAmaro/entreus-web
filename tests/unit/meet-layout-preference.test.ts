import { describe, expect, it, vi } from 'vitest'
import {
  MEET_LAYOUT_STORAGE_KEY,
  normalizeMeetLayoutMode,
  readMeetLayoutMode,
  resolveMeetLayoutMode,
  writeMeetLayoutMode,
} from '@/lib/meet/layout-preference'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(MEET_LAYOUT_STORAGE_KEY, initial)
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

describe('Meet local layout preference', () => {
  it('defaults missing, invalid and unavailable storage safely to automatic', () => {
    expect(normalizeMeetLayoutMode(undefined)).toBe('auto')
    expect(normalizeMeetLayoutMode('unknown')).toBe('auto')
    expect(readMeetLayoutMode(null)).toBe('auto')
    expect(readMeetLayoutMode(memoryStorage('invalid'))).toBe('auto')
    expect(readMeetLayoutMode({ getItem: () => { throw new Error('blocked') } })).toBe('auto')
  })

  it.each(['auto', 'grid', 'focus', 'presentation'] as const)(
    'persists and restores the %s layout locally',
    (mode) => {
      const storage = memoryStorage()
      expect(writeMeetLayoutMode(storage, mode)).toBe(true)
      expect(storage.setItem).toHaveBeenCalledWith(MEET_LAYOUT_STORAGE_KEY, mode)
      expect(readMeetLayoutMode(storage)).toBe(mode)
    },
  )

  it('keeps participant devices independent and performs no shared mutation', () => {
    const participantA = memoryStorage()
    const participantB = memoryStorage()
    writeMeetLayoutMode(participantA, 'focus')
    expect(readMeetLayoutMode(participantA)).toBe('focus')
    expect(readMeetLayoutMode(participantB)).toBe('auto')
    expect(participantB.setItem).not.toHaveBeenCalled()
  })

  it('prioritizes screen share automatically and safely falls back from presentation', () => {
    expect(resolveMeetLayoutMode('auto', false)).toBe('grid')
    expect(resolveMeetLayoutMode('auto', true)).toBe('presentation')
    expect(resolveMeetLayoutMode('presentation', true)).toBe('presentation')
    expect(resolveMeetLayoutMode('presentation', false)).toBe('grid')
  })

  it('fails locally without throwing when persistence is unavailable', () => {
    expect(writeMeetLayoutMode({ setItem: () => { throw new Error('blocked') } }, 'grid'))
      .toBe(false)
  })
})
