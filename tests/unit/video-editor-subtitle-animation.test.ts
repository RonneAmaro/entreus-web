import { describe, expect, it } from 'vitest'
import { parseSavedProject } from '@/lib/video-editor/project-persistence'
import {
  createSubtitle,
  normalizeSubtitleSegment,
  resolveSubtitleStyle,
  subtitleAnimationState,
  SUBTITLE_PRESETS,
  validSubtitle,
  type SubtitleSegment,
} from '@/lib/video-editor/subtitles'

function projectWith(subtitles: unknown[]) {
  return JSON.stringify({
    version: 1, id: 'p', createdAt: 1, updatedAt: 2, name: 'Animação', editorMode: 'video', canvasSize: { width: 1280, height: 720 },
    baseVideo: null, baseVideoDuration: 0, baseTrim: { trimStart: 0, trimEnd: 0 }, extraVideos: [], photoSlides: [], imageOverlays: [],
    texts: [], stickers: [], sequenceOrder: [], excludedClipIds: [], clipTransitions: {}, photoTransition: 'fade', filter: 'normal', videoVolume: 1,
    music: { media: null, name: '', selectedMusicId: null, duration: 0, startTime: 0, trimStart: 0, trimEnd: 0, volume: 1, volumeTouched: false },
    voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: '', currentTime: 0, subtitles,
  })
}

describe('animações determinísticas de legenda', () => {
  it('mantém projeto legado estático e normaliza os novos campos sem alterar sua aparência base', () => {
    const current = createSubtitle('p', 'legacy', 1, 3, 0)
    const legacyStyle = { ...current.style } as Partial<typeof current.style>
    delete legacyStyle.highlightColor
    delete legacyStyle.animation
    delete legacyStyle.animationIntensity
    delete legacyStyle.enterDuration
    delete legacyStyle.exitDuration
    delete legacyStyle.karaokeMode
    const legacy = { ...current, style: legacyStyle }

    expect(validSubtitle(legacy)).toBe(true)
    const parsed = parseSavedProject(projectWith([legacy])).subtitles?.[0]
    expect(parsed?.style).toMatchObject({ ...legacyStyle, animation: 'none', karaokeMode: 'off' })
    expect(subtitleAnimationState(parsed!, 1)).toMatchObject({ opacity: 1, scale: 1, translateYRatio: 0, karaokeProgress: 0 })
  })

  it('calcula fade e saída somente pelo tempo da timeline, inclusive após busca e pausa', () => {
    const segment: SubtitleSegment = { ...createSubtitle('p', 'fade', 2, 6, 0), style: { ...SUBTITLE_PRESETS.classic, enterDuration: 1, exitDuration: 1 } }
    expect(subtitleAnimationState(segment, 2).opacity).toBe(0)
    expect(subtitleAnimationState(segment, 2.5).opacity).toBeCloseTo(0.5)
    expect(subtitleAnimationState(segment, 4).opacity).toBe(1)
    expect(subtitleAnimationState(segment, 5.5).opacity).toBeCloseTo(0.5)
    expect(subtitleAnimationState(segment, 4.25)).toEqual(subtitleAnimationState(segment, 4.25))
  })

  it('interpola pop, zoom e slide sem deformação não uniforme', () => {
    const base = createSubtitle('p', 'motion', 0, 2, 0)
    const pop = { ...base, style: { ...SUBTITLE_PRESETS.pop, enterDuration: 1, animationIntensity: 100 } }
    const zoom = { ...base, style: { ...SUBTITLE_PRESETS.cinematic, enterDuration: 1, animationIntensity: 100 } }
    const slide = { ...base, style: { ...SUBTITLE_PRESETS.modern, enterDuration: 1, animationIntensity: 100 } }

    expect(subtitleAnimationState(pop, 0).scale).toBeCloseTo(0.82)
    expect(subtitleAnimationState(pop, 0.5).scale).toBeGreaterThan(1)
    expect(subtitleAnimationState(pop, 1).scale).toBe(1)
    expect(subtitleAnimationState(zoom, 0).scale).toBeCloseTo(0.92)
    expect(subtitleAnimationState(zoom, 1).scale).toBe(1)
    expect(subtitleAnimationState(slide, 0).translateYRatio).toBeCloseTo(0.03)
    expect(subtitleAnimationState(slide, 1).translateYRatio).toBe(0)
  })

  it('faz o karaokê confiável progredir no intervalo real do segmento', () => {
    const segment: SubtitleSegment = { ...createSubtitle('p', 'karaoke', 10, 14, 0), style: { ...SUBTITLE_PRESETS.karaoke } }
    expect(subtitleAnimationState(segment, 9).karaokeProgress).toBe(0)
    expect(subtitleAnimationState(segment, 11).karaokeProgress).toBeCloseTo(0.25)
    expect(subtitleAnimationState(segment, 12).karaokeProgress).toBeCloseTo(0.5)
    expect(subtitleAnimationState(segment, 14).karaokeProgress).toBe(1)
  })

  it('rejeita campos inválidos no modelo direto e oferece fallback seguro na normalização', () => {
    const segment = createSubtitle('p', 'invalid', 0, 2, 0)
    expect(validSubtitle({ ...segment, style: { ...segment.style, animation: 'shake' } })).toBe(false)
    expect(validSubtitle({ ...segment, style: { ...segment.style, animationIntensity: 101 } })).toBe(false)
    expect(validSubtitle({ ...segment, style: { ...segment.style, highlightColor: 'yellow' } })).toBe(false)

    const normalized = normalizeSubtitleSegment({
      ...segment,
      style: { ...segment.style, animation: 'shake', animationIntensity: 500, enterDuration: -1, highlightColor: 'yellow' },
    } as unknown as SubtitleSegment)
    expect(resolveSubtitleStyle(normalized.style)).toMatchObject({ animation: 'none', animationIntensity: 100, enterDuration: 0, highlightColor: '#facc15' })
    expect(validSubtitle(normalized)).toBe(true)
  })

  it('mantém presets profissionais completos e independentes', () => {
    expect(Object.keys(SUBTITLE_PRESETS)).toEqual(['classic', 'modern', 'pop', 'cinematic', 'high-contrast', 'karaoke'])
    expect(SUBTITLE_PRESETS.pop.animation).toBe('pop')
    expect(SUBTITLE_PRESETS.cinematic.animation).toBe('zoom')
    expect(SUBTITLE_PRESETS.karaoke.karaokeMode).toBe('segment')
    expect(SUBTITLE_PRESETS['high-contrast'].background).toBe(true)
  })
})
