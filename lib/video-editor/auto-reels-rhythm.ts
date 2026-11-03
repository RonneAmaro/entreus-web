import { generateAutoReels, type AutoReelsMedia, type AutoReelsOptions, type AutoReelsProposal } from './auto-reels'
import { RHYTHM_MAX_SECONDS, type RhythmResult } from './rhythm-analysis'

export type RhythmicAutoReelsRequest = {
  format: AutoReelsOptions['format']
  totalSeconds: number
  music: { assetId: string; duration: number }
  analysis: { status: RhythmResult['status']; events: readonly number[] }
}
export type SynchronizedAutoReelsProposal = AutoReelsProposal & {
  synchronization: {
    version: 1
    policy: 'events-balanced-v1'
    timeOrigin: 'music-start'
    musicAssetId: string
    musicDuration: number
    requestedDuration: number
  }
}
export type RhythmGenerationReason = 'invalid-input' | 'invalid-events' | 'insufficient-events' | 'infeasible' | 'music-too-short'
export type RhythmicAutoReelsResult =
  | { kind: 'synchronized'; proposal: SynchronizedAutoReelsProposal }
  | { kind: 'fallback'; reason: RhythmGenerationReason; proposal: AutoReelsProposal }
  | { kind: 'error'; reason: RhythmGenerationReason; message: string }

const TICKS = 1_000_000
const MAX_EVENTS = 600 // 60 seconds at the analyzer's smallest supported separation (0.1 s).
const COMPARISON_EPSILON = 1e-9
type Path = { cost: number; cuts: number[] }

