export type RhythmOptions = { windowSeconds?: number; minSeparationSeconds?: number; thresholdRatio?: number }
export type RhythmResult = { events: number[]; status: 'detected' | 'insufficient' }

// Conservative bounds also apply when the pure function is used without the adapter.
export const RHYTHM_MAX_SECONDS = 60
export const RHYTHM_MAX_PCM_BYTES = 48 * 1024 * 1024
export const RHYTHM_MAX_RATE = 96000

export function analyzeRhythm(channels: readonly Float32Array[], sampleRate: number, options: RhythmOptions = {}): RhythmResult {
  const windowSeconds = options.windowSeconds ?? 0.02
  const separation = options.minSeparationSeconds ?? 0.3
  const ratio = options.thresholdRatio ?? 3
  if (!Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > RHYTHM_MAX_RATE || !Number.isInteger(sampleRate)
    || channels.length < 1 || channels.length > 2 || !(channels[0] instanceof Float32Array)
    || channels.some((c) => !(c instanceof Float32Array) || c.length !== channels[0].length)
    || !channels[0].length || channels[0].length / sampleRate > RHYTHM_MAX_SECONDS
    || channels.reduce((sum, c) => sum + c.byteLength, 0) > RHYTHM_MAX_PCM_BYTES
    || !Number.isFinite(windowSeconds) || windowSeconds < 0.01 || windowSeconds > 0.1
    || !Number.isFinite(separation) || separation < 0.1 || separation > 5
    || !Number.isFinite(ratio) || ratio < 2 || ratio > 20) throw new Error('PCM ou parâmetros de análise inválidos.')
  const size = Math.max(1, Math.round(sampleRate * windowSeconds))
  const energy: number[] = []
  for (let start = 0; start < channels[0].length; start += size) {
    let sum = 0
    const end = Math.min(start + size, channels[0].length)
    for (let i = start; i < end; i++) {
      // Mean channel power avoids cancellation of opposite-phase stereo.
      for (const channel of channels) {
        const value = channel[i]
        if (!Number.isFinite(value) || Math.abs(value) > 1.01) throw new Error('PCM contém amostras inválidas.')
        sum += value * value / channels.length
      }
    }
    energy.push(Math.sqrt(sum / (end - start)))
  }
  const candidates: { time: number; strength: number }[] = []
  for (let i = 1; i < energy.length - 1; i++) {
    const current = energy[i]
    const local = energy.slice(Math.max(0, i - 25), Math.min(energy.length, i + 26)).sort((a, b) => a - b)
    const median = local[Math.floor(local.length / 2)]
    if (current > 0.01 && current > median * ratio && current > energy[i - 1] * 1.5 && current >= energy[i + 1]) {
      candidates.push({ time: i * size / sampleRate, strength: current })
    }
  }
  // Strongest first; earlier wins ties. Suppress adjacent detections deterministically.
  candidates.sort((a, b) => b.strength - a.strength || a.time - b.time)
  const selected: typeof candidates = []
  for (const candidate of candidates) if (selected.every((item) => Math.abs(item.time - candidate.time) >= separation - 1e-9)) selected.push(candidate)
  const events = selected.map((item) => item.time).sort((a, b) => a - b)
  return events.length >= 2 ? { events, status: 'detected' } : { events: [], status: 'insufficient' }
}
