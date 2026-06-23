import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEET_RECORDING_COMPRESSION_PROFILE,
  MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS,
  MEET_RECORDING_RETENTION_DAYS,
  getMeetRecordingCompressionPolicy,
  getMeetRecordingPlanLimits,
  getMeetRecordingRetention,
  hasActiveMeetRecordingRetention,
  isWithinMeetRecordingLimits,
  resolveMeetRecordingCompressionProfile,
} from '../../lib/meet/recording-compression'
import { getMeetRecordingEgressEncoding } from '../../lib/meet/recording-server'

describe('Meet recording compression policy', () => {
  it('uses economy as the default and safe fallback profile', () => {
    expect(DEFAULT_MEET_RECORDING_COMPRESSION_PROFILE).toBe('economy')
    expect(resolveMeetRecordingCompressionProfile(undefined)).toBe('economy')
    expect(resolveMeetRecordingCompressionProfile('high')).toBe('economy')
    expect(getMeetRecordingCompressionPolicy('invalid').profile).toBe('economy')
  })

  it('defines duration and storage caps for every supported profile', () => {
    for (const profile of ['economy', 'standard'] as const) {
      const policy = getMeetRecordingCompressionPolicy(profile)

      expect(policy.limits.maxDurationSeconds).toBe(MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS)
      expect(policy.limits.maxExpectedFileSizeBytes).toBeGreaterThan(0)
      expect(policy.serverEncoding.width).toBeGreaterThan(0)
      expect(policy.serverEncoding.height).toBeGreaterThan(0)
      expect(policy.serverEncoding.videoBitrateKbps).toBeGreaterThan(0)
    }
  })

  it('uses the economy encoding options on the server without provider secrets', () => {
    const policy = getMeetRecordingCompressionPolicy()
    const encoding = getMeetRecordingEgressEncoding(policy.profile)
    const serializedPolicy = JSON.stringify(policy)

    expect(encoding.width).toBe(960)
    expect(encoding.height).toBe(540)
    expect(encoding.framerate).toBe(20)
    expect(serializedPolicy).not.toContain('R2_SECRET_ACCESS_KEY')
    expect(serializedPolicy).not.toContain('LIVEKIT_API_SECRET')
  })

  it('keeps free accounts blocked while VIP and admin retain the same economy cap', () => {
    const free = getMeetRecordingPlanLimits({ isVipActive: false, isPlatformAdmin: false })
    const vip = getMeetRecordingPlanLimits({ isVipActive: true, isPlatformAdmin: false })
    const admin = getMeetRecordingPlanLimits({ isVipActive: false, isPlatformAdmin: true })

    expect(free).toMatchObject({ plan: 'free', canStartRecording: false, compressionProfile: 'economy' })
    expect(vip).toMatchObject({ plan: 'vip', canStartRecording: true, compressionProfile: 'economy' })
    expect(admin).toMatchObject({ plan: 'admin', canStartRecording: true, compressionProfile: 'economy' })
    expect(admin.maxDurationSeconds).toBe(vip.maxDurationSeconds)
    expect(admin.maxExpectedFileSizeBytes).toBe(vip.maxExpectedFileSizeBytes)
  })

  it('sets a finite retention deadline and blocks expired or oversized results', () => {
    const retention = getMeetRecordingRetention(new Date('2026-06-23T00:00:00.000Z'))

    expect(retention.retentionDays).toBe(MEET_RECORDING_RETENTION_DAYS)
    expect(retention.retentionExpiresAt).toBe('2026-07-08T00:00:00.000Z')
    expect(hasActiveMeetRecordingRetention(retention.retentionExpiresAt, new Date('2026-06-24T00:00:00.000Z'))).toBe(true)
    expect(hasActiveMeetRecordingRetention(retention.retentionExpiresAt, new Date('2026-07-08T00:00:00.000Z'))).toBe(false)
    expect(
      isWithinMeetRecordingLimits({
        durationSeconds: MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS + 1,
        fileSizeBytes: null,
        profile: 'economy',
      }),
    ).toBe(false)
  })
})
