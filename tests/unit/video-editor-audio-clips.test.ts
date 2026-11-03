import { describe, expect, it } from 'vitest'
import { audioClipGain, audioClipSourceTime, validAudioClip, type SavedAudioClip } from '@/lib/video-editor/audio-clips'
import { parseSavedProject, type SavedProject } from '@/lib/video-editor/project-persistence'

function audio(id = 'audio-one'): SavedAudioClip {
  return { id, assetId: `asset-${id}`, media: { id, name: 'tone.wav', type: 'audio/wav', size: 200, lastModified: 1, duration: 3 }, sourceDuration: 3, startTime: 0.5, trimStart: 0.2, trimEnd: 2.2, volume: 0.37, muted: false }
}
function legacy(): SavedProject {
  return { version: 1, id: 'project-1', createdAt: 1, updatedAt: 1, name: 'Audio', editorMode: 'video', canvasSize: { width: 160, height: 90 }, baseVideo: null, baseVideoDuration: 0,
    baseTrim: { trimStart: 0, trimEnd: 3 }, extraVideos: [], photoSlides: [], imageOverlays: [], videoOverlays: [], texts: [], stickers: [], sequenceOrder: [], excludedClipIds: [], clipTransitions: {}, photoTransition: 'none', filter: 'normal', videoVolume: 1,
    music: { media: { id: 'audio-track', name: 'old.wav', type: 'audio/wav', size: 200, lastModified: 1 }, name: 'old.wav', selectedMusicId: null, duration: 3, startTime: 0, trimStart: 0, trimEnd: 3, volume: 0.4, volumeTouched: true },
    voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: '', currentTime: 0 }
}

describe('clipes de áudio independentes', () => {
  it('mantém projetos antigos sem duplicar a música legada', () => {
    const saved = parseSavedProject(JSON.stringify(legacy()))
    expect(saved.music.media?.id).toBe('audio-track')
    expect(saved.audioClips).toBeUndefined()
  })
  it('preserva dois clipes, mute e ganho anterior ao recarregar', () => {
    const project = legacy()
    project.audioClips = [audio(), { ...audio('audio-two'), startTime: 1.5, muted: true }]
    project.music = { ...project.music, volume: 0, previousVolume: 0.37 }
    const saved = parseSavedProject(JSON.stringify(project))
    expect(saved.audioClips).toEqual(project.audioClips)
    expect(saved.music.previousVolume).toBe(0.37)
    const muted = saved.audioClips![1]
    expect(audioClipGain(muted)).toBe(0)
    expect(audioClipGain({ ...muted, muted: false })).toBe(0.37)
  })
  it('posiciona fontes simultâneas e sequenciais, respeitando cortes e fim do projeto', () => {
    const first = audio(), second = { ...audio('audio-two'), startTime: 1 }
    expect(audioClipSourceTime(0.4, first, 3)).toBeNull()
    expect(audioClipSourceTime(1.2, first, 3)).toBeCloseTo(0.9)
    expect(audioClipSourceTime(1.2, second, 3)).toBeCloseTo(0.4)
    expect(audioClipSourceTime(2.5, first, 3)).toBeNull()
    expect(audioClipSourceTime(2.5, second, 3)).toBeCloseTo(1.7)
    expect(audioClipSourceTime(2, second, 2)).toBeNull()
  })
  it.each([{ volume: -0.1 }, { volume: NaN }, { startTime: -1 }, { trimEnd: 4 }, { trimStart: 2.2 }, { muted: 'false' }, { id: 'audio-track' }])('rejeita metadados inválidos: %j', (changes) => {
    expect(validAudioClip({ ...audio(), ...changes })).toBe(false)
    expect(() => parseSavedProject(JSON.stringify({ ...legacy(), audioClips: [{ ...audio(), ...changes }] }))).toThrow()
  })
  it('rejeita identificadores duplicados e coleções excessivas', () => {
    expect(() => parseSavedProject(JSON.stringify({ ...legacy(), audioClips: [audio(), audio()] }))).toThrow()
    expect(() => parseSavedProject(JSON.stringify({ ...legacy(), audioClips: Array.from({ length: 17 }, (_, i) => audio(`audio-${i}`)) }))).toThrow()
  })
})
