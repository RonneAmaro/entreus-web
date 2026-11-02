import type { PositionedClip } from './timeline'
import { transitionDuration, type JunctionTransitions } from './timeline'
import { fitMediaFilter, type VideoFrameMode } from './video-format'
import { musicAudioFilter } from './music-audio'

export type RenderClip = Pick<PositionedClip, 'id' | 'type' | 'duration' | 'trimStart' | 'transition'> & {
  inputName: string
  inputIndex: number
  hasAudio: boolean
}

type AudioInput = { inputIndex: number; volume: number; startTime: number; trimStart: number; trimEnd: number; fadeIn?: number; fadeOut?: number }

export function buildMediaSequenceGraph(
  clips: RenderClip[],
  options: {
    width: number
    height: number
    frameMode?: VideoFrameMode
    visualFilter: string
    clipFilters?: Record<string, string>
    videoVolume: number
    music?: AudioInput
    voice?: Pick<AudioInput, 'inputIndex' | 'volume' | 'startTime'>
    transitions?: JunctionTransitions
  },
) {
  if (clips.length === 0) throw new Error('A sequência precisa de ao menos um clipe.')
  const joins = clips.map((clip, index) => transitionDuration(clips[index - 1], clip, options.transitions || {}))
  const totalDuration = clips.reduce((total, clip, index) => total + clip.duration - joins[index], 0)
  const inputArgs = clips.flatMap((clip) => clip.type === 'image'
    ? ['-loop', '1', '-framerate', '30', '-t', clip.duration.toFixed(3), '-i', clip.inputName]
    : ['-i', clip.inputName])
  const videoFilters = clips.map((clip, index) => {
    if (clip.transition !== 'none' && clip.transition !== 'fade') {
      throw new Error(`Transição não suportada na exportação: ${clip.transition}`)
    }
    const source = clip.type === 'video'
      ? `trim=start=${(clip.trimStart || 0).toFixed(3)}:duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS,`
      : 'setpts=PTS-STARTPTS,'
    const fade = index > 0 && joins[index] === 0 && clip.transition === 'fade'
      ? `,fade=t=in:st=0:d=${Math.min(0.45, clip.duration / 2).toFixed(3)}`
      : ''
    return `[${clip.inputIndex}:v]${source}${fitMediaFilter(options, options.frameMode || 'fit')},fps=30,${options.clipFilters?.[clip.id] || options.visualFilter},format=yuv420p${fade}[vclip${index}]`
  })
  let videoLabel = 'vclip0'
  let elapsed = clips[0].duration
  for (let index = 1; index < clips.length; index++) {
    const nextLabel = index === clips.length - 1 ? 'vseq' : `vjoin${index}`
    const duration = joins[index]
    if (duration > 0) {
      const transition = options.transitions?.[clips[index].id].type === 'dip-black' ? 'fadeblack' : 'fade'
      videoFilters.push(`[${videoLabel}][vclip${index}]xfade=transition=${transition}:duration=${duration.toFixed(3)}:offset=${(elapsed - duration).toFixed(3)}[${nextLabel}]`)
    } else {
      videoFilters.push(`[${videoLabel}][vclip${index}]concat=n=2:v=1:a=0[${nextLabel}]`)
    }
    videoLabel = nextLabel
    elapsed += clips[index].duration - duration
  }
  if (clips.length === 1) videoFilters.push('[vclip0]null[vseq]')

  const audioFilters: string[] = []
  const audioLabels: string[] = []
  if (clips.some((clip) => clip.hasAudio)) {
    clips.forEach((clip, index) => {
      const duration = clip.duration.toFixed(3)
      if (clip.type === 'video' && clip.hasAudio) {
        audioFilters.push(`[${clip.inputIndex}:a]atrim=start=${(clip.trimStart || 0).toFixed(3)}:duration=${duration},asetpts=PTS-STARTPTS,volume=${options.videoVolume.toFixed(6)},aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[aclip${index}]`)
      } else {
        audioFilters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[aclip${index}]`)
      }
    })
    let audioLabel = 'aclip0'
    for (let index = 1; index < clips.length; index++) {
      const nextLabel = index === clips.length - 1 ? 'aOriginal' : `ajoin${index}`
      const duration = joins[index]
      audioFilters.push(duration > 0
        ? `[${audioLabel}][aclip${index}]acrossfade=d=${duration.toFixed(3)}:c1=tri:c2=tri[${nextLabel}]`
        : `[${audioLabel}][aclip${index}]concat=n=2:v=0:a=1[${nextLabel}]`)
      audioLabel = nextLabel
    }
    if (clips.length === 1) audioFilters.push('[aclip0]anull[aOriginal]')
    audioLabels.push('[aOriginal]')
  }
  if (options.music && options.music.trimEnd > options.music.trimStart) {
    const music = options.music
    audioFilters.push(musicAudioFilter(music.inputIndex, { ...music, fadeIn: music.fadeIn ?? 0, fadeOut: music.fadeOut ?? 0 }, 'aMusicRaw'))
    audioFilters.push('[aMusicRaw]aformat=sample_rates=44100:channel_layouts=stereo[aMusic]')
    audioLabels.push('[aMusic]')
  }
  if (options.voice) {
    const voice = options.voice
    const delay = Math.round(voice.startTime * 1000)
    audioFilters.push(`[${voice.inputIndex}:a]asetpts=PTS-STARTPTS,adelay=${delay}:all=1,volume=${voice.volume.toFixed(6)},aformat=sample_rates=44100:channel_layouts=stereo[aVoice]`)
    audioLabels.push('[aVoice]')
  }
  if (audioLabels.length === 1) audioFilters.push(`${audioLabels[0]}atrim=duration=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS[a]`)
  if (audioLabels.length > 1) audioFilters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0,atrim=duration=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS[a]`)
  return { inputArgs, videoFilters, audioFilters, hasAudio: audioLabels.length > 0, totalDuration }
}
