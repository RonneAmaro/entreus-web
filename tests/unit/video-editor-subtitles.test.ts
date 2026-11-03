import { describe, expect, it } from 'vitest'
import { activeSubtitleWord, activeSubtitles, createSubtitle, parseSubtitleFile, SUBTITLE_PRESETS, validSubtitle, type SubtitleSegment } from '@/lib/video-editor/subtitles'
import { parseSavedProject } from '@/lib/video-editor/project-persistence'

describe('legendas temporizadas do Studio', () => {
  it('cria um segmento independente e seleciona somente dentro do intervalo', () => {
    const segment = createSubtitle('project-1', 'sub-1', 0.5, 1.5, 0)
    expect(validSubtitle(segment)).toBe(true)
    expect(activeSubtitles([segment], 0.49)).toEqual([])
    expect(activeSubtitles([segment], 0.5)).toEqual([segment])
    expect(activeSubtitles([segment], 1.5)).toEqual([])
    expect(validSubtitle({ ...segment, text: '' })).toBe(false)
    expect(validSubtitle({ ...segment, endTime: 0.4 })).toBe(false)
    expect(validSubtitle({ ...segment, startTime: Number.NaN })).toBe(false)
    expect(validSubtitle({ ...segment, style: { ...segment.style, position: 99 } })).toBe(false)
  })

  it('importa SRT e WebVTT com acentuação e rejeita tempos inválidos', () => {
    const srt = parseSubtitleFile('1\n00:00:00,500 --> 00:00:01,500\nOlá, mundo!\n\n2\n00:00:02,000 --> 00:00:03,000\nAté amanhã', 'srt', 'project-1')
    expect(srt.map(({ text, startTime }) => [text, startTime])).toEqual([['Olá, mundo!', 0.5], ['Até amanhã', 2]])
    const vtt = parseSubtitleFile('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<b>Bom dia</b>', 'vtt', 'project-1', 2)
    expect(vtt[0]).toMatchObject({ text: 'Bom dia', order: 2 })
    expect(() => parseSubtitleFile('00:00:03,000 --> 00:00:02,000\nErro', 'srt', 'project-1')).toThrow(/tempo/)
    expect(() => parseSubtitleFile('texto solto', 'vtt', 'project-1')).toThrow(/WEBVTT/)
  })

  it('mantém presets e só destaca palavra com tempos fornecidos', () => {
    const segment: SubtitleSegment = { ...createSubtitle('p', 's', 1, 3, 0), style: SUBTITLE_PRESETS.karaoke }
    expect(activeSubtitleWord(segment, 1.5)).toBeNull()
    segment.words = [{ text: 'Olá', startTime: 1.2, endTime: 1.8 }]
    expect(validSubtitle(segment)).toBe(true)
    expect(activeSubtitleWord(segment, 1.5)?.text).toBe('Olá')
    expect(activeSubtitleWord(segment, 2)).toBeNull()
    segment.words[0].endTime = 4
    expect(validSubtitle(segment)).toBe(false)
  })

  it('aceita projeto antigo sem legendas e preserva o modelo novo', () => {
    const old = {
      version: 1, id: 'p', createdAt: 1, updatedAt: 2, name: 'Teste', editorMode: 'video', canvasSize: { width: 1280, height: 720 },
      baseVideo: null, baseVideoDuration: 0, baseTrim: { trimStart: 0, trimEnd: 0 }, extraVideos: [], photoSlides: [], imageOverlays: [],
      texts: [], stickers: [], sequenceOrder: [], excludedClipIds: [], clipTransitions: {}, photoTransition: 'fade', filter: 'normal', videoVolume: 1,
      music: { media: null, name: '', selectedMusicId: null, duration: 0, startTime: 0, trimStart: 0, trimEnd: 0, volume: 1, volumeTouched: false },
      voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: 'post', currentTime: 0,
    }
    expect(parseSavedProject(JSON.stringify(old)).subtitles).toBeUndefined()
    const subtitles = [createSubtitle('p', 's', 0, 1, 0)]
    expect(parseSavedProject(JSON.stringify({ ...old, subtitles })).subtitles).toEqual(subtitles)
    expect(() => parseSavedProject(JSON.stringify({ ...old, subtitles: [{ ...subtitles[0], projectId: 'other' }] }))).toThrow(/inválidos/)
  })
})
