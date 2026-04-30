'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'

type PostMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video'
  position: number
  created_at?: string
}

type PostMediaGalleryProps = {
  media: PostMedia[]
}

function AutoPlayVideo({
  src,
  className,
  onClick,
  controls = false,
}: {
  src: string
  className?: string
  onClick?: () => void
  controls?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current

    if (!video) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]

        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Navegadores exigem muted para autoplay.
          })
        } else {
          video.pause()
        }
      },
      {
        threshold: 0.6,
      }
    )

    observer.observe(video)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      controls={controls}
      onClick={onClick}
      className={className}
    />
  )
}

export default function PostMediaGallery({ media }: PostMediaGalleryProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  if (!media || media.length === 0) return null

  const activeMedia = media[activeIndex]

  function openViewer(index: number) {
    setActiveIndex(index)
    setOpen(true)
  }

  function closeViewer() {
    setOpen(false)
  }

  function goPrevious() {
    setActiveIndex((current) => {
      if (current === 0) return media.length - 1
      return current - 1
    })
  }

  function goNext() {
    setActiveIndex((current) => {
      if (current === media.length - 1) return 0
      return current + 1
    })
  }

  return (
    <>
      <div
        className={[
          'mb-4 grid gap-2 overflow-hidden rounded-2xl',
          media.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
        ].join(' ')}
      >
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openViewer(index)}
            className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 text-left dark:border-zinc-700 dark:bg-zinc-900"
          >
            {item.media_type === 'image' ? (
              <img
                src={item.media_url}
                alt="Imagem da publicação"
                className="block h-64 w-full max-w-full object-cover transition group-hover:scale-[1.02] sm:h-80"
              />
            ) : (
              <div className="relative">
                <AutoPlayVideo
                  src={item.media_url}
                  className="block h-64 w-full max-w-full bg-black object-cover sm:h-80"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 opacity-100 transition group-hover:bg-black/20">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="h-6 w-6 fill-current" />
                  </div>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 px-3 py-6">
          <button
            type="button"
            onClick={closeViewer}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Fechar mídia"
          >
            <X className="h-6 w-6" />
          </button>

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrevious}
                className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Mídia anterior"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>

              <button
                type="button"
                onClick={goNext}
                className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Próxima mídia"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}

          <div className="flex h-full w-full max-w-6xl items-center justify-center">
            {activeMedia.media_type === 'image' ? (
              <img
                src={activeMedia.media_url}
                alt="Imagem ampliada"
                className="max-h-[90vh] max-w-full rounded-2xl object-contain"
              />
            ) : (
              <video
                src={activeMedia.media_url}
                controls
                autoPlay
                playsInline
                className="max-h-[90vh] max-w-full rounded-2xl bg-black object-contain"
              />
            )}
          </div>

          {media.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-sm text-white">
              {activeIndex + 1} / {media.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}