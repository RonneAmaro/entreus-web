import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectAutoSave, describeFile, matchesProjectMedia, parseSavedProject, projectStorageKey, type SavedProject } from '@/lib/video-editor/project-persistence'

const base = { id: 'base-video', name: 'base.webm', type: 'video/webm', size: 24, lastModified: 12, duration: 3, width: 160, height: 90 }
const pip = { id: 'pip-1', name: 'pip.webm', type: 'video/webm', size: 18, lastModified: 13, duration: 2 }
function project(): SavedProject {
  return {
    version: 1, id: 'project-1', createdAt: 10, updatedAt: 11, name: 'Cena PiP', editorMode: 'video',
    canvasSize: { width: 160, height: 90 }, originalCanvasSize: { width: 160, height: 90 }, aspectPreset: 'original', frameMode: 'fit', baseVideo: base, baseVideoDuration: 3,
    baseTrim: { trimStart: 0.4, trimEnd: 2.6 }, extraVideos: [], photoSlides: [], imageOverlays: [],
    videoOverlays: [{ id: 'pip-1', media: pip, name: 'pip.webm', x: 20, y: 12, width: 45, height: 25, rotation: 45, sourceDuration: 2, trimStart: 0.2, trimEnd: 1.2, startTime: 0.6, endTime: 1.6 }],
    texts: [{ id: 'text-1', text: 'Olá', x: 6, y: 8, fontSize: 20, width: 80, height: 55, color: '#ffffff', rotation: -30, startTime: 0.3, endTime: 2 }],
    stickers: [], sequenceOrder: ['base-video'], excludedClipIds: [], clipTransitions: {}, junctionTransitions: {}, photoTransition: 'fade',
    filter: 'warm', videoVolume: 0, music: { media: null, name: '', selectedMusicId: null, duration: 0, startTime: 0, trimStart: 0, trimEnd: 0, volume: 0.6, volumeTouched: false },
    voice: { media: null, duration: 0, startTime: 0, volume: 1 }, caption: '', currentTime: 0.8,
  }
}

afterEach(() => vi.useRealTimers())

