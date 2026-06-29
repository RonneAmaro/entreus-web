export const MEET_RECORDING_MENU_ITEM = {
  label: 'Iniciar gravação',
} as const

export function toggleMeetOptionsMenu(isOpen: boolean) {
  return !isOpen
}

export function isMeetOptionsMenuEscapeKey(key: string) {
  return key === 'Escape'
}

type MeetOptionsMenuBoundary = Pick<Node, 'contains'>

export function isInsideMeetOptionsMenuTarget({
  target,
  button,
  menu,
}: {
  target: EventTarget | null
  button?: MeetOptionsMenuBoundary | null
  menu?: MeetOptionsMenuBoundary | null
}) {
  if (!target) return false

  const node = target as Node
  return Boolean(button?.contains(node) || menu?.contains(node))
}

export function shouldCloseMeetOptionsMenu({
  target,
  button,
  menu,
}: {
  target: EventTarget | null
  button?: MeetOptionsMenuBoundary | null
  menu?: MeetOptionsMenuBoundary | null
}) {
  return !isInsideMeetOptionsMenuTarget({ target, button, menu })
}

export function getMeetOptionsMenuOutsideAction({
  target,
  button,
  menu,
  ignoreNextOutsideClick,
}: {
  target: EventTarget | null
  button: MeetOptionsMenuBoundary | null
  menu: MeetOptionsMenuBoundary | null
  ignoreNextOutsideClick: boolean
}): 'ignore' | 'close' {
  if (ignoreNextOutsideClick) return 'ignore'

  return shouldCloseMeetOptionsMenu({ target, button, menu }) ? 'close' : 'ignore'
}
