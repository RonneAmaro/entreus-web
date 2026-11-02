import { describe, expect, it } from 'vitest'
import { audioClipGainAt, audioClipTiming, normalizeAudioClipFades, type SavedAudioClip } from '@/lib/video-editor/audio-clips'
import { musicAudioFilter } from '@/lib/video-editor/music-audio'
import { parseSavedProject, type SavedProject } from '@/lib/video-editor/project-persistence'

const clip: SavedAudioClip = { id: 'audio-one', assetId: 'asset', media: { id: 'audio-one', name: 'tone.wav', size: 200, type: 'audio/wav', lastModified: 1 }, sourceDuration: 10, startTime: 2, trimStart: 1, trimEnd: 9, volume: 0.8, muted: false }
const project: SavedProject = { version: 1, id: 'project', name: 'Fades', createdAt: 1, updatedAt: 1, editorMode: 'video', canvasSize: { width: 160, height: 90 }, baseVideo: null, baseVideoDuration: 0, baseTrim: { trimStart: 0, trimEnd: 10 }, extraVideos: [], photoSlides: [], imageOverlays: [], videoOverlays: [], texts: [], stickers: [], sequenceOrder: [], excludedClipIds: [], clipTransitions: {}, photoTransition: 'none', filter: 'normal', videoVolume: 1, music: { media: null, name: '', selectedMusicId: null, duration: 0, startTime: 0, trimStart: 0, trimEnd: 0, volume: 1, volumeTouched: false }, voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: '', currentTime: 0 }

describe('fades individuais de áudio', () => {
  it('aplica entrada e saída ao ganho, no tempo da timeline e não da fonte', () => {
    const faded = { ...clip, fadeIn: 2, fadeOut: 3 }
    expect(audioClipGainAt(1, faded, 12)).toBe(0)
    expect(audioClipGainAt(2, faded, 12)).toBe(0)
    expect(audioClipGainAt(3, faded, 12)).toBeCloseTo(0.4)
    expect(audioClipGainAt(5, faded, 12)).toBe(0.8)
    expect(audioClipGainAt(8.5, faded, 12)).toBeCloseTo(0.4)
    expect(audioClipGainAt(10, faded, 12)).toBe(0)
  })
  it('zero e projetos sem campos preservam o ganho e compatibilidade', () => {
    expect(audioClipGainAt(3, clip, 12)).toBe(0.8)
    expect(audioClipGainAt(3, { ...clip, fadeIn: 0, fadeOut: 0 }, 12)).toBe(0.8)
    expect(parseSavedProject(JSON.stringify({ ...project, audioClips: [clip] })).audioClips).toEqual([clip])
    expect(parseSavedProject(JSON.stringify(project)).audioClips).toBeUndefined()
  })
  it('sobrepõe rampas por produto, sem picos ou valores negativos', () => {
    const faded = { ...clip, fadeIn: 8, fadeOut: 8 }
    expect(audioClipGainAt(6, faded, 12)).toBeCloseTo(0.2)
    for (let time = 0; time < 12; time += 0.1) expect(audioClipGainAt(time, faded, 12)).toBeGreaterThanOrEqual(0)
  })
  it('limita fades ao corte e ao fim do projeto, inclusive clipe vazio', () => {
    const faded = { ...clip, fadeIn: 20, fadeOut: 20 }
    expect(audioClipTiming(faded, 5)).toMatchObject({ trimEnd: 4, fadeIn: 3, fadeOut: 3 })
    expect(normalizeAudioClipFades({ ...faded, trimEnd: 2 }, 12)).toMatchObject({ fadeIn: 1, fadeOut: 1 })
    expect(audioClipGainAt(3, faded, 1)).toBe(0)
  })
  it.each([-5, NaN, Infinity, 'bad', null])('normaliza valor inválido %s sem perder o projeto', (fade) => {
    const loaded = parseSavedProject(JSON.stringify({ ...project, audioClips: [{ ...clip, fadeIn: fade, fadeOut: fade }] })).audioClips![0]
    expect(loaded.fadeIn).toBe(0)
    expect(loaded.fadeOut).toBe(0)
  })
  it('preserva parâmetros válidos ao recarregar', () => {
    expect(parseSavedProject(JSON.stringify({ ...project, audioClips: [{ ...clip, fadeIn: 2, fadeOut: 3 }] })).audioClips![0]).toMatchObject({ fadeIn: 2, fadeOut: 3 })
  })
  it('mute vence os fades e duas faixas mantêm envelopes independentes', () => {
    const first = { ...clip, fadeIn: 2 }, second = { ...clip, startTime: 3, volume: 0.4, fadeIn: 4 }
    expect(audioClipGainAt(4, first, 12)).toBe(0.8)
    expect(audioClipGainAt(4, second, 12)).toBe(0.1)
    expect(audioClipGainAt(4, { ...first, muted: true }, 12)).toBe(0)
  })
  it('gera corte, rampas, ganho e atraso nessa ordem para o intervalo útil', () => {
    const timing = audioClipTiming({ ...clip, fadeIn: 2, fadeOut: 3 }, 6)
    expect(musicAudioFilter(1, timing, 'extra')).toBe('[1:a]atrim=start=1.000:end=5.000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=2.000,afade=t=out:st=1.000:d=3.000,volume=0.800000,adelay=2000:all=1[extra]')
  })
})
