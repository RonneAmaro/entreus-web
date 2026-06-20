import { describe, expect, it } from 'vitest'

import {
  BYTES_PER_MEGABYTE,
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_ELDER_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES,
  getUploadMaxSizeBytes,
  resolveVideoUploadLimit,
} from '../../lib/media/upload-limits'

const now = Date.parse('2026-06-20T00:00:00.000Z')

describe('upload limits', () => {
  it('keeps images capped at 5 MB', () => {
    expect(IMAGE_UPLOAD_MAX_SIZE_BYTES).toBe(5 * BYTES_PER_MEGABYTE)
    expect(getUploadMaxSizeBytes('image/png')).toBe(IMAGE_UPLOAD_MAX_SIZE_BYTES)
  })

  it('uses 50 MB for standard video uploads', () => {
    expect(VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES).toBe(50 * BYTES_PER_MEGABYTE)
    expect(resolveVideoUploadLimit({}, now)).toEqual({
      tier: 'standard',
      maxSizeBytes: VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
    })
  })

  it('uses 200 MB for VIP and VIP Premium video uploads', () => {
    expect(VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES).toBe(200 * BYTES_PER_MEGABYTE)
    expect(resolveVideoUploadLimit({ badgeSlugs: ['vip'] }, now).maxSizeBytes).toBe(
      VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES,
    )
    expect(resolveVideoUploadLimit({ badgeSlugs: ['vip_premium'] }, now).maxSizeBytes).toBe(
      VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES,
    )
  })

  it('uses 500 MB for Elder video uploads', () => {
    expect(VIDEO_UPLOAD_ELDER_MAX_SIZE_BYTES).toBe(500 * BYTES_PER_MEGABYTE)
    expect(resolveVideoUploadLimit({ badgeSlugs: ['elder'] }, now)).toEqual({
      tier: 'elder',
      maxSizeBytes: VIDEO_UPLOAD_ELDER_MAX_SIZE_BYTES,
    })
  })
})
