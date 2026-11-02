export type SubtitlePreset = 'classic' | 'modern' | 'pop' | 'cinematic' | 'high-contrast' | 'karaoke'
export type SubtitleFontKey = 'system' | 'strong' | 'elegant' | 'condensed' | 'casual' | 'mono' | 'classic' | 'rounded'
export type SubtitleAnimation = 'none' | 'fade' | 'pop' | 'zoom' | 'slide'
export type SubtitleKaraokeMode = 'off' | 'segment'
export type SubtitleWord = { text: string; startTime: number; endTime: number }
export type SubtitleStyle = {
  preset: SubtitlePreset
  font: SubtitleFontKey
  size: number
  color: string
  outline: number
  shadow: boolean
  background: boolean
  position: number
  align: 'left' | 'center' | 'right'
  highlightColor: string
  animation: SubtitleAnimation
  animationIntensity: number
  enterDuration: number
  exitDuration: number
  karaokeMode: SubtitleKaraokeMode
}
export type SubtitleSegment = {
  id: string
  projectId: string
  text: string
  startTime: number
  endTime: number
  order: number
  style: SubtitleStyle
  words?: SubtitleWord[]
}

export const SUBTITLE_PRESETS: Record<SubtitlePreset, SubtitleStyle> = {
  classic: { preset: 'classic', font: 'system', size: 40, color: '#ffffff', outline: 2, shadow: true, background: false, position: 88, align: 'center', highlightColor: '#facc15', animation: 'fade', animationIntensity: 35, enterDuration: 0.25, exitDuration: 0.2, karaokeMode: 'off' },
  modern: { preset: 'modern', font: 'rounded', size: 38, color: '#ffffff', outline: 0, shadow: true, background: true, position: 86, align: 'center', highlightColor: '#38bdf8', animation: 'slide', animationIntensity: 45, enterDuration: 0.28, exitDuration: 0.2, karaokeMode: 'off' },
  pop: { preset: 'pop', font: 'strong', size: 44, color: '#ffffff', outline: 3, shadow: true, background: false, position: 84, align: 'center', highlightColor: '#f472b6', animation: 'pop', animationIntensity: 65, enterDuration: 0.32, exitDuration: 0.18, karaokeMode: 'off' },
  cinematic: { preset: 'cinematic', font: 'elegant', size: 38, color: '#f8fafc', outline: 1, shadow: true, background: false, position: 86, align: 'center', highlightColor: '#e2e8f0', animation: 'zoom', animationIntensity: 30, enterDuration: 0.45, exitDuration: 0.35, karaokeMode: 'off' },
  'high-contrast': { preset: 'high-contrast', font: 'strong', size: 42, color: '#ffff00', outline: 3, shadow: false, background: true, position: 86, align: 'center', highlightColor: '#ffffff', animation: 'fade', animationIntensity: 25, enterDuration: 0.2, exitDuration: 0.2, karaokeMode: 'off' },
  karaoke: { preset: 'karaoke', font: 'system', size: 40, color: '#ffffff', outline: 2, shadow: true, background: false, position: 88, align: 'center', highlightColor: '#facc15', animation: 'fade', animationIntensity: 30, enterDuration: 0.18, exitDuration: 0.18, karaokeMode: 'segment' },
}

const LEGACY_STYLE_DEFAULTS = {
  highlightColor: '#facc15',
  animation: 'none' as const,
  animationIntensity: 50,
  enterDuration: 0.25,
  exitDuration: 0.2,
  karaokeMode: 'off' as const,
}

export const SUBTITLE_ANIMATIONS: readonly SubtitleAnimation[] = ['none', 'fade', 'pop', 'zoom', 'slide']
export const SUBTITLE_KARAOKE_MODES: readonly SubtitleKaraokeMode[] = ['off', 'segment']

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const color = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type LegacySubtitleStyle = Omit<SubtitleStyle, 'highlightColor' | 'animation' | 'animationIntensity' | 'enterDuration' | 'exitDuration' | 'karaokeMode'>

