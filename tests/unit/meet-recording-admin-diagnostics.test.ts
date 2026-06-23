import { describe, expect, it } from 'vitest'
import {
  getMeetRecordingEnvironmentDiagnostics,
  toSafeMeetRecordingDiagnosticsPayload,
} from '../../lib/meet/recording-environment'

describe('Meet recording admin diagnostics payload', () => {
  it('returns only safe booleans, missing names and warnings', () => {
    const payload = toSafeMeetRecordingDiagnosticsPayload(
      getMeetRecordingEnvironmentDiagnostics({
        MEET_RECORDING_EGRESS_ENABLED: 'true',
        R2_MEET_RECORDINGS_BUCKET_NAME: 'private-bucket-name',
        R2_ACCOUNT_ID: 'private-account',
        R2_ACCESS_KEY_ID: 'private-access-key',
        R2_SECRET_ACCESS_KEY: 'private-r2-secret',
        LIVEKIT_URL: 'wss://private.example.test',
        LIVEKIT_API_KEY: 'private-livekit-key',
        LIVEKIT_API_SECRET: 'private-livekit-secret',
      }),
    )
    const keys = Object.keys(payload)
    const serializedPayload = JSON.stringify(payload)

    expect(keys).toEqual([
      'ready',
      'egressEnabled',
      'hasMeetRecordingsBucketName',
      'hasR2AccessConfig',
      'hasLiveKitServerConfig',
      'missing',
      'warnings',
    ])
    expect(serializedPayload).not.toContain('private-bucket-name')
    expect(serializedPayload).not.toContain('private-r2-secret')
    expect(serializedPayload).not.toContain('private-livekit-secret')
  })
})
