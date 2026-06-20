'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  Camera,
  CheckCircle2,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquareText,
  Scissors,
  Video,
  Play,
  Send,
  Smile,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useLanguage } from './LanguageProvider'
import { supabase } from '@/lib/supabase'
import UserTierBadge from './UserTierBadge'
import type { AiAssistMode } from '@/lib/ai/types'
import type { UserTier } from '@/lib/user-tiers'
import {
  HEAVY_VIDEO_WARNING_SIZE_BYTES,
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  POST_VIDEO_MAX_DURATION_SECONDS,
  VIDEO_UPLOAD_MAX_SIZE_BYTES,
  formatUploadBytes,
  formatUploadLimitMegabytes,
  getAllowedUploadContentType,
  isAllowedImageMimeType,
  isAllowedVideoMimeType,
  looksLikeVideoUpload,
} from '@/lib/media/upload-limits'
import {
  canAttemptVideoCompression,
  compressVideoForPost,
} from '@/lib/media/video-compression'
import {
  COMMUNITIES,
  CONTENT_RATINGS,
  getCommunityDefinition,
  resolveContentRating,
  type CommunityType,
  type ContentRating,
} from '@/lib/communities'

type VisibilityType = 'public' | 'followers' | 'private'

type MediaPreview = {
  id: string
  file: File
  url: string
  type: 'image' | 'video'
  videoOptimization?: VideoOptimizationInfo
}

type VideoOptimizationInfo = {
  originalSize: number
  compressedSize: number
  savedBytes: number
  savedPercent: number
  message: string
}

type PendingVideoCompression = {
  file: File
  replacementMediaId: string | null
}

type PostComposerProps = {
  userName: string
  userAvatarUrl?: string | null
  videoUploadLimitBytes?: number
  userTier?: UserTier
  canAccessAdult18Plus?: boolean
  submitting?: boolean
  onSubmit: (data: {
    content: string
    category: string
    communityType: CommunityType
    contentRating: ContentRating
    visibility: VisibilityType
    imageFile: File | null
    videoFile: File | null
    mediaFiles: File[]
  }) => boolean | void | Promise<boolean | void>
}

type AiAssistResponse =
  | {
      ok: true
      result: string
    }
  | {
      ok: false
      error?: string
    }

type AiFeedback = {
  type: 'success' | 'error'
  message: string
}

type MediaFeedback = {
  type: 'info' | 'success' | 'warning'
  message: string
}

