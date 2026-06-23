import { describe, expect, it } from 'vitest'
import {
  getMeetRecordingEnvironmentDiagnostics,
  toSafeMeetRecordingDiagnosticsPayload,
} from '../../lib/meet/recording-environment'
import { isMeetRecordingInfrastructureConfigured } from '../../lib/meet/recording-server'

const completeEnvironment = {
  MEET_RECORDING_EGRESS_ENABLED: 'true',
  R2_MEET_RECORDINGS_BUCKET_NAME: 'entreus-meet-recordings',
  R2_ACCOUNT_ID: 'account-id',
  R2_ACCESS_KEY_ID: 'access-key-id',
  R2_SECRET_ACCESS_KEY: 'access-key-secret',
  LIVEKIT_URL: 'wss://meet.example.test',
  LIVEKIT_API_KEY: 'livekit-key',
  LIVEKIT_API_SECRET: 'livekit-secret',
}

describe('Meet recording environment diagnostics', () => {
  it('keeps recording blocked without opt-in', () => {
    const diagnostics = getMeetRecordingEnvironmentDiagnostics({
      ...completeEnvironment,
      MEET_RECORDING_EGRESS_ENABLED: 'false',
    })

    expect(diagnostics.ready).toBe(false)
    expect(diagnostics.egressEnabled).toBe(false)
    expect(diagnostics.missing).toContain('MEET_RECORDING_EGRESS_ENABLED=true')
    expect(diagnostics.warnings).toEqual([])
    expect(isMeetRecordingInfrastructureConfigured({ ...completeEnvironment, MEET_RECORDING_EGRESS_ENABLED: 'false' })).toBe(false)
  })

  it('keeps recording blocked when opt-in is enabled without a dedicated bucket', () => {
    const diagnostics = getMeetRecordingEnvironmentDiagnostics({
      ...completeEnvironment,
      R2_MEET_RECORDINGS_BUCKET_NAME: '',
    })

    expect(diagnostics.ready).toBe(false)
    expect(diagnostics.hasMeetRecordingsBucketName).toBe(false)
    expect(diagnostics.missing).toContain('R2_MEET_RECORDINGS_BUCKET_NAME')
    expect(diagnostics.warnings).toHaveLength(1)
  })

  it('keeps recording blocked when the LiveKit server configuration is incomplete', () => {
    const diagnostics = getMeetRecordingEnvironmentDiagnostics({
      ...completeEnvironment,
      LIVEKIT_API_SECRET: undefined,
    })

    expect(diagnostics.ready).toBe(false)
    expect(diagnostics.hasLiveKitServerConfig).toBe(false)
    expect(diagnostics.missing).toContain('LIVEKIT_API_SECRET')
  })

  it('reports a complete environment as ready without revealing its values', () => {
    const diagnostics = getMeetRecordingEnvironmentDiagnostics(completeEnvironment)
    const payload = toSafeMeetRecordingDiagnosticsPayload(diagnostics)
    const serializedPayload = JSON.stringify(payload)

    expect(diagnostics.ready).toBe(true)
    expect(payload).toEqual({
      ready: true,
      egressEnabled: true,
      hasMeetRecordingsBucketName: true,
      hasR2AccessConfig: true,
      hasLiveKitServerConfig: true,
      missing: [],
      warnings: [
        'Confirme manualmente a migration Supabase, a privacidade do bucket R2 e o suporte a Egress antes de liberar a gravação.',
      ],
    })
    expect(serializedPayload).not.toContain('entreus-meet-recordings')
    expect(serializedPayload).not.toContain('access-key-secret')
    expect(serializedPayload).not.toContain('livekit-secret')
  })
})
