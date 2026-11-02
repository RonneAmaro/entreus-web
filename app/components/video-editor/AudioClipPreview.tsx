'use client'

import { useEffect, useRef } from 'react'
import { audioClipGainAt, audioClipSourceTime, type LocalAudioClip } from '@/lib/video-editor/audio-clips'

export default function AudioClipPreview({ clip, time, playing, duration, scale }: {
  clip: LocalAudioClip; time: number; playing: boolean; duration: number; scale: number
}) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const audio = ref.current
    if (!audio || !clip.file) return
    const url = URL.createObjectURL(clip.file)
    audio.src = url
    return () => { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url) }
  }, [clip.file])
  useEffect(() => {
    const audio = ref.current
    if (!audio || !clip.file) return
    const sync = () => {
      const source = audioClipSourceTime(time, clip, duration)
      audio.volume = Math.min(1, audioClipGainAt(time, clip, duration) * scale)
      audio.loop = false
      if (source === null || !playing) audio.pause()
      if (audio.readyState > 0 && Math.abs(audio.currentTime - (source ?? clip.trimStart)) > 0.15) audio.currentTime = source ?? clip.trimStart
      if (source !== null && playing && audio.paused) void audio.play().catch((error: DOMException) => {
        if (error.name !== 'AbortError') audio.dataset.playError = error.name
      })
    }
    sync()
    audio.addEventListener('loadedmetadata', sync)
    return () => audio.removeEventListener('loadedmetadata', sync)
  }, [clip, time, playing, duration, scale])
  return <audio ref={ref} data-audio-clip-id={clip.id} preload="auto" />
}