const CATEGORY_OPTIONS = [
  { value: 'cotidiano', labelKey: 'categories.cotidiano' },
  { value: 'viagens', labelKey: 'categories.viagens' },
  { value: 'lugares', labelKey: 'categories.lugares' },
  { value: 'comida', labelKey: 'categories.comida' },
  { value: 'pensamentos', labelKey: 'categories.pensamentos' },
  { value: 'lifestyle', labelKey: 'categories.lifestyle' },
  { value: '18plus', labelKey: 'categories.sensitive' },
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
const AI_MIN_TEXT_LENGTH = 3
const AI_MAX_TEXT_LENGTH = 1200
const AI_SHORT_TEXT_HINT = 'Escreva pelo menos 3 caracteres para usar a IA.'
const AI_LOGIN_ERROR = 'Faca login para usar a IA da EntreUS.'
const AI_GENERIC_ERRORS: Record<AiAssistMode, string> = {
  improve_post: 'Nao foi possivel melhorar o texto agora. Tente novamente em instantes.',
  suggest_caption: 'Nao foi possivel sugerir uma legenda agora. Tente novamente em instantes.',
}
const AI_TOO_LONG_ERRORS: Record<AiAssistMode, string> = {
  improve_post: 'O texto esta muito grande para melhorar com IA. Reduza um pouco e tente novamente.',
  suggest_caption: 'O texto esta muito grande para usar a IA. Reduza um pouco e tente novamente.',
}
const AI_UNCHANGED_ERRORS: Record<AiAssistMode, string> = {
  improve_post: 'A IA nao encontrou melhorias agora. Seu texto foi mantido.',
  suggest_caption: 'A IA nao encontrou uma legenda diferente agora. Seu texto foi mantido.',
}
const AI_SUCCESS_MESSAGES: Record<AiAssistMode, string> = {
  improve_post: 'Texto melhorado. Revise antes de publicar.',
  suggest_caption: 'Legenda sugerida. Revise antes de publicar.',
}
const AI_LOADING_LABELS: Record<AiAssistMode, string> = {
  improve_post: 'Melhorando...',
  suggest_caption: 'Gerando legenda...',
}
const POST_EMOJI_GROUPS = [
  {
    title: 'Populares',
    emojis: ['😀', '😍', '😂', '😎', '🔥', '❤️', '💙', '👏', '🙌', '🎉', '✨', '🚀'],
  },
  {
    title: 'Emoções',
    emojis: ['😮', '😢', '🥳', '🤔', '😘', '😜', '🥰', '😏', '😊', '😭', '😅', '🤩'],
  },
  {
    title: 'Gestos',
    emojis: ['👍', '👎', '🙏', '🫶', '💪', '🤝', '👊', '✌️', '🤙', '👋', '☝️', '🤞'],
  },
  {
    title: 'Festa',
    emojis: ['🎉', '🥳', '🎊', '🎁', '🏆', '⭐', '💎', '🌹', '📸', '🎥', '🎬', '🎵'],
  },
  {
    title: 'Símbolos',
    emojis: ['💬', '📌', '📢', '✅', '⚠️', '🔒', '🔗', '📝', '💯', '⚡', '🌎', '💡'],
  },
  {
    title: 'EntreUS azul',
    emojis: ['💙', '🫶', '🌎', '🚀', '✨', '💎', '🤝', '📣', '🌟', '🏠', '👥', '🛡️'],
  },
]

function getInitial(name: string) {
  if (!name) return 'U'
  return name.slice(0, 1).toUpperCase()
}

function getEffectiveContentType(file: File) {
  return getAllowedUploadContentType(file.type, file.name)
}

function isGif(file: File) {
  return getEffectiveContentType(file) === 'image/gif'
}

function getVideoSizeError(videoUploadLimitBytes: number) {
  return `Seu limite atual e ${formatUploadLimitMegabytes(videoUploadLimitBytes)}. Tente comprimir o video antes de publicar. VIP/Anciao tem limites maiores.`
}

function getVideoTierBenefitMessage(tier: UserTier, videoUploadLimitBytes: number) {
  if (tier === 'elder') return `Voce tem limite Anciao de ${formatUploadLimitMegabytes(videoUploadLimitBytes)}.`
  if (tier === 'vip' || tier === 'vip_premium') return `Voce tem limite VIP de ${formatUploadLimitMegabytes(videoUploadLimitBytes)}.`
  return `Seu limite atual de video e ${formatUploadLimitMegabytes(videoUploadLimitBytes)}.`
}

function getVideoOptimizationMessage(originalSize: number, compressedSize: number) {
  return `Video otimizado: ${formatUploadBytes(originalSize)} -> ${formatUploadBytes(compressedSize)}`
}

function hasVideoOptimization(item: MediaPreview): item is MediaPreview & {
  videoOptimization: VideoOptimizationInfo
} {
  return item.type === 'video' && Boolean(item.videoOptimization)
}

function readVideoDurationSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    let completed = false
    let timeoutId: number | null = null

    function finish(duration: number | null) {
      if (completed) return
      completed = true

      if (timeoutId !== null) window.clearTimeout(timeoutId)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
      resolve(duration)
    }

    timeoutId = window.setTimeout(() => finish(null), 10000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      finish(Number.isFinite(video.duration) ? video.duration : null)
    }
    video.onerror = () => finish(null)
    video.src = objectUrl
  })
}

function getMediaFeedbackClassName(type: MediaFeedback['type']) {
  if (type === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
  }

  if (type === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
  }

  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
}

