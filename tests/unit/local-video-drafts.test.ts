import { describe, expect, it } from 'vitest'
import {
  getLocalVideoDraftId,
  getLocalVideoDraftTargetUrl,
  isLocalVideoDraftMetadataFresh,
  isLocalVideoDraftStorageAvailable,
  isSupportedLocalVideoDraftSource,
  isUsableLocalVideoDraftRecord,
  LOCAL_VIDEO_DRAFT_MAX_AGE_MS,
  SCREEN_RECORDER_DRAFT_SOURCE,
} from '../../lib/local-video-drafts'

describe('local video draft helpers', () => {
  it('accepts only the screen recorder source', () => {
    expect(isSupportedLocalVideoDraftSource(SCREEN_RECORDER_DRAFT_SOURCE)).toBe(true)
    expect(isSupportedLocalVideoDraftSource('meet')).toBe(false)
    expect(isSupportedLocalVideoDraftSource(null)).toBe(false)
  })

  it('builds the local draft key and editor URL', () => {
    expect(getLocalVideoDraftId()).toBe('lab-video-draft:screen-recorder')
    expect(getLocalVideoDraftTargetUrl()).toBe('/lab/video-editor?source=screen-recorder')
  })

  it('checks IndexedDB availability without touching real storage', () => {
    expect(isLocalVideoDraftStorageAvailable({ indexedDB: {} as IDBFactory })).toBe(true)
    expect(isLocalVideoDraftStorageAvailable({ indexedDB: null })).toBe(false)
  })

  it('validates local draft freshness', () => {
    const now = 1_000_000

    expect(isLocalVideoDraftMetadataFresh(now - 10_000, now)).toBe(true)
    expect(isLocalVideoDraftMetadataFresh(now - LOCAL_VIDEO_DRAFT_MAX_AGE_MS - 1, now)).toBe(false)
    expect(isLocalVideoDraftMetadataFresh(now + 120_000, now)).toBe(false)
    expect(isLocalVideoDraftMetadataFresh(0, now)).toBe(false)
  })

  it('validates local draft records before importing into the editor', () => {
    const now = Date.now()
    const record = {
      id: getLocalVideoDraftId(),
      source: SCREEN_RECORDER_DRAFT_SOURCE,
      name: 'aula.webm',
      type: 'video/webm',
      size: 12,
      updatedAt: now,
      blob: new Blob(['video'], { type: 'video/webm' }),
    }

    expect(isUsableLocalVideoDraftRecord(record, now)).toBe(true)
    expect(isUsableLocalVideoDraftRecord({ ...record, size: 0 }, now)).toBe(false)
    expect(isUsableLocalVideoDraftRecord({ ...record, source: 'unknown' }, now)).toBe(false)
  })
})
