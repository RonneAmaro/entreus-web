import { describe, expect, it } from 'vitest'
import {
  SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE,
  buildScreenRecordingFileName,
  createScreenRecordingFileName,
  formatRecordingDuration,
  getBestScreenRecorderMimeType,
  getRecordingExtension,
  getScreenRecorderCanvasSize,
  getScreenRecorderContainRect,
  getScreenRecorderErrorMessage,
  getScreenRecorderSupport,
  getWebcamOverlayRect,
  isMp4MimeType,
  normalizeScreenRecorderPoint,
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
        canvas: { captureStream: () => undefined },
      }),
    ).toMatchObject({
      hasDisplayMedia: true,
      hasUserMedia: true,
      hasMediaRecorder: true,
      hasCanvasCapture: true,
      isCompositeSupported: true,
      isSupported: true,
      missing: [],
    })

    expect(getScreenRecorderSupport({ navigator: null, MediaRecorder: null })).toMatchObject({
      isSupported: false,
      isCompositeSupported: false,
      missing: ['mediaDevices', 'getDisplayMedia', 'getUserMedia', 'MediaRecorder'],
    })
  })

  it('chooses MP4 first when the browser supports it', () => {
    const supported = new Set(['video/mp4;codecs=h264,aac', 'video/webm;codecs=vp8,opus'])

    expect(getBestScreenRecorderMimeType({ isTypeSupported: (mimeType) => supported.has(mimeType) })).toBe(
      'video/mp4;codecs=h264,aac',
    )
  })

  it('falls back to WebM when MP4 is not supported', () => {
    const supported = new Set(['video/webm;codecs=vp8,opus'])

    expect(getBestScreenRecorderMimeType({ isTypeSupported: (mimeType) => supported.has(mimeType) })).toBe(
      'video/webm;codecs=vp8,opus',
    )
    expect(getBestScreenRecorderMimeType({ isTypeSupported: () => false })).toBe('')
    expect(getBestScreenRecorderMimeType(null)).toBe('')
  })

  it('maps recording extensions without renaming WebM as MP4', () => {
    expect(isMp4MimeType('video/mp4;codecs=h264,aac')).toBe(true)
    expect(isMp4MimeType('video/webm;codecs=vp9,opus')).toBe(false)
    expect(getRecordingExtension('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('mp4')
    expect(getRecordingExtension('video/webm;codecs=vp8,opus')).toBe('webm')
    expect(getRecordingExtension('')).toBe('webm')
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
    expect(buildScreenRecordingFileName(new Date(2026, 6, 1, 9, 5), 'video/mp4;codecs=h264,aac')).toBe(
      'entreus-gravacao-tela-2026-07-01-09-05.mp4',
    )
    expect(buildScreenRecordingFileName(new Date(2026, 6, 1, 9, 5), 'video/webm;codecs=vp9,opus')).toBe(
      'entreus-gravacao-tela-2026-07-01-09-05.webm',
    )
  })

  it('calculates a safe composite canvas size while preserving aspect ratio', () => {
    expect(getScreenRecorderCanvasSize({ width: 3840, height: 2160 })).toEqual({ width: 1920, height: 1080 })
    expect(getScreenRecorderCanvasSize({ width: 1080, height: 1920 })).toEqual({ width: 608, height: 1080 })
    expect(getScreenRecorderCanvasSize(null)).toEqual({ width: 1280, height: 720 })
  })

  it('keeps the captured screen contained inside the canvas', () => {
    expect(getScreenRecorderContainRect({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    })
    expect(getScreenRecorderContainRect({ width: 1000, height: 1000 }, { width: 1280, height: 720 })).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    })
  })

  it('calculates webcam overlay positions for the composite canvas', () => {
    const canvasSize = { width: 1280, height: 720 }

    expect(getWebcamOverlayRect({ canvasSize, position: 'bottom-right' })).toMatchObject({
      x: 999,
      y: 551,
      width: 256,
      height: 144,
    })
    expect(getWebcamOverlayRect({ canvasSize, position: 'top-left' })).toMatchObject({
      x: 25,
      y: 25,
      width: 256,
      height: 144,
    })
  })

  it('normalizes annotation points from pointer coordinates', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 }

    expect(normalizeScreenRecorderPoint(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(normalizeScreenRecorderPoint(50, 400, rect)).toEqual({ x: 0, y: 1 })
  })

  it('exposes a friendly fallback message for canvas capture support', () => {
    expect(SCREEN_RECORDER_CANVAS_FALLBACK_MESSAGE).toContain('sem webcam ou marcações embutidas')
  })

  it('maps browser errors to friendly messages', () => {
    expect(getScreenRecorderErrorMessage({ name: 'NotAllowedError' })).toContain('Permissão negada')
    expect(getScreenRecorderErrorMessage({ name: 'AbortError' })).toContain('cancelada')
    expect(getScreenRecorderErrorMessage(new Error('boom'))).toContain('Não foi possível')
  })
})
