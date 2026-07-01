import { describe, expect, it } from 'vitest'
import {
  MEET_OPTIONS_PANEL_ID,
  MEET_OPTIONS_PANEL_SECTIONS,
  MEET_RECORDING_PANEL_ITEM,
  getMeetOptionsPanelActionLabels,
  isMeetOptionsPanelEscapeKey,
  shouldCloseMeetOptionsPanelFromCloseButton,
  shouldKeepMeetOptionsPanelOpenAfterOutsideInteraction,
  toggleMeetOptionsPanel,
} from '../../lib/meet-options-menu'

describe('Meet options panel', () => {
  it('toggles open and closed from the three-dot button', () => {
    let isOpen = false

    isOpen = toggleMeetOptionsPanel(isOpen)
    expect(isOpen).toBe(true)

    isOpen = toggleMeetOptionsPanel(isOpen)
    expect(isOpen).toBe(false)
  })

  it('closes on Escape and ignores other keys', () => {
    let isOpen = true

    if (isMeetOptionsPanelEscapeKey('Escape')) {
      isOpen = false
    }

    expect(isOpen).toBe(false)
    expect(isMeetOptionsPanelEscapeKey('Enter')).toBe(false)
    expect(isMeetOptionsPanelEscapeKey('Esc')).toBe(false)
  })

  it('keeps the panel open after an outside click in this version', () => {
    let isOpen = true

    if (!shouldKeepMeetOptionsPanelOpenAfterOutsideInteraction()) {
      isOpen = false
    }

    expect(isOpen).toBe(true)
  })

  it('closes from the explicit close button', () => {
    let isOpen = true

    if (shouldCloseMeetOptionsPanelFromCloseButton()) {
      isOpen = false
    }

    expect(isOpen).toBe(false)
  })

  it('keeps the controlled recording entry point available', () => {
    expect(MEET_RECORDING_PANEL_ITEM).toEqual({
      label: 'Iniciar gravação',
    })
  })

  it('lists the stable panel sections and main actions', () => {
    expect(MEET_OPTIONS_PANEL_ID).toBe('meet-options-panel')
    expect(MEET_OPTIONS_PANEL_SECTIONS.map((section) => section.title)).toEqual([
      'Gravação',
      'Sala',
      'Interação',
      'Visual',
    ])
    expect(getMeetOptionsPanelActionLabels()).toEqual(
      expect.arrayContaining([
        'Iniciar/parar gravação',
        'Lista/download de gravações',
        'Copiar link',
        'Compartilhar',
        'Chat',
        'Participantes',
        'Reações',
        'Levantar/baixar mão',
        'Apresentar',
        'Sons',
        'Layout',
        'Tela cheia',
        'Sair da sala',
        'Fechar',
      ]),
    )
  })
})
