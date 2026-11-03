export type ClipTransition = 'none' | 'fade' | 'dissolve' | 'slide'
export type JunctionTransition = { fromId: string; type: 'dissolve' | 'dip-black'; duration: number }
export type JunctionTransitions = Record<string, JunctionTransition>

export type SequenceClip = {
  id: string
  type: 'video' | 'image'
  name: string
  previewUrl: string
  duration: number
  sourceDuration?: number
  trimStart?: number
  trimEnd?: number
  transition: ClipTransition
}

export type PositionedClip = SequenceClip & {
  startTime: number
  endTime: number
  order: number
}

const MIN_CLIP_DURATION = 0.5

export function positionClips(clips: SequenceClip[]): PositionedClip[] {
  let cursor = 0
  return clips.map((clip, order) => {
    const duration = Math.max(clip.duration, MIN_CLIP_DURATION)
    const positioned = { ...clip, duration, startTime: cursor, endTime: cursor + duration, order }
    cursor += duration
    return positioned
  })
}

export function transitionDuration(previous: Pick<SequenceClip, 'id' | 'duration'> | undefined, clip: Pick<SequenceClip, 'id' | 'duration'>, transitions: JunctionTransitions): number {
  const junction = transitions[clip.id]
  if (!previous || !junction || junction.fromId !== previous.id || !Number.isFinite(junction.duration)) return 0
  if (junction.type !== 'dissolve' && junction.type !== 'dip-black') return 0
  return Math.max(0, Math.min(junction.duration, previous.duration / 2 - 0.05, clip.duration / 2 - 0.05, 2))
}

export function positionClipsWithTransitions(clips: SequenceClip[], transitions: JunctionTransitions): PositionedClip[] {
  let cursor = 0
  return clips.map((clip, order) => {
    const duration = Math.max(clip.duration, MIN_CLIP_DURATION)
    const previous = clips[order - 1]
    cursor -= transitionDuration(previous, clip, transitions)
    const positioned = { ...clip, duration, startTime: cursor, endTime: cursor + duration, order }
    cursor += duration
    return positioned
  })
}

export function validJunctionTransitions(clips: SequenceClip[], transitions: JunctionTransitions): JunctionTransitions {
  const valid: JunctionTransitions = {}
  clips.forEach((clip, index) => {
    const previous = clips[index - 1]
    const duration = transitionDuration(previous, clip, transitions)
    if (duration > 0) valid[clip.id] = { ...transitions[clip.id], duration }
  })
  return valid
}

export function clipAtTime(clips: PositionedClip[], time: number): PositionedClip | null {
  return clips.findLast((clip) => time >= clip.startTime && time < clip.endTime) ||
    (time >= (clips.at(-1)?.endTime || Infinity) ? clips.at(-1) || null : null)
}

export function moveClip<T extends { id: string } | string>(clips: T[], id: string, targetIndex: number): T[] {
  const sourceIndex = clips.findIndex((clip) => (typeof clip === 'string' ? clip : clip.id) === id)
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= clips.length || sourceIndex === targetIndex) return clips
  const next = [...clips]
  const [clip] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, clip)
  return next
}

export function trimVideo(sourceDuration: number, start: number, end: number) {
  const safeSource = Math.max(sourceDuration, MIN_CLIP_DURATION)
  const trimStart = Math.max(0, Math.min(start, safeSource - MIN_CLIP_DURATION))
  const trimEnd = Math.max(trimStart + MIN_CLIP_DURATION, Math.min(end, safeSource))
  return { trimStart, trimEnd, duration: trimEnd - trimStart }
}

export function musicSourceTime(projectTime: number, offset: number, trimStart: number, trimEnd: number) {
  const elapsed = projectTime - offset
  if (elapsed < 0 || elapsed >= trimEnd - trimStart) return null
  return trimStart + elapsed
}

export function clampLayerTiming(start: number, end: number, total: number) {
  const safeTotal = Math.max(total, MIN_CLIP_DURATION)
  const startTime = Math.max(0, Math.min(start, safeTotal - MIN_CLIP_DURATION))
  const endTime = Math.max(startTime + MIN_CLIP_DURATION, Math.min(end, safeTotal))
  return { startTime, endTime }
}
