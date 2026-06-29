export const MEET_RECORDING_MENU_ITEM = {
  label: 'Iniciar gravação',
} as const

export function toggleMeetOptionsMenu(isOpen: boolean) {
  return !isOpen
}

export function isMeetOptionsMenuEscapeKey(key: string) {
  return key === 'Escape'
}

export function shouldKeepMeetOptionsMenuOpenAfterOutsideInteraction() {
  return true
}
