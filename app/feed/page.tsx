'use client'

import PostComposer from '../components/PostComposer'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import PostMoreMenu from '../components/PostMoreMenu'
import PostMediaGallery from '../components/PostMediaGallery'
import PostActions from '../components/PostActions'
import GiftModal from '../components/GiftModal'
import TipModal from '../components/TipModal'
import LinkPreview, { LinkedPostText } from '../components/LinkPreview'
import SensitiveContent from '../components/SensitiveContent'
import UserBadges from '../components/UserBadges'
import UserTierBadge from '../components/UserTierBadge'
import UserTierFrame, { getUserTierSurfaceClassName } from '../components/UserTierFrame'
import TranslatePostButton from '../components/TranslatePostButton'
import Link from 'next/link'
import {
  Award,
  CreditCard,
  Download,
  Edit3,
  FlaskConical,
  Gift,
  Heart,
  ImageIcon,
  Landmark,
  MessageCircle,
  MoreHorizontal,
  Newspaper,
  Play,
  Repeat2,
  Search,
  SmilePlus,
  Sparkles,
  Smartphone,
  Trophy,
  Trash2,
} from 'lucide-react'
import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '../components/LanguageProvider'
import {
  isMissingPostModerationColumnError,
  isModeratedHidden,
  type ModeratedPostFields,
} from '@/lib/post-moderation'
import {
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  VIDEO_UPLOAD_MAX_SIZE_BYTES,
  formatUploadLimitMegabytes,
  getAllowedUploadContentType,
  isAllowedImageMimeType,
  isAllowedVideoMimeType,
  looksLikeVideoUpload,
  resolveVideoUploadLimit,
} from '@/lib/media/upload-limits'
import { resolveUserTier } from '@/lib/user-tiers'

type VisibilityType = 'public' | 'followers' | 'private'
type ComposerSubmitData = {
  content: string
  category: string
  visibility: VisibilityType
  imageFile: File | null
  videoFile: File | null
  mediaFiles?: File[]
}

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  show_sensitive_content: boolean
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
  vip_status?: string | null
  vip_expires_at?: string | null
  badge_slugs?: string[]
}

type UserBadgeRow = {
  badges: { slug?: string | null } | { slug?: string | null }[] | null
}

type ProfileSummary = {
  username: string
  display_name: string | null
  avatar_url: string | null
  vip_status?: string | null
  vip_expires_at?: string | null
}

type UserTierBadgeRow = UserBadgeRow & {
  user_id: string
}

type PostMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video' | 'gif'
  position: number
  created_at?: string
}

type Post = ModeratedPostFields & {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url: string | null
  video_url: string | null
  visibility: VisibilityType
  is_sensitive: boolean | null
  profiles: ProfileSummary | null
  media?: PostMedia[]
}

type FeedHighlight = {
  id: string
  post_id: string | null
  challenge_id: string | null
  title: string | null
  description: string | null
  position: number | null
  posts?: {
    id: string
    content: string | null
  } | null
  community_challenges?: {
    slug: string
    title: string
  } | null
}

type FeedHighlightResponse = Omit<FeedHighlight, 'posts' | 'community_challenges'> & {
  posts?: FeedHighlight['posts'] | NonNullable<FeedHighlight['posts']>[] | null
  community_challenges?:
    | FeedHighlight['community_challenges']
    | NonNullable<FeedHighlight['community_challenges']>[]
    | null
}

function normalizeFeedHighlight(highlight: FeedHighlightResponse): FeedHighlight {
  return {
    ...highlight,
    posts: Array.isArray(highlight.posts)
      ? highlight.posts[0] || null
      : highlight.posts || null,
    community_challenges: Array.isArray(highlight.community_challenges)
      ? highlight.community_challenges[0] || null
      : highlight.community_challenges || null,
  }
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  profiles: ProfileSummary | null
  media?: CommentMedia[]
}

type CommentMedia = {
  id: string
  comment_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video' | 'gif'
  created_at?: string
}

type CommentMediaDraft = {
  file?: File
  url: string
  type: 'image' | 'video' | 'gif'
  source: 'file' | 'gif-url'
}

type Like = {
  id: string
  post_id: string
  user_id: string
}

type CommentLike = {
  id: string
  comment_id: string
  user_id: string
}

type Follow = {
  id?: string
  follower_id: string
  following_id: string
}

type Bookmark = {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

type Repost = {
  id: string
  post_id: string
  user_id: string
  created_at: string
  profiles: ProfileSummary | null
}

type FeedCursor = {
  createdAt: string
  id: string
}

const FEED_INITIAL_POST_LIMIT = 24
const FEED_NEXT_POST_LIMIT = 12
const FEED_INITIAL_COMMENT_LIMIT = 160
const FEED_INITIAL_REACTION_LIMIT = 500
const FEED_INITIAL_REPOST_LIMIT = 120
const ACCEPTED_MEDIA_FORMATS_MESSAGE = 'Formato nao permitido. Use JPG, PNG, WEBP, GIF, MP4, WebM ou MOV.'
const VIDEO_FORMAT_NOT_ACCEPTED_MESSAGE = 'Formato nao aceito. Use MP4, WebM ou MOV para videos.'
const PRESIGN_UPLOAD_FAILURE_MESSAGE = 'Nao foi possivel preparar o upload agora. Tente novamente em instantes.'
const R2_UPLOAD_FAILURE_MESSAGE = 'Nao foi possivel enviar a midia agora. Verifique sua conexao e tente novamente.'
const PUBLISH_LOGIN_MESSAGE = 'Faca login novamente para publicar.'
const GENERIC_PUBLISH_FAILURE_MESSAGE = 'Nao foi possivel publicar agora. Tente novamente em instantes.'
const PARTIAL_MEDIA_SAVE_FAILURE_MESSAGE = 'Post criado, mas nao foi possivel concluir as midias agora. Tente novamente em instantes.'
const FEED_ITEM_ACTIVE_ROOT_MARGIN = '1800px 0px 2200px 0px'
const FEED_MEDIA_PLACEHOLDER_HEIGHT = 360
const FEED_COMMENTS_PLACEHOLDER_HEIGHT = 180

type FeedTexts = {
  tabs: {
    posts: string
    media: string
  }
  mural: {
    searchTitle: string
    searchPlaceholder: string
    searchHelper: string
    labTitle: string
    labDescription: string
    labButton: string
    donationTitle: string
    donationDescription: string
    donationButton: string
    newsTitle: string
    newsOne: string
    newsTwo: string
    newsThree: string
    emptyMedia: string
    noSearchResults: string
    openPost: string
    galleryMediaCount: string
  }
}

const feedTexts: Record<string, FeedTexts> = {
  pt: {
    tabs: {
      posts: 'Posts',
      media: 'Mídia',
    },
    mural: {
      searchTitle: 'Buscar no feed',
      searchPlaceholder: 'Buscar posts, pessoas ou categorias...',
      searchHelper: 'Use a busca para filtrar rapidamente o conteúdo do feed.',
      labTitle: 'EntreUS Lab',
      labDescription: 'Ferramentas criativas para gerar pôsteres, materiais e recursos digitais.',
      labButton: 'Abrir laboratório',
      donationTitle: 'Apoie o projeto',
      donationDescription: 'Ajude o EntreUS Lab a continuar evoluindo com ferramentas gratuitas.',
      donationButton: 'Doar pelo Mercado Pago',
      newsTitle: 'O que vem por aí',
      newsOne: 'Mural com avisos e destaques da comunidade.',
      newsTwo: 'Galeria de mídia para fotos e vídeos do feed.',
      newsThree: 'Novas ferramentas criativas dentro do EntreUS Lab.',
      emptyMedia: 'Ainda não há mídia para mostrar nesta galeria.',
      noSearchResults: 'Nenhum resultado encontrado para essa busca.',
      openPost: 'Abrir post',
      galleryMediaCount: 'mídias',
    },
  },
  en: {
    tabs: {
      posts: 'Posts',
      media: 'Media',
    },
    mural: {
      searchTitle: 'Search feed',
      searchPlaceholder: 'Search posts, people or categories...',
      searchHelper: 'Use search to quickly filter feed content.',
      labTitle: 'EntreUS Lab',
      labDescription: 'Creative tools to generate posters, materials and digital resources.',
      labButton: 'Open lab',
      donationTitle: 'Support the project',
      donationDescription: 'Help EntreUS Lab continue evolving with free tools.',
      donationButton: 'Donate with Mercado Pago',
      newsTitle: 'Coming next',
      newsOne: 'Board with community notices and highlights.',
      newsTwo: 'Media gallery for photos and videos from the feed.',
      newsThree: 'New creative tools inside EntreUS Lab.',
      emptyMedia: 'There is no media to display in this gallery yet.',
      noSearchResults: 'No results found for this search.',
      openPost: 'Open post',
      galleryMediaCount: 'media',
    },
  },
  fr: {
    tabs: {
      posts: 'Posts',
      media: 'Média',
    },
    mural: {
      searchTitle: 'Rechercher dans le fil',
      searchPlaceholder: 'Rechercher des posts, personnes ou catégories...',
      searchHelper: 'Utilisez la recherche pour filtrer rapidement le contenu du fil.',
      labTitle: 'EntreUS Lab',
      labDescription: 'Outils créatifs pour générer des affiches, contenus et ressources numériques.',
      labButton: 'Ouvrir le labo',
      donationTitle: 'Soutenir le projet',
      donationDescription: 'Aidez EntreUS Lab à continuer d’évoluer avec des outils gratuits.',
      donationButton: 'Faire un don',
      newsTitle: 'À venir',
      newsOne: 'Mur avec avis et temps forts de la communauté.',
      newsTwo: 'Galerie média pour photos et vidéos du fil.',
      newsThree: 'Nouveaux outils créatifs dans EntreUS Lab.',
      emptyMedia: 'Aucun média à afficher dans cette galerie pour le moment.',
      noSearchResults: 'Aucun résultat trouvé pour cette recherche.',
      openPost: 'Ouvrir le post',
      galleryMediaCount: 'médias',
    },
  },
  id: {
    tabs: {
      posts: 'Postingan',
      media: 'Media',
    },
    mural: {
      searchTitle: 'Cari di feed',
      searchPlaceholder: 'Cari postingan, orang, atau kategori...',
      searchHelper: 'Gunakan pencarian untuk memfilter konten feed dengan cepat.',
      labTitle: 'EntreUS Lab',
      labDescription: 'Alat kreatif untuk membuat poster, materi, dan sumber daya digital.',
      labButton: 'Buka laboratorium',
      donationTitle: 'Dukung proyek',
      donationDescription: 'Bantu EntreUS Lab terus berkembang dengan alat gratis.',
      donationButton: 'Donasi Mercado Pago',
      newsTitle: 'Segera hadir',
      newsOne: 'Papan pengumuman dan sorotan komunitas.',
      newsTwo: 'Galeri media untuk foto dan video dari feed.',
      newsThree: 'Alat kreatif baru di EntreUS Lab.',
      emptyMedia: 'Belum ada media untuk ditampilkan di galeri ini.',
      noSearchResults: 'Tidak ada hasil untuk pencarian ini.',
      openPost: 'Buka postingan',
      galleryMediaCount: 'media',
    },
  },
  ja: {
    tabs: {
      posts: '投稿',
      media: 'メディア',
    },
    mural: {
      searchTitle: 'フィードを検索',
      searchPlaceholder: '投稿、人、カテゴリを検索...',
      searchHelper: '検索を使ってフィード内容をすばやく絞り込みます。',
      labTitle: 'EntreUS Lab',
      labDescription: 'ポスターやデジタル素材を作るためのクリエイティブツール。',
      labButton: 'ラボを開く',
      donationTitle: 'プロジェクトを応援',
      donationDescription: 'EntreUS Lab が無料ツールで進化し続けられるよう支援してください。',
      donationButton: 'Mercado Pagoで寄付',
      newsTitle: '今後の予定',
      newsOne: 'コミュニティのお知らせや注目情報。',
      newsTwo: 'フィードの写真や動画のメディアギャラリー。',
      newsThree: 'EntreUS Lab の新しいクリエイティブツール。',
      emptyMedia: 'このギャラリーに表示するメディアはまだありません。',
      noSearchResults: 'この検索に一致する結果はありません。',
      openPost: '投稿を開く',
      galleryMediaCount: '件のメディア',
    },
  },
  zh: {
    tabs: {
      posts: '帖子',
      media: '媒体',
    },
    mural: {
      searchTitle: '搜索动态',
      searchPlaceholder: '搜索帖子、人物或分类...',
      searchHelper: '使用搜索快速筛选动态内容。',
      labTitle: 'EntreUS Lab',
      labDescription: '用于生成海报、素材和数字资源的创意工具。',
      labButton: '打开实验室',
      donationTitle: '支持项目',
      donationDescription: '帮助 EntreUS Lab 持续以免费工具不断进化。',
      donationButton: '通过 Mercado Pago 捐赠',
      newsTitle: '即将推出',
      newsOne: '社区公告和亮点内容墙。',
      newsTwo: '用于展示动态中照片和视频的媒体画廊。',
      newsThree: 'EntreUS Lab 中的新创意工具。',
      emptyMedia: '此画廊中还没有可显示的媒体。',
      noSearchResults: '没有找到与此搜索相关的结果。',
      openPost: '打开帖子',
      galleryMediaCount: '个媒体',
    },
  },
}

function getLocalFeedTexts(language: string) {
  return feedTexts[language] || feedTexts.pt
}

function getDateLocale(language: string) {
  const locales: Record<string, string> = {
    pt: 'pt-BR',
    en: 'en-US',
    fr: 'fr-FR',
    id: 'id-ID',
    ja: 'ja-JP',
    zh: 'zh-CN',
  }

  return locales[language] || 'pt-BR'
}

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false

  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches
  const navigatorStandalone =
    'standalone' in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  return standaloneMedia || navigatorStandalone
}

function FeedInstallAppCard() {
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay())

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleChange = () => setIsStandalone(isStandaloneDisplay())

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  if (isStandalone) return null

  return (
    <Link
      href="/instalar"
      className="group mb-4 flex items-center gap-3 rounded-[1.35rem] border border-blue-300/20 bg-slate-950 px-3.5 py-3 text-white shadow-sm shadow-blue-950/10 ring-1 ring-white/10 transition hover:border-blue-300/40 lg:hidden"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
        <Smartphone className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">
          Instale a EntreUS
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-blue-100/75">
          Use como app direto da tela inicial.
        </span>
      </span>

      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-500 px-3 py-2 text-xs font-black text-white shadow-sm shadow-blue-500/25 transition group-hover:bg-blue-400">
        <Download className="h-4 w-4" />
        Instalar app
      </span>
    </Link>
  )
}

