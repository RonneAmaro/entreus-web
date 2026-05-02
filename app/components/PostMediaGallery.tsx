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
            // Navegadores geralmente exigem muted para autoplay.
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

function MediaThumb({
  item,
  index,
  onOpen,
  className = '',
  showOverlayCount,
}: {
  item: PostMedia
  index: number
  onOpen: (index: number) => void
  className?: string
  showOverlayCount?: number
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className={`group relative overflow-hidden border border-zinc-200 bg-zinc-100 text-left dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      {item.media_type === 'image' ? (
        <img
          src={item.media_url}
          alt="Imagem da publicação"
          className="block h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="relative h-full w-full">
          <AutoPlayVideo
            src={item.media_url}
            className="block h-full w-full bg-black object-cover"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-white shadow-lg">
              <Play className="h-6 w-6 fill-current" />
            </div>
          </div>
        </div>
      )}

      {showOverlayCount && showOverlayCount > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-bold text-white">
          +{showOverlayCount}
        </div>
      )}
    </button>
  )
}

export default function PostMediaGallery({ media }: PostMediaGalleryProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  if (!media || media.length === 0) return null

  const visibleMedia = media.slice(0, 5)
  const hiddenCount = media.length > 5 ? media.length - 5 : 0
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

  function renderGallery() {
    if (visibleMedia.length === 1) {
      return (
        <div className="mb-4 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
          <MediaThumb
            item={visibleMedia[0]}
            index={0}
            onOpen={openViewer}
            className="h-[26rem] w-full rounded-3xl sm:h-[34rem]"
          />
        </div>
      )
    }

    if (visibleMedia.length === 2) {
      return (
        <div className="mb-4 grid overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-2">
          {visibleMedia.map((item, index) => (
            <MediaThumb
              key={item.id}
              item={item}
              index={index}
              onOpen={openViewer}
              className={`h-72 w-full sm:h-96 ${
                index === 0
                  ? 'border-b border-zinc-200 dark:border-zinc-700 sm:border-b-0 sm:border-r'
                  : ''
              }`}
            />
          ))}
        </div>
      )
    }

    if (visibleMedia.length === 3) {
      return (
        <div className="mb-4 grid overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-2">
          <MediaThumb
            item={visibleMedia[0]}
            index={0}
            onOpen={openViewer}
            className="h-80 w-full border-b border-zinc-200 dark:border-zinc-700 sm:h-[28rem] sm:border-b-0 sm:border-r"
          />

          <div className="grid grid-cols-2 sm:grid-cols-1">
            <MediaThumb
              item={visibleMedia[1]}
              index={1}
              onOpen={openViewer}
              className="h-44 w-full border-r border-zinc-200 dark:border-zinc-700 sm:h-56 sm:border-b sm:border-r-0"
            />

            <MediaThumb
              item={visibleMedia[2]}
              index={2}
              onOpen={openViewer}
              className="h-44 w-full sm:h-56"
            />
          </div>
        </div>
      )
    }

    if (visibleMedia.length === 4) {
      return (
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
          {visibleMedia.map((item, index) => (
            <MediaThumb
              key={item.id}
              item={item}
              index={index}
              onOpen={openViewer}
              className={`h-48 w-full sm:h-64 ${
                index === 0 || index === 1
                  ? 'border-b border-zinc-200 dark:border-zinc-700'
                  : ''
              } ${
                index === 0 || index === 2
                  ? 'border-r border-zinc-200 dark:border-zinc-700'
                  : ''
              }`}
            />
          ))}
        </div>
      )
    }

    return (
      <div className="mb-4 grid overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-2">
        <MediaThumb
          item={visibleMedia[0]}
          index={0}
          onOpen={openViewer}
          className="h-80 w-full border-b border-zinc-200 dark:border-zinc-700 sm:h-[30rem] sm:border-b-0 sm:border-r"
        />

        <div className="grid grid-cols-2">
          {visibleMedia.slice(1, 5).map((item, sliceIndex) => {
            const realIndex = sliceIndex + 1
            const isLast = realIndex === 4

            return (
              <MediaThumb
                key={item.id}
                item={item}
                index={realIndex}
                onOpen={openViewer}
                showOverlayCount={isLast ? hiddenCount : undefined}
                className={`h-40 w-full sm:h-60 ${
                  sliceIndex === 0 || sliceIndex === 1
                    ? 'border-b border-zinc-200 dark:border-zinc-700'
                    : ''
                } ${
                  sliceIndex === 0 || sliceIndex === 2
                    ? 'border-r border-zinc-200 dark:border-zinc-700'
                    : ''
                }`}
              />
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {renderGallery()}

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