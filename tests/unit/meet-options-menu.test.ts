import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_MENU_ITEM,
  isMeetOptionsMenuEscapeKey,
  shouldKeepMeetOptionsMenuOpenAfterOutsideInteraction,
  toggleMeetOptionsMenu,
} from '../../lib/meet-options-menu'

describe('Meet options menu diagnostic mode', () => {
  it('toggles open and closed from the three-dot button', () => {
    let isOpen = false

    isOpen = toggleMeetOptionsMenu(isOpen)
    expect(isOpen).toBe(true)

    isOpen = toggleMeetOptionsMenu(isOpen)
    expect(isOpen).toBe(false)
  })

  it('keeps the menu open after an outside click in this diagnostic version', () => {
    let isOpen = true

    if (!shouldKeepMeetOptionsMenuOpenAfterOutsideInteraction()) {
      isOpen = false
    }

    expect(isOpen).toBe(true)
  })

  it('closes on Escape and ignores other keys', () => {
    let isOpen = true

    if (isMeetOptionsMenuEscapeKey('Escape')) {
      isOpen = false
    }

    expect(isOpen).toBe(false)
    expect(isMeetOptionsMenuEscapeKey('Enter')).toBe(false)
    expect(isMeetOptionsMenuEscapeKey('Esc')).toBe(false)
  })

  it('keeps the controlled recording entry point available', () => {
    expect(MEET_RECORDING_MENU_ITEM).toEqual({
      label: 'Iniciar gravação',
    })
  })
})