function getCategoryKey(value: string | null) {
  if (!value) return 'categories.uncategorized'
  if (value === 'gift_received') return 'Presente recebido'
  if (value === 'adulto' || value === 'sensual' || value === '18plus') {
    return 'categories.sensitive'
  }
  return `categories.${value}`
}

function getGiftPoster(mediaUrl: string | null) {
  if (!mediaUrl) return undefined

  const fileName = mediaUrl.split('/').pop()?.replace(/\.[^.]+$/, '')
  return fileName ? `/gifts/images/${fileName}.png` : undefined
}

function parseGiftSharedContent(content: string | null) {
  if (!content) {
    return {
      message: '',
      giftName: 'Presente EntreUS',
      sender: '',
      receiver: '',
    }
  }

  const lines = content.split('\n')
  const markerIndex = lines.findIndex((line) => line.trim() === 'Presente recebido')
  const messageLines = markerIndex >= 0 ? lines.slice(0, markerIndex) : lines
  const metadataLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : []

  const findValue = (label: string) => {
    const row = metadataLines.find((line) => line.startsWith(`${label}:`))
    return row?.replace(`${label}:`, '').trim() || ''
  }

  return {
    message: messageLines.join('\n').trim(),
    giftName: findValue('Presente') || 'Presente EntreUS',
    sender: findValue('De'),
    receiver: findValue('Para'),
  }
}

