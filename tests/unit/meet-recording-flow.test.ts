import { describe, expect, it } from 'vitest'
import {
  MEET_RECORDING_UNAVAILABLE_MESSAGE,
  canDownloadMeetRecording,
  getMeetRecordingParticipantNotice,
  getMeetRecordingStatusLabel,
  toPublicMeetRecording,
} from '../../lib/meet/recording-flow'

describe('Meet recording flow', () => {
  it('does not expose private storage metadata in the client recording payload', () => {
    const recording = toPublicMeetRecording(
      {
        id: 'recording-1',
        status: 'ready',
        created_at: '2026-06-23T12:00:00.000Z',
        started_at: '2026-06-23T12:00:00.000Z',
        ended_at: '2026-06-23T12:01:00.000Z',
        duration_seconds: 60,
        file_size_bytes: 2048,
        error_message: null,
        storage_bucket: 'private-recordings',
        storage_key: 'meet-recordings/sala/recording-1.mp4',
        egress_id: 'egress-private-id',
      },
      true,
    )

    expect(recording).not.toHaveProperty('storage_key')
    expect(recording).not.toHaveProperty('storageKey')
    expect(recording).not.toHaveProperty('egress_id')
    expect(recording.canDownload).toBe(true)
  })

  it('shows the visible participant notice while a recording is active', () => {
    expect(getMeetRecordingStatusLabel('recording')).toBe('Gravando')
    expect(getMeetRecordingParticipantNotice('recording')).toBe('Esta reunião está sendo gravada.')
  })

  it('only allows secure downloads for recordings that are ready', () => {
    expect(canDownloadMeetRecording('processing')).toBe(false)
    expect(canDownloadMeetRecording('ready')).toBe(true)
  })

  it('keeps an Egress configuration failure safe and explicit', () => {
    expect(MEET_RECORDING_UNAVAILABLE_MESSAGE).toBe(
      'Gravação indisponível neste ambiente. Configure LiveKit Egress e armazenamento seguro.',
    )
  })
})
