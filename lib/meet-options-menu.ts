export const MEET_OPTIONS_PANEL_ID = 'meet-options-panel'

export const MEET_RECORDING_PANEL_ITEM = {
  label: 'Iniciar gravação',
} as const

export const MEET_OPTIONS_PANEL_SECTIONS = [
  {
    title: 'Gravação',
    actions: ['Iniciar/parar gravação', 'Lista/download de gravações'],
  },
  {
    title: 'Sala',
    actions: ['Copiar link', 'Compartilhar', 'Chat', 'Participantes', 'Sair da sala', 'Fechar'],
  },
  {
    title: 'Interação',
    actions: ['Reações', 'Levantar/baixar mão', 'Sons'],
  },
  {
    title: 'Visual',
    actions: ['Apresentar', 'Layout', 'Tela cheia'],
  },
] as const

export function toggleMeetOptionsPanel(isOpen: boolean) {
  return !isOpen
}

export function isMeetOptionsPanelEscapeKey(key: string) {
  return key === 'Escape'
}

export function shouldKeepMeetOptionsPanelOpenAfterOutsideInteraction() {
  return true
}

export function shouldCloseMeetOptionsPanelFromCloseButton() {
  return true
}

export function getMeetOptionsPanelActionLabels() {
  return MEET_OPTIONS_PANEL_SECTIONS.flatMap((section) => section.actions)
}