describe('documento local do Studio', () => {
  it('preserva referências opcionais de vídeo e mantém projetos antigos', () => {
    const saved = project()
    expect(parseSavedProject(JSON.stringify(saved)).baseVideo?.assetId).toBeUndefined()
    saved.baseVideo = { ...base, assetId: `video-sha256-${'a'.repeat(64)}` }
    saved.extraVideos = [{ id: 'copy', media: { ...saved.baseVideo, id: 'copy' }, sourceDuration: 3, trimStart: 0.5, trimEnd: 2 }]
    const parsed = parseSavedProject(JSON.stringify(saved))
    expect(parsed.extraVideos[0].media.assetId).toBe(parsed.baseVideo!.assetId)
    saved.baseVideo.assetId = 'invalid'
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow()
  })
  it('aceita fotos antigas e valida referências de fotos salvas', () => {
    const saved = project()
    saved.photoSlides = [{ id: 'photo-1', media: { ...pip, id: 'photo-1', name: 'foto.png', type: 'image/png' }, duration: 2, order: 0 }]
    expect(parseSavedProject(JSON.stringify(saved)).photoSlides[0].assetId).toBeUndefined()
    saved.photoSlides[0].assetId = `photo-sha256-${'a'.repeat(64)}`
    expect(parseSavedProject(JSON.stringify(saved)).photoSlides[0].assetId).toBe(saved.photoSlides[0].assetId)
    saved.photoSlides[0].assetId = 'invalid'
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow()
  })
  it('preserva referência musical e fades sem afetar projetos antigos', () => {
    const saved = project()
    saved.music = { ...saved.music, assetId: 'asset-1', fadeIn: 0.4, fadeOut: 0.8 }
    expect(parseSavedProject(JSON.stringify(saved)).music).toEqual(saved.music)
    saved.music.fadeOut = -1
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow()
    expect(parseSavedProject(JSON.stringify(project())).music.assetId).toBeUndefined()
  })
  it('preserva PiP, texto, trims, mute e ordem sem arquivos nem URLs blob', () => {
    const saved = project()
    saved.imageOverlays.push({ id: 'image-1', media: { ...pip, id: 'image-1', name: 'foto.png', type: 'image/png' }, name: 'foto.png', x: 4, y: 5, width: 25, height: 17, rotation: -45, startTime: 0.5, endTime: 1.8 })
    saved.sequenceOrder.push('image-1')
    saved.visualLayerOrder = ['text-1', 'pip-1', 'image-1']
    const raw = JSON.stringify(saved)
    expect(raw).not.toContain('blob:')
    expect(parseSavedProject(raw)).toEqual(saved)
    expect(parseSavedProject(raw).videoOverlays[0]).toMatchObject({ rotation: 45, trimStart: 0.2, startTime: 0.6 })
    expect(parseSavedProject(raw).visualLayerOrder).toEqual(['text-1', 'pip-1', 'image-1'])
  })

  it('salva ajustes por clipe e rejeita valores fora da faixa', () => {
    const saved = project()
    saved.colorAdjustments = { 'base-video': { preset: 'cool', intensity: 64, brightness: -12, contrast: 18, saturation: 7, temperature: -32 } }
    expect(parseSavedProject(JSON.stringify(saved)).colorAdjustments).toEqual(saved.colorAdjustments)
    saved.colorAdjustments['base-video'].temperature = 101
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow(/inv/)
    delete saved.colorAdjustments
    expect(parseSavedProject(JSON.stringify(saved)).colorAdjustments).toBeUndefined()
  })

  it('aceita projeto anterior sem PiP ou voz e preserva dados incompatíveis sem sobrescrever', () => {
    const old = project() as unknown as Record<string, unknown>
    delete old.videoOverlays
    delete old.voice
    delete old.visualLayerOrder
    delete old.originalCanvasSize
    delete old.aspectPreset
    delete old.frameMode
    delete old.junctionTransitions
    delete (old.texts as Array<Record<string, unknown>>)[0].width
    delete (old.texts as Array<Record<string, unknown>>)[0].height
    expect(parseSavedProject(JSON.stringify(old))).toMatchObject({ videoOverlays: [], voice: { media: null }, originalCanvasSize: { width: 160, height: 90 }, aspectPreset: 'original', frameMode: 'fit', junctionTransitions: {} })
    expect(parseSavedProject(JSON.stringify(old)).visualLayerOrder).toBeUndefined()
    old.version = 2
    expect(() => parseSavedProject(JSON.stringify(old))).toThrow(/Versão/)
    old.version = 1
    old.baseTrim = { trimStart: 'errado', trimEnd: 2 }
    expect(() => parseSavedProject(JSON.stringify(old))).toThrow(/inválidos/)
  })

  it('normaliza stickers antigos e valida quadros, velocidade e opacidade dos animados', () => {
    const saved = project()
    saved.stickers = [{ id: 'old-sticker', value: '⭐', x: 80, y: 45, size: 32, rotation: 0, startTime: 0.2, endTime: 2, layerOrder: 30 }]
    expect(parseSavedProject(JSON.stringify(saved)).stickers[0]).toMatchObject({ value: '⭐', opacity: 1 })

    saved.stickers[0] = { ...saved.stickers[0], assetId: 'twinkle-loop', frames: ['✦', '✧', '✶', '✧'], frameRate: 6, opacity: 0.65, rotation: 37 }
    expect(parseSavedProject(JSON.stringify(saved)).stickers[0]).toEqual(saved.stickers[0])
    saved.stickers[0].frameRate = 30
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow(/inv/)
    saved.stickers[0].frameRate = 6
    saved.stickers[0].opacity = 0
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow(/inv/)
  })

  it('aceita edição apenas de fotos e texto, com música e narração associadas', () => {
    const saved = project()
    saved.editorMode = 'photos'
    saved.baseVideo = null
    saved.videoOverlays = []
    saved.photoSlides = [{ id: 'photo-1', media: { ...pip, id: 'photo-1', name: 'foto.png', type: 'image/png' }, duration: 2, order: 0 }]
    saved.sequenceOrder = ['photo-1']
    saved.music.media = { ...pip, id: 'audio-track', name: 'musica.webm', type: 'audio/webm' }
    saved.voice.media = { ...pip, id: 'voice-track', name: 'voz.webm', type: 'audio/webm' }
    expect(parseSavedProject(JSON.stringify(saved))).toEqual(saved)
    saved.photoSlides[0].media.id = 'outro-id'
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow(/inválidos/)
  })

  it('preserva formato e enquadramento e rejeita valores desconhecidos', () => {
    const saved = { ...project(), canvasSize: { width: 720, height: 1280 }, aspectPreset: '9:16' as const, frameMode: 'fill' as const }
    expect(parseSavedProject(JSON.stringify(saved))).toMatchObject({ canvasSize: { width: 720, height: 1280 }, aspectPreset: '9:16', frameMode: 'fill', originalCanvasSize: { width: 160, height: 90 } })
    expect(() => parseSavedProject(JSON.stringify({ ...saved, frameMode: 'stretch' }))).toThrow(/inválidos/)
    expect(() => parseSavedProject(JSON.stringify({ ...saved, aspectPreset: '2:1' }))).toThrow(/inválidos/)
  })

  it('persiste junções tipadas e rejeita duração inválida', () => {
    const saved = project()
    saved.junctionTransitions = { 'video-b': { fromId: 'base-video', type: 'dissolve', duration: 0.5 } }
    expect(parseSavedProject(JSON.stringify(saved)).junctionTransitions).toEqual(saved.junctionTransitions)
    saved.junctionTransitions['video-b'].duration = 3
    expect(() => parseSavedProject(JSON.stringify(saved))).toThrow(/inválidos/)
  })

  it('confere a mídia original e detecta duração ou dimensões incompatíveis', () => {
    const file = new File([new Uint8Array(24)], 'base.webm', { type: 'video/webm', lastModified: 12 })
    expect(describeFile('base-video', file, { duration: 3 })).toMatchObject({ id: 'base-video', size: 24, duration: 3 })
    expect(matchesProjectMedia(base, file, { duration: 3, width: 160, height: 90 })).toBe(true)
    expect(matchesProjectMedia(base, file, { duration: 4, width: 160, height: 90 })).toBe(false)
    expect(matchesProjectMedia(base, file, { duration: 3, width: 200, height: 90 })).toBe(false)
    expect(matchesProjectMedia(pip, file)).toBe(false)
  })

  it('isola chaves por usuário', () => {
    expect(projectStorageKey('user:00000000-0000-0000-0000-000000000001')).not.toBe(projectStorageKey('user:00000000-0000-0000-0000-000000000002'))
    expect(projectStorageKey('guest')).not.toBe(projectStorageKey('user:00000000-0000-0000-0000-000000000001'))
    expect(() => projectStorageKey('user:../../other')).toThrow()
  })

  it('agrupa mudanças rápidas, evita sobrescrita antiga e preserva o último documento após falha', () => {
    vi.useFakeTimers()
    let raw = JSON.stringify(project())
    let fail = false
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => { if (fail) throw new Error('QuotaExceededError'); raw = value },
    }
    const statuses: string[] = []
    const save = new ProjectAutoSave(storage, 'project', (status) => statuses.push(status), 100)
    expect(save.load().project?.name).toBe('Cena PiP')
    save.schedule({ ...project(), name: 'primeira' })
    vi.advanceTimersByTime(50)
    save.schedule({ ...project(), name: 'última' })
    vi.advanceTimersByTime(100)
    expect(parseSavedProject(raw).name).toBe('última')
    expect(statuses.at(-1)).toBe('saved')
    save.schedule({ ...project(), name: 'falhou' })
    fail = true
    vi.advanceTimersByTime(100)
    expect(statuses.at(-1)).toBe('error')
    expect(parseSavedProject(raw).name).toBe('última')
    fail = false
    expect(save.flush()).toBe(true)
    expect(parseSavedProject(raw).name).toBe('falhou')
  })

  it('cancela escrita pendente quando o usuário reverte ao último estado salvo', () => {
    vi.useFakeTimers()
    let raw = JSON.stringify(project())
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value } }
    const save = new ProjectAutoSave(storage, 'project', () => undefined, 100)
    save.load()
    save.schedule({ ...project(), name: 'temporário' })
    save.schedule(project())
    vi.advanceTimersByTime(200)
    expect(parseSavedProject(raw).name).toBe('Cena PiP')
  })
})
