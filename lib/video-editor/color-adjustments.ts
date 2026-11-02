export type ColorPreset = 'normal' | 'warm' | 'cool' | 'mono' | 'cinematic' | 'sepia'
export type ColorAdjustments = {
  preset: ColorPreset
  intensity: number
  brightness: number
  contrast: number
  saturation: number
  temperature: number
}

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  preset: 'normal', intensity: 100, brightness: 0, contrast: 0, saturation: 0, temperature: 0,
}

export function validColorAdjustments(value: unknown): value is ColorAdjustments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return ['normal', 'warm', 'cool', 'mono', 'cinematic', 'sepia'].includes(String(v.preset))
    && (['intensity', 'brightness', 'contrast', 'saturation', 'temperature'] as const).every((key) =>
      typeof v[key] === 'number' && Number.isFinite(v[key]) && v[key] >= (key === 'intensity' ? 0 : -100) && v[key] <= 100)
}

export function colorCss(a: ColorAdjustments): string {
  const strength = a.intensity / 100
  const preset = a.preset
  const mono = preset === 'mono' ? strength : 0
  const sepia = preset === 'sepia' ? strength : preset === 'cinematic' ? strength * 0.18 : 0
  const warmth = a.temperature / 100 + (preset === 'warm' ? 0.3 * strength : preset === 'cool' ? -0.3 * strength : 0)
  const contrast = 1 + a.contrast / 100 + (preset === 'cinematic' ? 0.18 * strength : 0)
  const saturation = Math.max(0, 1 + a.saturation / 100 + (preset === 'cinematic' ? -0.12 * strength : 0))
  return `brightness(${(1 + a.brightness / 100).toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) grayscale(${mono.toFixed(3)}) sepia(${Math.min(1, sepia + Math.abs(warmth) * 0.15).toFixed(3)}) hue-rotate(${(warmth < 0 ? 12 : -12) * Math.abs(warmth)}deg)`
}

export function colorFfmpeg(a: ColorAdjustments): string {
  const strength = a.intensity / 100
  const mono = a.preset === 'mono' ? strength : 0
  const sepia = a.preset === 'sepia' ? strength : a.preset === 'cinematic' ? strength * 0.18 : 0
  const warmth = a.temperature / 100 + (a.preset === 'warm' ? 0.3 * strength : a.preset === 'cool' ? -0.3 * strength : 0)
  const contrast = 1 + a.contrast / 100 + (a.preset === 'cinematic' ? 0.18 * strength : 0)
  const saturation = Math.max(0, 1 + a.saturation / 100 + (a.preset === 'cinematic' ? -0.12 * strength : 0)) * (1 - mono)
  const filters = [`eq=brightness=${(a.brightness / 100).toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`]
  if (sepia > 0) filters.push(`colorbalance=rs=${(sepia * 0.12).toFixed(3)}:gs=${(sepia * 0.03).toFixed(3)}:bs=${(-sepia * 0.12).toFixed(3)}`)
  if (warmth !== 0) filters.push(`colorbalance=rm=${(warmth * 0.2).toFixed(3)}:bm=${(-warmth * 0.2).toFixed(3)}`)
  return filters.join(',')
}