function SharedGiftFeedCard({ post }: { post: Post }) {
  const [mediaFailed, setMediaFailed] = useState(false)
  const details = parseGiftSharedContent(post.content)
  const mediaUrl = post.video_url || post.image_url
  const isVideo = Boolean(post.video_url)

  return (
    <div className="mb-4 overflow-hidden rounded-[1.75rem] border border-blue-300/20 bg-zinc-950 p-4 text-white shadow-xl shadow-blue-950/10 ring-1 ring-white/10">
      {details.message && (
        <LinkedPostText
          content={details.message}
          className="mb-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100 sm:text-base"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-blue-300/15 bg-gradient-to-br from-blue-500/15 via-black to-zinc-950 p-3">
          {mediaUrl && isVideo && !mediaFailed ? (
            <video
              src={mediaUrl}
              poster={getGiftPoster(mediaUrl)}
              muted
              loop
              playsInline
              controls
              preload="none"
              onError={() => setMediaFailed(true)}
              className="h-full w-full rounded-2xl object-contain"
            />
          ) : mediaUrl && !mediaFailed ? (
            <img
              src={mediaUrl}
              alt={details.giftName}
              loading="lazy"
              decoding="async"
              onError={() => setMediaFailed(true)}
              className="h-full w-full rounded-2xl object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-blue-500/10 text-blue-100">
              <Gift className="h-16 w-16 stroke-[1.5]" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-blue-300/20">
            <Gift className="h-3.5 w-3.5" />
            Presente recebido
          </span>

          <h3 className="mt-3 text-2xl font-black leading-tight text-white">
            {details.giftName}
          </h3>

          <div className="mt-4 grid gap-2 text-sm text-zinc-300">
            {details.sender && (
              <p>
                <span className="font-black text-blue-100">Enviado por:</span>{' '}
                {details.sender}
              </p>
            )}
            {details.receiver && (
              <p>
                <span className="font-black text-blue-100">Recebido por:</span>{' '}
                {details.receiver}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const COMMENT_EMOJI_GROUPS = [
  {
    title: 'EntreUS',
    emojis: ['😍', '😏', '🔥', '😂', '🤣', '❤️', '💙', '👀', '✨', '🫶', '😎', '🥳', '💯', '🚀', '💎', '🌟'],
  },
  {
    title: 'Rostos felizes',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😊', '🙂', '😉', '😌', '😋', '😜', '🤪', '🤗', '🤭', '😇', '🥰'],
  },
  {
    title: 'Amor e carinho',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  },
  {
    title: 'Gestos',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👊', '✌️', '🤙', '👋', '☝️', '👉', '👈', '🤌', '🤞'],
  },
  {
    title: 'Festa',
    emojis: ['🎉', '🥳', '🎊', '🎁', '🎈', '🏆', '🥇', '⭐', '🌟', '✨', '💫', '🎵', '🎶', '📸', '🎬', '🎤'],
  },
  {
    title: 'Top e impacto',
    emojis: ['🔥', '💯', '🚀', '⚡', '💎', '👑', '🤑', '😎', '🤩', '😏', '👏', '🙌', '✅', '📌', '📢', '🔝'],
  },
  {
    title: 'Surpresa',
    emojis: ['😮', '😯', '😲', '😳', '🥹', '🤯', '😱', '🙀', '👀', '🫢', '🤔', '🧐', '😅', '😬', '🤨', '😵'],
  },
  {
    title: 'Tristeza e apoio',
    emojis: ['😔', '😢', '😭', '🥺', '😞', '😥', '😓', '😩', '😫', '💔', '🫂', '🙏', '🤍', '🌧️', '😶', '😮‍💨'],
  },
  {
    title: 'Zoeira',
    emojis: ['😂', '🤣', '😅', '😜', '🤪', '😝', '🙃', '😆', '🤭', '😬', '👻', '🤡', '🙈', '🙉', '🙊', '🐒'],
  },
  {
    title: 'Símbolos',
    emojis: ['✅', '☑️', '❌', '⚠️', '🔒', '🔓', '📌', '📢', '💬', '📷', '🎥', '🎧', '🎤', '📎', '🔗', '📝'],
  },
  {
    title: 'Comunidade',
    emojis: ['🇧🇷', '🌎', '🤝', '🫶', '💙', '🏠', '👥', '🗣️', '📣', '💡', '🧠', '🛡️', '🏅', '🎖️', '🌱', '🚀'],
  },
]

const COMMENT_QUICK_EMOJIS = ['❤️', '😂', '🔥', '😍', '👀', '✨', '😏', '💙', '👏', '🥳', '🚀', '💯']

const institutionalLinks = [
  { href: '/terms', label: 'Termos' },
  { href: '/privacy', label: 'Privacidade' },
  { href: '/safety', label: 'Segurança' },
  { href: '/contact', label: 'Fale Conosco' },
  { href: '/selos', label: 'Selos' },
  { href: '/meet-info', label: 'Meet' },
  { href: '/itacash', label: 'ItaCash' },
]

type FeedItem =
  | {
    type: 'post'
    id: string
    created_at: string
    post: Post
  }
  | {
    type: 'repost'
    id: string
    created_at: string
    post: Post
    repost: Repost
  }

function FeedWindowItem({
  children,
  forceActive = false,
}: {
  children: (isNearViewport: boolean) => ReactNode
  forceActive?: boolean
}) {
  const itemRef = useRef<HTMLDivElement | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(true)

  useEffect(() => {
    if (forceActive) {
      setIsNearViewport(true)
      return
    }

    const item = itemRef.current
    if (!item || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIsNearViewport(Boolean(entry?.isIntersecting))
      },
      {
        rootMargin: FEED_ITEM_ACTIVE_ROOT_MARGIN,
        threshold: 0,
      }
    )

    observer.observe(item)

    return () => {
      observer.disconnect()
    }
  }, [forceActive])

  return <div ref={itemRef}>{children(forceActive || isNearViewport)}</div>
}

function DeferredFeedSection({
  active,
  children,
  minHeight,
}: {
  active: boolean
  children: ReactNode
  minHeight: number
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null)
  const [measuredHeight, setMeasuredHeight] = useState(0)

  useEffect(() => {
    if (!active || !sectionRef.current) return

    setMeasuredHeight((current) => Math.max(current, sectionRef.current?.offsetHeight || 0))
  }, [active, children])

  if (!active) {
    return (
      <div
        aria-hidden="true"
        style={{ minHeight: measuredHeight || minHeight }}
        className="rounded-[1.5rem] border border-dashed border-zinc-200/70 bg-zinc-50/50 dark:border-zinc-800/70 dark:bg-zinc-900/20"
      />
    )
  }

  return <div ref={sectionRef}>{children}</div>
}

function mergeUniqueById<T extends { id: string }>(current: T[], incoming: T[]) {
  const map = new Map<string, T>()

  for (const item of current) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values())
}

function FeedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightedPostId = searchParams.get('post') || ''
  const { theme, setTheme } = useTheme()
  const { t, language } = useLanguage()
  const localTexts = getLocalFeedTexts(language)

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)

  const videoUploadLimit = useMemo(
    () =>
      resolveVideoUploadLimit({
        vipStatus: currentProfile?.vip_status,
        vipExpiresAt: currentProfile?.vip_expires_at,
        badgeSlugs: currentProfile?.badge_slugs,
      }),
    [currentProfile],
  )

  const [uploadingPostImage, setUploadingPostImage] = useState(false)
  const [uploadingPostVideo, setUploadingPostVideo] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [commentLikes, setCommentLikes] = useState<CommentLike[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])
  const [tierBadgeSlugsByUserId, setTierBadgeSlugsByUserId] = useState<Record<string, string[]>>({})
  const [feedHighlights, setFeedHighlights] = useState<FeedHighlight[]>([])
  const [feedSearch, setFeedSearch] = useState('')

  const likeActionInProgressRef = useRef<Set<string>>(new Set())

  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [follows, setFollows] = useState<Follow[]>([])
  const [followLoadingUserId, setFollowLoadingUserId] = useState<string | null>(null)

  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])
  const [giftRecipient, setGiftRecipient] = useState<{
    id: string
    name: string
    username?: string | null
    avatarUrl?: string | null
  } | null>(null)
  const [tipRecipient, setTipRecipient] = useState<{
    id: string
    name: string
    username?: string | null
    avatarUrl?: string | null
  } | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [commentMediaDrafts, setCommentMediaDrafts] = useState<Record<string, CommentMediaDraft | null>>({})
  const [commentGifInputs, setCommentGifInputs] = useState<Record<string, string>>({})
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null)
  const [openGifPickerPostId, setOpenGifPickerPostId] = useState<string | null>(null)
  const [openCommentEmojiPickerPostId, setOpenCommentEmojiPickerPostId] = useState<string | null>(null)
  const [replyModalPostId, setReplyModalPostId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentContent, setEditCommentContent] = useState('')
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null)

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMorePosts, setHasMorePosts] = useState(true)
  const [feedCursor, setFeedCursor] = useState<FeedCursor | null>(null)
  const [loadMoreError, setLoadMoreError] = useState('')
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadUserAndData() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      const [profileResult, badgesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, display_name, avatar_url, show_sensitive_content, wants_18_plus, age_verification_status, vip_status, vip_expires_at')
          .eq('id', user.id)
          .single(),
        supabase
          .from('user_badges')
          .select('badges ( slug )')
          .eq('user_id', user.id),
      ])
      const { data: profileData, error: profileError } = profileResult
      const badgeSlugs = ((badgesResult.data || []) as UserBadgeRow[])
        .flatMap((row) => (Array.isArray(row.badges) ? row.badges : [row.badges]))
        .map((badge) => badge?.slug || '')
        .filter(Boolean)

      const loadedCurrentProfile: CurrentProfile | null =
        !profileError && profileData
          ? {
            username: profileData.username,
            display_name: profileData.display_name,
            avatar_url: profileData.avatar_url,
            wants_18_plus: profileData.wants_18_plus || false,
            age_verification_status: profileData.age_verification_status || 'not_started',
            vip_status: profileData.vip_status,
            vip_expires_at: profileData.vip_expires_at,
            badge_slugs: badgeSlugs,
            show_sensitive_content:
              Boolean(profileData.wants_18_plus && profileData.age_verification_status === 'approved'),
          }
          : null

      if (loadedCurrentProfile) {
        setCurrentProfile(loadedCurrentProfile)
      }

      const allowSensitiveContent =
        loadedCurrentProfile?.show_sensitive_content || false

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      const followsData = await loadFollows()
      setFollows(followsData)

      const loadedPosts = await loadPosts(user.id, blockedIds, followsData, allowSensitiveContent, {
        limit: FEED_INITIAL_POST_LIMIT,
      })

      await Promise.all([
        loadRelatedDataForPosts(loadedPosts, blockedIds),
        loadBookmarks(user.id),
        loadUnreadNotificationsCount(user.id),
        loadFeedHighlights(),
      ])

      setLoading(false)
    }

    loadUserAndData()
  }, [router])

  useEffect(() => {
    if (!highlightedPostId || posts.length === 0) return

    const timer = setTimeout(() => {
      const element = document.getElementById(`post-${highlightedPostId}`)

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [highlightedPostId, posts])

  async function loadUnreadNotificationsCount(currentUserId: string = userId) {
    if (!currentUserId) return

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    if (error) {
      setMessage(t('feed.messages.loadNotificationsError') + error.message)
      return
    }

    setUnreadNotificationsCount(count || 0)
  }

  async function loadFeedHighlights() {
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('feed_highlights')
      .select('id, post_id, challenge_id, title, description, position, posts(id, content), community_challenges(slug, title)')
      .eq('is_active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Erro ao carregar destaques da comunidade:', error.message)
      setFeedHighlights([])
      return
    }

    setFeedHighlights(((data || []) as FeedHighlightResponse[]).map(normalizeFeedHighlight))
  }

  async function loadBlockedUserIds(currentUserId: string) {
    const { data: blockedByMe, error: blockedByMeError } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId)

    if (blockedByMeError) {
      setMessage(t('feed.messages.loadBlocksError') + blockedByMeError.message)
      return []
    }

    const { data: blockedMe, error: blockedMeError } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', currentUserId)

    if (blockedMeError) {
      setMessage(t('feed.messages.loadBlocksError') + blockedMeError.message)
      return []
    }

    const ids = new Set<string>()

    for (const item of blockedByMe || []) {
      if (item.blocked_id) ids.add(item.blocked_id)
    }

    for (const item of blockedMe || []) {
      if (item.blocker_id) ids.add(item.blocker_id)
    }

    return Array.from(ids)
  }

  async function loadFollows() {
    const { data, error } = await supabase
      .from('follows')
      .select('id, follower_id, following_id')

    if (error) {
      setMessage(t('feed.messages.loadFollowsError') + error.message)
      return []
    }

    return data || []
  }

  async function loadBookmarks(currentUserId: string = userId) {
    if (!currentUserId) return

    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)

    if (error) {
      setMessage(t('feed.messages.loadSavedPostsError') + error.message)
      return
    }

    setBookmarks(data || [])
  }

  async function loadReposts(
    currentBlockedIds: string[] = blockedUserIds,
    currentPostIds: string[] = posts.map((post) => post.id),
    options: { append?: boolean } = {}
  ) {
    let query = supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(FEED_INITIAL_REPOST_LIMIT)

    if (currentPostIds.length > 0) {
      query = query.in('post_id', currentPostIds)
    }

    const { data, error } = await query

    if (error) {
      setMessage(t('feed.messages.loadRepostsError') + error.message)
      return []
    }

    const rawReposts = (data || []) as Omit<Repost, 'profiles'>[]

    const repostUserIds = Array.from(
      new Set(rawReposts.map((repost) => repost.user_id).filter(Boolean))
    )

    let profilesById: Record<string, ProfileSummary> = {}

    if (repostUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', repostUserIds)

      if (profilesError) {
        console.error('Erro ao carregar perfis dos reposts:', profilesError.message)
      }

      profilesById = ((profilesData || []) as (ProfileSummary & { id: string })[]).reduce(
        (acc, profile) => {
          acc[profile.id] = {
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          }

          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    const normalizedReposts: Repost[] = rawReposts
      .filter((repost) => !currentBlockedIds.includes(repost.user_id))
      .map((repost) => ({
        ...repost,
        profiles: profilesById[repost.user_id] || null,
      }))

    if (options.append) {
      setReposts((current) => mergeUniqueById(current, normalizedReposts))
    } else {
      setReposts(normalizedReposts)
    }
    return normalizedReposts
  }

  function canSeePost(post: Post, currentUserId: string, currentFollows: Follow[]) {
    if (post.user_id === currentUserId) return true
    if (post.visibility === 'public') return true

    if (post.visibility === 'followers') {
      return currentFollows.some(
        (follow) =>
          follow.follower_id === currentUserId &&
          follow.following_id === post.user_id
      )
    }

    if (post.visibility === 'private') return false

    return false
  }

  function isSensitivePost(post: Post) {
    return (
      post.is_sensitive ||
      post.category === 'adulto' ||
      post.category === 'sensual' ||
      post.category === '18plus'
    )
  }

  async function loadPosts(
    currentUserId: string = userId,
    currentBlockedIds: string[] = blockedUserIds,
    currentFollows: Follow[] = follows,
    allowSensitiveContent: boolean = currentProfile?.show_sensitive_content || false,
    options: { cursor?: FeedCursor | null; limit?: number; append?: boolean } = {}
  ): Promise<Post[]> {
    const limit = options.limit ?? FEED_INITIAL_POST_LIMIT

    const postSelectWithModeration = `
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
        video_url,
        visibility,
        is_sensitive,
        moderation_status,
        moderated_at,
        moderated_by,
        moderation_reason,
        profiles (
          username,
          display_name,
          avatar_url,
          vip_status,
          vip_expires_at
        )
      `
    const postSelectFallback = `
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
        video_url,
        visibility,
        is_sensitive,
        profiles (
          username,
          display_name,
          avatar_url,
          vip_status,
          vip_expires_at
        )
      `

    const buildPostsQuery = (selectFields: string) => {
      let postsQuery = supabase
      .from('posts')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)

      if (options.cursor) {
        postsQuery = postsQuery.or(
          `created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`
        )
      }

      return postsQuery
    }

    let { data, error } = await buildPostsQuery(postSelectWithModeration)

    if (error && isMissingPostModerationColumnError(error)) {
      const fallback = await buildPostsQuery(postSelectFallback)
      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) {
      if (options.append) {
        throw error
      }

      setMessage(t('feed.messages.loadPostsError') + error.message)
      setHasMorePosts(false)
      return []
    }

    const fetchedRows = (data || []) as any[]
    const lastFetchedPost = fetchedRows[fetchedRows.length - 1] as
      | { created_at: string; id: string }
      | undefined

    setHasMorePosts(fetchedRows.length === limit)
    setFeedCursor(
      lastFetchedPost
        ? {
          createdAt: lastFetchedPost.created_at,
          id: lastFetchedPost.id,
        }
        : null
    )

    const rawPosts = fetchedRows.map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
      is_sensitive: post.is_sensitive || false,
      profiles: Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles,
    })) as Post[]

    const postIds = rawPosts.map((post) => post.id)

    await loadTierBadgeSlugs(rawPosts.map((post) => post.user_id))

    let mediaByPost: Record<string, PostMedia[]> = {}

    if (postIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at')
        .in('post_id', postIds)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error('Erro ao carregar mídias dos posts:', mediaError.message)
      }

      mediaByPost = ((mediaData || []) as PostMedia[]).reduce(
        (acc, mediaItem) => {
          if (!acc[mediaItem.post_id]) acc[mediaItem.post_id] = []
          acc[mediaItem.post_id].push(mediaItem)
          return acc
        },
        {} as Record<string, PostMedia[]>
      )
    }

    const normalizedPosts = rawPosts
      .map((post) => ({
        ...post,
        media: mediaByPost[post.id] || [],
      }))
      .filter((post) => !currentBlockedIds.includes(post.user_id))
      .filter((post) => !isModeratedHidden(post))
      .filter((post) => canSeePost(post, currentUserId, currentFollows))

    if (options.append) {
      setPosts((current) => mergeUniqueById(current, normalizedPosts))
    } else {
      setPosts(normalizedPosts)
    }
    return normalizedPosts
  }

  async function loadTierBadgeSlugs(userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    if (uniqueUserIds.length === 0) return

    const { data, error } = await supabase
      .from('user_badges')
      .select('user_id, badges ( slug )')
      .in('user_id', uniqueUserIds)

    if (error) {
      console.warn('Nao foi possivel carregar os selos de destaque do feed.')
      return
    }

    const nextBadgeSlugsByUserId = uniqueUserIds.reduce<Record<string, string[]>>(
      (acc, currentUserId) => {
        acc[currentUserId] = []
        return acc
      },
      {},
    )

    for (const row of (data || []) as UserTierBadgeRow[]) {
      const badges = Array.isArray(row.badges) ? row.badges : [row.badges]
      nextBadgeSlugsByUserId[row.user_id] = badges
        .map((badge) => badge?.slug || '')
        .filter(Boolean)
    }

    setTierBadgeSlugsByUserId((current) => ({
      ...current,
      ...nextBadgeSlugsByUserId,
    }))
  }

  async function loadComments(
    currentBlockedIds: string[] = blockedUserIds,
    currentPostIds: string[] = posts.map((post) => post.id),
    options: { append?: boolean } = {}
  ): Promise<Comment[]> {
    if (currentPostIds.length === 0) {
      if (!options.append) {
        setComments([])
      }
      return []
    }

    const { data, error } = await supabase
      .from('comments')
      .select(`
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles (
          username,
          display_name,
          avatar_url
        )
      `)
      .in('post_id', currentPostIds)
      .order('created_at', { ascending: true })
      .limit(FEED_INITIAL_COMMENT_LIMIT)

    if (error) {
      setMessage(t('feed.messages.loadCommentsError') + error.message)
      return []
    }

    const normalizedComments = (data || [])
      .map((comment: any) => ({
        ...comment,
        profiles: Array.isArray(comment.profiles)
          ? comment.profiles[0] || null
          : comment.profiles,
      }))
      .filter((comment: Comment) => !currentBlockedIds.includes(comment.user_id))

    const commentIds = normalizedComments.map((comment: Comment) => comment.id)
    let mediaByComment: Record<string, CommentMedia[]> = {}

    if (commentIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('comment_media')
        .select('id, comment_id, user_id, media_url, media_type, created_at')
        .in('comment_id', commentIds)

      if (mediaError) {
        console.warn('Mídias de comentários ainda não disponíveis:', mediaError.message)
      } else {
        mediaByComment = ((mediaData || []) as CommentMedia[]).reduce(
          (acc, mediaItem) => {
            if (!acc[mediaItem.comment_id]) acc[mediaItem.comment_id] = []
            acc[mediaItem.comment_id].push(mediaItem)
            return acc
          },
          {} as Record<string, CommentMedia[]>
        )
      }
    }

    const commentsWithMedia = normalizedComments.map((comment: Comment) => ({
        ...comment,
        media: mediaByComment[comment.id] || [],
      }))

    if (options.append) {
      setComments((current) => mergeUniqueById(current, commentsWithMedia))
    } else {
      setComments(commentsWithMedia)
    }
    return commentsWithMedia
  }

  async function loadLikes(
    currentPostIds: string[] = posts.map((post) => post.id),
    options: { append?: boolean } = {}
  ) {
    let query = supabase
      .from('likes')
      .select('id, post_id, user_id')
      .limit(FEED_INITIAL_REACTION_LIMIT)

    if (currentPostIds.length > 0) {
      query = query.in('post_id', currentPostIds)
    }

    const { data, error } = await query

    if (error) {
      setMessage(t('feed.messages.loadLikesError') + error.message)
      return
    }

    if (options.append) {
      setLikes((current) => mergeUniqueById(current, data || []))
    } else {
      setLikes(data || [])
    }
  }

  async function loadCommentLikes(
    currentCommentIds: string[] = comments.map((comment) => comment.id),
    options: { append?: boolean } = {}
  ) {
    if (currentCommentIds.length === 0) {
      if (!options.append) {
        setCommentLikes([])
      }
      return
    }

    const { data, error } = await supabase
      .from('comment_likes')
      .select('id, comment_id, user_id')
      .in('comment_id', currentCommentIds)
      .limit(FEED_INITIAL_REACTION_LIMIT)

    if (error) {
      setMessage(t('feed.messages.loadCommentLikesError') + error.message)
      return
    }

    if (options.append) {
      setCommentLikes((current) => mergeUniqueById(current, data || []))
    } else {
      setCommentLikes(data || [])
    }
  }

  async function loadRelatedDataForPosts(
    postRows: Post[],
    currentBlockedIds: string[] = blockedUserIds,
    options: { append?: boolean } = {}
  ) {
    const postIds = postRows.map((post) => post.id)

    if (postIds.length === 0) {
      if (!options.append) {
        setComments([])
        setLikes([])
        setCommentLikes([])
        setReposts([])
      }

      return
    }

    const loadedComments = await loadComments(currentBlockedIds, postIds, options)
    const loadedCommentIds = loadedComments.map((comment) => comment.id)

    await Promise.all([
      loadLikes(postIds, options),
      loadCommentLikes(loadedCommentIds, options),
      loadReposts(currentBlockedIds, postIds, options),
    ])
  }

  const loadMorePosts = useCallback(async () => {
    if (loadingMoreRef.current || loading || !hasMorePosts || !userId || !feedCursor) return

    loadingMoreRef.current = true
    setIsLoadingMore(true)
    setLoadMoreError('')

    try {
      const nextPosts = await loadPosts(
        userId,
        blockedUserIds,
        follows,
        currentProfile?.show_sensitive_content || false,
        {
          cursor: feedCursor,
          limit: FEED_NEXT_POST_LIMIT,
          append: true,
        }
      )

      await loadRelatedDataForPosts(nextPosts, blockedUserIds, { append: true })
    } catch (error) {
      console.error('Erro ao carregar mais posts:', error)
      setLoadMoreError('Nao foi possivel carregar mais posts agora.')
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [
    blockedUserIds,
    currentProfile?.show_sensitive_content,
    feedCursor,
    follows,
    hasMorePosts,
    loading,
    userId,
  ])

  async function reloadInitialFeed(currentFollows: Follow[] = follows) {
    if (!userId) return []

    const freshPosts = await loadPosts(
      userId,
      blockedUserIds,
      currentFollows,
      currentProfile?.show_sensitive_content || false,
      {
        limit: FEED_INITIAL_POST_LIMIT,
      }
    )

    await loadRelatedDataForPosts(freshPosts, blockedUserIds)
    return freshPosts
  }

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current

    if (!sentinel || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]

        if (entry?.isIntersecting) {
          void loadMorePosts()
        }
      },
      {
        rootMargin: '640px 0px 640px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [loadMorePosts])

  async function refreshAfterFollowChange() {
    const freshFollows = await loadFollows()
    setFollows(freshFollows)

    await reloadInitialFeed(freshFollows)
  }

  async function handleToggleFollow(targetUserId: string) {
    if (!userId || !targetUserId || userId === targetUserId) return

    if (blockedUserIds.includes(targetUserId)) {
      setMessage(t('feed.messages.blockedFollow'))
      return
    }

    setFollowLoadingUserId(targetUserId)
    setMessage('')

    const { data: existingFollow, error: checkError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', targetUserId)
      .maybeSingle()

    if (checkError) {
      setMessage(t('feed.messages.checkFollowError') + checkError.message)
      setFollowLoadingUserId(null)
      return
    }

    if (existingFollow) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('id', existingFollow.id)

      if (error) {
        setMessage(t('feed.messages.unfollowError') + error.message)
        setFollowLoadingUserId(null)
        return
      }
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: userId,
        following_id: targetUserId,
      })

      if (error) {
        setMessage(t('feed.messages.followError') + error.message)
        setFollowLoadingUserId(null)
        return
      }

      await supabase.from('notifications').insert({
        user_id: targetUserId,
        actor_id: userId,
        type: 'follow',
      })
    }

    await refreshAfterFollowChange()
    setFollowLoadingUserId(null)
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!userId) return

    if (postOwnerId === userId) {
      setMessage(t('feed.messages.ownReport'))
      return
    }

    const reason = window.prompt(t('feed.messages.reportPrompt'))

    if (!reason || !reason.trim()) return

    setReportingPostId(postId)
    setMessage('')

    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      reported_post_id: postId,
      reported_user_id: postOwnerId,
      reason: reason.trim(),
    })

    if (error) {
      setMessage(t('feed.messages.reportError') + error.message)
      setReportingPostId(null)
      return
    }

    setReportedPostIds((prev) => [...prev, postId])
    setMessage(t('feed.messages.reportSuccess'))
    setReportingPostId(null)
  }

  async function handleCopyPostLink(postId: string) {
    const url = `${window.location.origin}/post/${postId}`

    try {
      await navigator.clipboard.writeText(url)
      setCopiedPostId(postId)

      setTimeout(() => {
        setCopiedPostId((current) => (current === postId ? null : current))
      }, 2000)
    } catch {
      setMessage(t('feed.messages.copyPostError'))
    }
  }

  async function handleToggleBookmark(postId: string) {
    if (!userId) return

    setMessage('')

    const existingBookmark = bookmarks.find(
      (bookmark) => bookmark.post_id === postId && bookmark.user_id === userId
    )

    if (existingBookmark) {
      setBookmarks((current) =>
        current.filter((bookmark) => bookmark.id !== existingBookmark.id)
      )

      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)

      if (error) {
        setMessage(t('feed.messages.removeSavedError') + error.message)
        await loadBookmarks(userId)
      }

      return
    }

    const optimisticBookmark: Bookmark = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
    }

    setBookmarks((current) => [...current, optimisticBookmark])

    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      setMessage(t('feed.messages.savePostError') + error.message)
      await loadBookmarks(userId)
      return
    }

    if (data) {
      setBookmarks((current) =>
        current.map((bookmark) =>
          bookmark.id === optimisticBookmark.id ? data : bookmark
        )
      )
    }
  }

  async function handleToggleRepost(postId: string) {
    if (!userId) return

    setMessage('')

    const repostedPost = posts.find((post) => post.id === postId)

    if (repostedPost?.user_id === userId) {
      setMessage(t('feed.messages.ownRepost'))
      return
    }

    const existingRepost = reposts.find(
      (repost) => repost.post_id === postId && repost.user_id === userId
    )

    if (existingRepost) {
      setReposts((current) =>
        current.filter((repost) => repost.id !== existingRepost.id)
      )

      const { error } = await supabase
        .from('reposts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)

      if (error) {
        setMessage(t('feed.messages.removeRepostError') + error.message)
        await loadReposts(blockedUserIds)
      }

      return
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
      profiles: currentProfile
        ? {
          username: currentProfile.username || t('common.username'),
          display_name: currentProfile.display_name,
          avatar_url: currentProfile.avatar_url,
        }
        : null,
    }

    setReposts((current) => [optimisticRepost, ...current])

    const { data, error } = await supabase
      .from('reposts')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      setMessage(t('feed.messages.repostError') + error.message)
      await loadReposts(blockedUserIds)
      return
    }

    if (data) {
      const savedRepost: Repost = {
        ...data,
        profiles: optimisticRepost.profiles,
      }

      setReposts((current) =>
        current.map((repost) =>
          repost.id === optimisticRepost.id ? savedRepost : repost
        )
      )
    }

    if (repostedPost && repostedPost.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: repostedPost.user_id,
        actor_id: userId,
        type: 'repost',
        post_id: postId,
      })
    }
  }

  function getEffectiveImageContentType(file: File) {
    const contentType = getAllowedUploadContentType(file.type, file.name)
    return contentType && isAllowedImageMimeType(contentType) ? contentType : null
  }

  function getEffectiveContentType(file: File) {
    return getAllowedUploadContentType(file.type, file.name)
  }

  function isImage(file: File) {
    return Boolean(getEffectiveImageContentType(file))
  }

  function isVideo(file: File) {
    const contentType = getEffectiveContentType(file)
    return Boolean(contentType && isAllowedVideoMimeType(contentType))
  }

  function isGif(file: File) {
    return getEffectiveImageContentType(file) === 'image/gif'
  }

  function getVideoTooLargeMessage(maxSizeBytes = videoUploadLimit.maxSizeBytes) {
    return `Seu limite atual e ${formatUploadLimitMegabytes(maxSizeBytes)}. Tente comprimir o video antes de publicar. VIP/Anciao tem limites maiores.`
  }

  function getVideoUploadFailureMessage() {
    return R2_UPLOAD_FAILURE_MESSAGE
  }

  async function getPresignAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) return null

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  function getPresignFailureMessage(status: number, error?: string, message?: string) {
    if (status === 401 || error === 'UNAUTHORIZED') {
      return PUBLISH_LOGIN_MESSAGE
    }

    if (status === 413 || error === 'FILE_TOO_LARGE') {
      return message || getVideoTooLargeMessage()
    }

    if (status === 415 || error === 'INVALID_FILE_TYPE') {
      return message || ACCEPTED_MEDIA_FORMATS_MESSAGE
    }

    if (status === 429 || error === 'RATE_LIMITED') {
      return 'Muitos uploads em pouco tempo. Aguarde um pouco.'
    }

    return message || PRESIGN_UPLOAD_FAILURE_MESSAGE
  }

  function getStorageFailureMessage(_mediaType: 'image' | 'video' | 'gif', _status?: number) {
    return R2_UPLOAD_FAILURE_MESSAGE
  }

  function getSafeErrorText(error: unknown) {
    return error instanceof Error ? error.message : 'Erro inesperado no upload R2.'
  }

  function isFetchBlockedOrNetworkError(error: unknown) {
    const message = getSafeErrorText(error).toLowerCase()
    return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')
  }

  async function readSafeResponseText(response: Response) {
    try {
      const text = await response.text()
      return text ? text.slice(0, 500) : ''
    } catch {
      return ''
    }
  }

  function getPresignContractFlags(data: {
    uploadUrl?: string
    publicUrl?: string
    key?: string
    contentType?: string
  } | null) {
    return {
      hasUploadUrl: typeof data?.uploadUrl === 'string' && data.uploadUrl.length > 0,
      hasPublicUrl: typeof data?.publicUrl === 'string' && data.publicUrl.length > 0,
      hasKey: typeof data?.key === 'string' && data.key.length > 0,
      returnedContentType: data?.contentType || null,
    }
  }

  function getR2PutCorsDebugInfo(folder: 'posts' | 'comments', contentType: string) {
    return {
      possibleCause: 'CORS/conexao/R2 bloqueou o PUT antes de retornar status HTTP.',
      requestMethod: 'PUT',
      requestHeaders: ['Content-Type'],
      contentType,
      folder,
      allowedMethodsNeeded: ['PUT', 'GET', 'HEAD'],
      allowedHeadersNeeded: ['Content-Type'],
      exposeHeadersSuggested: ['ETag'],
      origin: typeof window !== 'undefined' ? window.location.origin : null,
    }
  }

  function isSafeHttpMediaUrl(value: unknown) {
    if (typeof value !== 'string') return false

    const trimmedUrl = value.trim()

    if (!trimmedUrl || /^(javascript|data|blob):/i.test(trimmedUrl)) return false

    try {
      const url = new URL(trimmedUrl)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  }

  function isValidPresignData(
    data: {
      uploadUrl?: string
      publicUrl?: string
      key?: string
      contentType?: string
    } | null,
    file: File,
    folder: 'posts' | 'comments',
    expectedContentType: string,
  ): data is {
    uploadUrl: string
    publicUrl: string
    key: string
    contentType: string
  } {
    if (!data) return false
    if (!isSafeHttpMediaUrl(data.uploadUrl) || !isSafeHttpMediaUrl(data.publicUrl)) return false
    if (data.contentType !== expectedContentType) return false
    if (typeof data.key !== 'string' || !data.key.startsWith(`${folder}/${userId}/`)) return false

    return true
  }

  async function uploadMediaFile(
    file: File
  ): Promise<{ url: string; type: 'image' | 'video' | 'gif' } | null> {
    if (!userId) return null

    const uploadContentType = getEffectiveContentType(file)
    const mediaType: 'image' | 'video' | null = uploadContentType && getEffectiveImageContentType(file)
      ? 'image'
      : uploadContentType && isVideo(file)
        ? 'video'
        : null

    if (mediaType === 'image') {
      if (file.size > IMAGE_UPLOAD_MAX_SIZE_BYTES) {
        setMessage(isGif(file) ? 'GIF muito grande. O limite atual e 5 MB.' : t('feed.messages.imageTooLarge'))
        return null
      }
    }

    if (mediaType === 'video') {
      if (file.size > videoUploadLimit.maxSizeBytes) {
        setMessage(getVideoTooLargeMessage())
        return null
      }
    }

    if (!mediaType || !uploadContentType) {
      setMessage(looksLikeVideoUpload(file.type, file.name) ? VIDEO_FORMAT_NOT_ACCEPTED_MESSAGE : ACCEPTED_MEDIA_FORMATS_MESSAGE)
      return null
    }

    console.info('[FeedUpload] Iniciando upload de midia:', {
      fileName: file.name,
      fileType: file.type || null,
      fileSize: file.size,
      contentType: uploadContentType,
      folder: 'posts',
      step: 'frontend-validation',
    })

    if (mediaType === 'image') {
      setUploadingPostImage(true)
    } else {
      setUploadingPostVideo(true)
      setMessage('Enviando video... Mantenha esta aba aberta ate concluir.')
    }

    let uploadStep = 'presign-request'

    try {
      const authHeaders = await getPresignAuthHeaders()

      if (!authHeaders) {
        setMessage(PUBLISH_LOGIN_MESSAGE)
        return null
      }

      uploadStep = 'presign-request'
      const presignResponse = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          fileName: file.name,
          contentType: uploadContentType,
          fileSize: file.size,
          folder: 'posts',
        }),
      })

      const presignData = (await presignResponse.json().catch(() => null)) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        key?: string
        contentType?: string
        message?: string
        error?: string
      } | null

      console.info('[FeedUpload] Resposta do presign:', {
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        contentType: uploadContentType,
        folder: 'posts',
        status: presignResponse.status,
        step: 'presign-response',
        error: presignData?.error,
        ...getPresignContractFlags(presignData),
      })

      if (!presignResponse.ok || !presignData?.ok) {
        const errorMessage = getPresignFailureMessage(
          presignResponse.status,
          presignData?.error,
          presignData?.message,
        )

        console.error('[FeedUpload] Falha ao preparar upload R2:', {
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'posts',
          status: presignResponse.status,
          step: 'presign',
          error: presignData?.error,
          ...getPresignContractFlags(presignData),
        })

        setMessage(errorMessage)
        return null
      }

      if (!isValidPresignData(presignData, file, 'posts', uploadContentType)) {
        console.error('[FeedUpload] Presign retornou dados invalidos:', {
          fileName: file.name,
          fileType: file.type || null,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'posts',
          status: presignResponse.status,
          step: 'presign-validation',
          ...getPresignContractFlags(presignData),
        })
        setMessage(PRESIGN_UPLOAD_FAILURE_MESSAGE)
        return null
      }

      let uploadResponse: Response

      uploadStep = 'r2-put'
      try {
        uploadResponse = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': uploadContentType,
          },
          body: file,
        })
      } catch (error) {
        const errorText = getSafeErrorText(error)

        console.error('[FeedUpload] Erro de rede/browser no PUT R2:', {
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          contentType: uploadContentType,
          folder: 'posts',
          step: 'r2-put',
          message: errorText,
          fetchBlockedOrNetworkError: isFetchBlockedOrNetworkError(error),
          corsDebug: getR2PutCorsDebugInfo('posts', uploadContentType),
        })

        setMessage(getStorageFailureMessage(mediaType === 'video' ? 'video' : uploadContentType === 'image/gif' ? 'gif' : 'image'))
        return null
      }

      console.info('[FeedUpload] Resposta do PUT R2:', {
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        contentType: uploadContentType,
        folder: 'posts',
        status: uploadResponse.status,
        step: 'r2-put-response',
      })

      if (!uploadResponse.ok) {
        const uploadErrorText = await readSafeResponseText(uploadResponse)

        console.error('[FeedUpload] Falha ao enviar midia para o R2:', {
          fileName: file.name,
          fileType: file.type || null,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'posts',
          status: uploadResponse.status,
          step: 'r2-put',
          responseText: uploadErrorText,
        })

        const friendlyMessage = getStorageFailureMessage(
          mediaType === 'video' ? 'video' : uploadContentType === 'image/gif' ? 'gif' : 'image',
          uploadResponse.status,
        )

        setMessage(friendlyMessage)
        return null
      }

      return {
        url: presignData.publicUrl,
        type: uploadContentType === 'image/gif' ? 'gif' : mediaType,
      }
    } catch (error) {
      const errorMessage =
        uploadStep.startsWith('presign')
          ? PRESIGN_UPLOAD_FAILURE_MESSAGE
          : getStorageFailureMessage(mediaType === 'video' ? 'video' : uploadContentType === 'image/gif' ? 'gif' : 'image')

      console.error('[FeedUpload] Erro ao enviar midia do post:', {
        fileName: file.name,
        fileType: file.type || null,
        contentType: uploadContentType,
        sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
        folder: 'posts',
        step: uploadStep,
        message: getSafeErrorText(error),
      })

      setMessage(errorMessage)
      return null
    } finally {
      if (mediaType === 'image') {
        setUploadingPostImage(false)
      } else {
        setUploadingPostVideo(false)
      }
    }
  }

  async function uploadCommentMediaFile(
    draft: CommentMediaDraft
  ): Promise<{ url: string; type: 'image' | 'video' | 'gif' } | null> {
    if (draft.source === 'gif-url') {
      if (!isSafeHttpMediaUrl(draft.url)) {
        setMessage('Midia invalida. Envie o arquivo novamente.')
        return null
      }

      return {
        url: draft.url,
        type: 'gif',
      }
    }

    if (!draft.file) return null

    const file = draft.file
    const uploadContentType = getEffectiveContentType(file)
    const mediaType: 'image' | 'video' | 'gif' | null =
      uploadContentType === 'image/gif'
        ? 'gif'
        : uploadContentType && getEffectiveImageContentType(file)
          ? 'image'
          : uploadContentType && isVideo(file)
            ? 'video'
            : null

    if (!mediaType || !uploadContentType) {
      setMessage(looksLikeVideoUpload(file.type, file.name) ? VIDEO_FORMAT_NOT_ACCEPTED_MESSAGE : ACCEPTED_MEDIA_FORMATS_MESSAGE)
      return null
    }

    const maxSizeInBytes = mediaType === 'video' ? VIDEO_UPLOAD_MAX_SIZE_BYTES : IMAGE_UPLOAD_MAX_SIZE_BYTES

    if (file.size > maxSizeInBytes) {
      setMessage(mediaType === 'video' ? getVideoTooLargeMessage(VIDEO_UPLOAD_MAX_SIZE_BYTES) : mediaType === 'gif' ? 'GIF muito grande. O limite atual e 5 MB.' : t('feed.messages.imageTooLarge'))
      return null
    }

    let uploadStep = 'presign-request'

    try {
      const authHeaders = await getPresignAuthHeaders()

      if (!authHeaders) {
        setMessage(PUBLISH_LOGIN_MESSAGE)
        return null
      }

      uploadStep = 'presign-request'
      const presignResponse = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          fileName: file.name,
          contentType: uploadContentType,
          fileSize: file.size,
          folder: 'comments',
        }),
      })

      const presignData = (await presignResponse.json().catch(() => null)) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        key?: string
        contentType?: string
        message?: string
        error?: string
      } | null

      console.info('[FeedUpload] Resposta do presign de comentario:', {
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        contentType: uploadContentType,
        folder: 'comments',
        status: presignResponse.status,
        step: 'presign-response',
        error: presignData?.error,
        ...getPresignContractFlags(presignData),
      })

      if (!presignResponse.ok || !presignData?.ok) {
        console.error('[FeedUpload] Falha ao preparar upload R2 de comentario:', {
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'comments',
          status: presignResponse.status,
          step: 'presign',
          error: presignData?.error,
          ...getPresignContractFlags(presignData),
        })
        setMessage(
          getPresignFailureMessage(
            presignResponse.status,
            presignData?.error,
            presignData?.message,
          ),
        )
        return null
      }

      if (!isValidPresignData(presignData, file, 'comments', uploadContentType)) {
        console.error('[FeedUpload] Presign de comentario retornou dados invalidos:', {
          fileName: file.name,
          fileType: file.type || null,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'comments',
          status: presignResponse.status,
          step: 'presign-validation',
          ...getPresignContractFlags(presignData),
        })
        setMessage(PRESIGN_UPLOAD_FAILURE_MESSAGE)
        return null
      }

      let uploadResponse: Response

      uploadStep = 'r2-put'
      try {
        uploadResponse = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': uploadContentType,
          },
          body: file,
        })
      } catch (error) {
        const errorText = getSafeErrorText(error)

        console.error('[FeedUpload] Erro de rede/browser no PUT R2 de comentario:', {
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          contentType: uploadContentType,
          folder: 'comments',
          step: 'r2-put',
          message: errorText,
          fetchBlockedOrNetworkError: isFetchBlockedOrNetworkError(error),
          corsDebug: getR2PutCorsDebugInfo('comments', uploadContentType),
        })

        setMessage(getStorageFailureMessage(mediaType === 'video' ? 'video' : mediaType === 'gif' ? 'gif' : 'image'))
        return null
      }

      console.info('[FeedUpload] Resposta do PUT R2 de comentario:', {
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        contentType: uploadContentType,
        folder: 'comments',
        status: uploadResponse.status,
        step: 'r2-put-response',
      })

      if (!uploadResponse.ok) {
        const uploadErrorText = await readSafeResponseText(uploadResponse)

        console.error('[FeedUpload] Falha ao enviar midia de comentario para o R2:', {
          fileName: file.name,
          fileType: file.type || null,
          contentType: uploadContentType,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          folder: 'comments',
          status: uploadResponse.status,
          step: 'r2-put',
          responseText: uploadErrorText,
        })
        setMessage(getStorageFailureMessage(mediaType === 'video' ? 'video' : mediaType === 'gif' ? 'gif' : 'image', uploadResponse.status))
        return null
      }

      return {
        url: presignData.publicUrl,
        type: mediaType,
      }
    } catch (error) {
      console.error('[FeedUpload] Erro ao enviar midia de comentario:', {
        fileName: file.name,
        fileType: file.type || null,
        contentType: uploadContentType,
        sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
        folder: 'comments',
        step: uploadStep,
        message: getSafeErrorText(error),
      })
      setMessage(uploadStep.startsWith('presign') ? PRESIGN_UPLOAD_FAILURE_MESSAGE : getStorageFailureMessage(mediaType === 'video' ? 'video' : mediaType === 'gif' ? 'gif' : 'image'))
      return null
    }
  }

  async function handleCreatePost({
    content,
    category,
    visibility,
    imageFile,
    videoFile,
    mediaFiles = [],
  }: ComposerSubmitData) {
    const finalMediaFiles =
      mediaFiles.length > 0
        ? mediaFiles
        : ([imageFile, videoFile].filter(Boolean) as File[])

    if (!content.trim() && finalMediaFiles.length === 0) {
      setMessage(t('feed.messages.emptyPost'))
      return false
    }

    if (finalMediaFiles.length > 5) {
      setMessage(t('feed.messages.maxMediaPost'))
      return false
    }

    setMessage('')

    const uploadedMedia: {
      url: string
      type: 'image' | 'video' | 'gif'
    }[] = []

    for (const file of finalMediaFiles) {
      const uploaded = await uploadMediaFile(file)

      if (!uploaded) {
        return false
      }

      uploadedMedia.push(uploaded)
    }

    const firstImage = uploadedMedia.find((item) => item.type === 'image' || item.type === 'gif')?.url || null
    const firstVideo = uploadedMedia.find((item) => item.type === 'video')?.url || null

    console.info('[FeedUpload] Salvando post apos upload:', {
      mediaCount: uploadedMedia.length,
      mediaTypes: uploadedMedia.map((item) => item.type),
      hasImage: Boolean(firstImage),
      hasVideo: Boolean(firstVideo),
      step: 'database-post-save',
    })

    const { data: insertedPost, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: content.trim() || null,
        category,
        image_url: firstImage,
        video_url: firstVideo,
        visibility,
        is_sensitive: category === '18plus',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[FeedUpload] Falha ao salvar post apos upload:', {
        mediaCount: uploadedMedia.length,
        mediaTypes: uploadedMedia.map((item) => item.type),
        step: 'database-post-save',
        error: error.message,
      })
      setMessage(GENERIC_PUBLISH_FAILURE_MESSAGE)
      return false
    }

    if (insertedPost?.id && uploadedMedia.length > 0) {
      const mediaRows = uploadedMedia.map((item, index) => ({
        post_id: insertedPost.id,
        user_id: userId,
        media_url: item.url,
        media_type: item.type,
        position: index,
      }))

      const { error: mediaError } = await supabase
        .from('post_media')
        .insert(mediaRows)

      if (mediaError) {
        console.error('[FeedUpload] Falha ao salvar midias do post:', {
          postId: insertedPost.id,
          mediaCount: mediaRows.length,
          mediaTypes: mediaRows.map((item) => item.media_type),
          step: 'database-media-save',
          error: mediaError.message,
        })
        setMessage(PARTIAL_MEDIA_SAVE_FAILURE_MESSAGE)

        await reloadInitialFeed()
        await loadBookmarks(userId)

        return false
      }

      console.info('[FeedUpload] Midias do post salvas:', {
        postId: insertedPost.id,
        mediaCount: mediaRows.length,
        mediaTypes: mediaRows.map((item) => item.media_type),
        step: 'database-media-save',
      })
    }

    setMessage(t('feed.messages.publishedSuccess'))

    await reloadInitialFeed()
    await loadBookmarks(userId)

    return true
  }

  async function handleDeletePost(postId: string) {
    const confirmDelete = window.confirm(t('feed.messages.confirmDeletePost'))

    if (!confirmDelete) return

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('feed.messages.deletePostError') + error.message)
      return
    }

    setMessage(t('feed.messages.postDeleted'))

    await reloadInitialFeed()
    await loadBookmarks(userId)
  }

  function handleStartEdit(post: Post) {
    setEditingPostId(post.id)
    setEditContent(post.content || '')
  }

  function handleCancelEdit() {
    setEditingPostId(null)
    setEditContent('')
  }

  async function handleSaveEdit(postId: string) {
    if (!editContent.trim()) {
      setMessage(t('feed.messages.emptyPostEdit'))
      return
    }

    setSavingEdit(true)
    setMessage('')

    const { error } = await supabase
      .from('posts')
      .update({
        content: editContent.trim(),
      })
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('feed.messages.editPostError') + error.message)
      setSavingEdit(false)
      return
    }

    setMessage(t('feed.messages.postEdited'))
    setEditingPostId(null)
    setEditContent('')
    setSavingEdit(false)

    await reloadInitialFeed()
  }

  async function handleCreateComment(postId: string) {
    const text = commentInputs[postId]?.trim()
    const mediaDraft = commentMediaDrafts[postId]

    if (!text && !mediaDraft) {
      setMessage(t('feed.messages.emptyComment'))
      return
    }

    if (submittingCommentPostId === postId) return

    setSubmittingCommentPostId(postId)

    const uploadedCommentMedia = mediaDraft ? await uploadCommentMediaFile(mediaDraft) : null

    if (mediaDraft && !uploadedCommentMedia) {
      setSubmittingCommentPostId(null)
      return
    }

    const { data: insertedComment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: text || '',
      })
      .select('id')
      .single()

    if (error) {
      setMessage(t('feed.messages.commentError') + error.message)
      setSubmittingCommentPostId(null)
      return
    }

    if (insertedComment?.id && uploadedCommentMedia) {
      const { error: mediaError } = await supabase
        .from('comment_media')
        .insert({
          comment_id: insertedComment.id,
          user_id: userId,
          media_url: uploadedCommentMedia.url,
          media_type: uploadedCommentMedia.type,
        })

      if (mediaError) {
        setMessage('Comentário criado, mas a mídia não foi salva. Aplique a migration de mídias de comentários no Supabase.')
        await loadComments()
        setSubmittingCommentPostId(null)
        return
      }
    }

    const commentedPost = posts.find((post) => post.id === postId)

    if (commentedPost && commentedPost.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: commentedPost.user_id,
        actor_id: userId,
        type: 'comment',
        post_id: postId,
        comment_id: insertedComment?.id || null,
      })
    }

    setCommentInputs((prev) => ({
      ...prev,
      [postId]: '',
    }))
    removeCommentMediaDraft(postId)
    setCommentGifInputs((prev) => ({
      ...prev,
      [postId]: '',
    }))
    setOpenGifPickerPostId(null)
    setOpenCommentEmojiPickerPostId(null)
    setReplyModalPostId((current) => (current === postId ? null : current))

    setMessage(t('feed.messages.commentSuccess'))

    await loadComments()
    await loadCommentLikes()
    setSubmittingCommentPostId(null)
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

    if (likeActionInProgressRef.current.has(postId)) {
      return
    }

    likeActionInProgressRef.current.add(postId)
    setMessage('')

    const existingLike = likes.find(
      (like) => like.post_id === postId && like.user_id === userId
    )

    if (existingLike) {
      setLikes((current) =>
        current.filter(
          (like) => !(like.post_id === postId && like.user_id === userId)
        )
      )

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        setMessage(t('feed.messages.removeLikeError') + error.message)
        await loadLikes()
      }

      likeActionInProgressRef.current.delete(postId)
      return
    }

    const optimisticLike: Like = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
    }

    setLikes((current) => [...current, optimisticLike])

    const { data, error } = await supabase
      .from('likes')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('id, post_id, user_id')
      .single()

    if (error) {
      setMessage(t('feed.messages.likeError') + error.message)
      await loadLikes()
      likeActionInProgressRef.current.delete(postId)
      return
    }

    if (data) {
      setLikes((current) =>
        current.map((like) =>
          like.id === optimisticLike.id ? data : like
        )
      )
    }

    const likedPost = posts.find((post) => post.id === postId)

    if (likedPost && likedPost.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: likedPost.user_id,
        actor_id: userId,
        type: 'like',
        post_id: postId,
      })
    }

    likeActionInProgressRef.current.delete(postId)
  }

  async function handleToggleCommentLike(commentId: string) {
    if (!userId) return

    const existingLike = commentLikes.find(
      (like) => like.comment_id === commentId && like.user_id === userId
    )

    if (existingLike) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        setMessage(t('feed.messages.removeCommentLikeError') + error.message)
        return
      }
    } else {
      const { error } = await supabase.from('comment_likes').insert({
        comment_id: commentId,
        user_id: userId,
      })

      if (error) {
        setMessage(t('feed.messages.commentLikeError') + error.message)
        return
      }
    }

    await loadCommentLikes()
  }

  function handleStartEditComment(comment: Comment) {
    setEditingCommentId(comment.id)
    setEditCommentContent(comment.content)
    setOpenCommentMenuId(null)
  }

  function handleCancelEditComment() {
    setEditingCommentId(null)
    setEditCommentContent('')
    setSavingCommentId(null)
  }

  async function handleSaveCommentEdit(commentId: string) {
    if (!editCommentContent.trim()) {
      setMessage(t('feed.messages.emptyCommentEdit'))
      return
    }

    setSavingCommentId(commentId)
    setMessage('')

    const { error } = await supabase
      .from('comments')
      .update({
        content: editCommentContent.trim(),
      })
      .eq('id', commentId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('feed.messages.editCommentError') + error.message)
      setSavingCommentId(null)
      return
    }

    setMessage(t('feed.messages.commentEdited'))
    setEditingCommentId(null)
    setEditCommentContent('')
    setSavingCommentId(null)

    await loadComments()
  }

  async function handleDeleteComment(commentId: string) {
    const confirmDelete = window.confirm(t('feed.messages.confirmDeleteComment'))

    if (!confirmDelete) return

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('feed.messages.deleteCommentError') + error.message)
      return
    }

    setMessage(t('feed.messages.commentDeleted'))
    setOpenCommentMenuId(null)

    await loadComments()
    await loadCommentLikes()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostComposerFocus() {
    const composer = document.getElementById('post-composer')

    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' })

      const textarea = composer.querySelector('textarea')

      if (textarea instanceof HTMLTextAreaElement) {
        setTimeout(() => textarea.focus(), 350)
      }
    }
  }

  function handleFocusCommentInput(postId: string) {
    const input = document.getElementById(`comment-input-${postId}`)

    if (input instanceof HTMLInputElement) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' })

      setTimeout(() => {
        input.focus()
      }, 300)
    }
  }

  function handleInsertCommentEmoji(postId: string, emoji: string) {
    setCommentInputs((prev) => ({
      ...prev,
      [postId]: `${prev[postId] || ''}${emoji}`,
    }))

    setTimeout(() => {
      const modalInput = document.getElementById('reply-modal-comment-input')
      const inlineInput = document.getElementById(`comment-input-${postId}`)

      if (replyModalPostId === postId && modalInput instanceof HTMLTextAreaElement) {
        modalInput.focus()
        return
      }

      if (inlineInput instanceof HTMLInputElement) {
        inlineInput.focus()
      }
    }, 50)
  }

  function handleSelectCommentMedia(postId: string, files: FileList | null) {
    const file = files?.[0]

    if (!file) return

    if (!isImage(file) && !isVideo(file)) {
      setMessage(ACCEPTED_MEDIA_FORMATS_MESSAGE)
      return
    }

    setCommentMediaDrafts((current) => {
      const previousDraft = current[postId]

      if (previousDraft?.source === 'file') {
        URL.revokeObjectURL(previousDraft.url)
      }

      return {
        ...current,
        [postId]: {
          file,
          url: URL.createObjectURL(file),
          type: isGif(file) ? 'gif' : isVideo(file) ? 'video' : 'image',
          source: 'file',
        },
      }
    })
  }

  function removeCommentMediaDraft(postId: string) {
    setCommentMediaDrafts((current) => {
      const previousDraft = current[postId]

      if (previousDraft?.source === 'file') {
        URL.revokeObjectURL(previousDraft.url)
      }

      return {
        ...current,
        [postId]: null,
      }
    })
  }

  function handleAddGifUrl(postId: string) {
    const gifUrl = (commentGifInputs[postId] || '').trim()

    if (gifUrl.length > 500 || !isSafeHttpMediaUrl(gifUrl)) {
      setMessage('Cole um link de GIF válido começando com http:// ou https://.')
      return
    }

    removeCommentMediaDraft(postId)
    setCommentMediaDrafts((current) => ({
      ...current,
      [postId]: {
        url: gifUrl,
        type: 'gif',
        source: 'gif-url',
      },
    }))
    setOpenGifPickerPostId(null)
  }

  function handleOpenReplyModal(postId: string) {
    setReplyModalPostId(postId)
    setOpenCommentEmojiPickerPostId(null)

    setTimeout(() => {
      const input = document.getElementById('reply-modal-comment-input')

      if (input instanceof HTMLTextAreaElement) {
        input.focus()
      }
    }, 150)
  }

  function handleCloseReplyModal() {
    setReplyModalPostId(null)
    setOpenCommentEmojiPickerPostId(null)
  }

  async function handleSubmitReplyModal(postId: string) {
    const text = commentInputs[postId]?.trim()
    const mediaDraft = commentMediaDrafts[postId]

    if (!text && !mediaDraft) {
      setMessage(t('feed.messages.emptyComment'))
      return
    }

    await handleCreateComment(postId)
  }

  function getVisibilityLabel(value: Post['visibility']) {
    if (value === 'public') return t('visibility.public')
    if (value === 'followers') return t('visibility.followers')

    return t('visibility.private')
  }

  function getPostMedia(post: Post): PostMedia[] {
    if (post.media && post.media.length > 0) {
      return post.media
    }

    const legacyMedia: PostMedia[] = []

    if (post.image_url) {
      legacyMedia.push({
        id: `${post.id}-legacy-image`,
        post_id: post.id,
        user_id: post.user_id,
        media_url: post.image_url,
        media_type: 'image',
        position: 0,
      })
    }

    if (post.video_url) {
      legacyMedia.push({
        id: `${post.id}-legacy-video`,
        post_id: post.id,
        user_id: post.user_id,
        media_url: post.video_url,
        media_type: 'video',
        position: legacyMedia.length,
      })
    }

    return legacyMedia
  }

  const followStateMap = useMemo(() => {
    const map = new Map<string, boolean>()

    for (const follow of follows) {
      if (follow.follower_id === userId) {
        map.set(follow.following_id, true)
      }
    }

    return map
  }, [follows, userId])

  const feedItems = useMemo<FeedItem[]>(() => {
    const postMap = new Map<string, Post>()

    for (const post of posts) {
      postMap.set(post.id, post)
    }

    const postItems: FeedItem[] = posts.map((post) => ({
      type: 'post',
      id: `post-${post.id}`,
      created_at: post.created_at,
      post,
    }))

    const repostItems = reposts
      .map((repost) => {
        const originalPost = postMap.get(repost.post_id)

        if (!originalPost) return null

        return {
          type: 'repost' as const,
          id: `repost-${repost.id}`,
          created_at: repost.created_at,
          post: originalPost,
          repost,
        }
      })
      .filter((item): item is Extract<FeedItem, { type: 'repost' }> => item !== null)

    return [...postItems, ...repostItems].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [posts, reposts])

  const normalizedSearch = feedSearch.trim().toLowerCase()

  function matchesPostSearch(post: Post) {
    if (!normalizedSearch) return true

    const haystack = [
      post.content || '',
      post.category || '',
      post.profiles?.display_name || '',
      post.profiles?.username || '',
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedSearch)
  }

  const filteredFeedItems = useMemo(() => {
    if (!normalizedSearch) return feedItems

    return feedItems.filter((item) => {
      const postMatch = matchesPostSearch(item.post)

      if (postMatch) return true

      if (item.type === 'repost') {
        const repostHaystack = [
          item.repost.profiles?.display_name || '',
          item.repost.profiles?.username || '',
        ]
          .join(' ')
          .toLowerCase()

        return repostHaystack.includes(normalizedSearch)
      }

      return false
    })
  }, [feedItems, normalizedSearch])

  const visibleFeedItems = filteredFeedItems
  const hasSearch = normalizedSearch.length > 0

  const commentsByPostId = useMemo(() => {
    const map = new Map<string, Comment[]>()

    for (const comment of comments) {
      const postComments = map.get(comment.post_id) || []
      postComments.push(comment)
      map.set(comment.post_id, postComments)
    }

    return map
  }, [comments])

  const likesByPostId = useMemo(() => {
    const map = new Map<string, Like[]>()
    const likedByCurrentUser = new Set<string>()

    for (const like of likes) {
      const postLikes = map.get(like.post_id) || []
      postLikes.push(like)
      map.set(like.post_id, postLikes)

      if (like.user_id === userId) {
        likedByCurrentUser.add(like.post_id)
      }
    }

    return { map, likedByCurrentUser }
  }, [likes, userId])

  const repostsByPostId = useMemo(() => {
    const map = new Map<string, Repost[]>()
    const repostedByCurrentUser = new Set<string>()

    for (const repost of reposts) {
      const postReposts = map.get(repost.post_id) || []
      postReposts.push(repost)
      map.set(repost.post_id, postReposts)

      if (repost.user_id === userId) {
        repostedByCurrentUser.add(repost.post_id)
      }
    }

    return { map, repostedByCurrentUser }
  }, [reposts, userId])

  const savedPostIds = useMemo(() => {
    const ids = new Set<string>()

    for (const bookmark of bookmarks) {
      if (bookmark.user_id === userId) {
        ids.add(bookmark.post_id)
      }
    }

    return ids
  }, [bookmarks, userId])

  const commentLikesByCommentId = useMemo(() => {
    const map = new Map<string, CommentLike[]>()
    const likedByCurrentUser = new Set<string>()

    for (const like of commentLikes) {
      const likesForComment = map.get(like.comment_id) || []
      likesForComment.push(like)
      map.set(like.comment_id, likesForComment)

      if (like.user_id === userId) {
        likedByCurrentUser.add(like.comment_id)
      }
    }

    return { map, likedByCurrentUser }
  }, [commentLikes, userId])

  const replyModalPost = useMemo(() => {
    if (!replyModalPostId) return null

    return posts.find((post) => post.id === replyModalPostId) || null
  }, [posts, replyModalPostId])

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-6 text-black dark:bg-black dark:text-white">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div className="h-24 rounded-[2rem] border border-zinc-200 bg-white/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80" />
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center gap-3 p-4">
                <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-36 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-24 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
                </div>
              </div>
              <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-900" />
              <div className="flex gap-3 p-4">
                <div className="h-9 flex-1 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
                <div className="h-9 flex-1 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
                <div className="h-9 flex-1 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
              </div>
            </div>
          ))}
          <p className="text-center text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            {t('feed.loading')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={currentProfile?.display_name || undefined}
        username={currentProfile?.username || null}
        email={email}
        avatarUrl={currentProfile?.avatar_url || null}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={currentProfile?.display_name || currentProfile?.username || t('nav.myProfile')}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostComposerFocus}
      />

      {replyModalPost && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-3 py-6 backdrop-blur-md sm:py-10">
          <button
            type="button"
            onClick={handleCloseReplyModal}
            className="absolute inset-0 cursor-default"
            aria-label="Fechar resposta"
          />

          <div className="relative z-[81] flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white/95 shadow-2xl shadow-black/25 ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/90 dark:ring-white/10 sm:max-h-[88vh]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/70">
              <button
                type="button"
                onClick={handleCloseReplyModal}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Fechar"
                title="Fechar"
              >
                ×
              </button>

              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Responder publicação
              </p>

              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-sm font-bold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                title="Rascunhos futuramente"
              >
                Rascunhos
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-4 pb-3 sm:px-5">
              <div className="relative flex gap-3">
                <div className="flex shrink-0 flex-col items-center">
                  {replyModalPost.profiles?.avatar_url ? (
                    <img
                      src={replyModalPost.profiles.avatar_url}
                      alt={replyModalPost.profiles.display_name || replyModalPost.profiles.username || t('common.user')}
                      className="h-11 w-11 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {(replyModalPost.profiles?.display_name || replyModalPost.profiles?.username || t('common.user')).charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="mt-2 w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>

                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center gap-1">
                    <UserBadges userId={replyModalPost.user_id} size="sm" max={1} />

                    <p className="font-bold text-zinc-950 dark:text-white">
                      {replyModalPost.profiles?.display_name || replyModalPost.profiles?.username || t('common.user')}
                    </p>

                    <p className="text-sm text-zinc-500">
                      @{replyModalPost.profiles?.username || t('common.username')}
                    </p>
                  </div>

                  {replyModalPost.content && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                      {replyModalPost.content}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-zinc-500">
                    {new Date(replyModalPost.created_at).toLocaleString(getDateLocale(language))}
                  </p>

                  <p className="mt-3 text-sm text-zinc-500">
                    Respondendo a{' '}
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      @{replyModalPost.profiles?.username || t('common.username')}
                    </span>
                  </p>
                </div>
              </div>

              <div className="relative flex gap-3 rounded-[1.75rem] bg-zinc-50/70 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/70 dark:ring-zinc-800/70">
                <div className="shrink-0">
                  {currentProfile?.avatar_url ? (
                    <img
                      src={currentProfile.avatar_url}
                      alt={currentProfile.display_name || currentProfile.username || t('common.user')}
                      className="h-11 w-11 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {(currentProfile?.display_name || currentProfile?.username || t('common.user')).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <textarea
                    id="reply-modal-comment-input"
                    value={commentInputs[replyModalPost.id] || ''}
                    onChange={(event) =>
                      setCommentInputs((prev) => ({
                        ...prev,
                        [replyModalPost.id]: event.target.value,
                      }))
                    }
                    placeholder="Postar sua resposta..."
                    className="min-h-32 w-full resize-none bg-transparent py-2 text-lg text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white"
                  />

                  {commentMediaDrafts[replyModalPost.id] && (
                    <div className="mb-3 overflow-hidden rounded-[1.5rem] border border-blue-400/20 bg-black/90 shadow-lg shadow-blue-950/10">
                      {commentMediaDrafts[replyModalPost.id]?.type === 'video' ? (
                        <video
                          src={commentMediaDrafts[replyModalPost.id]?.url}
                          controls
                          playsInline
                          preload="none"
                          className="max-h-72 w-full bg-black object-contain"
                        />
                      ) : (
                        <img
                          src={commentMediaDrafts[replyModalPost.id]?.url}
                          loading="lazy"
                          decoding="async"
                          alt="Prévia da mídia do comentário"
                          className="max-h-72 w-full object-contain"
                        />
                      )}

                      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">
                          {commentMediaDrafts[replyModalPost.id]?.type === 'gif' ? 'GIF' : 'Mídia'}
                        </span>

                        <button
                          type="button"
                          onClick={() => removeCommentMediaDraft(replyModalPost.id)}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  )}

                  {openCommentEmojiPickerPostId === replyModalPost.id && (
                    <div className="mb-3 max-h-[45vh] overflow-hidden rounded-[1.75rem] border border-zinc-200/70 bg-white/95 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-zinc-700/70 dark:bg-zinc-950/95 sm:max-h-[260px]">
                      <div className="border-b border-zinc-200/70 bg-gradient-to-br from-blue-50 via-white to-purple-50 p-3 dark:border-zinc-800 dark:from-blue-950/30 dark:via-zinc-950 dark:to-purple-950/30">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-zinc-950 dark:text-white">
                              Emojis
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              Toque para inserir na resposta.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setOpenCommentEmojiPickerPostId(null)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                            aria-label="Fechar emojis"
                            title="Fechar emojis"
                          >
                            ×
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {COMMENT_QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={`reply-quick-${replyModalPost.id}-${emoji}`}
                              type="button"
                              onClick={() => handleInsertCommentEmoji(replyModalPost.id, emoji)}
                              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-xl shadow-sm transition hover:-translate-y-0.5 hover:scale-110 hover:shadow-md active:scale-95 dark:bg-zinc-900"
                              aria-label={`Inserir emoji ${emoji}`}
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-[calc(45vh-96px)] overflow-y-auto p-3 sm:max-h-[164px]">
                        <div className="space-y-4">
                          {COMMENT_EMOJI_GROUPS.map((group) => (
                            <div key={`reply-group-${replyModalPost.id}-${group.title}`}>
                              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                {group.title}
                              </p>

                              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                                {group.emojis.map((emoji) => (
                                  <button
                                    key={`reply-${replyModalPost.id}-${group.title}-${emoji}`}
                                    type="button"
                                    onClick={() => handleInsertCommentEmoji(replyModalPost.id, emoji)}
                                    className="flex h-9 w-9 items-center justify-center rounded-2xl text-xl transition hover:-translate-y-0.5 hover:scale-110 hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800"
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
                    </div>
                  )}

                  {openGifPickerPostId === replyModalPost.id && (
                    <div className="mb-3 rounded-[1.5rem] border border-blue-400/20 bg-zinc-950/95 p-3 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10">
                      <label className="text-xs font-black uppercase tracking-[0.14em] text-blue-200">
                        Cole o link do GIF
                      </label>

                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="url"
                          value={commentGifInputs[replyModalPost.id] || ''}
                          onChange={(event) =>
                            setCommentGifInputs((prev) => ({
                              ...prev,
                              [replyModalPost.id]: event.target.value.slice(0, 500),
                            }))
                          }
                          placeholder="https://..."
                          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                        />

                        <button
                          type="button"
                          onClick={() => handleAddGifUrl(replyModalPost.id)}
                          className="rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700"
                        >
                          Adicionar GIF
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-between border-t border-zinc-200/70 bg-zinc-50/95 py-3 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/95">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <label
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        title="Adicionar imagem ou vídeo"
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif,video/mp4,video/webm,video/quicktime"
                          className="hidden"
                          onChange={(event) => {
                            handleSelectCommentMedia(replyModalPost.id, event.target.files)
                            event.currentTarget.value = ''
                          }}
                        />
                        <ImageIcon className="h-5 w-5" />
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenGifPickerPostId((current) =>
                            current === replyModalPost.id ? null : replyModalPost.id
                          )
                        }
                        className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-black transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        title="Adicionar GIF"
                      >
                        GIF
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenCommentEmojiPickerPostId((current) =>
                            current === replyModalPost.id ? null : replyModalPost.id
                          )
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                          openCommentEmojiPickerPostId === replyModalPost.id
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-blue-50 dark:hover:bg-blue-950/40'
                        }`}
                        title="Emoji"
                      >
                        <SmilePlus className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        title="Enquete preparada na migration"
                      >
                        <Sparkles className="h-5 w-5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSubmitReplyModal(replyModalPost.id)}
                      disabled={
                        submittingCommentPostId === replyModalPost.id ||
                        (!commentInputs[replyModalPost.id]?.trim() && !commentMediaDrafts[replyModalPost.id])
                      }
                      className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:scale-[1.02] hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                    >
                      {submittingCommentPostId === replyModalPost.id ? 'Enviando...' : 'Responder'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <GiftModal
        open={Boolean(giftRecipient)}
        recipient={giftRecipient}
        currentUserId={userId}
        onClose={() => setGiftRecipient(null)}
      />

      <TipModal
        open={Boolean(tipRecipient)}
        recipient={tipRecipient}
        currentUserId={userId}
        onClose={() => setTipRecipient(null)}
      />

      <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[104px]">
        <div className="mx-auto grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,40rem)_20rem]">
          <div className="min-w-0">
            {currentProfile && !currentProfile.show_sensitive_content && (
              <div className="mb-4 rounded-[1.5rem] border border-yellow-200/70 bg-yellow-50/80 px-4 py-3 text-sm text-yellow-800 shadow-sm ring-1 ring-yellow-100/70 dark:border-yellow-900/50 dark:bg-yellow-950/10 dark:text-yellow-300 dark:ring-yellow-900/20">
                {t('feed.sensitiveHiddenPrefix')}{' '}
                <Link href="/profile" className="font-semibold underline">
                  {t('nav.myProfile')}
                </Link>
                .
              </div>
            )}

            <div
              id="post-composer"
              className="mb-4 scroll-mt-24"
            >
              <PostComposer
                userName={currentProfile?.display_name || currentProfile?.username || email || t('common.user')}
                userAvatarUrl={currentProfile?.avatar_url || null}
                videoUploadLimitBytes={videoUploadLimit.maxSizeBytes}
                userTier={videoUploadLimit.tier}
                submitting={uploadingPostImage || uploadingPostVideo}
                onSubmit={handleCreatePost}
              />

              {message && (
                <p className="mt-4 rounded-[1.35rem] border border-zinc-200/70 bg-zinc-50/90 px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:text-zinc-300">
                  {message}
                </p>
              )}
            </div>

            <FeedInstallAppCard />

            <div className="space-y-3.5 sm:space-y-5">
              {visibleFeedItems.length === 0 && (
                <div className="rounded-[2rem] border border-zinc-200/70 bg-white/90 p-5 text-zinc-500 shadow-sm shadow-black/5 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:text-zinc-400 sm:p-6">
                  {hasSearch ? localTexts.mural.noSearchResults : t('feed.noPosts')}
                </div>
              )}

              {visibleFeedItems.map((item) => {
                const post = item.post

                const postComments = commentsByPostId.get(post.id) || []
                const postLikes = likesByPostId.map.get(post.id) || []
                const postReposts = repostsByPostId.map.get(post.id) || []
                const userLiked = likesByPostId.likedByCurrentUser.has(post.id)
                const postSaved = savedPostIds.has(post.id)
                const postReposted = repostsByPostId.repostedByCurrentUser.has(post.id)

                const isEditing = editingPostId === post.id
                const hasActiveCommentState = postComments.some(
                  (comment) => comment.id === editingCommentId || comment.id === openCommentMenuId
                )

                const authorName =
                  post.profiles?.display_name || post.profiles?.username || t('common.user')

                const authorUsername = post.profiles?.username || t('common.username')
                const authorAvatar = post.profiles?.avatar_url || ''
                const authorTier = resolveUserTier({
                  vipStatus: post.profiles?.vip_status,
                  vipExpiresAt: post.profiles?.vip_expires_at,
                  badgeSlugs: tierBadgeSlugsByUserId[post.user_id],
                })
                const isOwnPost = post.user_id === userId
                const isBlockedRelation = blockedUserIds.includes(post.user_id)
                const isFollowingAuthor = followStateMap.get(post.user_id) || false
                const isHighlighted = highlightedPostId === post.id
                const postMedia = getPostMedia(post)
                const isSharedGiftPost = post.category === 'gift_received'

                const isSensitivePostItem = isSensitivePost(post)

                const shouldShowSensitiveWarning =
                  isSensitivePostItem && !currentProfile?.show_sensitive_content

                const reposterName =
                  item.type === 'repost'
                    ? item.repost.profiles?.display_name ||
                    item.repost.profiles?.username ||
                    t('common.user')
                    : ''

                const reposterUsername =
                  item.type === 'repost'
                    ? item.repost.profiles?.username || t('common.username')
                    : t('common.username')

                const reposterAvatar =
                  item.type === 'repost' ? item.repost.profiles?.avatar_url || '' : ''

                return (
                  <FeedWindowItem
                    key={item.id}
                    forceActive={isHighlighted || isEditing || hasActiveCommentState || replyModalPostId === post.id}
                  >
                    {(isNearViewport) => (
                  <article
                    id={item.type === 'post' ? `post-${post.id}` : `repost-${item.id}`}
                    className={`group relative overflow-hidden rounded-[1.65rem] border bg-white/95 p-3.5 shadow-sm shadow-black/5 ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_42%)] before:opacity-0 before:transition-opacity before:duration-300 hover:border-blue-400/50 hover:shadow-2xl hover:shadow-blue-500/10 hover:before:opacity-100 dark:bg-slate-950/85 dark:ring-white/10 sm:rounded-[2rem] sm:p-6 md:hover:-translate-y-1 ${isHighlighted
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:border-blue-400 dark:ring-blue-900'
                        : 'border-zinc-200/70 dark:border-zinc-800/70'
                      } ${getUserTierSurfaceClassName(authorTier)}`}
                  >
                    {item.type === 'repost' && (
                      <Link
                        href={`/u/${reposterUsername}`}
                        className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700 transition hover:opacity-80 dark:bg-green-950/30 dark:text-green-300"
                      >
                        {reposterAvatar ? (
                          <img
                            src={reposterAvatar}
                            alt={reposterName}
                            className="h-7 w-7 rounded-full border border-green-200 object-cover dark:border-green-800"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-green-200 bg-green-50 text-xs font-bold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                            {reposterName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <Repeat2 className="h-4 w-4" />

                        <span className="inline-flex min-w-0 items-center gap-1">
                          <UserBadges userId={item.repost.user_id} size="sm" max={1} />

                          <span className="truncate">
                            {item.repost.user_id === userId
                              ? t('postCard.youReposted')
                              : t('postCard.repostedBy').replace('{name}', reposterName)}
                          </span>
                        </span>
                      </Link>
                    )}

                    <div className="mb-3 flex items-start justify-between gap-3">
                      <Link
                        href={`/u/${authorUsername}`}
                        className="flex min-w-0 items-center gap-3 transition hover:opacity-80"
                      >
                        <UserTierFrame tier={authorTier} className="h-12 w-12">
                          {authorAvatar ? (
                            <img
                              src={authorAvatar}
                              alt={authorName}
                              className="h-full w-full rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {authorName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </UserTierFrame>

                        <div className="min-w-0">
                          <p className="inline-flex max-w-full items-center gap-1 font-semibold text-black dark:text-white">
                            <UserTierBadge tier={authorTier} />
                            <UserBadges userId={post.user_id} size="sm" max={1} excludeTierBadges={authorTier !== 'standard'} />

                            <span className="min-w-0 break-words">
                              {authorName}
                            </span>
                          </p>

                          <p className="break-all text-sm text-zinc-500">
                            @{authorUsername}
                          </p>
                        </div>
                      </Link>

                      <PostMoreMenu
                        isOwnPost={isOwnPost}
                        copied={copiedPostId === post.id}
                        reported={reportedPostIds.includes(post.id)}
                        reporting={reportingPostId === post.id}
                        onCopy={() => handleCopyPostLink(post.id)}
                        onEdit={() => handleStartEdit(post)}
                        onDelete={() => handleDeletePost(post.id)}
                        onReport={() => handleReportPost(post.id, post.user_id)}
                      />
                    </div>

                    {!isOwnPost && !isBlockedRelation && (
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() => handleToggleFollow(post.user_id)}
                          disabled={followLoadingUserId === post.user_id}
                          className={`rounded-full px-4 py-2 text-sm font-bold shadow-sm transition ${isFollowingAuthor
                              ? 'border border-zinc-200 bg-white/80 text-zinc-800 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-200 dark:hover:bg-zinc-900'
                              : 'bg-zinc-950 text-white hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black'
                            } ${followLoadingUserId === post.user_id
                              ? 'cursor-not-allowed opacity-60'
                              : ''
                            }`}
                        >
                          {followLoadingUserId === post.user_id
                            ? t('common.loading')
                            : isFollowingAuthor
                              ? t('postCard.following')
                              : t('postCard.follow')}
                        </button>
                      </div>
                    )}

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <p className="text-sm text-zinc-500">
                        {post.category === 'gift_received'
                          ? 'Presente recebido'
                          : t(getCategoryKey(post.category))}
                      </p>

                      <span className="rounded-full bg-zinc-100/80 px-2.5 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-zinc-900/80 dark:text-zinc-300 dark:ring-zinc-800/70">
                        {getVisibilityLabel(post.visibility)}
                      </span>

                      {isSensitivePostItem && (
                        <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-700 ring-1 ring-yellow-200/80 dark:bg-yellow-950/30 dark:text-yellow-300 dark:ring-yellow-900/60">
                          18+
                        </span>
                      )}

                      {postReposted && (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 ring-1 ring-green-200/80 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/60">
                          {t('postStatus.reposted')}
                        </span>
                      )}

                      {postSaved && (
                        <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-700 ring-1 ring-yellow-200/80 dark:bg-yellow-950/30 dark:text-yellow-300 dark:ring-yellow-900/60">
                          {t('postStatus.saved')}
                        </span>
                      )}

                      {isHighlighted && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200/80 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/60">
                          {t('postStatus.highlighted')}
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mb-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-28 w-full resize-none rounded-[1.5rem] border border-zinc-200/80 bg-zinc-100/70 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:focus:border-blue-500/70 dark:focus:bg-zinc-950 sm:text-base"
                        />

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            onClick={() => handleSaveEdit(post.id)}
                            disabled={savingEdit}
                            className={`w-full rounded-full px-5 py-2.5 font-bold shadow-sm transition sm:w-auto ${savingEdit
                                ? 'cursor-not-allowed bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                                : 'bg-zinc-950 text-white hover:scale-[1.02] hover:bg-black dark:bg-white dark:text-black'
                              }`}
                          >
                            {savingEdit ? t('common.saving') : t('common.save')}
                          </button>

                          <button
                            onClick={handleCancelEdit}
                            className="w-full rounded-full border border-zinc-200 bg-white/70 px-5 py-2.5 font-bold text-zinc-900 transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-white dark:hover:bg-zinc-900 sm:w-auto"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {shouldShowSensitiveWarning ? (
                          <SensitiveContent>
                            {isSharedGiftPost ? (
                              <DeferredFeedSection active={isNearViewport} minHeight={FEED_MEDIA_PLACEHOLDER_HEIGHT}>
                                <SharedGiftFeedCard post={post} />
                              </DeferredFeedSection>
                            ) : post.content && (
                              <LinkedPostText
                                content={post.content}
                                className="mb-3 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
                              />
                            )}

                            <TranslatePostButton content={post.content} />

                            <LinkPreview content={post.content} enableExternalEmbeds />

                            {!isSharedGiftPost && postMedia.length > 0 && (
                              <DeferredFeedSection active={isNearViewport} minHeight={FEED_MEDIA_PLACEHOLDER_HEIGHT}>
                                <PostMediaGallery media={postMedia} />
                              </DeferredFeedSection>
                            )}
                          </SensitiveContent>
                        ) : (
                          <>
                            {isSharedGiftPost ? (
                              <DeferredFeedSection active={isNearViewport} minHeight={FEED_MEDIA_PLACEHOLDER_HEIGHT}>
                                <SharedGiftFeedCard post={post} />
                              </DeferredFeedSection>
                            ) : post.content && (
                              <LinkedPostText
                                content={post.content}
                                className="mb-3 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
                              />
                            )}

                            <TranslatePostButton content={post.content} />

                            <LinkPreview content={post.content} enableExternalEmbeds />

                            {!isSharedGiftPost && postMedia.length > 0 && (
                              <DeferredFeedSection active={isNearViewport} minHeight={FEED_MEDIA_PLACEHOLDER_HEIGHT}>
                                <PostMediaGallery media={postMedia} />
                              </DeferredFeedSection>
                            )}
                          </>
                        )}
                      </>
                    )}

                    <PostActions
                      commentsCount={postComments.length}
                      likesCount={postLikes.length}
                      repostsCount={postReposts.length}
                      liked={userLiked}
                      reposted={postReposted}
                      saved={postSaved}
                      copied={copiedPostId === post.id}
                      showGift={post.user_id !== userId}
                      showTip={post.user_id !== userId}
                      onLike={() => handleToggleLike(post.id)}
                      onCommentClick={() => handleOpenReplyModal(post.id)}
                      onRepost={() => handleToggleRepost(post.id)}
                      onSave={() => handleToggleBookmark(post.id)}
                      onGift={() =>
                        setGiftRecipient({
                          id: post.user_id,
                          name: authorName,
                          username: post.profiles?.username,
                          avatarUrl: authorAvatar,
                        })
                      }
                      onTip={() =>
                        setTipRecipient({
                          id: post.user_id,
                          name: authorName,
                          username: post.profiles?.username,
                          avatarUrl: authorAvatar,
                        })
                      }
                      onShare={() => handleCopyPostLink(post.id)}
                    />

                    <p className="mb-4 mt-3 text-xs text-zinc-500 dark:text-zinc-600">
                      {item.type === 'repost'
                        ? `${t('feed.repostedAt')} ${new Date(item.repost.created_at).toLocaleString(getDateLocale(language))}`
                        : new Date(post.created_at).toLocaleString(getDateLocale(language))}
                    </p>

                    <DeferredFeedSection active={isNearViewport} minHeight={FEED_COMMENTS_PLACEHOLDER_HEIGHT}>
                    <div className="mt-4 border-t border-zinc-200/70 pt-4 dark:border-zinc-800/70">
                      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {t('feed.comments')}
                      </h3>

                      <div className="mb-4 space-y-3">
                        {postComments.length === 0 && (
                          <p className="text-sm text-zinc-500">
                            {t('feed.noComments')}
                          </p>
                        )}

                        {postComments.map((comment) => {
                          const commentAuthorName =
                            comment.profiles?.display_name ||
                            comment.profiles?.username ||
                            t('common.user')

                          const commentAuthorUsername =
                            comment.profiles?.username || t('common.username')

                          const commentAuthorAvatar =
                            comment.profiles?.avatar_url || ''

                          const commentIsMine = comment.user_id === userId
                          const isEditingThisComment = editingCommentId === comment.id

                          const likesForComment = commentLikesByCommentId.map.get(comment.id) || []
                          const userLikedComment = commentLikesByCommentId.likedByCurrentUser.has(comment.id)

                          return (
                            <div
                              key={comment.id}
                              className="rounded-[1.5rem] bg-zinc-50/90 px-4 py-3 text-sm ring-1 ring-zinc-200/60 transition hover:bg-zinc-100/80 dark:bg-zinc-900/80 dark:ring-zinc-800/70 dark:hover:bg-zinc-900"
                            >
                              <div className="flex items-start gap-3">
                                <Link
                                  href={`/u/${commentAuthorUsername}`}
                                  className="shrink-0 transition hover:opacity-80"
                                >
                                  {commentAuthorAvatar ? (
                                    <img
                                      src={commentAuthorAvatar}
                                      alt={commentAuthorName}
                                      className="h-10 w-10 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                                    />
                                  ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                      {commentAuthorName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </Link>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <Link
                                      href={`/u/${commentAuthorUsername}`}
                                      className="block min-w-0 transition hover:opacity-80"
                                    >
                                      <p className="inline-flex max-w-full items-center gap-1 font-semibold text-black dark:text-white">
                                        <UserBadges userId={comment.user_id} size="sm" max={1} />

                                        <span className="min-w-0 break-words">
                                          {commentAuthorName}
                                        </span>
                                      </p>

                                      <p className="break-all text-xs text-zinc-500">
                                        @{commentAuthorUsername}
                                      </p>
                                    </Link>

                                    {commentIsMine && (
                                      <div className="relative shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setOpenCommentMenuId((current) =>
                                              current === comment.id ? null : comment.id
                                            )
                                          }
                                          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                          aria-label={t('feed.commentOptions')}
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </button>

                                        {openCommentMenuId === comment.id && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => setOpenCommentMenuId(null)}
                                              className="fixed inset-0 z-40 cursor-default"
                                              aria-label={t('common.closeMenu')}
                                            />

                                            <div className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-[1.35rem] border border-zinc-200/70 bg-white/95 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-zinc-700/70 dark:bg-zinc-950/95">
                                              <button
                                                type="button"
                                                onClick={() => handleStartEditComment(comment)}
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                                              >
                                                <Edit3 className="h-4 w-4" />
                                                {t('feed.editComment')}
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => handleDeleteComment(comment.id)}
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                                {t('feed.deleteComment')}
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {isEditingThisComment ? (
                                    <div className="mt-3">
                                      <textarea
                                        value={editCommentContent}
                                        onChange={(e) => setEditCommentContent(e.target.value)}
                                          className="min-h-24 w-full resize-none rounded-[1.35rem] border border-zinc-200/80 bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-950 dark:text-white"
                                      />

                                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveCommentEdit(comment.id)}
                                          disabled={savingCommentId === comment.id}
                                          className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition hover:scale-[1.02] hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black"
                                        >
                                          {savingCommentId === comment.id
                                            ? t('common.saving')
                                            : t('common.save')}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={handleCancelEditComment}
                                          className="rounded-full border border-zinc-200 bg-white/70 px-4 py-2 text-sm font-bold transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                                        >
                                          {t('common.cancel')}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="mt-2 break-words text-zinc-800 dark:text-zinc-200">
                                      {comment.content}
                                    </p>
                                  )}

                                  {!isEditingThisComment && comment.media && comment.media.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {comment.media.map((mediaItem) => (
                                        <div
                                          key={mediaItem.id}
                                          className="overflow-hidden rounded-[1.25rem] border border-blue-400/15 bg-black shadow-sm shadow-blue-950/10"
                                        >
                                          {mediaItem.media_type === 'video' ? (
                                            <video
                                              src={mediaItem.media_url}
                                              controls
                                              playsInline
                                              preload="none"
                                              className="max-h-80 w-full bg-black object-contain"
                                            />
                                          ) : (
                                            <img
                                              src={mediaItem.media_url}
                                              loading="lazy"
                                              decoding="async"
                                              alt={mediaItem.media_type === 'gif' ? 'GIF do comentário' : 'Imagem do comentário'}
                                              className="max-h-80 w-full object-contain"
                                            />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="mt-2 flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCommentLike(comment.id)}
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition ${userLikedComment
                                          ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                                          : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                      <span>{userLikedComment ? '♥' : '♡'}</span>
                                      <span>{likesForComment.length}</span>
                                    </button>

                                    <p className="text-xs text-zinc-500">
                                      {new Date(comment.created_at).toLocaleString(getDateLocale(language))}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpenReplyModal(post.id)}
                          className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:scale-[1.02] hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                        >
                          Responder
                        </button>
                      </div>
                    </div>
                    </DeferredFeedSection>
                  </article>
                    )}
                  </FeedWindowItem>
                )
              })}
            </div>

            {!hasSearch && (
              <div ref={loadMoreSentinelRef} className="py-5 text-center">
                {isLoadingMore ? (
                  <div className="mx-auto max-w-xl rounded-[1.5rem] border border-zinc-200/70 bg-white/85 p-4 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/80">
                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                      Carregando mais posts...
                    </p>
                  </div>
                ) : loadMoreError ? (
                  <div className="mx-auto max-w-xl rounded-[1.5rem] border border-red-200 bg-red-50/90 p-4 text-red-700 shadow-sm dark:border-red-900/70 dark:bg-red-950/25 dark:text-red-200">
                    <p className="text-sm font-semibold">{loadMoreError}</p>
                    <button
                      type="button"
                      onClick={loadMorePosts}
                      className="mt-3 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : hasMorePosts ? (
                  <button
                    type="button"
                    onClick={loadMorePosts}
                    className="rounded-full border border-blue-300/30 bg-blue-500/10 px-5 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-500 hover:text-white dark:text-blue-200 dark:hover:text-white"
                  >
                    Carregar mais
                  </button>
                ) : posts.length > 0 ? (
                  <p className="rounded-full border border-zinc-200/70 bg-white/75 px-4 py-2 text-sm font-semibold text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-950/70 dark:text-zinc-400">
                    Voce chegou ao fim por enquanto.
                  </p>
                ) : null}
              </div>
            )}

          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-8 space-y-4">
              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <div className="mb-3 flex items-center gap-2">
                  <Search className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                  <h2 className="text-lg font-black text-zinc-950 dark:text-white">
                    {localTexts.mural.searchTitle}
                  </h2>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />

                  <input
                    type="text"
                    value={feedSearch}
                    onChange={(e) => setFeedSearch(e.target.value)}
                    placeholder={localTexts.mural.searchPlaceholder}
                    className="w-full rounded-full border border-zinc-200/70 bg-zinc-100/80 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800/70 dark:bg-zinc-900 dark:text-white dark:focus:border-blue-500/70 dark:focus:bg-zinc-950"
                  />
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {localTexts.mural.searchHelper}
                </p>
              </div>

              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-sm shadow-black/10 ring-1 ring-white/10 backdrop-blur-xl transition-all duration-300 hover:border-blue-400/35 hover:shadow-xl hover:shadow-blue-500/10">
                <div className="space-y-4 p-5">
                  {feedHighlights.length > 0 && (
                    <div className="rounded-[1.5rem] border border-blue-400/20 bg-blue-950/20 p-4 ring-1 ring-white/10">
                      <div className="mb-3 flex items-center gap-2 text-blue-200">
                        <Trophy className="h-5 w-5" />
                        <h3 className="font-bold">Destaques da Comunidade</h3>
                      </div>

                      <div className="space-y-3">
                        {feedHighlights.map((highlight) => {
                          const href = highlight.post_id
                            ? `/post/${highlight.post_id}`
                            : highlight.community_challenges?.slug
                              ? `/challenges/${highlight.community_challenges.slug}`
                              : '/challenges'
                          const title =
                            highlight.title ||
                            highlight.community_challenges?.title ||
                            'Post em destaque'
                          const description =
                            highlight.description ||
                            highlight.posts?.content ||
                            'Selecionado pelos desafios da comunidade.'

                          return (
                            <Link
                              key={highlight.id}
                              href={href}
                              className="block rounded-[1.25rem] border border-white/10 bg-black/30 p-3 transition hover:-translate-y-0.5 hover:border-blue-300/35 hover:bg-blue-950/30"
                            >
                              <p className="font-bold text-blue-50">{title}</p>
                              <p className="mt-1 line-clamp-2 text-sm leading-5 text-blue-100/70">
                                {description}
                              </p>
                            </Link>
                          )
                        })}
                      </div>

                      <Link
                        href="/challenges"
                        className="mt-4 inline-flex rounded-full bg-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-500/25 transition hover:bg-blue-400"
                      >
                        Ver desafios
                      </Link>
                    </div>
                  )}

                  <Link
                    href="/lab"
                    className="group relative block overflow-hidden rounded-[1.5rem] border border-blue-400/20 bg-blue-950/20 p-4 ring-1 ring-white/10 transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.26),transparent_48%)] before:opacity-70 before:transition-opacity hover:-translate-y-1 hover:border-blue-400/50 hover:bg-blue-950/35 hover:shadow-xl hover:shadow-blue-500/20 hover:before:opacity-100"
                  >
                    <div className="mb-3 flex items-center gap-2 text-blue-200">
                      <FlaskConical className="h-5 w-5" />
                      <h3 className="font-bold">
                        {localTexts.mural.labTitle}
                      </h3>
                    </div>

                    <p className="text-sm leading-6 text-blue-100/80">
                      {localTexts.mural.labDescription}
                    </p>

                    <span className="mt-4 inline-flex rounded-full bg-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-500/25 transition group-hover:bg-blue-400">
                      {localTexts.mural.labButton}
                    </span>
                  </Link>

                  <Link
                    href="/profile"
                    className="group relative block overflow-hidden rounded-[1.5rem] border border-yellow-400/20 bg-yellow-950/15 p-4 ring-1 ring-white/10 transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_46%)] before:opacity-60 before:transition-opacity hover:-translate-y-1 hover:border-blue-400/40 hover:bg-yellow-950/25 hover:shadow-xl hover:shadow-blue-500/15 hover:before:opacity-100"
                  >
                    <div className="mb-3 flex items-center gap-2 text-yellow-200">
                      <Award className="h-5 w-5" />
                      <h3 className="font-bold">
                        Selos EntreUS
                      </h3>
                    </div>

                    <p className="text-sm leading-6 text-yellow-100/80">
                      Ganhe destaque na comunidade com selos especiais, como Engajador, VIP Premium e Ancião.
                    </p>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-yellow-300/20 bg-black/40 shadow-lg shadow-blue-500/10 ring-1 ring-blue-400/10">
                      <video
                        src="/selos-entreus.mp4"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="none"
                        className="aspect-video max-h-40 w-full object-cover"
                      />
                    </div>

                    <span className="mt-4 inline-flex rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-black shadow-sm shadow-yellow-500/20 transition group-hover:bg-yellow-300">
                      Ver meus selos
                    </span>
                  </Link>

                  <div className="group relative overflow-hidden rounded-[1.5rem] border border-green-400/20 bg-green-950/15 p-4 ring-1 ring-white/10 transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_46%)] before:opacity-60 before:transition-opacity hover:-translate-y-1 hover:border-blue-400/35 hover:bg-green-950/25 hover:shadow-xl hover:shadow-blue-500/15 hover:before:opacity-100">
                    <div className="mb-3 flex items-center gap-2 text-green-200">
                      <Heart className="h-5 w-5" />
                      <h3 className="font-bold">
                        Apoie o projeto
                      </h3>
                    </div>

                    <p className="text-sm leading-6 text-green-100/80">
                      Ajude o EntreUS Lab a continuar evoluindo com ferramentas gratuitas. Se puder, prefira Pix Nubank, pois não tem taxa para o projeto.
                    </p>

                    <div className="mt-4 space-y-3">
                      <a
                        href="https://nubank.com.br/cobrar/u2kum/69fca421-184d-459c-a125-f760fc56c264"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-full bg-green-500 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-green-500/20 transition hover:bg-green-400"
                      >
                        <Landmark className="h-4 w-4" />
                        Pix Nubank — sem taxa
                      </a>

                      <a
                        href="https://link.mercadopago.com.br/entreuslab"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-full border border-green-400/30 bg-white/[0.03] px-4 py-2 text-sm font-bold text-green-100 transition hover:border-green-300/50 hover:bg-green-900/40"
                      >
                        <CreditCard className="h-4 w-4" />
                        Mercado Pago — pode ter taxa
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/95 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/80 dark:ring-white/10">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-lg font-black text-zinc-950 dark:text-white">
                    {localTexts.mural.newsTitle}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-3 rounded-[1.35rem] bg-zinc-50/90 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/80 dark:ring-zinc-800/70">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {localTexts.mural.newsOne}
                    </p>
                  </div>

                  <div className="flex gap-3 rounded-[1.35rem] bg-zinc-50/90 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/80 dark:ring-zinc-800/70">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {localTexts.mural.newsTwo}
                    </p>
                  </div>

                  <div className="flex gap-3 rounded-[1.35rem] bg-zinc-50/90 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/80 dark:ring-zinc-800/70">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black">
                      <FlaskConical className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {localTexts.mural.newsThree}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/70 bg-white/80 p-5 text-sm leading-6 text-zinc-500 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/60 dark:text-zinc-400 dark:ring-white/10">
                <div className="mb-2 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">
                  <MessageCircle className="h-4 w-4" />
                  EntreUS
                </div>
                O mural é uma área experimental. Depois podemos colocar criadores em destaque, anúncios internos, ItaCash, eventos, lives e novidades da comunidade.
              </div>

              <div className="rounded-[1.5rem] border border-zinc-200/60 bg-white/70 p-4 text-sm leading-6 text-zinc-500 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/45 dark:text-zinc-400 dark:ring-white/10">
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {institutionalLinks.map((item, index) => (
                    <span key={item.href} className="inline-flex items-center gap-2">
                      <Link
                        href={item.href}
                        className="font-semibold text-zinc-500 underline-offset-4 transition hover:text-blue-500 hover:underline dark:text-zinc-400 dark:hover:text-blue-300"
                      >
                        {item.label}
                      </Link>
                      {index < institutionalLinks.length - 1 && (
                        <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      )}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                  © 2026 EntreUS
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default function FeedPage() {
  const { t } = useLanguage()

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white px-4 text-black dark:bg-black dark:text-white">
          <p>{t('feed.loading')}</p>
        </main>
      }
    >
      <FeedContent />
    </Suspense>
  )
}
