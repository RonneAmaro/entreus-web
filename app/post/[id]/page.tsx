'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PostCard from '@/app/components/PostCard'
import RichTextLinks from '@/app/components/RichTextLinks'
import { useLanguage } from '@/app/components/LanguageProvider'
import { isAdminRole } from '@/lib/admin'
import {
  isMissingPostModerationColumnError,
  isModeratedHidden,
  type ModeratedPostFields,
} from '@/lib/post-moderation'
import {
  canViewerSeePostClassification as canViewCommunity,
  getSafePostCommunity as normalizeCommunity,
  getSafePostContentRating as normalizeContentRating,
  isAdultPostClassification as isAdultCommunityOrRating,
} from '@/lib/post-classification'
import { canViewAdultContent } from '@/lib/content-access'
import { applyPostVisibilityFilters } from '@/lib/post-visibility'
import { isMissingPaidPostColumnError, isPaidPost } from '@/lib/paid-posts'
import { protectPostForViewer } from '@/lib/protected-post-access'
import { resolveUserTier } from '@/lib/user-tiers'

type VisibilityType = 'public' | 'followers' | 'private'

type Profile = {
  username: string
  display_name: string | null
  avatar_url: string | null
  vip_status?: string | null
  vip_expires_at?: string | null
  profile_theme?: string | null
}

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role?: string | null
  show_sensitive_content: boolean
  is_minor?: boolean | null
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
}

type PostMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string | null
  media_type: 'image' | 'video' | 'gif'
  position: number
  created_at?: string
  access_level?: string | null
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
  community_type?: string | null
  content_rating?: string | null
  is_paid?: boolean | null
  price_itacash?: number | null
  paid_unlocked?: boolean
  profiles: Profile | null
  media?: PostMedia[]
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  profiles: Profile | null
}

type CommentRow = Omit<Comment, 'profiles'> & {
  profiles: Profile | Profile[] | null
}

type Like = {
  id: string
  post_id: string
  user_id: string
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
}

const POST_SELECT_COMMUNITY_FIELDS = `
          community_type,
          content_rating,
`
const POST_SELECT_PAID_FIELDS = `
          is_paid,
          price_itacash,
`

function isMissingCommunityColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message || '').toLowerCase()
  return message.includes('community_type') || message.includes('content_rating')
}

function removePaidPostSelectFields(selectFields: string) {
  return selectFields.replace(POST_SELECT_PAID_FIELDS, '')
}

async function recordAuthorizedPostView(targetPostId: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) return

    const response = await fetch('/api/analytics/post-view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ postId: targetPostId, source: 'post' }),
    })

    if (!response.ok && process.env.NODE_ENV === 'development') {
      console.warn('[PostAnalytics] post view was not counted:', response.status)
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[PostAnalytics] failed to record post view:', error)
    }
  }
}

