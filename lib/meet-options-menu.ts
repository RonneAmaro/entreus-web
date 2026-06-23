export const MEET_RECORDING_PREPARATION_MESSAGE =
  'A gravação de reuniões está em preparação. Em uma próxima versão, ela exigirá aviso aos participantes e armazenamento seguro.'

export const MEET_RECORDING_MENU_ITEM = {
  label: 'Gravar reunião',
  badge: 'Em preparação',
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
