'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import PostCard from '../components/PostCard'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '../components/LanguageProvider'
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
import { isMissingPaidPostColumnError } from '@/lib/paid-posts'
import { protectPostForViewer } from '@/lib/protected-post-access'


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

type VisibilityType = 'public' | 'followers' | 'private'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  show_sensitive_content: boolean
  is_minor?: boolean | null
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
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
  profiles: ProfileSummary | null
  media?: PostMedia[]
}

type Like = {
  id: string
  post_id: string
  user_id: string
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
}

type Follow = {
  id?: string
  follower_id: string
  following_id: string
}

type SavedBookmark = {
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

export default function SavedPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { t, language } = useLanguage()

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)

  const [posts, setPosts] = useState<Post[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [follows, setFollows] = useState<Follow[]>([])

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadPageData() {
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
        .select('username, display_name, avatar_url, show_sensitive_content, is_minor, wants_18_plus, age_verification_status')
        .eq('id', user.id)
        .single()

      const loadedProfile: CurrentProfile | null =
        !profileError && profileData
          ? {
              username: profileData.username,
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url,
              is_minor: profileData.is_minor,
              wants_18_plus: profileData.wants_18_plus || false,
              age_verification_status: profileData.age_verification_status || 'not_started',
              show_sensitive_content: canViewAdultContent({
                isMinor: profileData.is_minor,
                wants18Plus: profileData.wants_18_plus,
                ageVerificationStatus: profileData.age_verification_status,
              }),
            }
          : null

      setCurrentProfile(loadedProfile)

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      const followsData = await loadFollows()
      setFollows(followsData)

      const bookmarksData = await loadBookmarks(user.id)
      setBookmarks(bookmarksData)

      await Promise.all([
        loadSavedPosts(
          user.id,
          bookmarksData,
          blockedIds,
          followsData,
          loadedProfile
        ),
        loadLikes(),
        loadComments(blockedIds),
        loadReposts(),
        loadUnreadNotificationsCount(user.id),
      ])

      setLoading(false)
    }

    loadPageData()
  }, [router])

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    if (error) {
      setMessage(t('saved.messages.loadNotificationsError') + error.message)
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
      setMessage(t('saved.messages.loadBlocksError') + blockedByMeError.message)
      return []
    }

    const { data: blockedMe, error: blockedMeError } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', currentUserId)

    if (blockedMeError) {
      setMessage(t('saved.messages.loadBlocksError') + blockedMeError.message)
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
      setMessage(t('saved.messages.loadFollowsError') + error.message)
      return []
    }

    return data || []
  }

  async function loadBookmarks(currentUserId: string) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('saved.messages.loadBookmarksError') + error.message)
      return []
    }

    return data || []
  }

  async function loadLikes() {
    const { data, error } = await supabase
      .from('likes')
      .select('id, post_id, user_id')

    if (error) {
      setMessage(t('saved.messages.loadLikesError') + error.message)
      return
    }

    setLikes(data || [])
  }

  async function loadReposts() {
    const { data, error } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(t('saved.messages.loadRepostsError') + error.message)
      return
    }

    setReposts(data || [])
  }

  async function loadComments(currentBlockedIds: string[] = blockedUserIds) {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(t('saved.messages.loadCommentsError') + error.message)
      return
    }

    const normalizedComments = (data || []).filter(
      (comment: Comment) => !currentBlockedIds.includes(comment.user_id)
    )

    setComments(normalizedComments)
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
      normalizeContentRating(post.content_rating) !== 'safe' ||
      isAdultCommunityOrRating(post.community_type, post.content_rating, post.category) ||
      post.category === 'adulto' ||
      post.category === 'sensual' ||
      post.category === '18plus'
    )
  }

  async function loadPaidUnlockIdsForPosts(currentUserId: string, postIds: string[]) {
    if (!currentUserId || postIds.length === 0) return new Set<string>()

    const { data, error } = await supabase
      .from('paid_post_unlocks')
      .select('post_id')
      .eq('buyer_id', currentUserId)
      .in('post_id', postIds)

    if (error) {
      if (!isMissingPaidPostColumnError(error)) {
        console.warn('Nao foi possivel carregar desbloqueios de posts pagos salvos:', error.message)
      }
      return new Set<string>()
    }

    return new Set((data || []).map((row) => row.post_id).filter(Boolean) as string[])
  }

  async function loadSavedPosts(
    currentUserId: string,
    currentBookmarks: SavedBookmark[],
    currentBlockedIds: string[],
    currentFollows: Follow[],
    viewerProfile: CurrentProfile | null = currentProfile
  ) {
    const postIds = currentBookmarks.map((bookmark) => bookmark.post_id)

    if (postIds.length === 0) {
      setPosts([])
      return
    }

    const selectWithModeration = `
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
          avatar_url
        )
      `
    const selectFallback = `
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
          avatar_url
        )
      `

    let { data, error } = await applyPostVisibilityFilters(supabase
      .from('posts')
      .select(selectWithModeration)
      .in('id', postIds), {
        isMinor: viewerProfile?.is_minor,
        wants18Plus: viewerProfile?.wants_18_plus,
        ageVerificationStatus: viewerProfile?.age_verification_status,
      }, 'saved')

    if (error && isMissingPaidPostColumnError(error)) {
      const fallback = await applyPostVisibilityFilters(supabase
        .from('posts')
        .select(removePaidPostSelectFields(selectWithModeration))
        .in('id', postIds), {
          isMinor: viewerProfile?.is_minor,
          wants18Plus: viewerProfile?.wants_18_plus,
          ageVerificationStatus: viewerProfile?.age_verification_status,
        }, 'saved')

      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error && isMissingPostModerationColumnError(error)) {
      const fallback = await applyPostVisibilityFilters(supabase
        .from('posts')
        .select(selectFallback)
        .in('id', postIds), {
          isMinor: viewerProfile?.is_minor,
          wants18Plus: viewerProfile?.wants_18_plus,
          ageVerificationStatus: viewerProfile?.age_verification_status,
        }, 'saved')

      data = fallback.data as typeof data
      error = fallback.error

      if (error && isMissingPaidPostColumnError(error)) {
        const paidFallback = await applyPostVisibilityFilters(supabase
          .from('posts')
          .select(removePaidPostSelectFields(selectFallback))
          .in('id', postIds), {
            isMinor: viewerProfile?.is_minor,
            wants18Plus: viewerProfile?.wants_18_plus,
            ageVerificationStatus: viewerProfile?.age_verification_status,
          }, 'saved')

        data = paidFallback.data as typeof data
        error = paidFallback.error
      }
    }

    if (error && isMissingCommunityColumnError(error)) {
      const fallback = await applyPostVisibilityFilters(supabase
        .from('posts')
        .select(removePaidPostSelectFields(selectWithModeration).replace(POST_SELECT_COMMUNITY_FIELDS, ''))
        .in('id', postIds), {
          isMinor: viewerProfile?.is_minor,
          wants18Plus: viewerProfile?.wants_18_plus,
          ageVerificationStatus: viewerProfile?.age_verification_status,
        }, 'saved')

      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) {
      setMessage(t('saved.messages.loadBookmarksError') + error.message)
      return
    }

    const rawPosts = (data || []).map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
      is_sensitive: post.is_sensitive || false,
      community_type: normalizeCommunity(post.community_type),
      content_rating: normalizeContentRating(post.content_rating),
      profiles: Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles,
    })) as Post[]

    const visiblePosts = rawPosts
      .filter((post) => !currentBlockedIds.includes(post.user_id))
      .filter((post) => !isModeratedHidden(post))
      .filter((post) => canViewCommunity(
        {
          isMinor: viewerProfile?.is_minor,
          wants18Plus: viewerProfile?.wants_18_plus,
          ageVerificationStatus: viewerProfile?.age_verification_status,
        },
        post.community_type,
        post.content_rating,
        post.category,
      ))
      .filter((post) => canSeePost(post, currentUserId, currentFollows))

    const visiblePostIds = visiblePosts.map((post) => post.id)
    const paidUnlockedIds = await loadPaidUnlockIdsForPosts(currentUserId, visiblePostIds)
    let mediaByPost: Record<string, PostMedia[]> = {}

    if (visiblePostIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at, access_level')
        .in('post_id', visiblePostIds)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error(t('saved.messages.loadSavedMediaError'), mediaError.message)
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

    const bookmarkOrder = new Map<string, number>()

    currentBookmarks.forEach((bookmark, index) => {
      bookmarkOrder.set(bookmark.post_id, index)
    })

    const normalizedPosts = visiblePosts
      .map((post) => {
        const paidUnlocked = post.user_id === currentUserId || paidUnlockedIds.has(post.id)
        return protectPostForViewer({
          post: {
            ...post,
            media: mediaByPost[post.id] || [],
            paid_unlocked: paidUnlocked,
          },
          viewerId: currentUserId,
          viewerProfile: {
            isMinor: viewerProfile?.is_minor,
            wants18Plus: viewerProfile?.wants_18_plus,
            ageVerificationStatus: viewerProfile?.age_verification_status,
          },
          hasPaidUnlock: paidUnlocked,
          isFollowingAuthor: currentFollows.some(
            (follow) =>
              follow.follower_id === currentUserId &&
              follow.following_id === post.user_id,
          ),
        })
      })
      .sort((a, b) => {
        const orderA = bookmarkOrder.get(a.id) ?? 999999
        const orderB = bookmarkOrder.get(b.id) ?? 999999
        return orderA - orderB
      })

    setPosts(normalizedPosts)
  }

  async function refreshSavedPosts() {
    if (!userId) return

    const freshBookmarks = await loadBookmarks(userId)
    setBookmarks(freshBookmarks)

    await loadSavedPosts(
      userId,
      freshBookmarks,
      blockedUserIds,
      follows,
      currentProfile
    )
  }

  async function handleToggleBookmark(postId: string) {
    if (!userId) return

    const existingBookmark = bookmarks.find(
      (bookmark) => bookmark.post_id === postId && bookmark.user_id === userId
    )

    if (!existingBookmark) return

    setBookmarks((current) =>
      current.filter((bookmark) => bookmark.id !== existingBookmark.id)
    )

    setPosts((current) => current.filter((post) => post.id !== postId))

    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage(t('saved.messages.removeSavedError') + error.message)
      await refreshSavedPosts()
    }
  }

  async function handleToggleRepost(postId: string) {
    if (!userId) return

    setMessage('')

    const repostedPost = posts.find((post) => post.id === postId)

    if (repostedPost?.user_id === userId) {
      setMessage(t('saved.messages.ownRepost'))
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
        setMessage(t('saved.messages.removeRepostError') + error.message)
        await loadReposts()
      }

      return
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
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
      setMessage(t('saved.messages.repostError') + error.message)
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

    if (repostedPost && repostedPost.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: repostedPost.user_id,
        actor_id: userId,
        type: 'repost',
        post_id: postId,
      })
    }
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

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
        setMessage(t('saved.messages.removeLikeError') + error.message)
        await loadLikes()
      }

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
      setMessage(t('saved.messages.likeError') + error.message)
      await loadLikes()
      return
    }

    if (data) {
      setLikes((current) =>
        current.map((like) => (like.id === optimisticLike.id ? data : like))
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
      setMessage(t('saved.messages.copyPostError'))
    }
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!userId) return

    if (postOwnerId === userId) {
      setMessage(t('saved.messages.ownReport'))
      return
    }

    const reason = window.prompt(t('saved.messages.reportPrompt'))

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
      setMessage(t('saved.messages.reportError') + error.message)
      setReportingPostId(null)
      return
    }

    setReportedPostIds((prev) => [...prev, postId])
    setMessage(t('saved.messages.reportSuccess'))
    setReportingPostId(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  const savedPostIds = useMemo(() => {
    return new Set(bookmarks.map((bookmark) => bookmark.post_id))
  }, [bookmarks])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-black dark:bg-black dark:text-white">
        <p>{t('saved.loading')}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
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
        onPostClick={handlePostClick}
      />

      <section className="w-full max-w-2xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(104px+((100vw-104px-42rem)/2))] lg:py-8">
        <div className="mb-6 rounded-[1.75rem] border border-zinc-200/70 bg-white/90 p-5 shadow-sm shadow-black/5 ring-1 ring-black/5 backdrop-blur dark:border-zinc-800/70 dark:bg-slate-950/80 dark:ring-white/10">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-50 text-yellow-600 ring-1 ring-yellow-200/70 dark:bg-yellow-950/40 dark:text-yellow-300 dark:ring-yellow-900/60">
              <Bookmark className="h-6 w-6 fill-current" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
                {t('saved.title')}
              </h1>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t('saved.description')}
              </p>
            </div>
          </div>

          {message && (
            <p className="mt-4 rounded-2xl border border-zinc-200/70 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800/70 dark:bg-black/30 dark:text-zinc-300">
              {message}
            </p>
          )}
        </div>

        <div className="space-y-4 sm:space-y-5">
          {posts.length === 0 && (
            <div className="rounded-[1.75rem] border border-blue-200/70 bg-white/90 p-7 text-center text-zinc-500 shadow-sm shadow-blue-500/5 ring-1 ring-black/5 backdrop-blur dark:border-blue-400/15 dark:bg-slate-950/80 dark:text-zinc-400 dark:ring-white/10">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-50 text-yellow-600 ring-1 ring-yellow-200/70 dark:bg-yellow-950/35 dark:text-yellow-300 dark:ring-yellow-900/60">
                <Bookmark className="h-7 w-7 fill-current" />
              </span>

              <p className="font-medium text-zinc-800 dark:text-zinc-200">
                {t('saved.emptyTitle')}
              </p>

              <p className="mt-1 text-sm">
                {t('saved.emptyDescription')}
              </p>

              <Link
                href="/feed"
                className="mt-5 inline-flex rounded-full bg-blue-500 px-5 py-2 text-sm font-black text-white shadow-sm shadow-blue-500/25 transition hover:-translate-y-0.5 hover:bg-blue-400 active:scale-95"
              >
                {t('saved.backToFeed')}
              </Link>
            </div>
          )}

          {posts.map((post) => {
            const postComments = comments.filter((comment) => comment.post_id === post.id)
            const postLikes = likes.filter((like) => like.post_id === post.id)
            const postReposts = reposts.filter((repost) => repost.post_id === post.id)

            const userLiked = likes.some(
              (like) => like.post_id === post.id && like.user_id === userId
            )

            const postSaved = savedPostIds.has(post.id)

            const postReposted = reposts.some(
              (repost) => repost.post_id === post.id && repost.user_id === userId
            )

            return (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={userId}
                commentsCount={postComments.length}
                likesCount={postLikes.length}
                repostsCount={postReposts.length}
                liked={userLiked}
                saved={postSaved}
                reposted={postReposted}
                copied={copiedPostId === post.id}
                reported={reportedPostIds.includes(post.id)}
                reporting={reportingPostId === post.id}
                showSensitiveContent={currentProfile?.show_sensitive_content || false}
                canViewAdultContent={canViewAdultContent({
                  isMinor: currentProfile?.is_minor,
                  wants18Plus: currentProfile?.wants_18_plus,
                  ageVerificationStatus: currentProfile?.age_verification_status,
                })}
                footerLabel={`${t('saved.publishedAt')} ${new Date(post.created_at).toLocaleString(getDateLocale(language))}`}
                onLike={() => handleToggleLike(post.id)}
                onCommentClick={() => router.push(`/post/${post.id}`)}
                onRepost={() => handleToggleRepost(post.id)}
                onSave={() => handleToggleBookmark(post.id)}
                onShare={() => handleCopyPostLink(post.id)}
                onCopy={() => handleCopyPostLink(post.id)}
                onEdit={() => router.push(`/post/${post.id}`)}
                onDelete={() => router.push(`/post/${post.id}`)}
                onReport={() => handleReportPost(post.id, post.user_id)}
                onPaidPostUnlocked={refreshSavedPosts}
              />
            )
          })}
        </div>
      </section>
    </main>
  )
}
