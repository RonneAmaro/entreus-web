export const MEET_LAYOUT_STORAGE_KEY = 'entreus.meet.layout'

export const MEET_LAYOUT_MODES = ['auto', 'grid', 'focus', 'presentation'] as const

export type MeetLayoutMode = (typeof MEET_LAYOUT_MODES)[number]
export type ResolvedMeetLayout = Exclude<MeetLayoutMode, 'auto'>

type LayoutPreferenceReader = Pick<Storage, 'getItem'>
type LayoutPreferenceWriter = Pick<Storage, 'setItem'>

export function normalizeMeetLayoutMode(value: unknown): MeetLayoutMode {
  return typeof value === 'string' && MEET_LAYOUT_MODES.includes(value as MeetLayoutMode)
    ? value as MeetLayoutMode
    : 'auto'
}

export function readMeetLayoutMode(
  storage?: LayoutPreferenceReader | null,
): MeetLayoutMode {
  if (!storage) return 'auto'
  try {
    return normalizeMeetLayoutMode(storage.getItem(MEET_LAYOUT_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

export function writeMeetLayoutMode(
  storage: LayoutPreferenceWriter | null | undefined,
  mode: MeetLayoutMode,
) {
  if (!storage) return false
  try {
    storage.setItem(MEET_LAYOUT_STORAGE_KEY, mode)
    return true
  } catch {
    return false
  }
}

export function resolveMeetLayoutMode(
  mode: MeetLayoutMode,
  hasScreenShare: boolean,
): ResolvedMeetLayout {
  if (mode === 'auto') return hasScreenShare ? 'presentation' : 'grid'
  if (mode === 'presentation' && !hasScreenShare) return 'grid'
  return mode
}
