import { describe, expect, it } from 'vitest'
import {
  createScreenRecordingFileName,
  formatRecordingDuration,
  getBestScreenRecorderMimeType,
  getScreenRecorderErrorMessage,
  getScreenRecorderSupport,
} from '../../lib/screen-recorder'

describe('screen recorder helpers', () => {
  it('detects browser support requirements', () => {
    expect(
      getScreenRecorderSupport({
        navigator: {
          mediaDevices: {
            getDisplayMedia: () => undefined,
            getUserMedia: () => undefined,
          },
        },
        MediaRecorder: { isTypeSupported: () => true },
      }),
    ).toMatchObject({
      hasDisplayMedia: true,
      hasUserMedia: true,
      hasMediaRecorder: true,
      isSupported: true,
      missing: [],
    })

    expect(getScreenRecorderSupport({ navigator: null, MediaRecorder: null })).toMatchObject({
      isSupported: false,
      missing: ['mediaDevices', 'getDisplayMedia', 'getUserMedia', 'MediaRecorder'],
    })
  })

  it('chooses the first supported mime type', () => {
    const supported = new Set(['video/webm;codecs=vp8,opus'])

    expect(getBestScreenRecorderMimeType({ isTypeSupported: (mimeType) => supported.has(mimeType) })).toBe(
      'video/webm;codecs=vp8,opus',
    )
    expect(getBestScreenRecorderMimeType({ isTypeSupported: () => false })).toBe('')
    expect(getBestScreenRecorderMimeType(null)).toBe('')
  })

  it('formats recording duration for timers', () => {
    expect(formatRecordingDuration(0)).toBe('00:00')
    expect(formatRecordingDuration(65_400)).toBe('01:05')
    expect(formatRecordingDuration(3_665_000)).toBe('01:01:05')
    expect(formatRecordingDuration(-100)).toBe('00:00')
  })

  it('creates a friendly screen recording file name', () => {
    expect(createScreenRecordingFileName(new Date(2026, 6, 1, 9, 5))).toBe(
      'entreus-gravacao-tela-2026-07-01-09-05.webm',
    )
  })

  it('maps browser errors to friendly messages', () => {
    expect(getScreenRecorderErrorMessage({ name: 'NotAllowedError' })).toContain('Permissão negada')
    expect(getScreenRecorderErrorMessage({ name: 'AbortError' })).toContain('cancelada')
    expect(getScreenRecorderErrorMessage(new Error('boom'))).toContain('Não foi possível')
  })
})
