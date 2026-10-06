import { describe, expect, it } from 'vitest'
import { getPhotoSlideAtTime, getTimelinePlaybackTime } from '@/lib/video-timeline'

const slides = [
  { id: 'a', duration: 3, order: 0 },
  { id: 'b', duration: 3, order: 1 },
  { id: 'c', duration: 3, order: 2 },
]

describe('video timeline photo playback', () => {
  it('selects the photo from the playhead, including exact boundaries', () => {
    expect(getPhotoSlideAtTime(slides, 1)?.id).toBe('a')
    expect(getPhotoSlideAtTime(slides, 3)?.id).toBe('b')
    expect(getPhotoSlideAtTime(slides, 4)?.id).toBe('b')
    expect(getPhotoSlideAtTime(slides, 6)?.id).toBe('c')
    expect(getPhotoSlideAtTime(slides, 7)?.id).toBe('c')
  })

  it('uses the final photo at the completed timeline endpoint and honors video offsets', () => {
    expect(getPhotoSlideAtTime(slides, 9)?.id).toBe('c')
    expect(getPhotoSlideAtTime(slides, 4, 3)?.id).toBe('a')
    expect(getPhotoSlideAtTime(slides, 3, 3)?.id).toBe('a')
  })

  it('advances, pauses, seeks, and restarts with a bounded project clock', () => {
    expect(getTimelinePlaybackTime(1_000, 0, 2_500, 9)).toBe(1.5)
    expect(getTimelinePlaybackTime(1_000, 4, 1_000, 9)).toBe(4)
    expect(getTimelinePlaybackTime(1_000, 8.5, 2_000, 9)).toBe(9)
    expect(getTimelinePlaybackTime(1_000, 0, 1_000, 9)).toBe(0)
  })
})
