export const MEET_CAPTIONS_STORAGE_KEY = 'entreus.meet.captions.enabled'

export const MEET_CAPTION_MODES = ['off', 'original'] as const

export type MeetCaptionMode = (typeof MEET_CAPTION_MODES)[number]
export type MeetCaptionState = 'off' | 'unavailable' | 'on'

type CaptionPreferenceReader = Pick<Storage, 'getItem'>
type CaptionPreferenceWriter = Pick<Storage, 'setItem'>

export function normalizeMeetCaptionMode(value: unknown): MeetCaptionMode {
  return value === 'original' ? 'original' : 'off'
}

export function readMeetCaptionMode(
  storage?: CaptionPreferenceReader | null,
): MeetCaptionMode {
  if (!storage) return 'off'
  try {
    return normalizeMeetCaptionMode(storage.getItem(MEET_CAPTIONS_STORAGE_KEY))
  } catch {
    return 'off'
  }
}

export function writeMeetCaptionMode(
  storage: CaptionPreferenceWriter | null | undefined,
  mode: MeetCaptionMode,
) {
  if (!storage) return false
  try {
    storage.setItem(MEET_CAPTIONS_STORAGE_KEY, mode)
    return true
  } catch {
    return false
  }
}

export function isMeetCaptionModeEnabled(mode: MeetCaptionMode) {
  return mode !== 'off'
}

export function resolveMeetCaptionState(
  mode: MeetCaptionMode,
  trustedServiceAvailable: boolean,
): MeetCaptionState {
  if (!isMeetCaptionModeEnabled(mode)) return 'off'
  return trustedServiceAvailable ? 'on' : 'unavailable'
}