export function resolveSubtitleStyle(style: LegacySubtitleStyle | SubtitleStyle): SubtitleStyle {
  const candidate = style as Partial<SubtitleStyle>
  return {
    ...style,
    highlightColor: color(candidate.highlightColor) ? candidate.highlightColor : LEGACY_STYLE_DEFAULTS.highlightColor,
    animation: SUBTITLE_ANIMATIONS.includes(candidate.animation as SubtitleAnimation) ? candidate.animation as SubtitleAnimation : LEGACY_STYLE_DEFAULTS.animation,
    animationIntensity: finite(candidate.animationIntensity) ? clamp(candidate.animationIntensity, 0, 100) : LEGACY_STYLE_DEFAULTS.animationIntensity,
    enterDuration: finite(candidate.enterDuration) ? clamp(candidate.enterDuration, 0, 2) : LEGACY_STYLE_DEFAULTS.enterDuration,
    exitDuration: finite(candidate.exitDuration) ? clamp(candidate.exitDuration, 0, 2) : LEGACY_STYLE_DEFAULTS.exitDuration,
    karaokeMode: SUBTITLE_KARAOKE_MODES.includes(candidate.karaokeMode as SubtitleKaraokeMode) ? candidate.karaokeMode as SubtitleKaraokeMode : LEGACY_STYLE_DEFAULTS.karaokeMode,
  }
}

export type SubtitleAnimationState = {
  opacity: number
  scale: number
  translateYRatio: number
  segmentProgress: number
  karaokeProgress: number
}

export function subtitleAnimationState(segment: SubtitleSegment, time: number): SubtitleAnimationState {
  const style = resolveSubtitleStyle(segment.style)
  const duration = Math.max(segment.endTime - segment.startTime, 0.001)
  const localTime = clamp(time - segment.startTime, 0, duration)
  const segmentProgress = clamp(localTime / duration, 0, 1)
  const enterDuration = Math.min(style.enterDuration, duration / 2)
  const exitDuration = Math.min(style.exitDuration, duration / 2)
  const enterProgress = enterDuration > 0 ? clamp(localTime / enterDuration, 0, 1) : 1
  const exitProgress = exitDuration > 0 ? clamp((duration - localTime) / exitDuration, 0, 1) : 1
  const intensity = style.animationIntensity / 100
  const animated = style.animation !== 'none'
  const opacity = animated ? Math.min(enterProgress, exitProgress) : 1
  let scale = 1
  let translateYRatio = 0

  if (style.animation === 'pop' && enterProgress < 1) {
    scale = 1 - 0.18 * intensity * (1 - enterProgress) + 0.14 * intensity * Math.sin(Math.PI * enterProgress)
  } else if (style.animation === 'zoom' && enterProgress < 1) {
    scale = 1 - 0.08 * intensity * (1 - enterProgress)
  } else if (style.animation === 'slide' && enterProgress < 1) {
    translateYRatio = 0.03 * intensity * (1 - enterProgress)
  }

  return {
    opacity,
    scale,
    translateYRatio,
    segmentProgress,
    karaokeProgress: style.karaokeMode === 'segment' ? segmentProgress : 0,
  }
}

