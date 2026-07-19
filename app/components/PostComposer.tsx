'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  Camera,
  ChevronDown,
  CheckCircle2,
  Coins,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquareText,
  Scissors,
  Video,
  Play,
  Send,
  SlidersHorizontal,
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
import ComposerActiveChips from './post-composer/ComposerActiveChips'
import ComposerPublishSummary from './post-composer/ComposerPublishSummary'
import type { AiAssistMode } from '@/lib/ai/types'
import type { UserTier } from '@/lib/user-tiers'
import {
  COMPOSE_ACTION_EVENT,
  resolveComposeIntent,
  type ComposeIntent,
} from '@/lib/compose-intent'
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
  POST_COMMUNITIES as COMMUNITIES,
  POST_CONTENT_RATINGS as CONTENT_RATINGS,
  getPostCommunityDefinition as getCommunityDefinition,
  resolvePostContentRating as resolveContentRating,
  type PostCommunityType as CommunityType,
  type PostContentRating as ContentRating,
} from '@/lib/post-classification'
import { isLegacyAdultCategory, normalizePostClassification } from '@/lib/content-access'
import { getPaidPostErrorMessage, validatePaidPostPrice } from '@/lib/paid-posts'
import {
  DEFAULT_POST_COMPOSER_ADVANCED_OPEN,
  getComposerActiveAdvancedChips,
  getComposerProfileContentModeGuidance,
  getComposerPublishSummary,
  getComposerVisualGuardMessage,
} from '@/lib/post-composer-ux'
import type { ProfileContentMode } from '@/lib/profile-content-mode'
import { claimSubmitGuard, releaseSubmitGuard, type SubmitGuard } from '@/lib/post-submit-guard'
import ExpressionPicker from './expressions/ExpressionPicker'
import ExpressionAttachment from './expressions/ExpressionAttachment'
import type { ExpressionAsset } from '@/lib/expressions/expression-types'

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
  profileContentMode?: ProfileContentMode
  initialIntent?: ComposeIntent | null
  intentRequestKey?: number
  highlightOnMount?: boolean
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
    isPaid: boolean
    priceItacash: number | null
    expression: ExpressionAsset | null
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
const MEDIA_INTENT_FALLBACK_MESSAGE = 'Clique em adicionar mídia para escolher a foto/vídeo.'
const MEDIA_INTENT_READY_MESSAGES: Record<'photo' | 'video', string> = {
  photo: 'Escolha uma foto para publicar.',
  video: 'Escolha um vídeo para publicar.',
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
  profileContentMode = 'general',
  initialIntent = null,
  intentRequestKey = 0,
  highlightOnMount = false,
  submitting = false,
  onSubmit,
}: PostComposerProps) {
  const { t } = useLanguage()
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const cameraPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const cameraVideoInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaRef = useRef<MediaPreview[]>([])
  const mediaReplacementIdRef = useRef<string | null>(null)
  const submitGuardRef = useRef<SubmitGuard>({ current: false })

  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [communityType, setCommunityType] = useState<CommunityType>('general')
  const [contentRating, setContentRating] = useState<ContentRating>('safe')
  const [visibility, setVisibility] = useState<VisibilityType>('public')
  const [isPaidPost, setIsPaidPost] = useState(false)
  const [paidPostPrice, setPaidPostPrice] = useState('')
  const [media, setMedia] = useState<MediaPreview[]>([])
  const [error, setError] = useState('')
  const [mediaFeedback, setMediaFeedback] = useState<MediaFeedback | null>(null)
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null)
  const [activeAiMode, setActiveAiMode] = useState<AiAssistMode | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [expression, setExpression] = useState<ExpressionAsset | null>(null)
  const [expressionUserId, setExpressionUserId] = useState('signed-in')
  const [expressionToken, setExpressionToken] = useState<string | null>(null)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(DEFAULT_POST_COMPOSER_ADVANCED_OPEN)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [isOptimizingVideo, setIsOptimizingVideo] = useState(false)
  const [pendingVideoCompression, setPendingVideoCompression] = useState<PendingVideoCompression | null>(null)
  const [publishSuccessMessage, setPublishSuccessMessage] = useState('')
  const [submitLocked, setSubmitLocked] = useState(false)
  const isSubmitting = submitting || submitLocked

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setExpressionUserId(data.session?.user.id || 'signed-in')
      setExpressionToken(data.session?.access_token || null)
    })
  }, [])

  const tryOpenIntentMediaPicker = useCallback((intent: ComposeIntent) => {
    const input =
      intent === 'photo'
        ? photoInputRef.current
        : intent === 'video'
          ? videoInputRef.current
          : null

    if (!input) return false

    try {
      input.click()
      return true
    } catch {
      return false
    }
  }, [])

  const selectedCategory = useMemo(() => {
    return CATEGORY_OPTIONS.find((item) => item.value === category)
  }, [category])

  const selectedCommunity = useMemo(() => {
    return getCommunityDefinition(communityType)
  }, [communityType])

  const selectedVisibility = useMemo(() => {
    return VISIBILITY_OPTIONS.find((item) => item.value === visibility)
  }, [visibility])

  const selectedRating = useMemo(() => {
    return CONTENT_RATINGS.find((item) => item.key === contentRating)
  }, [contentRating])

  const optimizedVideoItems = useMemo(() => {
    return media.filter(hasVideoOptimization)
  }, [media])

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    if (!publishSuccessMessage) return

    const timer = window.setTimeout(() => {
      setPublishSuccessMessage('')
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [publishSuccessMessage])

  useEffect(() => {
    return () => {
      mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url))
    }
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

  useEffect(() => {
    if (!initialIntent || intentRequestKey <= 0) return

    let pickerTimer: number | null = null
    let highlightTimer: number | null = null
    let focusTimer: number | null = null

    const requestTimer = window.setTimeout(() => {
      setIsModalOpen(true)
      setShowEmojiPicker(false)
      setShowMediaMenu(initialIntent === 'photo' || initialIntent === 'video')

      if (highlightOnMount) {
        setIsHighlighted(true)
      }

      highlightTimer = window.setTimeout(() => {
        setIsHighlighted(false)
      }, 1800)

      focusTimer = window.setTimeout(() => {
        textareaRef.current?.focus()
      }, 120)

      if (initialIntent === 'photo' || initialIntent === 'video') {
        setMediaFeedback({
          type: 'info',
          message: MEDIA_INTENT_READY_MESSAGES[initialIntent],
        })

        pickerTimer = window.setTimeout(() => {
          if (!tryOpenIntentMediaPicker(initialIntent)) {
            setShowMediaMenu(true)
            setMediaFeedback({
              type: 'warning',
              message: MEDIA_INTENT_FALLBACK_MESSAGE,
            })
            return
          }

          setMediaFeedback({
            type: 'info',
            message: MEDIA_INTENT_FALLBACK_MESSAGE,
          })
        }, 180)
      }
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      if (highlightTimer !== null) window.clearTimeout(highlightTimer)
      if (focusTimer !== null) window.clearTimeout(focusTimer)
      if (pickerTimer !== null) window.clearTimeout(pickerTimer)
    }
  }, [highlightOnMount, initialIntent, intentRequestKey, tryOpenIntentMediaPicker])

  useEffect(() => {
    let highlightTimer: number | null = null
    let focusTimer: number | null = null

    function clearTimers() {
      if (highlightTimer !== null) window.clearTimeout(highlightTimer)
      if (focusTimer !== null) window.clearTimeout(focusTimer)
      highlightTimer = null
      focusTimer = null
    }

    function handleComposeAction(event: Event) {
      const customEvent = event as CustomEvent<{ intent?: string }>
      const intent = resolveComposeIntent(customEvent.detail?.intent) || 'text'
      const isMediaIntent = intent === 'photo' || intent === 'video'

      clearTimers()
      setIsModalOpen(true)
      setShowEmojiPicker(false)
      setShowMediaMenu(isMediaIntent)
      setIsHighlighted(true)

      highlightTimer = window.setTimeout(() => {
        setIsHighlighted(false)
      }, 1800)

      if (isMediaIntent) {
        setMediaFeedback({
          type: 'info',
          message: MEDIA_INTENT_READY_MESSAGES[intent],
        })

        if (!tryOpenIntentMediaPicker(intent)) {
          setMediaFeedback({
            type: 'warning',
            message: MEDIA_INTENT_FALLBACK_MESSAGE,
          })
          return
        }

        setMediaFeedback({
          type: 'info',
          message: MEDIA_INTENT_FALLBACK_MESSAGE,
        })
        return
      }

      setShowMediaMenu(false)
      focusTimer = window.setTimeout(() => {
        textareaRef.current?.focus()
      }, 80)
    }

    window.addEventListener(COMPOSE_ACTION_EVENT, handleComposeAction)

    return () => {
      clearTimers()
      window.removeEventListener(COMPOSE_ACTION_EVENT, handleComposeAction)
    }
  }, [tryOpenIntentMediaPicker])

  function openMediaPicker(replacementMediaId?: string) {
    mediaReplacementIdRef.current = replacementMediaId || null
    mediaInputRef.current?.click()
  }

  function openPhotoPicker() {
    mediaReplacementIdRef.current = null
    photoInputRef.current?.click()
  }

  function openVideoPicker() {
    mediaReplacementIdRef.current = null
    videoInputRef.current?.click()
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
    setPublishSuccessMessage('')
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
        setError(
          isGif(file)
            ? 'GIF muito grande. Use ate 5 MB.'
            : `Imagem muito grande. Use ate ${formatUploadLimitMegabytes(IMAGE_UPLOAD_MAX_SIZE_BYTES)}.`,
        )
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
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (videoInputRef.current) videoInputRef.current.value = ''
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
    setPublishSuccessMessage('')
  }

  function handleCategoryChange(value: string) {
    const nextCategory = CATEGORY_OPTIONS.some((item) => item.value === value)
      ? value
      : 'cotidiano'

    if (isLegacyAdultCategory(nextCategory) && !canAccessAdult18Plus) {
      setError('Area 18+ exige verificacao de idade aprovada.')
      return
    }

    setError('')
    setCategory(nextCategory)

    if (isLegacyAdultCategory(nextCategory)) {
      setCommunityType('adult_18plus')
      setContentRating('adult_18plus')
    }
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
    if (nextRating === 'adult_18plus') {
      setCommunityType('adult_18plus')
      setContentRating('adult_18plus')
      return
    }

    setContentRating(resolveContentRating(communityType, nextRating))
  }

  function handleAdult18PlusToggle(checked: boolean) {
    if (checked) {
      if (!canAccessAdult18Plus) {
        setError('Conteudo adulto 18+ exige verificacao aprovada.')
        setCommunityType('general')
        setContentRating('safe')
        return
      }

      setError('')
      setCommunityType('adult_18plus')
      setContentRating('adult_18plus')
      return
    }

    setError('')
    setCommunityType('general')
    setContentRating('safe')

    if (isLegacyAdultCategory(category)) {
      setCategory('cotidiano')
    }
  }

  function handlePaidPostToggle(checked: boolean) {
    setIsPaidPost(checked)
    setError('')

    if (!checked) {
      setPaidPostPrice('')
    }
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
    if (activeAiMode || isSubmitting) return

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
    if (isSubmitting || !claimSubmitGuard(submitGuardRef.current)) return

    setSubmitLocked(true)

    try {
      const trimmedContent = content.trim()

      if (isOptimizingVideo) {
        setMediaFeedback({
          type: 'info',
          message: 'Otimizando video...',
        })
        return
      }

      if (!trimmedContent && media.length === 0 && !expression) {
        setError(t('composer.emptyError'))
        return
      }

      setError('')

      const imageFile = media.find((item) => item.type === 'image')?.file || null
      const videoFile = media.find((item) => item.type === 'video')?.file || null
      const mediaFiles = media.map((item) => item.file)
      const resolvedClassification = normalizePostClassification(
        communityType,
        resolveContentRating(communityType, contentRating),
        category,
      )

      if (resolvedClassification.contentRating === 'adult_18plus' && !canAccessAdult18Plus) {
        setError('Conteudo adulto 18+ exige verificacao aprovada.')
        return
      }

      const paidPriceValidation = isPaidPost
        ? validatePaidPostPrice(paidPostPrice)
        : ({ ok: true as const, value: null })

      if (!paidPriceValidation.ok) {
        setError(getPaidPostErrorMessage(paidPriceValidation.reason))
        return
      }

      const result = await onSubmit({
        content: trimmedContent,
        category,
        communityType: resolvedClassification.communityType,
        contentRating: resolvedClassification.contentRating,
        visibility,
        imageFile,
        videoFile,
        mediaFiles,
        isPaid: isPaidPost,
        priceItacash: paidPriceValidation.value,
        expression,
      })

      if (result === false) {
        setError(t('composer.publishError'))
        return
      }

      setContent('')
      setCategory('cotidiano')
      setCommunityType('general')
      setContentRating('safe')
      setVisibility('public')
      setIsPaidPost(false)
      setPaidPostPrice('')
      setError('')
      setShowEmojiPicker(false)
      setExpression(null)
      setShowMediaMenu(false)
      setShowAdvancedOptions(false)
      setMediaFeedback(null)
      setAiFeedback(null)
      setPendingVideoCompression(null)
      setPublishSuccessMessage('Publicado com sucesso.')
      setIsModalOpen(false)
      setMedia((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.url))
        return []
      })
    } finally {
      releaseSubmitGuard(submitGuardRef.current)
      setSubmitLocked(false)
    }
  }

  const trimmedContentLength = content.trim().length
  const canPublish = (trimmedContentLength > 0 || media.length > 0) && !isOptimizingVideo
  const canUseAi =
    trimmedContentLength >= AI_MIN_TEXT_LENGTH && !isSubmitting && !activeAiMode
  const portalElement = typeof document === 'undefined' ? null : document.body
  const visibilityLabel = selectedVisibility ? t(selectedVisibility.labelKey) : 'Publica'
  const contentRatingLabel = selectedRating?.label || 'Seguro'
  const hasAdultSelection =
    communityType === 'adult_18plus' ||
    contentRating === 'adult_18plus' ||
    isLegacyAdultCategory(category)
  const activeAdvancedChips = getComposerActiveAdvancedChips({
    community: communityType,
    communityLabel: selectedCommunity.label,
    contentRating,
    contentRatingLabel,
    visibility,
    visibilityLabel,
    isPaidPost,
  })
  const publishSummaryItems = getComposerPublishSummary({
    communityLabel: selectedCommunity.label,
    visibilityLabel,
    contentRatingLabel,
    isPaidPost,
  })
  const visualGuardMessage = getComposerVisualGuardMessage({
    hasText: trimmedContentLength > 0,
    mediaCount: media.length,
    isOptimizingVideo,
    isPaidPost,
    paidPostPrice,
    hasAdultSelection,
    canAccessAdult18Plus,
  })
  const profileContentModeGuidance = getComposerProfileContentModeGuidance(profileContentMode)
  const getAiButtonTitle = (mode: AiAssistMode) => {
    if (activeAiMode === mode) return AI_LOADING_LABELS[mode]
    if (activeAiMode) return 'Aguarde a outra acao da IA terminar.'
    if (trimmedContentLength < AI_MIN_TEXT_LENGTH) return AI_SHORT_TEXT_HINT
    if (trimmedContentLength > AI_MAX_TEXT_LENGTH) return AI_TOO_LONG_ERRORS[mode]

    return mode === 'suggest_caption'
      ? 'Sugerir legenda com IA da EntreUS'
      : 'Melhorar texto com IA da EntreUS'
  }
  const placeholderText = t('composer.placeholder')

  return (
    <>
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
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        multiple
        className="hidden"
        disabled={isOptimizingVideo}
        onChange={(event) => addFiles(event.target.files)}
      />

      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
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

      <div
        className={`rounded-[1.35rem] border px-3 py-2.5 shadow-sm backdrop-blur-xl transition ${
          isHighlighted
            ? 'border-blue-400/70 bg-blue-50/90 ring-4 ring-blue-500/20 dark:border-blue-400/60 dark:bg-blue-950/30 dark:ring-blue-400/20'
            : 'border-zinc-200/70 bg-white/90 ring-1 ring-black/5 dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:ring-white/10'
        }`}
      >
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
            onClick={() => {
              setPublishSuccessMessage('')
              setIsModalOpen(true)
            }}
            className="min-w-0 flex-1 rounded-full px-2 py-2 text-left text-[15px] text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {placeholderText}
          </button>

          <button
            type="button"
            onClick={() => {
              setPublishSuccessMessage('')
              setIsModalOpen(true)
            }}
            className="hidden rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 sm:inline-flex"
          >
            {t('composer.publish')}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1 pl-[3.25rem] text-blue-600 dark:text-blue-400">
          {[ImagePlus, Smile, Tag, selectedVisibility?.icon ? null : Globe2].map((Icon, index) =>
            Icon ? (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setPublishSuccessMessage('')
                  setIsModalOpen(true)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
                aria-label={t('composer.open')}
              >
                <Icon className="h-4 w-4" />
              </button>
            ) : null
          )}

          <button
            type="button"
            onClick={() => {
              setPublishSuccessMessage('')
              setIsModalOpen(true)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
            aria-label={t('composer.open')}
          >
            <span className="scale-90">{selectedVisibility?.icon}</span>
          </button>
        </div>
      </div>

      {publishSuccessMessage && (
        <p
          className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          role="status"
          aria-live="polite"
        >
          {publishSuccessMessage}
        </p>
      )}

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
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>

              <p className="text-sm font-black text-zinc-950 dark:text-white">
                {t('composer.create')}
              </p>

              <button
                type="button"
                disabled={isSubmitting || !canPublish}
                onClick={handleSubmit}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {isOptimizingVideo ? t('composer.optimizing') : isSubmitting ? t('composer.posting') : t('composer.publish')}
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
            placeholder={placeholderText}
            className="min-h-[76px] w-full resize-none border-0 bg-transparent px-0 py-2 text-lg text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:min-h-[92px] sm:text-xl"
          />
          {expression && <div className="mt-3 flex items-start gap-2"><ExpressionAttachment expression={expression} /><button type="button" onClick={() => setExpression(null)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-bold dark:border-zinc-700">{t('common.remove')}</button></div>}

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
                      title={t('composer.changeMedia')}
                      aria-label={t('composer.changeMedia')}
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>

                    <Link
                      href="/editor"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                      title={t('composer.editMedia')}
                      aria-label={t('composer.editMedia')}
                    >
                      <Scissors className="h-4 w-4" />
                    </Link>

                    {item.type === 'video' && portalElement && canAttemptVideoCompression(item.file) && (
                      <button
                        type="button"
                        onClick={() => handleAttachedVideoCompression(item)}
                        disabled={isOptimizingVideo}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                        title={t('composer.compressVideo')}
                        aria-label={t('composer.compressVideo')}
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
                  {t('composer.compress')}
                </button>

                <button
                  type="button"
                  onClick={() => setPendingVideoCompression(null)}
                  disabled={isOptimizingVideo}
                  className="inline-flex h-9 items-center rounded-full border border-amber-300 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/60"
                >
                  {t('common.cancel')}
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
            {profileContentModeGuidance && (
              <p className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold leading-6 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                {profileContentModeGuidance}
              </p>
            )}

            <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/70 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-bold text-zinc-700 dark:border-zinc-800 dark:bg-black dark:text-zinc-200">
                  {t('composer.communitySummary', { community: t(`communities.${selectedCommunity.key}`) })}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {contentRating === 'safe' ? t('composer.safeContent') : t(`communities.${contentRating}`)}
                </span>
              </div>

              <p className="text-zinc-500 dark:text-zinc-400">
                {t('composer.communityGuidance')}
              </p>
            </div>

            <div className="mt-3">
              <ComposerPublishSummary items={publishSummaryItems} />
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowMediaMenu((current) => !current)}
                      disabled={isOptimizingVideo}
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold transition ${
                        showMediaMenu
                          ? 'border-blue-200 bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'border-zinc-200 bg-white text-blue-600 hover:bg-blue-50 dark:border-zinc-800 dark:bg-black dark:text-blue-300 dark:hover:bg-blue-950/30'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      title={t('composer.addMedia')}
                      aria-label={t('composer.addMedia')}
                      aria-expanded={showMediaMenu}
                    >
                      <ImagePlus className="h-4 w-4" />
                      {t('composer.addMedia')}
                    </button>

                    {showMediaMenu && (
                      <div className="absolute left-0 top-12 z-[10000] w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-blue-400/25 bg-white p-1.5 text-zinc-900 shadow-2xl shadow-blue-950/20 ring-1 ring-black/5 dark:bg-zinc-950 dark:text-white dark:ring-white/10">
                        <button
                          type="button"
                          onClick={openPhotoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <ImagePlus className="h-4 w-4 text-blue-500" />
                          {t('composer.addPhoto')}
                        </button>

                        <button
                          type="button"
                          onClick={openVideoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <Video className="h-4 w-4 text-blue-500" />
                          {t('composer.addVideo')}
                        </button>

                        <button
                          type="button"
                          onClick={() => openMediaPicker()}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <ImagePlus className="h-4 w-4 text-blue-500" />
                          {t('composer.gallery')}
                        </button>

                        <button
                          type="button"
                          onClick={openCameraPhotoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <Camera className="h-4 w-4 text-blue-500" />
                          {t('composer.camera')}
                        </button>

                        <button
                          type="button"
                          onClick={openCameraVideoPicker}
                          disabled={isOptimizingVideo}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30"
                        >
                          <Video className="h-4 w-4 text-blue-500" />
                          {t('composer.recordVideo')}
                        </button>

                        <Link
                          href="/editor"
                          onClick={() => setShowMediaMenu(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          title={t('composer.editMedia')}
                          aria-label={t('composer.editMedia')}
                        >
                          <Scissors className="h-4 w-4 text-blue-500" />
                          {t('composer.editMedia')}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((current) => !current)}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                        showEmojiPicker
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-300 dark:hover:bg-zinc-900'
                      }`}
                      title={t('composer.addEmoji')}
                      aria-label={t('composer.addEmoji')}
                      aria-expanded={showEmojiPicker}
                    >
                      <Smile className="h-5 w-5" />
                    </button>

                    <ExpressionPicker open={showEmojiPicker} context="post" userId={expressionUserId} accessToken={expressionToken} onClose={() => setShowEmojiPicker(false)} onSelect={(asset) => asset.kind === 'emoji' ? insertEmoji(asset.providerId) : setExpression(asset)} returnFocusRef={textareaRef} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions((current) => !current)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-900"
                    aria-expanded={showAdvancedOptions}
                    aria-controls="composer-advanced-options"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {t('composer.advancedOptions')}
                    <ChevronDown className={`h-4 w-4 transition ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting || !canPublish}
                  onClick={handleSubmit}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black sm:w-auto sm:min-w-[110px]"
                >
                  {isOptimizingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isOptimizingVideo ? t('composer.optimizing') : isSubmitting ? t('composer.posting') : t('composer.publish')}
                </button>
              </div>

              <div className="flex flex-col gap-2 pl-1 text-xs text-zinc-500 dark:text-zinc-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{t('postComposer.mediaCounter').replace('{current}', String(media.length)).replace('{max}', String(MAX_MEDIA_FILES))}</span>
                  <ComposerActiveChips chips={activeAdvancedChips} />
                </div>
                {visualGuardMessage && !error && (
                  <p className="text-zinc-500 dark:text-zinc-400">{visualGuardMessage}</p>
                )}
              </div>
            </div>

            {showAdvancedOptions && (
              <div
                id="composer-advanced-options"
                className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-black"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white">
                      <SlidersHorizontal className="h-4 w-4" />
                      {t('composer.advancedOptions')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {t('composer.advancedGuidance')}
                    </p>
                  </div>
                  <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-bold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {activeAdvancedChips.length > 0 ? t('composer.activeOptions') : t('composer.simpleDefault')}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {t('composer.community')}
                    </span>
                    <select
                      value={communityType}
                      onChange={(event) => handleCommunityChange(event.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                    >
                      {COMMUNITIES.map((community) => (
                        <option
                          key={community.key}
                          value={community.key}
                          disabled={community.requires18Plus && !canAccessAdult18Plus}
                        >
                          {t(`communities.${community.key}`)}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {t('composer.communityGuidance')}
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {t('composer.category')}
                    </span>
                    <select
                      value={category}
                      onChange={(event) => handleCategoryChange(event.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      title={selectedCategory ? t(selectedCategory.labelKey) : t('postComposer.category')}
                      aria-label={t('postComposer.category')}
                    >
                      {CATEGORY_OPTIONS.map((item) => (
                        <option
                          key={item.value}
                          value={item.value}
                          disabled={isLegacyAdultCategory(item.value) && !canAccessAdult18Plus}
                        >
                          {t(item.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {t('composer.visibility')}
                    </span>
                    <select
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value as VisibilityType)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      title={t('postComposer.privacy')}
                      aria-label={t('postComposer.privacy')}
                    >
                      {VISIBILITY_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {t('composer.contentRating')}
                    </span>
                    <select
                      value={contentRating}
                      onChange={(event) => handleContentRatingChange(event.target.value)}
                      disabled={communityType === 'adult_18plus'}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                    >
                      {CONTENT_RATINGS.map((rating) => (
                        <option
                          key={rating.key}
                          value={rating.key}
                          disabled={rating.requires18Plus && !canAccessAdult18Plus}
                        >
                          {t(`communities.${rating.key}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasAdultSelection}
                      onChange={(event) => handleAdult18PlusToggle(event.target.checked)}
                      disabled={!canAccessAdult18Plus}
                      className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-black text-amber-950 dark:text-amber-100">
                        <Lock className="h-4 w-4" />
                        {t('composer.adultTitle')}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-amber-900/80 dark:text-amber-100/75">
                        {t('composer.adultDescription')}
                      </span>
                      {!canAccessAdult18Plus && (
                        <span className="mt-1 block text-xs leading-5 text-amber-900 dark:text-amber-100">
                          Conteudo adulto 18+ exige verificacao aprovada.{' '}
                          <Link href="/age-verification" className="font-black underline underline-offset-2">
                            {t('composer.verifyAge')}
                          </Link>
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isPaidPost}
                      onChange={(event) => handlePaidPostToggle(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-black text-cyan-900 dark:text-cyan-100">
                        <Coins className="h-4 w-4" />
                        {t('composer.paidTitle')}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-cyan-800/75 dark:text-cyan-100/70">
                        {t('composer.paidDescription')}
                      </span>
                    </span>
                  </label>

                  {isPaidPost && (
                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-xs font-bold text-cyan-900 dark:text-cyan-100">
                        {t('composer.paidPrice')}
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={paidPostPrice}
                        onChange={(event) => setPaidPostPrice(event.target.value)}
                        placeholder="Ex.: 25"
                        className="h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10 dark:border-cyan-900/60 dark:bg-black dark:text-white"
                      />
                      <span className="mt-1.5 block text-xs leading-5 text-cyan-800/75 dark:text-cyan-100/70">
                        {t('composer.paidSplit')}
                      </span>
                    </label>
                  )}
                </div>

                <div className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-xs leading-5 ${userTier === 'elder'
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

                <div className="mt-3 rounded-2xl border border-violet-200/70 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleAiAssist('improve_post')}
                      disabled={!canUseAi}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-zinc-950 dark:text-violet-200 dark:hover:bg-violet-950/50"
                      aria-label={t('composer.aiImprove')}
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
                          : t('composer.aiImprove')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAiAssist('suggest_caption')}
                      disabled={!canUseAi}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-200/80 bg-white px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900/60 dark:bg-zinc-950 dark:text-violet-200 dark:hover:bg-violet-950/30"
                      aria-label={t('composer.aiCaption')}
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
                          : t('composer.aiCaption')}
                      </span>
                    </button>
                  </div>

                  <div
                    id="ai-assistance-note"
                    className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-violet-700 dark:text-violet-200"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('composer.aiGuidance')}</span>
                    <Link
                      href="/help/ia"
                      className="font-bold underline decoration-violet-300 underline-offset-2 transition hover:text-violet-900 dark:decoration-violet-700 dark:hover:text-white"
                      aria-label={t('composer.learnMore')}
                    >
                      {t('composer.learnMore')}
                    </Link>
                  </div>
                </div>
              </div>
            )}
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