function earlier(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/**
 * Pure generation, separate from the regular API and from audio analysis.
 * Start is zero and end is the requested total (floored to microseconds).
 * Every internal boundary must be a detected event, rounded to microseconds.
 * Dynamic programming minimizes the sum of squared distances from equally
 * spaced boundaries, among feasible paths; ties choose the earliest cut sequence.
 * No greedy choice, random selection, tempo inference, looping or source mutation.
 */
export function generateRhythmicAutoReels(media: AutoReelsMedia[], request: RhythmicAutoReelsRequest): RhythmicAutoReelsResult {
  try {
    // Reuse existing media/format validation, independently of the rhythmic total.
    generateAutoReels(media, { format: request.format, timing: 'per-photo', seconds: 1 })
    if (!Number.isFinite(request.totalSeconds) || request.totalSeconds <= 0 || request.totalSeconds > RHYTHM_MAX_SECONDS
      || !request.music.assetId || request.music.assetId.length > 128 || !Number.isFinite(request.music.duration)
      || request.music.duration <= 0 || request.music.duration > RHYTHM_MAX_SECONDS) throw new Error('Configuração musical inválida.')
  } catch {
    return { kind: 'error', reason: 'invalid-input', message: 'Mídias, duração ou configuração musical inválidas.' }
  }

  const fallback = (reason: RhythmGenerationReason): RhythmicAutoReelsResult => {
    try {
      const proposal = generateAutoReels(media, { format: request.format, timing: 'total', seconds: request.totalSeconds })
      // Regular videos keep their full trims; never offer a fallback that exceeds
      // the music or silently changes the requested duration (video-only legacy rule).
      if (proposal.duration > request.music.duration + COMPARISON_EPSILON
        || Math.abs(proposal.duration - request.totalSeconds) > COMPARISON_EPSILON) throw new Error('Duração incompatível.')
      return { kind: 'fallback', reason, proposal }
    } catch {
      return { kind: 'error', reason, message: 'Sem proposta sincronizada e sem alternativa regular válida para esta duração e música.' }
    }
  }
  if (request.totalSeconds > request.music.duration) return fallback('music-too-short')
  const events = request.analysis?.events
  if (!Array.isArray(events) || events.length > MAX_EVENTS || !['detected', 'insufficient'].includes(request.analysis.status)
    || events.some((event, i) => !Number.isFinite(event) || event < 0 || event > request.music.duration || i > 0 && event <= events[i - 1])) return fallback('invalid-events')
  if (request.analysis.status !== 'detected' || media.length < 2) return fallback('insufficient-events')

  const end = Math.floor(request.totalSeconds * TICKS)
  const nodes = [...new Set(events.map((event) => Math.round(event * TICKS)).filter((tick) => tick > 0 && tick < end))]
  if (nodes.length < media.length - 1) return fallback('insufficient-events')
  const bounds = media.map((item) => item.type === 'video'
    ? { min: TICKS / 2, max: Math.floor((item.trimEnd - item.trimStart) * TICKS) }
    : { min: TICKS, max: 8 * TICKS })
  if (end < bounds.reduce((sum, b) => sum + b.min, 0) || end > bounds.reduce((sum, b) => sum + b.max, 0)) return fallback('infeasible')

  let states = new Map<number, Path>([[0, { cost: 0, cuts: [] }]])
  for (let i = 0; i < media.length; i++) {
    const next = new Map<number, Path>()
    for (const boundary of i === media.length - 1 ? [end] : nodes) {
      for (const [previous, path] of states) {
        const duration = boundary - previous
        if (duration < bounds[i].min || duration > bounds[i].max) continue
        const offset = boundary / end - (i + 1) / media.length
        const candidate = { cost: path.cost + offset * offset, cuts: [...path.cuts, boundary] }
        const best = next.get(boundary)
        if (!best || candidate.cost < best.cost - 1e-12 || Math.abs(candidate.cost - best.cost) <= 1e-12 && earlier(candidate.cuts, best.cuts)) next.set(boundary, candidate)
      }
    }
    states = next
    if (!states.size) return fallback('infeasible')
  }
  const path = states.get(end)!
  const clips = media.map((item, i): AutoReelsProposal['clips'][number] => {
    const startTime = (i ? path.cuts[i - 1] : 0) / TICKS
    const endTime = path.cuts[i] / TICKS
    const duration = (path.cuts[i] - (i ? path.cuts[i - 1] : 0)) / TICKS
    return {
      id: `autoreels-rhythm-${i}-${item.id}`, sourceId: item.id, type: item.type || 'image',
      name: item.name, previewUrl: item.previewUrl, transition: 'none', order: i,
      startTime, endTime, duration,
      ...(item.type === 'video' ? { sourceDuration: item.sourceDuration, trimStart: item.trimStart, trimEnd: Math.min(item.trimEnd, item.trimStart + duration) } : {}),
    }
  })
  // Reuse the regular generator's canvas convention, not its duration allocation.
  const size = generateAutoReels(media, { format: request.format, timing: 'per-photo', seconds: 1 }).size
  return { kind: 'synchronized', proposal: {
    format: request.format, size, duration: end / TICKS,
    photoCount: clips.filter((clip) => clip.type === 'image').length,
    videoCount: clips.filter((clip) => clip.type === 'video').length, clips,
    synchronization: { version: 1, policy: 'events-balanced-v1', timeOrigin: 'music-start',
      musicAssetId: request.music.assetId, musicDuration: request.music.duration, requestedDuration: request.totalSeconds },
  } }
}

function matchesCanonical(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= COMPARISON_EPSILON
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false
  const a = actual as Record<string, unknown>, b = expected as Record<string, unknown>
  const keys = Object.keys(b)
  return Object.keys(a).length === keys.length && keys.every((key) => Object.hasOwn(a, key) && matchesCanonical(a[key], b[key]))
}

/** B.3 must pass fresh media, verified music identity and the original analysis
 * request, held outside the submitted proposal. After the existing revision and
 * storage guards, use the returned canonical proposal; do not reconstruct it
 * with generateAutoReels(total), which redistributes photos and restores videos.
 * This validator grants no permission to bypass the editor's other guards.
 */
export function validateSynchronizedAutoReels(candidate: unknown, media: AutoReelsMedia[], request: RhythmicAutoReelsRequest):
  { valid: true; proposal: SynchronizedAutoReelsProposal } | { valid: false; reason: string } {
  const regenerated = generateRhythmicAutoReels(media, request)
  if (regenerated.kind !== 'synchronized') return { valid: false, reason: 'Não foi possível revalidar a sincronização com os dados atuais.' }
  if (!matchesCanonical(candidate, regenerated.proposal)) return { valid: false, reason: 'A proposta diverge dos tempos, recortes ou referências revalidados.' }
  return { valid: true, proposal: regenerated.proposal }
}
