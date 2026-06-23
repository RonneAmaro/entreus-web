import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_MENU_ITEM,
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
  it('starts closed and toggles when the three-dot button is selected', () => {
    expect(toggleMeetOptionsMenu(false)).toBe(true)
    expect(toggleMeetOptionsMenu(true)).toBe(false)
  })

  it('does not treat the button or one of its children as an external pointer target', () => {
    const button = {} as Node
    const buttonChild = {} as Node
    const menu = {} as Node

    expect(
      isInsideMeetOptionsMenuTarget({
        target: buttonChild,
        button: createBoundary(button, buttonChild),
        menu: createBoundary(menu),
      }),
    ).toBe(true)
    expect(
      shouldCloseMeetOptionsMenu({
        target: button,
        button: createBoundary(button, buttonChild),
        menu: createBoundary(menu),
      }),
    ).toBe(false)
  })

  it('does not close for the menu or an element inside it', () => {
    const button = {} as Node
    const menu = {} as Node
    const menuAction = {} as Node

    expect(
      shouldCloseMeetOptionsMenu({
        target: menuAction,
        button: createBoundary(button),
        menu: createBoundary(menu, menuAction),
      }),
    ).toBe(false)
  })

  it('closes safely for an external or null target', () => {
    const button = {} as Node
    const menu = {} as Node
    const outside = {} as Node

    expect(
      shouldCloseMeetOptionsMenu({
        target: outside,
        button: createBoundary(button),
        menu: createBoundary(menu),
      }),
    ).toBe(true)
    expect(
      shouldCloseMeetOptionsMenu({
        target: null,
        button: createBoundary(button),
        menu: createBoundary(menu),
      }),
    ).toBe(true)
  })

  it('exposes the controlled recording entry point', () => {
    expect(MEET_RECORDING_MENU_ITEM).toEqual({
      label: 'Iniciar gravação',
    })
  })
})