export default function PostComposer({
  userName,
  userAvatarUrl,
  videoUploadLimitBytes = VIDEO_UPLOAD_MAX_SIZE_BYTES,
  userTier = 'standard',
  canAccessAdult18Plus = false,
  submitting = false,
  onSubmit,
}: PostComposerProps) {
  const { t } = useLanguage()
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const cameraPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaRef = useRef<MediaPreview[]>([])
  const mediaReplacementIdRef = useRef<string | null>(null)

  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [communityType, setCommunityType] = useState<CommunityType>('general')
  const [contentRating, setContentRating] = useState<ContentRating>('safe')
  const [visibility, setVisibility] = useState<VisibilityType>('public')
  const [media, setMedia] = useState<MediaPreview[]>([])
  const [error, setError] = useState('')
  const [mediaFeedback, setMediaFeedback] = useState<MediaFeedback | null>(null)
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null)
  const [activeAiMode, setActiveAiMode] = useState<AiAssistMode | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)
  const [isOptimizingVideo, setIsOptimizingVideo] = useState(false)
  const [pendingVideoCompression, setPendingVideoCompression] = useState<PendingVideoCompression | null>(null)

  const selectedCategory = useMemo(() => {
    return CATEGORY_OPTIONS.find((item) => item.value === category)
  }, [category])

  const selectedCommunity = useMemo(() => {
    return getCommunityDefinition(communityType)
  }, [communityType])

  const selectedVisibility = useMemo(() => {
    return VISIBILITY_OPTIONS.find((item) => item.value === visibility)
  }, [visibility])

  const optimizedVideoItems = useMemo(() => {
    return media.filter(hasVideoOptimization)
  }, [media])

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    return () => {
      mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

  useEffect(() => {
    setPortalElement(document.body)
  }, [])

  useEffect(() => {
    if (!isModalOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && content.trim().length === 0 && media.length === 0) {
        setIsModalOpen(false)
        setShowEmojiPicker(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus()
    }, 80)

    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [content, isModalOpen, media.length])

  function openMediaPicker(replacementMediaId?: string) {
    mediaReplacementIdRef.current = replacementMediaId || null
    mediaInputRef.current?.click()
  }

  function openCameraPhotoPicker() {
    mediaReplacementIdRef.current = null
    cameraPhotoInputRef.current?.click()
  }

  function openCameraVideoPicker() {
    mediaReplacementIdRef.current = null
    cameraVideoInputRef.current?.click()
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      mediaReplacementIdRef.current = null
      return
    }

    setError('')
    setMediaFeedback(null)
    setPendingVideoCompression(null)
    setShowMediaMenu(false)

    const currentMedia = [...media]
    const replacementMediaId = mediaReplacementIdRef.current
    const replacementMedia = replacementMediaId
      ? currentMedia.find((item) => item.id === replacementMediaId)
      : null
    const availableSlots = MAX_MEDIA_FILES - currentMedia.length + (replacementMedia ? 1 : 0)

    mediaReplacementIdRef.current = null

    if (availableSlots <= 0) {
      setError(t('postComposer.errors.maxMedia').replace('{max}', String(MAX_MEDIA_FILES)))
      return
    }

    const selectedFiles = Array.from(files).slice(0, replacementMedia ? 1 : availableSlots)
    const newMedia: MediaPreview[] = []

    for (const file of selectedFiles) {
      const fileToAttach = file
      const contentType = getEffectiveContentType(file)
      const fileIsImage = Boolean(contentType && isAllowedImageMimeType(contentType))
      const fileIsVideo = Boolean(contentType && isAllowedVideoMimeType(contentType))

      if (!fileIsImage && !fileIsVideo) {
        setError(
          looksLikeVideoUpload(file.type, file.name)
            ? 'Formato nao aceito. Use MP4, WebM ou MOV para videos.'
            : 'Formato nao permitido. Use JPG, PNG, WEBP ou GIF.',
        )
        continue
      }

      if (fileIsImage && file.size > IMAGE_UPLOAD_MAX_SIZE_BYTES) {
        setError(isGif(file) ? 'GIF muito grande. O limite atual e 5 MB.' : t('postComposer.errors.imageTooLarge'))
        continue
      }

      if (fileIsVideo) {
        const duration = await readVideoDurationSeconds(file)

        if (duration !== null && duration > POST_VIDEO_MAX_DURATION_SECONDS) {
          setError('Para manter a EntreUS rapida, envie videos de ate 60 segundos.')
          continue
        }
      }

      if (fileIsVideo && file.size > videoUploadLimitBytes) {
        const sizeError = getVideoSizeError(videoUploadLimitBytes)
        setError(sizeError)
        setMediaFeedback({
          type: 'warning',
          message: sizeError,
        })

        if (canAttemptVideoCompression(file)) {
          setPendingVideoCompression({
            file,
            replacementMediaId: replacementMedia?.id || null,
          })
        }

        break
      }

      if (fileIsVideo && file.size > HEAVY_VIDEO_WARNING_SIZE_BYTES) {
        setMediaFeedback({
          type: 'warning',
          message: 'Video pesado selecionado. Se o upload falhar no celular, reduza a duracao/qualidade ou use o editor para otimizar.',
        })
      }

      newMedia.push({
        id: `${fileToAttach.name}-${fileToAttach.size}-${Date.now()}-${Math.random()}`,
        file: fileToAttach,
        url: URL.createObjectURL(fileToAttach),
        type: fileIsImage ? 'image' : 'video',
      })
    }

    if (Array.from(files).length > availableSlots) {
      setError(t('postComposer.errors.partialAdded').replace('{count}', String(availableSlots)).replace('{max}', String(MAX_MEDIA_FILES)))
    }

    if (newMedia.length > 0) {
      if (replacementMedia) {
        const replacementItem = newMedia[0]

        setMedia((current) => {
          let replaced = false
          const nextMedia = current.map((item) => {
            if (item.id !== replacementMedia.id) return item

            replaced = true
            URL.revokeObjectURL(item.url)
            return replacementItem
          })

          if (!replaced) {
            URL.revokeObjectURL(replacementItem.url)
            return current
          }

          return nextMedia
        })
      } else {
        setMedia((current) => [...current, ...newMedia])
      }
    }

    if (mediaInputRef.current) mediaInputRef.current.value = ''
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
    if (cameraVideoInputRef.current) cameraVideoInputRef.current.value = ''
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

  async function compressVideoForComposer(file: File) {
    if (!canAttemptVideoCompression(file)) {
      setMediaFeedback({
        type: 'warning',
        message: 'Nao foi possivel comprimir neste dispositivo. Tente um video menor.',
      })
      return null
    }

    setIsOptimizingVideo(true)
    setMediaFeedback({
      type: 'info',
      message: 'Preparando video...',
    })

    try {
      const result = await compressVideoForPost(file, {
        targetMaxSizeBytes: videoUploadLimitBytes,
        onStage: (stage) => {
          setMediaFeedback({
            type: 'info',
            message:
              stage === 'preparing'
                ? 'Preparando video...'
                : 'Comprimindo video...',
          })
        },
      })

      if (result.ok) {
        return {
          file: result.file,
          videoOptimization: {
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            savedBytes: result.savedBytes,
            savedPercent: result.savedPercent,
            message: getVideoOptimizationMessage(result.originalSize, result.compressedSize),
          },
        }
      }

      setMediaFeedback({
        type: 'warning',
        message: 'Nao foi possivel comprimir neste dispositivo. Tente um video menor.',
      })
      return null
    } catch {
      setMediaFeedback({
        type: 'warning',
        message: 'Nao foi possivel comprimir neste dispositivo. Tente um video menor.',
      })
      return null
    } finally {
      setIsOptimizingVideo(false)
    }
  }

  function createVideoPreview(file: File, videoOptimization?: VideoOptimizationInfo): MediaPreview {
    return {
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
      type: 'video',
      videoOptimization,
    }
  }

  function attachCompressedVideo(
    file: File,
    videoOptimization: VideoOptimizationInfo,
    replacementMediaId: string | null,
  ) {
    const replacementItem = createVideoPreview(file, videoOptimization)

    setMedia((current) => {
      if (!replacementMediaId) {
        if (current.length >= MAX_MEDIA_FILES) {
          URL.revokeObjectURL(replacementItem.url)
          return current
        }

        return [...current, replacementItem]
      }

      let replaced = false
      const nextMedia = current.map((item) => {
        if (item.id !== replacementMediaId) return item

        replaced = true
        URL.revokeObjectURL(item.url)
        return replacementItem
      })

      if (!replaced) {
        URL.revokeObjectURL(replacementItem.url)
        return current
      }

      return nextMedia
    })
  }

  async function handlePendingVideoCompression() {
    if (!pendingVideoCompression || isOptimizingVideo) return

    const pending = pendingVideoCompression
    const result = await compressVideoForComposer(pending.file)

    if (!result) return

    if (result.file.size > videoUploadLimitBytes) {
      const sizeError = getVideoSizeError(videoUploadLimitBytes)
      setError(sizeError)
      setMediaFeedback({
        type: 'warning',
        message: sizeError,
      })
      return
    }

    setError('')
    setPendingVideoCompression(null)
    attachCompressedVideo(result.file, result.videoOptimization, pending.replacementMediaId)
    setMediaFeedback({
      type: 'success',
      message: 'Video comprimido e pronto para publicar.',
    })
  }

  async function handleAttachedVideoCompression(item: MediaPreview) {
    if (item.type !== 'video' || isOptimizingVideo) return

    const result = await compressVideoForComposer(item.file)
    if (!result) return

    setMedia((current) =>
      current.map((currentItem) => {
        if (currentItem.id !== item.id) return currentItem

        URL.revokeObjectURL(currentItem.url)
        return {
          ...currentItem,
          file: result.file,
          url: URL.createObjectURL(result.file),
          videoOptimization: result.videoOptimization,
        }
      }),
    )
    setMediaFeedback({
      type: 'success',
      message: 'Video comprimido e pronto para publicar.',
    })
  }

  function handleContentChange(value: string) {
    setContent(value)
    setAiFeedback(null)
  }

  function handleCommunityChange(value: string) {
    const nextCommunity = COMMUNITIES.some((item) => item.key === value)
      ? (value as CommunityType)
      : 'general'

    if (nextCommunity === 'adult_18plus' && !canAccessAdult18Plus) {
      setError('Area 18+ exige verificacao de idade aprovada.')
      setCommunityType('general')
      setContentRating('safe')
      return
    }

    const nextRating = resolveContentRating(nextCommunity, contentRating)
    setError('')
    setCommunityType(nextCommunity)
    setContentRating(nextRating)
  }

  function handleContentRatingChange(value: string) {
    const nextRating = CONTENT_RATINGS.some((item) => item.key === value)
      ? (value as ContentRating)
      : 'safe'

    if (nextRating === 'adult_18plus' && !canAccessAdult18Plus) {
      setError('Area 18+ exige verificacao de idade aprovada.')
      setContentRating(resolveContentRating(communityType, 'safe'))
      return
    }

    setError('')
    setContentRating(resolveContentRating(communityType, nextRating))
  }

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current

    if (!textarea) {
      setContent((current) => `${current}${emoji}`)
      setAiFeedback(null)
      setShowEmojiPicker(false)
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const nextContent = `${content.slice(0, selectionStart)}${emoji}${content.slice(selectionEnd)}`
    const nextCursorPosition = selectionStart + emoji.length

    setContent(nextContent)
    setAiFeedback(null)
    setShowEmojiPicker(false)

    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition)
    })
  }

  async function handleAiAssist(mode: AiAssistMode) {
    if (activeAiMode || submitting) return

    const text = content.trim()
    const genericError = AI_GENERIC_ERRORS[mode]

    if (text.length < AI_MIN_TEXT_LENGTH) {
      setAiFeedback({
        type: 'error',
        message: AI_SHORT_TEXT_HINT,
      })
      return
    }

    if (text.length > AI_MAX_TEXT_LENGTH) {
      setAiFeedback({
        type: 'error',
        message: AI_TOO_LONG_ERRORS[mode],
      })
      return
    }

    setActiveAiMode(mode)
    setAiFeedback(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setAiFeedback({
          type: 'error',
          message: AI_LOGIN_ERROR,
        })
        return
      }

      const response = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          text,
        }),
      })
      const data = (await response.json().catch(() => null)) as AiAssistResponse | null

      if (!data) {
        setAiFeedback({
          type: 'error',
          message: genericError,
        })
        return
      }

      if (!data.ok) {
        setAiFeedback({
          type: 'error',
          message:
            response.status === 401 || data.error === AI_LOGIN_ERROR
              ? AI_LOGIN_ERROR
              : genericError,
        })
        return
      }

      if (!response.ok) {
        setAiFeedback({
          type: 'error',
          message: genericError,
        })
        return
      }

      const assistedText = data.result.trim()

      if (!assistedText || assistedText === text) {
        setAiFeedback({
          type: 'error',
          message: AI_UNCHANGED_ERRORS[mode],
        })
        return
      }

      setContent(assistedText)
      setAiFeedback({
        type: 'success',
        message: AI_SUCCESS_MESSAGES[mode],
      })

      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    } catch {
      setAiFeedback({
        type: 'error',
        message: genericError,
      })
    } finally {
      setActiveAiMode(null)
    }
  }

  async function handleSubmit() {
    const trimmedContent = content.trim()

    if (isOptimizingVideo) {
      setMediaFeedback({
        type: 'info',
        message: 'Otimizando video...',
      })
      return
    }

    if (!trimmedContent && media.length === 0) {
      setError(t('postComposer.errors.empty'))
      return
    }

    setError('')

    const imageFile = media.find((item) => item.type === 'image')?.file || null
    const videoFile = media.find((item) => item.type === 'video')?.file || null
    const mediaFiles = media.map((item) => item.file)
    const resolvedRating = resolveContentRating(communityType, contentRating)

    if (resolvedRating === 'adult_18plus' && !canAccessAdult18Plus) {
      setError('Area 18+ exige verificacao de idade aprovada.')
      return
    }

    const result = await onSubmit({
      content: trimmedContent,
      category,
      communityType,
      contentRating: resolvedRating,
      visibility,
      imageFile,
      videoFile,
      mediaFiles,
    })

    if (result === false) return

    setContent('')
    setCommunityType('general')
    setContentRating('safe')
    setShowEmojiPicker(false)
    setShowMediaMenu(false)
    setMediaFeedback(null)
    setIsModalOpen(false)
    setMedia((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url))
      return []
    })
  }

  const trimmedContentLength = content.trim().length
  const canPublish = (trimmedContentLength > 0 || media.length > 0) && !isOptimizingVideo
  const canUseAi =
    trimmedContentLength >= AI_MIN_TEXT_LENGTH && !submitting && !activeAiMode
  const getAiButtonTitle = (mode: AiAssistMode) => {
    if (activeAiMode === mode) return AI_LOADING_LABELS[mode]
    if (activeAiMode) return 'Aguarde a outra acao da IA terminar.'
    if (trimmedContentLength < AI_MIN_TEXT_LENGTH) return AI_SHORT_TEXT_HINT
    if (trimmedContentLength > AI_MAX_TEXT_LENGTH) return AI_TOO_LONG_ERRORS[mode]

    return mode === 'suggest_caption'
      ? 'Sugerir legenda com IA da EntreUS'
      : 'Melhorar texto com IA da EntreUS'
  }
  const placeholderText = t('postComposer.placeholder').replace('{name}', userName)

  return (
    <>
      <div className="rounded-[1.35rem] border border-zinc-200/70 bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:ring-white/10">
        <div className="flex items-center gap-3">
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

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="min-w-0 flex-1 rounded-full px-2 py-2 text-left text-[15px] text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {placeholderText}
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hidden rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 sm:inline-flex"
          >
            {t('postComposer.post')}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1 pl-[3.25rem] text-blue-600 dark:text-blue-400">
          {[ImagePlus, Smile, Tag, selectedVisibility?.icon ? null : Globe2].map((Icon, index) =>
            Icon ? (
              <button
                key={index}
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
                aria-label="Abrir criador de post"
              >
                <Icon className="h-4 w-4" />
              </button>
            ) : null
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
            aria-label="Abrir criador de post"
          >
            <span className="scale-90">{selectedVisibility?.icon}</span>
          </button>
        </div>
      </div>

      {portalElement && isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center px-2 py-3 sm:items-center sm:px-4 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

          <div className="relative z-[10000] flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-blue-400/20 bg-white shadow-2xl shadow-blue-950/25 ring-1 ring-white/10 dark:bg-zinc-950 sm:max-h-[90vh]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/90">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false)
                  setShowEmojiPicker(false)
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>

              <p className="text-sm font-black text-zinc-950 dark:text-white">
                Criar post
              </p>

              <button
                type="button"
                disabled={submitting || !canPublish}
                onClick={handleSubmit}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {isOptimizingVideo ? 'Otimizando...' : submitting ? t('postComposer.posting') : t('postComposer.post')}
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto">
              <div className="bg-white px-4 py-3 dark:bg-zinc-950 sm:px-5 sm:py-4">
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
            ref={textareaRef}
            value={content}
            onChange={(event) => handleContentChange(event.target.value)}
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
                        preload="none"
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
                    aria-label={t('postComposer.removeMedia')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <div className="absolute left-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openMediaPicker(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                      title="Trocar midia"
                      aria-label="Trocar midia"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>

                    <Link
                      href="/editor"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                      title="Editar midia"
                      aria-label="Editar midia"
                    >
                      <Scissors className="h-4 w-4" />
                    </Link>

                    {item.type === 'video' && portalElement && canAttemptVideoCompression(item.file) && (
                      <button
                        type="button"
                        onClick={() => handleAttachedVideoCompression(item)}
                        disabled={isOptimizingVideo}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                        title="Comprimir video"
                        aria-label="Comprimir video"
                      >
                        {isOptimizingVideo ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Scissors className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                    {item.type === 'image' ? t('postComposer.image') : t('postComposer.video')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {optimizedVideoItems.length > 0 && (
            <div className="mt-2 space-y-2" role="status" aria-live="polite">
              {optimizedVideoItems.map((item) => (
                <div
                  key={`${item.id}-optimization`}
                  className="flex flex-col gap-1 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800 shadow-sm shadow-emerald-950/5 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{item.videoOptimization.message}</span>
                  </span>

                  <span className="shrink-0 font-black">
                    Economia de {item.videoOptimization.savedPercent}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {pendingVideoCompression && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0">
                O video selecionado excede seu limite. Tente comprimir antes de publicar.
              </p>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handlePendingVideoCompression}
                  disabled={isOptimizingVideo}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-amber-700 px-3 text-xs font-bold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isOptimizingVideo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Scissors className="h-4 w-4" />
                  )}
                  Comprimir
                </button>

                <button
                  type="button"
                  onClick={() => setPendingVideoCompression(null)}
                  disabled={isOptimizingVideo}
                  className="inline-flex h-9 items-center rounded-full border border-amber-300 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          {mediaFeedback && (
            <p
              className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${getMediaFeedbackClassName(mediaFeedback.type)}`}
              role="status"
              aria-live="polite"
            >
              {mediaFeedback.message}
            </p>
          )}

          {aiFeedback && (
            <p
              id="ai-assistance-feedback"
              className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
                aiFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
              }`}
              role="status"
              aria-live="polite"
            >
              {aiFeedback.message}
            </p>
          )}

          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-xs leading-5 ${userTier === 'elder'
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'
              : userTier === 'vip' || userTier === 'vip_premium'
                ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100'
              }`}
            >
              <UserTierBadge tier={userTier} />
              <span>{getVideoTierBenefitMessage(userTier, videoUploadLimitBytes)}</span>
              {userTier === 'standard' && (
                <>
                  <span>VIP libera videos maiores e destaque visual.</span>
                  <Link href="/vip-plus" className="font-black underline underline-offset-2">
                    Conhecer VIP
                  </Link>
                </>
              )}
            </div>

            <div className="mb-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="mb-3">
                <p className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">
                  Escolha onde seu post deve aparecer.
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  Conteudo adulto fica isolado e so aparece para usuarios verificados 18+.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                    Comunidade
                  </span>
                  <select
                    value={communityType}
                    onChange={(event) => handleCommunityChange(event.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-black dark:text-white"
                  >
                    {COMMUNITIES.map((community) => (
                      <option
                        key={community.key}
                        value={community.key}
                        disabled={community.requires18Plus && !canAccessAdult18Plus}
                      >
                        {community.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                    Classificacao
                  </span>
                  <select
                    value={contentRating}
                    onChange={(event) => handleContentRatingChange(event.target.value)}
                    disabled={communityType === 'adult_18plus'}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-800 dark:bg-black dark:text-white"
                  >
                    {CONTENT_RATINGS.map((rating) => (
                      <option
                        key={rating.key}
                        value={rating.key}
                        disabled={rating.requires18Plus && !canAccessAdult18Plus}
                      >
                        {rating.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-bold dark:border-zinc-800 dark:bg-black">
                  {selectedCommunity.label}
                </span>
                {selectedCommunity.sensitive && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    Sensivel
                  </span>
                )}
                {!canAccessAdult18Plus && (
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-bold dark:border-zinc-800 dark:bg-black">
                    Area 18+ exige verificacao de idade.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    multiple
                    className="hidden"
                    disabled={isOptimizingVideo}
                    onChange={(event) => addFiles(event.target.files)}
                  />

                  <input
                    ref={cameraPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={isOptimizingVideo}
                    onChange={(event) => addFiles(event.target.files)}
                  />

                  <input
                    ref={cameraVideoInputRef}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    disabled={isOptimizingVideo}
                    onChange={(event) => addFiles(event.target.files)}
                  />

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowMediaMenu((current) => !current)}
                      disabled={isOptimizingVideo}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                        showMediaMenu
                          ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30'
                          : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      title="Adicionar midia"
                      aria-label="Adicionar midia"
                      aria-expanded={showMediaMenu}
                    >
                      <ImagePlus className="h-5 w-5" />
                    </button>

                    {showMediaMenu && (
                      <div className="absolute left-0 top-12 z-[10000] w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-blue-400/25 bg-white p-1.5 text-zinc-900 shadow-2xl shadow-blue-950/20 ring-1 ring-black/5 dark:bg-zinc-950 dark:text-white dark:ring-white/10">
                        <button
                          type="button"
                          onClick={() => openMediaPicker()}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <ImagePlus className="h-4 w-4 text-blue-500" />
                          Galeria
                        </button>

                        <button
                          type="button"
                          onClick={openCameraPhotoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <Camera className="h-4 w-4 text-blue-500" />
                          Camera
                        </button>

                        <button
                          type="button"
                          onClick={openCameraVideoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <Video className="h-4 w-4 text-blue-500" />
                          Gravar video
                        </button>

                        <Link
                          href="/editor"
                          onClick={() => setShowMediaMenu(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          title="Editar midia"
                          aria-label="Editar midia"
                        >
                          <Scissors className="h-4 w-4 text-blue-500" />
                          Editar midia
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((current) => !current)}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                        showEmojiPicker
                          ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30'
                          : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      }`}
                      title="Adicionar emoji"
                      aria-label="Adicionar emoji"
                      aria-expanded={showEmojiPicker}
                    >
                      <Smile className="h-5 w-5" />
                    </button>

                    {showEmojiPicker && (
                      <div className="absolute left-0 top-12 z-[10000] max-h-[52dvh] w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-[1.35rem] border border-blue-400/25 bg-zinc-950/95 p-3 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10 backdrop-blur-xl sm:w-80">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">
                            Emojis
                          </p>

                          <button
                            type="button"
                            onClick={() => setShowEmojiPicker(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                            aria-label="Fechar emojis"
                            title="Fechar emojis"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          {POST_EMOJI_GROUPS.map((group) => (
                            <div key={group.title}>
                              <p className="mb-1.5 text-[11px] font-bold text-zinc-400">
                                {group.title}
                              </p>

                              <div className="grid grid-cols-6 gap-1.5">
                                {group.emojis.map((emoji) => (
                                  <button
                                    key={`${group.title}-${emoji}`}
                                    type="button"
                                    onClick={() => insertEmoji(emoji)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    aria-label={`Inserir emoji ${emoji}`}
                                    title={emoji}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAiAssist('improve_post')}
                    disabled={!canUseAi}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:bg-violet-950/50"
                    aria-label="Melhorar texto com IA da EntreUS"
                    aria-describedby="ai-assistance-note"
                    title={getAiButtonTitle('improve_post')}
                  >
                    {activeAiMode === 'improve_post' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span>
                      {activeAiMode === 'improve_post'
                        ? AI_LOADING_LABELS.improve_post
                        : 'Melhorar com IA'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAiAssist('suggest_caption')}
                    disabled={!canUseAi}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-200/80 bg-white px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-zinc-950 dark:text-violet-200 dark:hover:bg-violet-950/30"
                    aria-label="Sugerir legenda com IA da EntreUS"
                    aria-describedby="ai-assistance-note"
                    title={getAiButtonTitle('suggest_caption')}
                  >
                    {activeAiMode === 'suggest_caption' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquareText className="h-4 w-4" />
                    )}
                    <span>
                      {activeAiMode === 'suggest_caption'
                        ? AI_LOADING_LABELS.suggest_caption
                        : 'Sugerir legenda'}
                    </span>
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
                  {isOptimizingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isOptimizingVideo ? 'Otimizando...' : submitting ? t('postComposer.posting') : t('postComposer.post')}
                </button>
              </div>

              <div
                id="ai-assistance-note"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-violet-200/70 bg-violet-50/60 px-3 py-2 text-[11px] leading-5 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-200"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>A IA apenas sugere melhorias e legendas. Revise antes de publicar.</span>
                <Link
                  href="/help/ia"
                  className="font-bold underline decoration-violet-300 underline-offset-2 transition hover:text-violet-900 dark:decoration-violet-700 dark:hover:text-white"
                  aria-label="Saiba mais sobre a IA da EntreUS"
                >
                  Saiba mais
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-1 text-xs text-zinc-500 dark:text-zinc-500">
                <span>{t('postComposer.mediaCounter').replace('{current}', String(media.length)).replace('{max}', String(MAX_MEDIA_FILES))}</span>
                {contentRating === 'adult_18plus' && (
                  <span className="rounded-full border border-yellow-300/40 bg-yellow-50 px-2 py-1 font-bold text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
                    Conteudo adulto fica isolado e protegido por verificacao 18+.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
              </div>
            </div>
          </div>
        </div>,
        portalElement
      )}
    </>
  )
}
