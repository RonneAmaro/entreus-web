'use client'

import PostComposer from '../components/PostComposer'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import PostMoreMenu from '../components/PostMoreMenu'
import PostMediaGallery from '../components/PostMediaGallery'
import PostActions from '../components/PostActions'
import LinkPreview, { LinkedPostText } from '../components/LinkPreview'
import SensitiveContent from '../components/SensitiveContent'
import UserBadges from '../components/UserBadges'
import TranslatePostButton from '../components/TranslatePostButton'
import Link from 'next/link'
import {
  Award,
  CreditCard,
  Edit3,
  FlaskConical,
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
  Trash2,
} from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '../components/LanguageProvider'

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
}

type ProfileSummary = {
  username: string
  display_name: string | null
  avatar_url: string | null
}

type PostMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video'
  position: number
  created_at?: string
}

type Post = {
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

function getCategoryKey(value: string | null) {
  if (!value) return 'categories.uncategorized'
  return `categories.${value}`
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

  const [uploadingPostImage, setUploadingPostImage] = useState(false)
  const [uploadingPostVideo, setUploadingPostVideo] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [commentLikes, setCommentLikes] = useState<CommentLike[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])
  const [feedSearch, setFeedSearch] = useState('')

  const likeActionInProgressRef = useRef<Set<string>>(new Set())

  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [follows, setFollows] = useState<Follow[]>([])
  const [followLoadingUserId, setFollowLoadingUserId] = useState<string | null>(null)

  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [commentMediaDrafts, setCommentMediaDrafts] = useState<Record<string, CommentMediaDraft | null>>({})
  const [commentGifInputs, setCommentGifInputs] = useState<Record<string, string>>({})
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

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, show_sensitive_content')
        .eq('id', user.id)
        .single()

      const loadedCurrentProfile: CurrentProfile | null =
        !profileError && profileData
          ? {
            username: profileData.username,
            display_name: profileData.display_name,
            avatar_url: profileData.avatar_url,
            show_sensitive_content: profileData.show_sensitive_content || false,
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

      await Promise.all([
        loadPosts(user.id, blockedIds, followsData, allowSensitiveContent),
        loadComments(blockedIds),
        loadLikes(),
        loadCommentLikes(),
        loadBookmarks(user.id),
        loadReposts(blockedIds),
        loadUnreadNotificationsCount(user.id),
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

  async function loadReposts(currentBlockedIds: string[] = blockedUserIds) {
    const { data, error } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('feed.messages.loadRepostsError') + error.message)
      return
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

    setReposts(normalizedReposts)
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
      post.category === 'sensual'
    )
  }

  async function loadPosts(
    currentUserId: string = userId,
    currentBlockedIds: string[] = blockedUserIds,
    currentFollows: Follow[] = follows,
    allowSensitiveContent: boolean = currentProfile?.show_sensitive_content || false
  ) {
    const { data, error } = await supabase
      .from('posts')
      .select(`
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
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('feed.messages.loadPostsError') + error.message)
      return
    }

    const rawPosts = (data || []).map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
      is_sensitive: post.is_sensitive || false,
      profiles: Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles,
    })) as Post[]

    const postIds = rawPosts.map((post) => post.id)

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
      .filter((post) => canSeePost(post, currentUserId, currentFollows))
      .filter((post) => {
        if (post.user_id === currentUserId) return true
        if (allowSensitiveContent) return true

        return !isSensitivePost(post)
      })

    setPosts(normalizedPosts)
  }

  async function loadComments(currentBlockedIds: string[] = blockedUserIds) {
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
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(t('feed.messages.loadCommentsError') + error.message)
      return
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

    setComments(
      normalizedComments.map((comment: Comment) => ({
        ...comment,
        media: mediaByComment[comment.id] || [],
      }))
    )
  }

  async function loadLikes() {
    const { data, error } = await supabase.from('likes').select('*')

    if (error) {
      setMessage(t('feed.messages.loadLikesError') + error.message)
      return
    }

    setLikes(data || [])
  }

  async function loadCommentLikes() {
    const { data, error } = await supabase
      .from('comment_likes')
      .select('id, comment_id, user_id')

    if (error) {
      setMessage(t('feed.messages.loadCommentLikesError') + error.message)
      return
    }

    setCommentLikes(data || [])
  }

  async function refreshAfterFollowChange() {
    const freshFollows = await loadFollows()
    setFollows(freshFollows)

    await loadPosts(
      userId,
      blockedUserIds,
      freshFollows,
      currentProfile?.show_sensitive_content || false
    )
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

  function isImage(file: File) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
  }

  function isVideo(file: File) {
    return ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)
  }

  async function uploadMediaFile(
    file: File
  ): Promise<{ url: string; type: 'image' | 'video' } | null> {
    if (!userId) return null

    const mediaType: 'image' | 'video' | null = isImage(file)
      ? 'image'
      : isVideo(file)
        ? 'video'
        : null

    if (mediaType === 'image') {
      const maxSizeInBytes = 5 * 1024 * 1024

      if (file.size > maxSizeInBytes) {
        setMessage(t('feed.messages.imageTooLarge'))
        return null
      }
    }

    if (mediaType === 'video') {
      const maxSizeInBytes = 30 * 1024 * 1024

      if (file.size > maxSizeInBytes) {
        setMessage(t('feed.messages.videoTooLarge'))
        return null
      }
    }

    if (!mediaType) {
      setMessage(t('feed.messages.unsupportedMedia'))
      return null
    }

    if (mediaType === 'image') {
      setUploadingPostImage(true)
    } else {
      setUploadingPostVideo(true)
    }

    try {
      const presignResponse = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          folder: 'posts',
        }),
      })

      const presignData = (await presignResponse.json().catch(() => null)) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        message?: string
        error?: string
      } | null

      if (!presignResponse.ok || !presignData?.ok || !presignData.uploadUrl || !presignData.publicUrl) {
        const errorMessage =
          presignData?.message || presignData?.error || 'Falha ao preparar upload para o R2.'

        setMessage(
          mediaType === 'image'
            ? t('feed.messages.uploadImageError') + errorMessage
            : t('feed.messages.uploadVideoError') + errorMessage
        )
        return null
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        console.error('Falha ao enviar mídia para o R2:', {
          fileName: file.name,
          contentType: file.type,
          sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
          status: uploadResponse.status,
        })

        const friendlyMessage =
          mediaType === 'video'
            ? 'Não foi possível enviar o vídeo. Tente novamente ou use um vídeo menor.'
            : 'Falha ao enviar mídia para o R2.'

        setMessage(
          mediaType === 'image'
            ? t('feed.messages.uploadImageError') + friendlyMessage
            : t('feed.messages.uploadVideoError') + friendlyMessage
        )
        return null
      }

      return {
        url: presignData.publicUrl,
        type: mediaType,
      }
    } catch (error) {
      const errorMessage =
        mediaType === 'video'
          ? 'Não foi possível enviar o vídeo. Tente novamente ou use um vídeo menor.'
          : error instanceof Error
            ? error.message
            : 'Erro inesperado no upload R2.'

      console.error('Erro ao enviar mídia do post:', {
        fileName: file.name,
        contentType: file.type,
        sizeMb: Number((file.size / 1024 / 1024).toFixed(2)),
        message: error instanceof Error ? error.message : 'Erro inesperado no upload R2.',
      })

      setMessage(
        mediaType === 'image'
          ? t('feed.messages.uploadImageError') + errorMessage
          : t('feed.messages.uploadVideoError') + errorMessage
      )
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
      return {
        url: draft.url,
        type: 'gif',
      }
    }

    if (!draft.file) return null

    const file = draft.file
    const mediaType: 'image' | 'video' | 'gif' | null =
      file.type === 'image/gif'
        ? 'gif'
        : isImage(file)
          ? 'image'
          : isVideo(file)
            ? 'video'
            : null

    if (!mediaType) {
      setMessage(t('feed.messages.unsupportedMedia'))
      return null
    }

    const maxSizeInBytes = mediaType === 'video' ? 30 * 1024 * 1024 : 5 * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setMessage(mediaType === 'video' ? t('feed.messages.videoTooLarge') : t('feed.messages.imageTooLarge'))
      return null
    }

    try {
      const presignResponse = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          folder: 'comments',
        }),
      })

      const presignData = (await presignResponse.json().catch(() => null)) as {
        ok?: boolean
        uploadUrl?: string
        publicUrl?: string
        message?: string
        error?: string
      } | null

      if (!presignResponse.ok || !presignData?.ok || !presignData.uploadUrl || !presignData.publicUrl) {
        setMessage(presignData?.message || presignData?.error || 'Falha ao preparar mídia do comentário.')
        return null
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        setMessage('Não foi possível enviar a mídia do comentário.')
        return null
      }

      return {
        url: presignData.publicUrl,
        type: mediaType,
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro inesperado no upload do comentário.')
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
      type: 'image' | 'video'
    }[] = []

    for (const file of finalMediaFiles) {
      const uploaded = await uploadMediaFile(file)

      if (!uploaded) {
        return false
      }

      uploadedMedia.push(uploaded)
    }

    const firstImage = uploadedMedia.find((item) => item.type === 'image')?.url || null
    const firstVideo = uploadedMedia.find((item) => item.type === 'video')?.url || null

    const { data: insertedPost, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: content.trim() || null,
        category,
        image_url: firstImage,
        video_url: firstVideo,
        visibility,
        is_sensitive: category === 'sensual' || category === 'adulto',
      })
      .select('id')
      .single()

    if (error) {
      setMessage(t('feed.messages.publishError') + error.message)
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
        setMessage(t('feed.messages.mediaSavePartial') + mediaError.message)

        await loadPosts(
          userId,
          blockedUserIds,
          follows,
          currentProfile?.show_sensitive_content || false
        )
        await loadComments()
        await loadLikes()
        await loadCommentLikes()
        await loadBookmarks(userId)
        await loadReposts(blockedUserIds)

        return false
      }
    }

    setMessage(t('feed.messages.publishedSuccess'))

    await loadPosts(
      userId,
      blockedUserIds,
      follows,
      currentProfile?.show_sensitive_content || false
    )
    await loadComments()
    await loadLikes()
    await loadCommentLikes()
    await loadBookmarks(userId)
    await loadReposts(blockedUserIds)

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

    await loadPosts(
      userId,
      blockedUserIds,
      follows,
      currentProfile?.show_sensitive_content || false
    )
    await loadComments()
    await loadLikes()
    await loadCommentLikes()
    await loadBookmarks(userId)
    await loadReposts(blockedUserIds)
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

    await loadPosts(
      userId,
      blockedUserIds,
      follows,
      currentProfile?.show_sensitive_content || false
    )
  }

  async function handleCreateComment(postId: string) {
    const text = commentInputs[postId]?.trim()
    const mediaDraft = commentMediaDrafts[postId]

    if (!text && !mediaDraft) {
      setMessage(t('feed.messages.emptyComment'))
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
      return
    }

    if (insertedComment?.id && mediaDraft) {
      const uploadedCommentMedia = await uploadCommentMediaFile(mediaDraft)

      if (!uploadedCommentMedia) return

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
      setMessage(t('feed.messages.unsupportedMedia'))
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
          type: file.type === 'image/gif' ? 'gif' : isVideo(file) ? 'video' : 'image',
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

    if (!/^https?:\/\/.{1,500}$/i.test(gifUrl)) {
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

  const replyModalPost = useMemo(() => {
    if (!replyModalPostId) return null

    return posts.find((post) => post.id === replyModalPostId) || null
  }, [posts, replyModalPostId])

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>{t('feed.loading')}</p>
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
                          preload="metadata"
                          className="max-h-72 w-full bg-black object-contain"
                        />
                      ) : (
                        <img
                          src={commentMediaDrafts[replyModalPost.id]?.url}
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
                          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
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
                      disabled={!commentInputs[replyModalPost.id]?.trim() && !commentMediaDrafts[replyModalPost.id]}
                      className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:scale-[1.02] hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                    >
                      Responder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="w-full overflow-x-hidden px-3 py-16 pb-24 sm:px-6 sm:py-20 lg:mx-auto lg:max-w-[1280px] lg:px-0 lg:py-8 lg:pl-[290px]">
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
                submitting={uploadingPostImage || uploadingPostVideo}
                onSubmit={handleCreatePost}
              />

              {message && (
                <p className="mt-4 rounded-[1.35rem] border border-zinc-200/70 bg-zinc-50/90 px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:text-zinc-300">
                  {message}
                </p>
              )}
            </div>

            <div className="space-y-3.5 sm:space-y-5">
              {visibleFeedItems.length === 0 && (
                <div className="rounded-[2rem] border border-zinc-200/70 bg-white/90 p-5 text-zinc-500 shadow-sm shadow-black/5 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:text-zinc-400 sm:p-6">
                  {hasSearch ? localTexts.mural.noSearchResults : t('feed.noPosts')}
                </div>
              )}

              {visibleFeedItems.map((item) => {
                const post = item.post

                const postComments = comments.filter((comment) => comment.post_id === post.id)
                const postLikes = likes.filter((like) => like.post_id === post.id)
                const postReposts = reposts.filter((repost) => repost.post_id === post.id)

                const userLiked = likes.some(
                  (like) => like.post_id === post.id && like.user_id === userId
                )

                const postSaved = bookmarks.some(
                  (bookmark) => bookmark.post_id === post.id && bookmark.user_id === userId
                )

                const postReposted = reposts.some(
                  (repost) => repost.post_id === post.id && repost.user_id === userId
                )

                const isEditing = editingPostId === post.id

                const authorName =
                  post.profiles?.display_name || post.profiles?.username || t('common.user')

                const authorUsername = post.profiles?.username || t('common.username')
                const authorAvatar = post.profiles?.avatar_url || ''
                const isOwnPost = post.user_id === userId
                const isBlockedRelation = blockedUserIds.includes(post.user_id)
                const isFollowingAuthor = followStateMap.get(post.user_id) || false
                const isHighlighted = highlightedPostId === post.id
                const postMedia = getPostMedia(post)

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
                  <article
                    id={item.type === 'post' ? `post-${post.id}` : `repost-${item.id}`}
                    key={item.id}
                    className={`group relative overflow-hidden rounded-[1.65rem] border bg-white/95 p-3.5 shadow-sm shadow-black/5 ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_42%)] before:opacity-0 before:transition-opacity before:duration-300 hover:border-blue-400/50 hover:shadow-2xl hover:shadow-blue-500/10 hover:before:opacity-100 dark:bg-slate-950/85 dark:ring-white/10 sm:rounded-[2rem] sm:p-6 md:hover:-translate-y-1 ${isHighlighted
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:border-blue-400 dark:ring-blue-900'
                        : 'border-zinc-200/70 dark:border-zinc-800/70'
                      }`}
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
                        {authorAvatar ? (
                          <img
                            src={authorAvatar}
                            alt={authorName}
                            className="h-12 w-12 shrink-0 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {authorName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="inline-flex max-w-full items-center gap-1 font-semibold text-black dark:text-white">
                            <UserBadges userId={post.user_id} size="sm" max={1} />

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
                        {t(getCategoryKey(post.category))}
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
                            {post.content && (
                              <LinkedPostText
                                content={post.content}
                                className="mb-3 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
                              />
                            )}

                            <TranslatePostButton content={post.content} />

                            <LinkPreview content={post.content} />

                            <PostMediaGallery media={postMedia} />
                          </SensitiveContent>
                        ) : (
                          <>
                            {post.content && (
                              <LinkedPostText
                                content={post.content}
                                className="mb-3 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
                              />
                            )}

                            <TranslatePostButton content={post.content} />

                            <LinkPreview content={post.content} />

                            <PostMediaGallery media={postMedia} />
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
                      onLike={() => handleToggleLike(post.id)}
                      onCommentClick={() => handleOpenReplyModal(post.id)}
                      onRepost={() => handleToggleRepost(post.id)}
                      onSave={() => handleToggleBookmark(post.id)}
                      onShare={() => handleCopyPostLink(post.id)}
                    />

                    <p className="mb-4 mt-3 text-xs text-zinc-500 dark:text-zinc-600">
                      {item.type === 'repost'
                        ? `${t('feed.repostedAt')} ${new Date(item.repost.created_at).toLocaleString(getDateLocale(language))}`
                        : new Date(post.created_at).toLocaleString(getDateLocale(language))}
                    </p>

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

                          const likesForComment = commentLikes.filter(
                            (like) => like.comment_id === comment.id
                          )

                          const userLikedComment = likesForComment.some(
                            (like) => like.user_id === userId
                          )

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
                                              preload="metadata"
                                              className="max-h-80 w-full bg-black object-contain"
                                            />
                                          ) : (
                                            <img
                                              src={mediaItem.media_url}
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
                  </article>
                )
              })}
            </div>

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
                        preload="metadata"
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
