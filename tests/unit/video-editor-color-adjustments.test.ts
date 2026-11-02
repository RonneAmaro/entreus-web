import { describe, expect, it } from 'vitest'
import { colorCss, colorFfmpeg, DEFAULT_COLOR_ADJUSTMENTS, validColorAdjustments } from '@/lib/video-editor/color-adjustments'
import { buildMediaSequenceGraph } from '@/lib/video-editor/render-plan'

describe('ajustes de cor por clipe', () => {
  it('usa original sem transformar cor e gera filtros seguros para todos os presets', () => {
    expect(validColorAdjustments(DEFAULT_COLOR_ADJUSTMENTS)).toBe(true)
    expect(colorFfmpeg(DEFAULT_COLOR_ADJUSTMENTS)).toContain('saturation=1.000')
    for (const preset of ['warm', 'cool', 'mono', 'cinematic', 'sepia'] as const) {
      const value = { ...DEFAULT_COLOR_ADJUSTMENTS, preset, intensity: 70 }
      expect(colorCss(value)).toContain('brightness(')
      expect(colorFfmpeg(value)).toContain('eq=')
    }
    expect(validColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, intensity: 101 })).toBe(false)
  })

  it('usa ajuste específico para vídeo e foto na mesma sequência', () => {
    const clips = [
      { id: 'video', type: 'video' as const, duration: 2, trimStart: 0, transition: 'none' as const, inputName: 'a.mp4', inputIndex: 0, hasAudio: false },
      { id: 'photo', type: 'image' as const, duration: 2, trimStart: 0, transition: 'none' as const, inputName: 'b.png', inputIndex: 1, hasAudio: false },
    ]
    const graph = buildMediaSequenceGraph(clips, { width: 160, height: 90, visualFilter: 'null', videoVolume: 1, clipFilters: { video: 'eq=brightness=0.2', photo: 'eq=brightness=-0.2' } })
    expect(graph.videoFilters[0]).toContain('eq=brightness=0.2')
    expect(graph.videoFilters[1]).toContain('eq=brightness=-0.2')
  })
})
