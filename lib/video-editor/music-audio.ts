export type MusicTiming = { startTime: number; trimStart: number; trimEnd: number; fadeIn: number; fadeOut: number; volume: number }
// A fixed project-wide scale keeps source ratios and avoids level pumping at clip boundaries.
export function safeMixScale(...gains: number[]): number {
  const total = gains.reduce((sum, gain) => sum + (Number.isFinite(gain) ? Math.max(0, gain) : 0), 0)
  return total > 1 ? 0.95 / total : 1
}
export function musicGainAt(time: number, music: MusicTiming): number {
  const length = Math.max(0, music.trimEnd - music.trimStart)
  const elapsed = time - music.startTime
  if (elapsed < 0 || elapsed >= length) return 0
  const fadeIn = Math.min(Math.max(0, music.fadeIn), length)
  const fadeOut = Math.min(Math.max(0, music.fadeOut), length)
  return Math.max(0, Math.min(1, music.volume)) * (fadeIn ? Math.min(1, elapsed / fadeIn) : 1) * (fadeOut ? Math.min(1, (length - elapsed) / fadeOut) : 1)
}
export function musicAudioFilter(input: number, music: MusicTiming, label: string): string {
  const length = Math.max(0.001, music.trimEnd - music.trimStart)
  const fadeIn = Math.min(Math.max(0, music.fadeIn), length)
  const fadeOut = Math.min(Math.max(0, music.fadeOut), length)
  const filters = [`atrim=start=${music.trimStart.toFixed(3)}:end=${music.trimEnd.toFixed(3)}`, 'asetpts=PTS-STARTPTS']
  if (fadeIn) filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`)
  if (fadeOut) filters.push(`afade=t=out:st=${(length - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`)
  filters.push(`volume=${Math.max(0, Math.min(1, music.volume)).toFixed(6)}`, `adelay=${Math.max(0, Math.round(music.startTime * 1000))}:all=1`)
  return `[${input}:a]${filters.join(',')}[${label}]`
}