export default function PostPage() {
  const params = useParams()
  const router = useRouter()
  const { language, t } = useLanguage()
  const postId = typeof params.id === 'string' ? params.id : ''

  const [loggedUserId, setLoggedUserId] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)

  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])

  const [commentInput, setCommentInput] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingComment, setSendingComment] = useState(false)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)
  const [canInteract, setCanInteract] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [moderationHiddenDenied, setModerationHiddenDenied] = useState(false)
  const recordedPostViewsRef = useRef<Set<string>>(new Set())

  async function loadPostMediaRows(targetPostId: string) {
    const { data: mediaData, error: mediaError } = await supabase
      .from('post_media')
      .select('id, post_id, user_id, media_url, media_type, position, created_at, access_level')
      .eq('post_id', targetPostId)
      .order('position', { ascending: true })

    if (mediaError) {
      console.error('Erro ao carregar midias:', mediaError.message)
      return []
    }

    return (mediaData || []) as PostMedia[]
  }

  async function refreshPaidPostContent(targetPostId: string) {
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('content, image_url, video_url')
      .eq('id', targetPostId)
      .maybeSingle()
    const media = await loadPostMediaRows(targetPostId)

    if (postError) {
      console.warn('Nao foi possivel recarregar conteudo do post pago:', postError.message)
    }

    setPost((current) =>
      current && current.id === targetPostId
        ? { ...current, ...(postData || {}), media, paid_unlocked: true }
        : current,
    )

    await Promise.all([
      loadComments(),
      loadLikes(),
      loadReposts(),
      loggedUserId ? loadBookmarks(loggedUserId) : Promise.resolve(),
    ])
  }

  useEffect(() => {
    async function loadPostPage() {
      setLoading(true)
      setMessage('')
      setPermissionDenied(false)
      setModerationHiddenDenied(false)

      if (!postId) {
        setMessage(t('postPage.errors.invalidPost'))
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      const currentUserId = user?.id || ''
      setLoggedUserId(currentUserId)
      setCanInteract(!!currentUserId)

      let currentUserIsAdmin = false
      let adultViewer = {
        isMinor: true,
        wants18Plus: false,
        ageVerificationStatus: 'not_started',
      }

      if (currentUserId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url, role, show_sensitive_content, is_minor, wants_18_plus, age_verification_status')
          .eq('id', currentUserId)
          .maybeSingle()

        if (profileData) {
          currentUserIsAdmin = isAdminRole(profileData.role)
          adultViewer = {
            isMinor: profileData.is_minor,
            wants18Plus: profileData.wants_18_plus || false,
            ageVerificationStatus: profileData.age_verification_status || 'not_started',
          }
          setCurrentProfile({
            username: profileData.username,
            display_name: profileData.display_name,
            avatar_url: profileData.avatar_url,
            role: profileData.role || 'user',
            is_minor: profileData.is_minor,
            wants_18_plus: profileData.wants_18_plus || false,
            age_verification_status: profileData.age_verification_status || 'not_started',
            show_sensitive_content: canViewAdultContent({
              isMinor: profileData.is_minor,
              wants18Plus: profileData.wants_18_plus,
              ageVerificationStatus: profileData.age_verification_status,
            }),
          })
        }
      }

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
          ${POST_SELECT_COMMUNITY_FIELDS}
          ${POST_SELECT_PAID_FIELDS}
          moderation_status,
          moderated_at,
          moderated_by,
          moderation_reason,
          profiles (
            username,
            display_name,
            avatar_url,
            vip_status,
            vip_expires_at,
            profile_theme
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
          ${POST_SELECT_COMMUNITY_FIELDS}
          ${POST_SELECT_PAID_FIELDS}
          profiles (
            username,
            display_name,
            avatar_url,
            vip_status,
            vip_expires_at,
            profile_theme
          )
        `

      let { data: postData, error: postError } = await applyPostVisibilityFilters(supabase
        .from('posts')
        .select(postSelectWithModeration)
        .eq('id', postId), adultViewer, currentUserIsAdmin ? 'admin' : 'post-detail')
        .maybeSingle()

      if (postError && isMissingPaidPostColumnError(postError)) {
        const fallback = await applyPostVisibilityFilters(supabase
          .from('posts')
          .select(removePaidPostSelectFields(postSelectWithModeration))
          .eq('id', postId), adultViewer, currentUserIsAdmin ? 'admin' : 'post-detail')
          .maybeSingle()

        postData = fallback.data as typeof postData
        postError = fallback.error
      }

      if (postError && isMissingPostModerationColumnError(postError)) {
        const fallback = await applyPostVisibilityFilters(supabase
          .from('posts')
          .select(postSelectFallback)
          .eq('id', postId), adultViewer, currentUserIsAdmin ? 'admin' : 'post-detail')
          .maybeSingle()

        postData = fallback.data as typeof postData
        postError = fallback.error

        if (postError && isMissingPaidPostColumnError(postError)) {
          const paidFallback = await applyPostVisibilityFilters(supabase
            .from('posts')
            .select(removePaidPostSelectFields(postSelectFallback))
            .eq('id', postId), adultViewer, currentUserIsAdmin ? 'admin' : 'post-detail')
            .maybeSingle()

          postData = paidFallback.data as typeof postData
          postError = paidFallback.error
        }
      }

      if (postError && isMissingCommunityColumnError(postError)) {
        const fallback = await applyPostVisibilityFilters(supabase
          .from('posts')
          .select(removePaidPostSelectFields(postSelectWithModeration).replace(POST_SELECT_COMMUNITY_FIELDS, ''))
          .eq('id', postId), adultViewer, currentUserIsAdmin ? 'admin' : 'post-detail')
          .maybeSingle()

        postData = fallback.data as typeof postData
        postError = fallback.error
      }

      if (postError) {
        console.error('Erro ao carregar publicacao:', postError.message)
        setMessage(t('postPage.errors.loadPost'))
        setLoading(false)
        return
      }

      if (!postData) {
        setMessage(t('postPage.errors.notFound'))
        setLoading(false)
        return
      }

      const normalizedPost = {
        ...postData,
        visibility: (postData.visibility || 'public') as VisibilityType,
        is_sensitive: postData.is_sensitive || false,
        community_type: normalizeCommunity(postData.community_type),
        content_rating: normalizeContentRating(postData.content_rating),
        profiles: Array.isArray(postData.profiles)
          ? postData.profiles[0] || null
          : postData.profiles,
      } as Post

      const isHiddenByModeration = isModeratedHidden(normalizedPost)

      if (isHiddenByModeration && !currentUserIsAdmin) {
        setPost(protectPostForViewer({
          post: normalizedPost,
          viewerId: currentUserId,
          viewerProfile: adultViewer,
          isAdmin: currentUserIsAdmin,
          hasPaidUnlock: false,
        }))
        setPermissionDenied(true)
        setModerationHiddenDenied(true)
        setMessage(t('postPage.errors.moderatedHidden'))
        setLoading(false)
        return
      }

      if (
        isAdultCommunityOrRating(
          normalizedPost.community_type,
          normalizedPost.content_rating,
          normalizedPost.category,
        ) &&
        !currentUserIsAdmin &&
        normalizedPost.user_id !== currentUserId &&
        !canViewCommunity(
          adultViewer,
          normalizedPost.community_type,
          normalizedPost.content_rating,
          normalizedPost.category,
        )
      ) {
        setPost(protectPostForViewer({
          post: normalizedPost,
          viewerId: currentUserId,
          viewerProfile: adultViewer,
          isAdmin: currentUserIsAdmin,
          hasPaidUnlock: false,
        }))
        setPermissionDenied(true)
        setMessage(t('postPage.errors.accountRestricted'))
        setLoading(false)
        return
      }

      const canSee = await checkCanSeePost(normalizedPost, currentUserId)

      if (!canSee) {
        setPost(protectPostForViewer({
          post: normalizedPost,
          viewerId: currentUserId,
          viewerProfile: adultViewer,
          isAdmin: currentUserIsAdmin,
          canViewVisibility: false,
          hasPaidUnlock: false,
        }))
        setPermissionDenied(true)
        setMessage(t('postPage.errors.permissionDenied'))
        setLoading(false)
        return
      }

      let paidUnlocked = !isPaidPost(normalizedPost) || currentUserIsAdmin || normalizedPost.user_id === currentUserId

      if (!paidUnlocked && currentUserId) {
        const { data: unlock, error: unlockError } = await supabase
          .from('paid_post_unlocks')
          .select('id')
          .eq('post_id', normalizedPost.id)
          .eq('buyer_id', currentUserId)
          .maybeSingle()

        if (!unlockError && unlock) {
          paidUnlocked = true
        } else if (unlockError && !isMissingPaidPostColumnError(unlockError)) {
          console.warn('Nao foi possivel verificar desbloqueio de post pago:', unlockError.message)
        }
      }

      normalizedPost.paid_unlocked = paidUnlocked

      if (isPaidPost(normalizedPost) && !paidUnlocked) {
        setPost(protectPostForViewer({
          post: {
            ...normalizedPost,
            media: [],
            paid_unlocked: false,
          },
          viewerId: currentUserId,
          viewerProfile: adultViewer,
          isAdmin: currentUserIsAdmin,
          canViewVisibility: true,
          hasPaidUnlock: false,
        }))

        await Promise.all([
          loadLikes(),
          loadReposts(),
          currentUserId ? loadBookmarks(currentUserId) : Promise.resolve(),
        ])

        setLoading(false)
        return
      }

      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at, access_level')
        .eq('post_id', postId)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error('Erro ao carregar mídias:', mediaError.message)
      }

      normalizedPost.media = (mediaData || []) as PostMedia[]

      setPost(normalizedPost)

      await Promise.all([
        loadComments(),
        loadLikes(),
        loadReposts(),
        currentUserId ? loadBookmarks(currentUserId) : Promise.resolve(),
      ])

      setLoading(false)
    }

    loadPostPage()
  }, [postId])

  useEffect(() => {
    if (loading || !loggedUserId || !post || permissionDenied || moderationHiddenDenied) return

    const isAdmin = isAdminRole(currentProfile?.role)
    const paidLocked = isPaidPost(post) && !post.paid_unlocked && post.user_id !== loggedUserId && !isAdmin

    if (paidLocked || recordedPostViewsRef.current.has(post.id)) return

    recordedPostViewsRef.current.add(post.id)
    void recordAuthorizedPostView(post.id)
  }, [
    currentProfile?.role,
    loading,
    loggedUserId,
    moderationHiddenDenied,
    permissionDenied,
    post,
    post?.id,
    post?.is_paid,
    post?.paid_unlocked,
    post?.price_itacash,
    post?.user_id,
  ])

  async function checkCanSeePost(targetPost: Post, currentUserId: string) {
    if (targetPost.visibility === 'public') return true
    if (!currentUserId) return false
    if (targetPost.user_id === currentUserId) return true

    if (targetPost.visibility === 'private') return false

    if (targetPost.visibility === 'followers') {
      const { data: followData, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', targetPost.user_id)
        .maybeSingle()

      if (error) {
        console.error('Erro ao verificar permissao da publicação:', error.message)
        setMessage(t('postPage.errors.checkPermission'))
        return false
      }

      return !!followData
    }

    return false
  }

  async function loadComments() {
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
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro ao carregar comentários:', error.message)
      setMessage(t('postPage.errors.loadComments'))
      return
    }

    const normalizedComments = ((data || []) as CommentRow[]).map((comment) => ({
      ...comment,
      profiles: Array.isArray(comment.profiles)
        ? comment.profiles[0] || null
        : comment.profiles,
    })) as Comment[]

    setComments(normalizedComments)
  }

  async function loadLikes() {
    const { data, error } = await supabase
      .from('likes')
      .select('id, post_id, user_id')
      .eq('post_id', postId)

    if (error) {
      console.error('Erro ao carregar curtidas:', error.message)
      setMessage(t('postPage.errors.loadLikes'))
      return
    }

    setLikes(data || [])
  }

  async function loadBookmarks(currentUserId: string) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)
      .eq('post_id', postId)

    if (error) {
      console.error('Erro ao carregar salvos:', error.message)
      setMessage(t('postPage.errors.loadBookmarks'))
      return
    }

    setBookmarks(data || [])
  }

  async function loadReposts() {
    const { data, error } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao carregar reposts:', error.message)
      setMessage(t('postPage.errors.loadReposts'))
      return
    }

    setReposts(data || [])
  }

  async function handleToggleLike() {
    if (!loggedUserId) {
      router.push('/login')
      return
    }

    if (!post) return

    setMessage('')

    const existingLike = likes.find((like) => like.user_id === loggedUserId)

    if (existingLike) {
      setLikes((current) =>
        current.filter((like) => like.id !== existingLike.id)
      )

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        console.error('Erro ao remover curtida:', error.message)
        setMessage(t('postPage.errors.removeLike'))
        await loadLikes()
      }

      return
    }

    const optimisticLike: Like = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
    }

    setLikes((current) => [...current, optimisticLike])

    const { data, error } = await supabase
      .from('likes')
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select('id, post_id, user_id')
      .single()

    if (error) {
      console.error('Erro ao curtir publicação:', error.message)
      setMessage(t('postPage.errors.like'))
      await loadLikes()
      return
    }

    if (data) {
      setLikes((current) =>
        current.map((like) => (like.id === optimisticLike.id ? data : like))
      )
    }

    if (post.user_id !== loggedUserId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        actor_id: loggedUserId,
        type: 'like',
        post_id: postId,
      })
    }
  }

  async function handleToggleBookmark() {
    if (!loggedUserId) {
      router.push('/login')
      return
    }

    if (!post) return

    setMessage('')

    const existingBookmark = bookmarks.find(
      (bookmark) => bookmark.post_id === postId && bookmark.user_id === loggedUserId
    )

    if (existingBookmark) {
      setBookmarks((current) =>
        current.filter((bookmark) => bookmark.id !== existingBookmark.id)
      )

      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', loggedUserId)

      if (error) {
        console.error('Erro ao remover dos salvos:', error.message)
        setMessage(t('postPage.errors.removeBookmark'))
        await loadBookmarks(loggedUserId)
      }

      return
    }

    const optimisticBookmark: Bookmark = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
      created_at: new Date().toISOString(),
    }

    setBookmarks((current) => [...current, optimisticBookmark])

    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      console.error('Erro ao salvar publicação:', error.message)
      setMessage(t('postPage.errors.savePost'))
      await loadBookmarks(loggedUserId)
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

  async function handleToggleRepost() {
    if (!loggedUserId) {
      router.push('/login')
      return
    }

    if (!post) return

    setMessage('')

    if (post.user_id === loggedUserId) {
      setMessage(t('postPage.errors.repostOwn'))
      return
    }

    const existingRepost = reposts.find(
      (repost) => repost.post_id === postId && repost.user_id === loggedUserId
    )

    if (existingRepost) {
      setReposts((current) =>
        current.filter((repost) => repost.id !== existingRepost.id)
      )

      const { error } = await supabase
        .from('reposts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', loggedUserId)

      if (error) {
        console.error('Erro ao remover repost:', error.message)
        setMessage(t('postPage.errors.removeRepost'))
        await loadReposts()
      }

      return
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: loggedUserId,
      created_at: new Date().toISOString(),
    }

    setReposts((current) => [optimisticRepost, ...current])

    const { data, error } = await supabase
      .from('reposts')
      .insert({
        post_id: postId,
        user_id: loggedUserId,
      })
      .select('id, post_id, user_id, created_at')
      .single()

    if (error) {
      console.error('Erro ao repostar publicação:', error.message)
      setMessage(t('postPage.errors.repost'))
      await loadReposts()
      return
    }

    if (data) {
      setReposts((current) =>
        current.map((repost) =>
          repost.id === optimisticRepost.id ? data : repost
        )
      )
    }

    if (post.user_id !== loggedUserId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        actor_id: loggedUserId,
        type: 'repost',
        post_id: postId,
      })
    }
  }

  async function handleCreateComment(e: React.FormEvent) {
    e.preventDefault()

    if (!loggedUserId) {
      router.push('/login')
      return
    }

    const text = commentInput.trim()

    if (!text) {
      setMessage(t('postPage.errors.emptyComment'))
      return
    }

    setSendingComment(true)
    setMessage('')

    const { data: insertedComment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: loggedUserId,
        content: text,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Erro ao comentar na publicação:', error.message)
      setMessage(t('postPage.errors.comment'))
      setSendingComment(false)
      return
    }

    if (post && post.user_id !== loggedUserId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        actor_id: loggedUserId,
        type: 'comment',
        post_id: postId,
        comment_id: insertedComment?.id || null,
      })
    }

    setCommentInput('')
    setSendingComment(false)

    await loadComments()
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/post/${postId}`

    try {
      await navigator.clipboard.writeText(url)
      setCopiedPostId(postId)

      setTimeout(() => {
        setCopiedPostId((current) => (current === postId ? null : current))
      }, 2000)
    } catch {
      setMessage(t('postPage.errors.copyLink'))
    }
  }

  async function handleDeletePost() {
    if (!loggedUserId || !post) return

    const confirmDelete = window.confirm(t('postPage.confirmDelete'))

    if (!confirmDelete) return

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', post.id)
      .eq('user_id', loggedUserId)

    if (error) {
      console.error('Erro ao excluir publicação:', error.message)
      setMessage(t('postPage.errors.deletePost'))
      return
    }

    router.push('/feed')
  }

  async function handleReportPost() {
    if (!loggedUserId || !post) {
      router.push('/login')
      return
    }

    if (post.user_id === loggedUserId) {
      setMessage(t('postPage.errors.reportOwn'))
      return
    }

    const reason = window.prompt(
      t('postPage.reportPrompt')
    )

    if (!reason || !reason.trim()) return

    const { error } = await supabase.from('reports').insert({
      reporter_id: loggedUserId,
      reported_post_id: post.id,
      reported_user_id: post.user_id,
      reason: reason.trim(),
    })

    if (error) {
      console.error('Erro ao denunciar publicação:', error.message)
      setMessage(t('postPage.errors.report'))
      return
    }

    setMessage(t('postPage.success.reported'))
  }

  const userLiked = useMemo(() => {
    return likes.some((like) => like.user_id === loggedUserId)
  }, [likes, loggedUserId])

  const postSaved = useMemo(() => {
    return bookmarks.some(
      (bookmark) => bookmark.post_id === postId && bookmark.user_id === loggedUserId
    )
  }, [bookmarks, postId, loggedUserId])

  const postReposted = useMemo(() => {
    return reposts.some(
      (repost) => repost.post_id === postId && repost.user_id === loggedUserId
    )
  }, [reposts, postId, loggedUserId])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-black dark:bg-black dark:text-white">
        <p>{t('postPage.loading')}</p>
      </main>
    )
  }

  if (!post) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
        <header className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('postPage.back')}
            </Link>

            <strong>EntreUS</strong>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-700 dark:text-zinc-300">
              {message || t('postPage.errors.notFound')}
            </p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('postPage.back')}
          </button>

          <Link href="/feed" className="font-bold">
            EntreUS
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-6">
        {permissionDenied ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="text-xl font-bold">
              {moderationHiddenDenied ? t('postPage.moderatedTitle') : t('postPage.restrictedTitle')}
            </h1>

            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {moderationHiddenDenied
                ? t('postPage.errors.moderatedHidden')
                : t('postPage.restrictedDescription')}
            </p>

            {!moderationHiddenDenied && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-xl bg-black px-5 py-3 text-center font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                {t('auth.login.submit')}
              </Link>

              <Link
                href="/signup"
                className="rounded-xl border border-zinc-300 px-5 py-3 text-center font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {t('auth.signup.create')}
              </Link>
            </div>
            )}
          </div>
        ) : (
          <>
            <PostCard
              post={post}
              currentUserId={loggedUserId}
              commentsCount={comments.length}
              likesCount={likes.length}
              repostsCount={reposts.length}
              liked={userLiked}
              saved={postSaved}
              reposted={postReposted}
              copied={copiedPostId === post.id}
              showSensitiveContent={currentProfile?.show_sensitive_content || false}
              canViewAdultContent={
                isAdminRole(currentProfile?.role) ||
                canViewAdultContent({
                  isMinor: currentProfile?.is_minor,
                  wants18Plus: currentProfile?.wants_18_plus,
                  ageVerificationStatus: currentProfile?.age_verification_status,
                })
              }
              footerLabel={t('postPage.publishedAt', {
                date: new Date(post.created_at).toLocaleString(language),
              })}
              onLike={handleToggleLike}
              onCommentClick={() => {
                const input = document.getElementById('single-post-comment-input')

                if (input instanceof HTMLInputElement) {
                  input.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  setTimeout(() => input.focus(), 250)
                }
              }}
              onRepost={handleToggleRepost}
              onSave={handleToggleBookmark}
              onShare={handleCopyLink}
              onCopy={handleCopyLink}
              onEdit={() => router.push(`/post/${post.id}`)}
              onDelete={handleDeletePost}
              onReport={handleReportPost}
              onPaidPostUnlocked={refreshPaidPostContent}
              authorTier={resolveUserTier({
                vipStatus: post.profiles?.vip_status,
                vipExpiresAt: post.profiles?.vip_expires_at,
              })}
              authorProfileTheme={post.profiles?.profile_theme}
            />

            {!canInteract && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-semibold">
                    {t('postPage.signInTitle')}
                </p>

                <p className="mt-1 text-sm opacity-90">
                  {t('postPage.signInDescription')}
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="rounded-xl bg-black px-5 py-3 text-center font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
                  >
                    {t('auth.login.submit')}
                  </Link>

                  <Link
                    href="/signup"
                    className="rounded-xl border border-blue-300 px-5 py-3 text-center font-medium hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-950"
                  >
                    {t('auth.signup.create')}
                  </Link>
                </div>
              </div>
            )}

            <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
              <h2 className="mb-4 text-lg font-bold">{t('postPage.commentsTitle')}</h2>

              {canInteract ? (
                <form
                  onSubmit={handleCreateComment}
                  className="mb-5 flex flex-col gap-3 sm:flex-row"
                >
                  <input
                    id="single-post-comment-input"
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={t('postPage.commentPlaceholder')}
                    className="flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />

                  <button
                    type="submit"
                    disabled={sendingComment}
                    className="rounded-xl bg-black px-5 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
                  >
                    {sendingComment ? t('postPage.commentSending') : t('postPage.commentSubmit')}
                  </button>
                </form>
              ) : (
                <p className="mb-5 text-sm text-zinc-500">
                  {t('postPage.commentLoginHint')}
                </p>
              )}

              {message && !permissionDenied && (
                <p className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {message}
                </p>
              )}

              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {t('postPage.commentsEmpty')}
                  </p>
                )}

                {comments.map((comment) => {
                  const commentAuthorName =
                    comment.profiles?.display_name ||
                    comment.profiles?.username ||
                    t('postPage.fallbackUser')

                  const commentAuthorUsername =
                    comment.profiles?.username || t('postPage.fallbackUsername')

                  const commentAvatar = comment.profiles?.avatar_url || ''

                  return (
                    <div
                      key={comment.id}
                      className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800"
                    >
                      <div className="flex items-start gap-3">
                        <Link href={`/u/${commentAuthorUsername}`} className="shrink-0">
                          {commentAvatar ? (
                            <img
                              src={commentAvatar}
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
                          <Link href={`/u/${commentAuthorUsername}`} className="hover:underline">
                            <p className="font-semibold text-black dark:text-white">
                              {commentAuthorName}
                            </p>

                            <p className="break-all text-xs text-zinc-500">
                              @{commentAuthorUsername}
                            </p>
                          </Link>

                          <RichTextLinks
                            text={comment.content}
                            className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200"
                          />

                          <p className="mt-2 text-xs text-zinc-500">
                            {new Date(comment.created_at).toLocaleString(language)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
