import { describe, expect, it } from 'vitest'
import { musicAudioFilter, musicGainAt } from '@/lib/video-editor/music-audio'

describe('music timeline gain', () => {
  const track = { startTime: 2, trimStart: 1, trimEnd: 5, fadeIn: 1, fadeOut: 1, volume: 0.8 }
  it('uses the positioned trimmed duration and linear fades', () => {
    expect(musicGainAt(1.9, track)).toBe(0)
    expect(musicGainAt(2.5, track)).toBeCloseTo(0.4)
    expect(musicGainAt(3.5, track)).toBeCloseTo(0.8)
    expect(musicGainAt(5.5, track)).toBeCloseTo(0.4)
    expect(musicGainAt(6, track)).toBe(0)
    expect(musicGainAt(3, { ...track, volume: 0 })).toBe(0)
  })
  it('clamps overlapping fades to clip length for preview and export', () => {
    const short = { ...track, trimEnd: 2, fadeIn: 4, fadeOut: 4 }
    expect(musicGainAt(2.5, short)).toBeCloseTo(0.2)
    expect(musicAudioFilter(1, short, 'music')).toContain('afade=t=in:st=0:d=1.000,afade=t=out:st=0.000:d=1.000')
    expect(musicAudioFilter(1, track, 'music')).toContain('atrim=start=1.000:end=5.000')
    expect(musicAudioFilter(1, track, 'music')).toContain('adelay=2000:all=1')
  })
})
import { safeMixScale } from '@/lib/video-editor/music-audio'
describe('margem de mixagem', () => {
  it('preserva ganho isolado e proporção entre fontes, incluindo voz', () => {
    expect(safeMixScale(1, 0, 0)).toBe(1)
    expect(safeMixScale(0.4, 0.5, 0)).toBe(1)
    expect(safeMixScale(1, 1, 0)).toBeCloseTo(0.475)
    expect(safeMixScale(1, 1, 1.5)).toBeCloseTo(0.95 / 3.5)
    expect((1 + 1 + 1.5) * safeMixScale(1, 1, 1.5)).toBeCloseTo(0.95)
  })
  it('limita soma sintética em fase sem alterar a relação ou os fades', () => {
    const scale = safeMixScale(1, 1)
    for (let i = 0; i < 1000; i++) {
      const sample = Math.sin(i / 10)
      const mixed = sample * scale + sample * scale
      expect(Math.abs(mixed)).toBeLessThanOrEqual(0.95)
    }
    const track = { startTime: 0, trimStart: 0, trimEnd: 2, fadeIn: 1, fadeOut: 1, volume: scale }
    expect(musicGainAt(0.5, track)).toBeCloseTo(scale / 2)
    expect(musicGainAt(1.5, track)).toBeCloseTo(scale / 2)
  })
})
