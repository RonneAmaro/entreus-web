'use client'

import { useEffect, useId, useRef, useState } from 'react'
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

type MediaFit = 'cover' | 'contain'

const AUTOPLAY_EVENT = 'entreus:post-media-autoplay'

type MediaAutoplayDetail = {
  playerId: string
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean
  }
}

function isDataSaverEnabled() {
  if (typeof navigator === 'undefined') return false

  return Boolean((navigator as NavigatorWithConnection).connection?.saveData)
}

function AutoPlayVideo({
  src,
  className,
  onClick,
  controls = false,
  autoplayEnabled = true,
}: {
  src: string
  className?: string
  onClick?: () => void
  controls?: boolean
  autoplayEnabled?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerId = useId()

  useEffect(() => {
    const observedVideo = videoRef.current

    if (!observedVideo) return

    let isVisible = false

    function pauseVideo() {
      const currentVideo = videoRef.current

      if (!currentVideo) return

      currentVideo.pause()
    }

    function canAutoplay() {
      return (
        autoplayEnabled &&
        isVisible &&
        document.visibilityState === 'visible' &&
        !isDataSaverEnabled()
      )
    }

    function requestPlay() {
      if (!canAutoplay()) {
        pauseVideo()
        return
      }

      const currentVideo = videoRef.current

      if (!currentVideo) return

      currentVideo.muted = true
      window.dispatchEvent(
        new CustomEvent<MediaAutoplayDetail>(AUTOPLAY_EVENT, {
          detail: { playerId },
        })
      )

      currentVideo.play().catch(() => {
        // Browsers can still block autoplay even when the video is muted.
      })
    }

    function handleAutoplayEvent(event: Event) {
      const detail = (event as CustomEvent<MediaAutoplayDetail>).detail

      if (detail?.playerId !== playerId) {
        pauseVideo()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        pauseVideo()
        return
      }

      requestPlay()
    }

    observedVideo.muted = true
    observedVideo.playsInline = true
    observedVideo.preload = 'none'

    window.addEventListener(AUTOPLAY_EVENT, handleAutoplayEvent)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (!autoplayEnabled || typeof IntersectionObserver === 'undefined') {
      pauseVideo()
      return () => {
        pauseVideo()
        window.removeEventListener(AUTOPLAY_EVENT, handleAutoplayEvent)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.65

        requestPlay()
      },
      {
        threshold: [0, 0.35, 0.65, 0.85],
      }
    )

    observer.observe(observedVideo)

    return () => {
      pauseVideo()
      observer.disconnect()
      window.removeEventListener(AUTOPLAY_EVENT, handleAutoplayEvent)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [autoplayEnabled, playerId, src])

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      preload="none"
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
  fit = 'cover',
  autoplayEnabled = true,
}: {
  item: PostMedia
  index: number
  onOpen: (index: number) => void
  className?: string
  showOverlayCount?: number
  fit?: MediaFit
  autoplayEnabled?: boolean
}) {
  const imageClassName =
    fit === 'contain'
      ? 'block max-h-[720px] max-w-full object-contain transition duration-300 group-hover:scale-[1.01]'
      : 'block h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]'

  const videoClassName =
    fit === 'contain'
      ? 'block max-h-[720px] max-w-full bg-black object-contain'
      : 'block h-full w-full bg-black object-cover'

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
          className={imageClassName}
        />
      ) : (
        <div
          className={
            fit === 'contain'
              ? 'relative flex w-full items-center justify-center'
              : 'relative h-full w-full'
          }
        >
          <AutoPlayVideo
            src={item.media_url}
            className={videoClassName}
            autoplayEnabled={autoplayEnabled && !showOverlayCount}
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
        <div className="mb-4 flex w-full items-center justify-center overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950">
          <MediaThumb
            item={visibleMedia[0]}
            index={0}
            onOpen={openViewer}
            fit="contain"
            autoplayEnabled={!open}
            className="flex w-full items-center justify-center rounded-3xl p-0"
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
              autoplayEnabled={!open}
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
            autoplayEnabled={!open}
            className="h-80 w-full border-b border-zinc-200 dark:border-zinc-700 sm:h-[28rem] sm:border-b-0 sm:border-r"
          />

          <div className="grid grid-cols-2 sm:grid-cols-1">
            <MediaThumb
              item={visibleMedia[1]}
              index={1}
              onOpen={openViewer}
              autoplayEnabled={!open}
              className="h-44 w-full border-r border-zinc-200 dark:border-zinc-700 sm:h-56 sm:border-b sm:border-r-0"
            />

            <MediaThumb
              item={visibleMedia[2]}
              index={2}
              onOpen={openViewer}
              autoplayEnabled={!open}
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
              autoplayEnabled={!open}
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
          autoplayEnabled={!open}
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
                autoplayEnabled={!open}
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
                muted
                playsInline
                preload="metadata"
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
