import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_CONSENT_REQUIRED_MESSAGE,
  MEET_RECORDING_HOST_REQUIRED_MESSAGE,
  MEET_RECORDING_LOGIN_REQUIRED_MESSAGE,
  MEET_RECORDING_MINOR_BLOCKED_MESSAGE,
  MEET_RECORDING_VIP_REQUIRED_MESSAGE,
  evaluateMeetRecordingPermission,
} from '../../lib/meet/recording-permissions'

const allowedInput = {
  authenticated: true,
  isRoomModerator: true,
  isPlatformAdmin: false,
  isVipActive: true,
  isMinor: false,
  consentConfirmed: true,
}

describe('Meet recording permissions', () => {
  it('does not allow an unauthenticated user to record', () => {
    expect(evaluateMeetRecordingPermission({ ...allowedInput, authenticated: false })).toEqual({
      allowed: false,
      status: 401,
      message: MEET_RECORDING_LOGIN_REQUIRED_MESSAGE,
    })
  })

  it('does not allow a non-host and non-admin user to record', () => {
    expect(
      evaluateMeetRecordingPermission({
        ...allowedInput,
        isRoomModerator: false,
        isPlatformAdmin: false,
      }),
    ).toEqual({
      allowed: false,
      status: 403,
      message: MEET_RECORDING_HOST_REQUIRED_MESSAGE,
    })
  })

  it('allows a VIP host that has confirmed the participant notice', () => {
    expect(evaluateMeetRecordingPermission(allowedInput)).toEqual({ allowed: true })
  })

  it('blocks a minor even when the account is a VIP host', () => {
    expect(evaluateMeetRecordingPermission({ ...allowedInput, isMinor: true })).toEqual({
      allowed: false,
      status: 403,
      message: MEET_RECORDING_MINOR_BLOCKED_MESSAGE,
    })
  })

  it('requires active VIP and explicit consent before starting', () => {
    expect(evaluateMeetRecordingPermission({ ...allowedInput, isVipActive: false })).toEqual({
      allowed: false,
      status: 403,
      message: MEET_RECORDING_VIP_REQUIRED_MESSAGE,
    })
    expect(evaluateMeetRecordingPermission({ ...allowedInput, consentConfirmed: false })).toEqual({
      allowed: false,
      status: 400,
      message: MEET_RECORDING_CONSENT_REQUIRED_MESSAGE,
    })
  })
})
