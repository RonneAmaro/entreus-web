import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_MENU_ITEM,
  shouldCloseMeetOptionsMenu,
  toggleMeetOptionsMenu,
} from '../../lib/meet-options-menu'

describe('Meet options menu', () => {
  it('starts closed and toggles when the three-dot button is selected', () => {
    expect(toggleMeetOptionsMenu(false)).toBe(true)
    expect(toggleMeetOptionsMenu(true)).toBe(false)
  })

  it('closes only for a pointer event outside both button and menu', () => {
    expect(shouldCloseMeetOptionsMenu({ clickedButton: true, clickedMenu: false })).toBe(false)
    expect(shouldCloseMeetOptionsMenu({ clickedButton: false, clickedMenu: true })).toBe(false)
    expect(shouldCloseMeetOptionsMenu({ clickedButton: false, clickedMenu: false })).toBe(true)
  })

  it('exposes the controlled recording entry point', () => {
    expect(MEET_RECORDING_MENU_ITEM).toEqual({
      label: 'Iniciar gravação',
    })
  })
})
