export const MEET_RECORDING_LOGIN_REQUIRED_MESSAGE = 'Você precisa estar logado para gravar.'
export const MEET_RECORDING_HOST_REQUIRED_MESSAGE = 'Apenas o anfitrião da sala pode iniciar a gravação.'
export const MEET_RECORDING_VIP_REQUIRED_MESSAGE = 'A gravação de reuniões exige VIP ativo.'
export const MEET_RECORDING_MINOR_BLOCKED_MESSAGE = 'A gravação não está disponível para contas de menores de idade.'
export const MEET_RECORDING_CONSENT_REQUIRED_MESSAGE = 'Confirme o aviso aos participantes antes de iniciar a gravação.'

export type MeetRecordingPermissionInput = {
  authenticated: boolean
  isRoomModerator: boolean
  isPlatformAdmin: boolean
  isVipActive: boolean
  isMinor: boolean
  consentConfirmed: boolean
}

export type MeetRecordingPermissionResult =
  | { allowed: true }
  | { allowed: false; status: 400 | 401 | 403; message: string }

export function canManageMeetRecording({
  authenticated,
  isRoomModerator,
  isPlatformAdmin,
}: Pick<MeetRecordingPermissionInput, 'authenticated' | 'isRoomModerator' | 'isPlatformAdmin'>) {
  return authenticated && (isRoomModerator || isPlatformAdmin)
}

export function evaluateMeetRecordingPermission(
  input: MeetRecordingPermissionInput,
): MeetRecordingPermissionResult {
  if (!input.authenticated) {
    return { allowed: false, status: 401, message: MEET_RECORDING_LOGIN_REQUIRED_MESSAGE }
  }

  if (!canManageMeetRecording(input)) {
    return { allowed: false, status: 403, message: MEET_RECORDING_HOST_REQUIRED_MESSAGE }
  }

  if (!input.isVipActive) {
    return { allowed: false, status: 403, message: MEET_RECORDING_VIP_REQUIRED_MESSAGE }
  }

  if (input.isMinor) {
    return { allowed: false, status: 403, message: MEET_RECORDING_MINOR_BLOCKED_MESSAGE }
  }

  if (!input.consentConfirmed) {
    return { allowed: false, status: 400, message: MEET_RECORDING_CONSENT_REQUIRED_MESSAGE }
  }

  return { allowed: true }
}
