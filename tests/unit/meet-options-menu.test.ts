import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_MENU_ITEM,
  getMeetOptionsMenuOutsideAction,
  isMeetOptionsMenuEscapeKey,
  isInsideMeetOptionsMenuTarget,
  shouldCloseMeetOptionsMenu,
  toggleMeetOptionsMenu,
} from '../../lib/meet-options-menu'

function createBoundary(...targets: Node[]) {
  return {
    contains(target: Node | null) {
      return target !== null && targets.includes(target)
    },
  }
}

describe('Meet options menu', () => {
  it('opens on the first button click and keeps the opening event from closing it', () => {
    const button = {} as Node
    const menu = {} as Node
    const outside = {} as Node
    let isOpen = false

    isOpen = toggleMeetOptionsMenu(isOpen)
    const openingAction = getMeetOptionsMenuOutsideAction({
      target: outside,
      button: createBoundary(button),
      menu: createBoundary(menu),
      ignoreNextOutsideClick: true,
    })

    if (openingAction === 'close') {
      isOpen = false
    }

    expect(openingAction).toBe('ignore')
    expect(isOpen).toBe(true)
  })

  it('closes on the second button click', () => {
    expect(toggleMeetOptionsMenu(true)).toBe(false)
  })

  it('treats the button and the fixed popover as the safe click area', () => {
    const button = {} as Node
    const buttonChild = {} as Node
    const menu = {} as Node
    const menuAction = {} as Node
    const buttonBoundary = createBoundary(button, buttonChild)
    const menuBoundary = createBoundary(menu, menuAction)

    expect(
      isInsideMeetOptionsMenuTarget({
        target: buttonChild,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(true)
    expect(
      isInsideMeetOptionsMenuTarget({
        target: menuAction,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(true)
    expect(
      shouldCloseMeetOptionsMenu({
        target: button,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(false)
    expect(
      shouldCloseMeetOptionsMenu({
        target: menuAction,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(false)
  })

  it('does not close for a menu action before the action runs', () => {
    const menuAction = {} as Node
    const menu = createBoundary(menuAction)
    let isOpen = true
    let actionClicked = false

    actionClicked = true
    if (shouldCloseMeetOptionsMenu({ target: menuAction, button: null, menu })) {
      isOpen = false
    }

    expect(actionClicked).toBe(true)
    expect(isOpen).toBe(true)
  })

  it('closes for an external click or null target', () => {
    const button = {} as Node
    const menuAction = {} as Node
    const outside = {} as Node
    const buttonBoundary = createBoundary(button)
    const menuBoundary = createBoundary(menuAction)

    expect(
      shouldCloseMeetOptionsMenu({
        target: outside,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(true)
    expect(
      getMeetOptionsMenuOutsideAction({
        target: outside,
        button: buttonBoundary,
        menu: menuBoundary,
        ignoreNextOutsideClick: false,
      }),
    ).toBe('close')
    expect(
      shouldCloseMeetOptionsMenu({
        target: null,
        button: buttonBoundary,
        menu: menuBoundary,
      }),
    ).toBe(true)
  })

  it('closes on Escape and ignores other keys', () => {
    expect(isMeetOptionsMenuEscapeKey('Escape')).toBe(true)
    expect(isMeetOptionsMenuEscapeKey('Enter')).toBe(false)
    expect(isMeetOptionsMenuEscapeKey('Esc')).toBe(false)
  })

  it('exposes the controlled recording entry point', () => {
    expect(MEET_RECORDING_MENU_ITEM).toEqual({
      label: 'Iniciar gravação',
    })
  })
})