export function validSubtitle(value: unknown): value is SubtitleSegment {
  if (!record(value) || typeof value.id !== 'string' || !value.id || value.id.length > 100
    || typeof value.projectId !== 'string' || !value.projectId || value.projectId.length > 100
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2000
    || !finite(value.startTime) || !finite(value.endTime) || value.startTime < 0 || value.endTime <= value.startTime
    || !finite(value.order) || !Number.isInteger(value.order) || !record(value.style)) return false
  const style = value.style
  if (!Object.hasOwn(SUBTITLE_PRESETS, String(style.preset)) || !['system', 'strong', 'elegant', 'condensed', 'casual', 'mono', 'classic', 'rounded'].includes(String(style.font))
    || !finite(style.size) || style.size < 12 || style.size > 120 || !color(style.color)
    || !finite(style.outline) || style.outline < 0 || style.outline > 8
    || typeof style.shadow !== 'boolean' || typeof style.background !== 'boolean'
    || !finite(style.position) || style.position < 10 || style.position > 92
    || !['left', 'center', 'right'].includes(String(style.align))
    || (style.highlightColor !== undefined && !color(style.highlightColor))
    || (style.animation !== undefined && !SUBTITLE_ANIMATIONS.includes(style.animation as SubtitleAnimation))
    || (style.animationIntensity !== undefined && (!finite(style.animationIntensity) || style.animationIntensity < 0 || style.animationIntensity > 100))
    || (style.enterDuration !== undefined && (!finite(style.enterDuration) || style.enterDuration < 0 || style.enterDuration > 2))
    || (style.exitDuration !== undefined && (!finite(style.exitDuration) || style.exitDuration < 0 || style.exitDuration > 2))
    || (style.karaokeMode !== undefined && !SUBTITLE_KARAOKE_MODES.includes(style.karaokeMode as SubtitleKaraokeMode))) return false
  if (value.words === undefined) return true
  const segmentStart = value.startTime as number
  const segmentEnd = value.endTime as number
  return Array.isArray(value.words) && value.words.length <= 100 && value.words.every((word: unknown) =>
    record(word) && typeof word.text === 'string' && !!word.text.trim() && word.text.length <= 100
    && finite(word.startTime) && finite(word.endTime) && word.startTime >= segmentStart
    && word.endTime <= segmentEnd && word.endTime > word.startTime)
}

export function activeSubtitles(segments: SubtitleSegment[], time: number) {
  return segments.filter((item) => time >= item.startTime && time < item.endTime).sort((a, b) => a.order - b.order)
}

export function activeSubtitleWord(segment: SubtitleSegment, time: number) {
  return segment.words?.find((word) => time >= word.startTime && time < word.endTime) ?? null
}

export function createSubtitle(projectId: string, id: string, startTime: number, endTime: number, order: number): SubtitleSegment {
  return { id, projectId, text: 'Nova legenda', startTime, endTime, order, style: { ...SUBTITLE_PRESETS.classic } }
}

export function normalizeSubtitleSegment(segment: SubtitleSegment): SubtitleSegment {
  return { ...segment, style: resolveSubtitleStyle(segment.style) }
}

function timestamp(value: string): number | null {
  const match = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds + Number(match[4]) / 1000
}

export function parseSubtitleFile(source: string, format: 'srt' | 'vtt', projectId: string, firstOrder = 0): SubtitleSegment[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (normalized.length > 500_000) throw new Error('O arquivo de legendas é grande demais.')
  const body = format === 'vtt' ? normalized.replace(/^WEBVTT[^\n]*\n/, '') : normalized
  if (format === 'vtt' && body === normalized) throw new Error('O arquivo WebVTT precisa começar com WEBVTT.')
  const blocks = body.split(/\n\s*\n/).filter((block) => block.trim() && !/^(NOTE|STYLE|REGION)(\s|$)/.test(block.trim()))
  if (!blocks.length || blocks.length > 1000) throw new Error('Nenhuma legenda válida foi encontrada.')
  return blocks.map((block, index) => {
    const lines = block.split('\n')
    const cue = lines.findIndex((line) => line.includes('-->'))
    if (cue < 0 || cue > 1 || cue === lines.length - 1) throw new Error(`Legenda ${index + 1}: tempo ou texto ausente.`)
    const match = /^([^\s]+)\s+-->\s+([^\s]+)/.exec(lines[cue])
    const startTime = match ? timestamp(match[1]) : null
    const endTime = match ? timestamp(match[2]) : null
    const text = lines.slice(cue + 1).join('\n').replace(/<[^>]*>/g, '').trim()
    if (startTime === null || endTime === null || endTime <= startTime || !text) throw new Error(`Legenda ${index + 1}: tempo ou texto inválido.`)
    const segment: SubtitleSegment = { id: crypto.randomUUID(), projectId, text, startTime, endTime, order: firstOrder + index, style: { ...SUBTITLE_PRESETS.classic } }
    if (!validSubtitle(segment)) throw new Error(`Legenda ${index + 1}: conteúdo inválido.`)
    return segment
  })
}
