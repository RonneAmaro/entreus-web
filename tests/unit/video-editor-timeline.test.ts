import { describe, expect, it } from 'vitest'
import { clampLayerTiming, clipAtTime, moveClip, musicSourceTime, positionClips, positionClipsWithTransitions, trimVideo, validJunctionTransitions, type SequenceClip } from '@/lib/video-editor/timeline'
import { buildMediaSequenceGraph } from '@/lib/video-editor/render-plan'

const clips: SequenceClip[] = [
  { id: 'video-a', type: 'video', name: 'A', previewUrl: 'a', duration: 4, sourceDuration: 8, trimStart: 2, trimEnd: 6, transition: 'none' },
  { id: 'photo', type: 'image', name: 'Foto', previewUrl: 'p', duration: 3, transition: 'fade' },
  { id: 'video-b', type: 'video', name: 'B', previewUrl: 'b', duration: 5, sourceDuration: 5, trimStart: 0, trimEnd: 5, transition: 'slide' },
]

describe('sequência do editor', () => {
  it('sobrepõe junções válidas, encurta o total e descarta associações após reordenação', () => {
    const transitions = { photo: { fromId: 'video-a', type: 'dissolve' as const, duration: 0.6 }, 'video-b': { fromId: 'photo', type: 'dip-black' as const, duration: 0.4 } }
    const positioned = positionClipsWithTransitions(clips, transitions)
    expect(positioned.map((clip) => clip.startTime)).toEqual([0, 3.4, 6])
    expect(positioned.at(-1)?.endTime).toBe(11)
    expect(clipAtTime(positioned, 3.7)?.id).toBe('photo')
    expect(validJunctionTransitions(moveClip(clips, 'video-b', 0), transitions)).toEqual({ photo: transitions.photo })
    expect(positionClipsWithTransitions(clips, {}) .at(-1)?.endTime).toBe(12)
    const short = [clips[0], { ...clips[1], duration: 0.5 }, clips[2]]
    const bounded = validJunctionTransitions(short, transitions)
    expect(bounded.photo.duration).toBeCloseTo(0.2)
    expect(bounded['video-b'].duration).toBeCloseTo(0.2)
    expect(positionClipsWithTransitions(short, bounded)[1].endTime).toBeLessThan(positionClipsWithTransitions(short, bounded)[2].endTime)
  })
  it('reordena vídeo e foto preservando duração e resolve o playhead', () => {
    const moved = moveClip(clips, 'video-b', 0)
    const timeline = positionClips(moved)
    expect(timeline.map((clip) => [clip.id, clip.startTime, clip.endTime])).toEqual([
      ['video-b', 0, 5], ['video-a', 5, 9], ['photo', 9, 12],
    ])
    expect(clipAtTime(timeline, 5.5)?.id).toBe('video-a')
    expect(clipAtTime(timeline, 12)?.id).toBe('photo')
    expect(clips[0].id).toBe('video-a')
  })

  it('limita as duas alças de corte aos metadados do vídeo', () => {
    expect(trimVideo(8, 2, 6)).toEqual({ trimStart: 2, trimEnd: 6, duration: 4 })
    expect(trimVideo(8, 9, 2)).toEqual({ trimStart: 7.5, trimEnd: 8, duration: 0.5 })
  })

  it('recalcula o total após mudar a duração da foto', () => {
    const next = positionClips(clips.map((clip) => clip.id === 'photo' ? { ...clip, duration: 5 } : clip))
    expect(next.at(-1)?.endTime).toBe(14)
  })

  it('aplica offset e início/fim do trecho musical', () => {
    expect(musicSourceTime(1, 2, 4, 7)).toBeNull()
    expect(musicSourceTime(2.5, 2, 4, 7)).toBe(4.5)
    expect(musicSourceTime(5, 2, 4, 7)).toBeNull()
  })

  it('mantém a transição do clipe e limita o texto ao projeto', () => {
    expect(positionClips(clips)[2].transition).toBe('slide')
    expect(clampLayerTiming(9, 20, 12)).toEqual({ startTime: 9, endTime: 12 })
  })
})

describe('render da sequência', () => {
  it('usa a ordem da timeline, os cortes e o fade também na exportação', () => {
    const ordered = positionClips(moveClip(clips, 'video-b', 0))
    const plan = buildMediaSequenceGraph(ordered.map((clip, inputIndex) => ({
      ...clip,
      transition: clip.id === 'video-b' ? 'none' as const : clip.transition,
      inputIndex,
      inputName: `${clip.id}.${clip.type === 'video' ? 'mp4' : 'png'}`,
      hasAudio: clip.id === 'video-a',
    })), {
      width: 1280, height: 720, visualFilter: 'null', videoVolume: 0.5,
      music: { inputIndex: 3, startTime: 2, trimStart: 4, trimEnd: 7, volume: 0.35 },
    })

    expect(plan.inputArgs.filter((part) => part.endsWith('.mp4') || part.endsWith('.png')))
      .toEqual(['video-b.mp4', 'video-a.mp4', 'photo.png'])
    expect(plan.videoFilters[0]).toContain('trim=start=0.000:duration=5.000')
    expect(plan.videoFilters[1]).toContain('trim=start=2.000:duration=4.000')
    expect(plan.videoFilters[2]).toContain('fade=t=in:st=0:d=0.450')
    expect(plan.videoFilters.at(-1)).toBe('[vjoin1][vclip2]concat=n=2:v=1:a=0[vseq]')
    expect(plan.audioFilters.join(';')).toContain('[1:a]atrim=start=2.000:duration=4.000')
    expect(plan.audioFilters.join(';')).toContain('atrim=start=4.000:end=7.000')
    expect(plan.audioFilters.join(';')).toContain('adelay=2000:all=1')
    expect(plan.totalDuration).toBe(12)
    expect(plan.hasAudio).toBe(true)
  })

  it('exporta fotos sem inventar uma faixa de áudio', () => {
    const plan = buildMediaSequenceGraph([{
      id: 'photo', type: 'image', duration: 3, transition: 'none',
      inputName: 'photo.png', inputIndex: 0, hasAudio: false,
    }], { width: 720, height: 1280, visualFilter: 'null', videoVolume: 1 })
    expect(plan.inputArgs).toEqual(['-loop', '1', '-framerate', '30', '-t', '3.000', '-i', 'photo.png'])
    expect(plan.audioFilters).toEqual([])
    expect(plan.hasAudio).toBe(false)
  })

  it('usa xfade e acrossfade para dissolver e passar pelo preto sem tempo extra', () => {
    const renderClips = clips.map((clip, inputIndex) => ({ ...clip, transition: 'none' as const, inputIndex, inputName: `${clip.id}.webm`, hasAudio: clip.type === 'video' }))
    const transitions = { photo: { fromId: 'video-a', type: 'dissolve' as const, duration: 0.6 }, 'video-b': { fromId: 'photo', type: 'dip-black' as const, duration: 0.4 } }
    const plan = buildMediaSequenceGraph(renderClips, { width: 1280, height: 720, visualFilter: 'null', videoVolume: 1, transitions })
    expect(plan.totalDuration).toBe(11)
    expect(plan.videoFilters.join(';')).toContain('xfade=transition=fade:duration=0.600:offset=3.400')
    expect(plan.videoFilters.join(';')).toContain('xfade=transition=fadeblack:duration=0.400:offset=6.000')
    expect(plan.audioFilters.join(';')).toContain('acrossfade=d=0.600')
    expect(plan.audioFilters.join(';')).toContain('acrossfade=d=0.400')
  })
})
