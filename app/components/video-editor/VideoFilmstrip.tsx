'use client'

import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'

export default function VideoFilmstrip({ src }: { src: string }) {
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    async function capture() {
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve()
          video.onerror = () => reject(new Error('Unable to load video preview'))
          video.src = src
          video.load()
        })
        const canvas = document.createElement('canvas')
        canvas.width = 120
        canvas.height = 72
        const context = canvas.getContext('2d')
        if (!context) return
        const nextFrames: string[] = []
        const safeDuration = Math.max(0.1, Math.min(video.duration || 1, 600))
        for (let index = 0; index < 8 && !cancelled; index += 1) {
          const target = Math.min(safeDuration - 0.05, Math.max(0.01, (safeDuration * (index + 0.5)) / 8))
          if (Math.abs(video.currentTime - target) > 0.005) {
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve()
              video.currentTime = target
            })
          }
          if (video.videoWidth && video.videoHeight) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            nextFrames.push(canvas.toDataURL('image/jpeg', 0.66))
          }
        }
        if (!cancelled) setFrames(nextFrames)
      } catch {
        if (!cancelled) setFrames([])
      }
    }

    void capture()
    return () => {
      cancelled = true
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return frames.length > 0 ? (
    <span className="absolute inset-0 flex overflow-hidden" aria-hidden="true">
      {frames.map((frame, index) => <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" />)}
      <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
    </span>
  ) : (
    <span className="absolute inset-0 grid place-items-center bg-gradient-to-r from-sky-900 via-indigo-800 to-fuchsia-900" aria-hidden="true">
      <Film className="h-5 w-5 text-white/70" />
    </span>
  )
}
