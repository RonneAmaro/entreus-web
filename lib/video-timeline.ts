export type TimelinePhotoSlide = {
  id: string
  duration: number
  order: number
}

export function getPhotoSlideAtTime<T extends TimelinePhotoSlide>(
  slides: T[],
  currentTime: number,
  offset = 0
) {
  const relativeTime = currentTime - offset
  const orderedSlides = [...slides].sort((left, right) => left.order - right.order)

  if (relativeTime < 0 || orderedSlides.length === 0) return null

  let elapsed = 0
  for (const slide of orderedSlides) {
    const end = elapsed + slide.duration
    if (relativeTime >= elapsed && relativeTime < end) return slide
    elapsed = end
  }

  return orderedSlides.at(-1) || null
}

export function getTimelinePlaybackTime(
  startedAt: number,
  startedFrom: number,
  now: number,
  duration: number
) {
  return Math.min(Math.max(startedFrom + (now - startedAt) / 1000, 0), Math.max(duration, 0))
}
