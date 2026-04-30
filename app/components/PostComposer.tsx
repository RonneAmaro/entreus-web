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
  Video,
} from 'lucide-react'

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
  { value: 'cotidiano', label: 'Cotidiano' },
  { value: 'viagens', label: 'Viagens' },
  { value: 'lugares', label: 'Lugares' },
  { value: 'comida', label: 'Comida' },
  { value: 'pensamentos', label: 'Pensamentos' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'sensual', label: 'Sensual' },
  { value: 'adulto', label: 'Adulto' },
]

const VISIBILITY_OPTIONS: {
  value: VisibilityType
  label: string
  icon: React.ReactNode
}[] = [
  {
    value: 'public',
    label: 'Público',
    icon: <Globe2 className="h-4 w-4" />,
  },
  {
    value: 'followers',
    label: 'Só seguidores',
    icon: <Users className="h-4 w-4" />,
  },
  {
    value: 'private',
    label: 'Privado',
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
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)

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
      setError(`Você pode adicionar no máximo ${MAX_MEDIA_FILES} mídias por publicação.`)
      return
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots)
    const newMedia: MediaPreview[] = []

    for (const file of selectedFiles) {
      if (!isImage(file) && !isVideo(file)) {
        setError('Envie apenas imagens JPG, PNG, WEBP ou vídeos MP4, WEBM, OGG.')
        continue
      }

      if (isImage(file) && file.size > MAX_IMAGE_SIZE) {
        setError('Cada imagem deve ter no máximo 5MB.')
        continue
      }

      if (isVideo(file) && file.size > MAX_VIDEO_SIZE) {
        setError('Cada vídeo deve ter no máximo 30MB.')
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
      setError(`Foram adicionadas apenas ${availableSlots} mídia(s). O limite é ${MAX_MEDIA_FILES}.`)
    }

    setMedia([...currentMedia, ...newMedia])

    if (imageInputRef.current) imageInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
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
      setError('Escreva algo ou adicione uma foto/vídeo antes de publicar.')
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
            placeholder={`O que está acontecendo, ${userName}?`}
            className="min-h-[68px] w-full resize-none border-0 bg-transparent px-0 py-2 text-lg text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:min-h-[78px] sm:text-xl"
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
                      alt="Prévia da imagem"
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
                    title="Remover mídia"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                    {item.type === 'image' ? 'Imagem' : 'Vídeo'}
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

          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  title="Adicionar imagens"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  title="Adicionar vídeos"
                >
                  <Video className="h-5 w-5" />
                </button>

                <div className="relative">
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-9 max-w-[142px] appearance-none rounded-full border border-zinc-200 bg-transparent pl-8 pr-3 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:max-w-none sm:text-sm"
                    title="Categoria"
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>

                <div className="relative">
                  <select
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as VisibilityType)}
                    className="h-9 max-w-[132px] appearance-none rounded-full border border-zinc-200 bg-transparent pl-8 pr-3 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:max-w-none sm:text-sm"
                    title="Privacidade"
                  >
                    {VISIBILITY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                    {selectedVisibility?.icon}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || !canPublish}
                onClick={handleSubmit}
                className="flex h-9 min-w-[98px] items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Publicando...' : 'Postar'}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
              <span>{selectedCategory?.label}</span>
              <span>•</span>
              <span>{selectedVisibility?.label}</span>
              <span>•</span>
              <span>{media.length}/{MAX_MEDIA_FILES} mídias</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}