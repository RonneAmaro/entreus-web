export const MAX_MEET_PARTICIPANT_NAME_LENGTH = 60
export const MIN_MEET_PARTICIPANT_NAME_LENGTH = 2

const DISALLOWED_DISPLAY_NAME_CHARACTERS = /[<>\u0000-\u001f\u007f-\u009f]/

export type MeetingParticipantNameValidation =
  | { ok: true; value: string }
  | { ok: false; code: 'invalid_type' | 'empty' | 'too_short' | 'too_long' | 'unsafe_characters' }

export type MeetingNameFieldState = Readonly<{
  value: string
  initialized: boolean
  edited: boolean
}>

export function validateMeetingParticipantName(value: unknown): MeetingParticipantNameValidation {
  if (typeof value !== 'string') return { ok: false, code: 'invalid_type' }
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return { ok: false, code: 'empty' }
  if (normalized.length < MIN_MEET_PARTICIPANT_NAME_LENGTH) return { ok: false, code: 'too_short' }
  if (normalized.length > MAX_MEET_PARTICIPANT_NAME_LENGTH) return { ok: false, code: 'too_long' }
  if (DISALLOWED_DISPLAY_NAME_CHARACTERS.test(normalized)) return { ok: false, code: 'unsafe_characters' }
  return { ok: true, value: normalized }
}

export function createMeetingNameFieldState(): MeetingNameFieldState {
  return { value: '', initialized: false, edited: false }
}

export function initializeMeetingName(
  current: MeetingNameFieldState,
  suggestion: unknown,
): MeetingNameFieldState {
  if (current.initialized || current.edited) return current
  const validated = validateMeetingParticipantName(suggestion)
  if (!validated.ok) return current
  return { value: validated.value, initialized: true, edited: false }
}

export function editMeetingName(current: MeetingNameFieldState, value: string): MeetingNameFieldState {
  return { value, initialized: true, edited: true }
}

export function confirmMeetingName(current: MeetingNameFieldState, value: unknown): MeetingNameFieldState {
  const validated = validateMeetingParticipantName(value)
  if (!validated.ok) return current
  return { value: validated.value, initialized: true, edited: current.edited }
}

export function createServerIssuedLiveKitIdentity(userId: string, nonce = crypto.randomUUID()) {
  return `${userId}-${nonce.slice(0, 8)}`
}
