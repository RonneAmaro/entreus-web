import { describe, expect, it, vi } from 'vitest'
import {
  MEET_CAPTIONS_STORAGE_KEY,
  isMeetCaptionModeEnabled,
  normalizeMeetCaptionMode,
  readMeetCaptionMode,
  resolveMeetCaptionState,
  writeMeetCaptionMode,
} from '@/lib/meet/caption-preference'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(MEET_CAPTIONS_STORAGE_KEY, initial)
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

describe('Meet personal caption preference', () => {
  it('defaults missing, invalid and unavailable storage safely to off', () => {
    expect(normalizeMeetCaptionMode(undefined)).toBe('off')
    expect(normalizeMeetCaptionMode('true')).toBe('off')
    expect(normalizeMeetCaptionMode('pt-BR')).toBe('off')
    expect(readMeetCaptionMode(null)).toBe('off')
    expect(readMeetCaptionMode(memoryStorage('invalid'))).toBe('off')
    expect(readMeetCaptionMode({ getItem: () => { throw new Error('blocked') } })).toBe('off')
  })

  it('persists the original-language mode locally and restores it', () => {
    const storage = memoryStorage()
    expect(writeMeetCaptionMode(storage, 'original')).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(MEET_CAPTIONS_STORAGE_KEY, 'original')
    expect(readMeetCaptionMode(storage)).toBe('original')
    expect(isMeetCaptionModeEnabled('original')).toBe(true)
    expect(isMeetCaptionModeEnabled('off')).toBe(false)
  })

  it('distinguishes requested but unavailable captions from genuinely active captions', () => {
    expect(resolveMeetCaptionState('off', false)).toBe('off')
    expect(resolveMeetCaptionState('original', false)).toBe('unavailable')
    expect(resolveMeetCaptionState('original', true)).toBe('on')
  })

  it('keeps two participant devices independent and performs no shared mutation', () => {
    const participantA = memoryStorage()
    const participantB = memoryStorage()
    writeMeetCaptionMode(participantA, 'original')
    expect(readMeetCaptionMode(participantA)).toBe('original')
    expect(readMeetCaptionMode(participantB)).toBe('off')
    expect(participantB.setItem).not.toHaveBeenCalled()
  })

  it('fails locally without throwing when persistence is unavailable', () => {
    expect(writeMeetCaptionMode({ setItem: () => { throw new Error('blocked') } }, 'original'))
      .toBe(false)
  })
})
