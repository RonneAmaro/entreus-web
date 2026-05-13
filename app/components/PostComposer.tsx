'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Globe2,
  ImagePlus,
  Lock,
  Play,
  Send,
  Tag,
  Trash2,
  Users,
} from 'lucide-react'
import { useLanguage } from './LanguageProvider'

type VisibilityType = 'public' | 'followers' | 'private'

type MediaPreview = {
  id: string
  file: File
  url: string
  type: 'image' | 'video'
}

type PostComposerProps = {
  userName: string
  userAvatarUrl?: string | null
  submitting?: boolean
  onSubmit: (data: {
    content: string
    category: string
    visibility: VisibilityType
    imageFile: File | null
    videoFile: File | null
    mediaFiles: File[]
  }) => void | Promise<void>
}

const CATEGORY_OPTIONS = [
  { value: 'cotidiano', labelKey: 'categories.cotidiano' },
  { value: 'viagens', labelKey: 'categories.viagens' },
  { value: 'lugares', labelKey: 'categories.lugares' },
  { value: 'comida', labelKey: 'categories.comida' },
  { value: 'pensamentos', labelKey: 'categories.pensamentos' },
  { value: 'lifestyle', labelKey: 'categories.lifestyle' },
  { value: 'sensual', labelKey: 'categories.sensual' },
  { value: 'adulto', labelKey: 'categories.adulto' },
]

const VISIBILITY_OPTIONS: {
  value: VisibilityType
  labelKey: string
  icon: React.ReactNode
}[] = [
  {
    value: 'public',
    labelKey: 'visibility.public',
    icon: <Globe2 className="h-4 w-4" />,
  },
  {
    value: 'followers',
    labelKey: 'visibility.followers',
    icon: <Users className="h-4 w-4" />,
  },
  {
    value: 'private',
    labelKey: 'visibility.private',
    icon: <Lock className="h-4 w-4" />,
  },
]

const MAX_MEDIA_FILES = 5
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_VIDEO_SIZE = 30 * 1024 * 1024

function getInitial(name: string) {
  if (!name) return 'U'
  return name.slice(0, 1).toUpperCase()
}

function isImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}

function isVideo(file: File) {
  return ['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)
}

export default function PostComposer({
  userName,
  userAvatarUrl,
  submitting = false,
  onSubmit,
}: PostComposerProps) {
  const { t } = useLanguage()
  const mediaInputRef = useRef<HTMLInputElement | null>(null)

  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [visibility, setVisibility] = useState<VisibilityType>('public')
  const [media, setMedia] = useState<MediaPreview[]>([])
  const [error, setError] = useState('')

  const selectedCategory = useMemo(() => {
    return CATEGORY_OPTIONS.find((item) => item.value === category)
  }, [category])

  const selectedVisibility = useMemo(() => {
    return VISIBILITY_OPTIONS.find((item) => item.value === visibility)
  }, [visibility])

  useEffect(() => {
    return () => {
      media.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [media])

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setError('')

    const currentMedia = [...media]
    const availableSlots = MAX_MEDIA_FILES - currentMedia.length

    if (availableSlots <= 0) {
      setError(t('postComposer.errors.maxMedia').replace('{max}', String(MAX_MEDIA_FILES)))
      return
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots)
    const newMedia: MediaPreview[] = []

    for (const file of selectedFiles) {
      if (!isImage(file) && !isVideo(file)) {
        setError(t('postComposer.errors.unsupported'))
        continue
      }

      if (isImage(file) && file.size > MAX_IMAGE_SIZE) {
        setError(t('postComposer.errors.imageTooLarge'))
        continue
      }

      if (isVideo(file) && file.size > MAX_VIDEO_SIZE) {
        setError(t('postComposer.errors.videoTooLarge'))
        continue
      }

      newMedia.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        type: isImage(file) ? 'image' : 'video',
      })
    }

    if (Array.from(files).length > availableSlots) {
      setError(t('postComposer.errors.partialAdded').replace('{count}', String(availableSlots)).replace('{max}', String(MAX_MEDIA_FILES)))
    }

    setMedia([...currentMedia, ...newMedia])

    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }

  function removeMedia(id: string) {
    setMedia((current) => {
      const itemToRemove = current.find((item) => item.id === id)

      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.url)
      }

      return current.filter((item) => item.id !== id)
    })
  }

  async function handleSubmit() {
    const trimmedContent = content.trim()

    if (!trimmedContent && media.length === 0) {
      setError(t('postComposer.errors.empty'))
      return
    }

    setError('')

    const imageFile = media.find((item) => item.type === 'image')?.file || null
    const videoFile = media.find((item) => item.type === 'video')?.file || null
    const mediaFiles = media.map((item) => item.file)

    await onSubmit({
      content: trimmedContent,
      category,
      visibility,
      imageFile,
      videoFile,
      mediaFiles,
    })

    setContent('')
    setMedia((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url))
      return []
    })
  }

  const canPublish = content.trim().length > 0 || media.length > 0

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-black sm:rounded-2xl sm:border sm:px-4 sm:py-4">
      <div className="flex gap-3">
        <div className="shrink-0 pt-1">
          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={userName}
              className="h-10 w-10 rounded-full border border-zinc-200 object-cover dark:border-zinc-800 sm:h-11 sm:w-11"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 sm:h-11 sm:w-11">
              {getInitial(userName)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('postComposer.placeholder').replace('{name}', userName)}
            className="min-h-[76px] w-full resize-none border-0 bg-transparent px-0 py-2 text-lg text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:min-h-[92px] sm:text-xl"
          />

          {media.length > 0 && (
            <div
              className={[
                'mt-3 grid gap-2 overflow-hidden rounded-2xl',
                media.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
              ].join(' ')}
            >
              {media.map((item) => (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.url}
                      alt={t('postComposer.previewImage')}
                      className="h-40 w-full object-cover sm:h-56"
                    />
                  ) : (
                    <div className="relative">
                      <video
                        src={item.url}
                        className="h-40 w-full bg-black object-cover sm:h-56"
                        muted
                        playsInline
                      />

                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white">
                          <Play className="h-5 w-5 fill-current" />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => removeMedia(item.id)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                    title={t('postComposer.removeMedia')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                    {item.type === 'image' ? t('postComposer.image') : t('postComposer.video')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg"
                    multiple
                    className="hidden"
                    onChange={(event) => addFiles(event.target.files)}
                  />

                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    title={`${t('postComposer.addImages')} / ${t('postComposer.addVideos')}`}
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>

                  <div
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    title={selectedCategory ? t(selectedCategory.labelKey) : t('postComposer.category')}
                  >
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      title={t('postComposer.category')}
                      aria-label={t('postComposer.category')}
                    >
                      {CATEGORY_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </option>
                      ))}
                    </select>

                    <Tag className="pointer-events-none h-4 w-4" />
                  </div>

                  <div
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    title={selectedVisibility ? t(selectedVisibility.labelKey) : t('postComposer.privacy')}
                  >
                    <select
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value as VisibilityType)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      title={t('postComposer.privacy')}
                      aria-label={t('postComposer.privacy')}
                    >
                      {VISIBILITY_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </option>
                      ))}
                    </select>

                    <span className="pointer-events-none">
                      {selectedVisibility?.icon}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submitting || !canPublish}
                  onClick={handleSubmit}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black sm:w-auto sm:min-w-[110px]"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? t('postComposer.posting') : t('postComposer.post')}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-1 text-xs text-zinc-500 dark:text-zinc-500">
                <span>{t('postComposer.mediaCounter').replace('{current}', String(media.length)).replace('{max}', String(MAX_MEDIA_FILES))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
