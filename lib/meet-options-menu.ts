export const MEET_RECORDING_MENU_ITEM = {
  label: 'Iniciar gravação',
} as const

export function toggleMeetOptionsMenu(isOpen: boolean) {
  return !isOpen
}

export function shouldCloseMeetOptionsMenu({
  clickedButton,
  clickedMenu,
}: {
  clickedButton: boolean
  clickedMenu: boolean
}) {
  return !clickedButton && !clickedMenu
}
