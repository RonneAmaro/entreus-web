'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import PostMoreMenu from '../components/PostMoreMenu'
import PostMediaGallery from '../components/PostMediaGallery'
import PostActions from '../components/PostActions'
import LinkPreview from '../components/LinkPreview'
import SensitiveContent from '../components/SensitiveContent'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

type VisibilityType = 'public' | 'followers' | 'private'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  show_sensitive_content: boolean
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
  profiles: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
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

export default function SavedPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)

  const [posts, setPosts] = useState<Post[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([])
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
        .select('username, display_name, avatar_url, show_sensitive_content')
        .eq('id', user.id)
        .single()

      const loadedProfile: CurrentProfile | null =
        !profileError && profileData
          ? {
              username: profileData.username,
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url,
              show_sensitive_content: profileData.show_sensitive_content || false,
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
          loadedProfile?.show_sensitive_content || false
        ),
        loadLikes(),
        loadComments(blockedIds),
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
      setMessage('Erro ao carregar notificações: ' + error.message)
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
      setMessage('Erro ao carregar bloqueios: ' + blockedByMeError.message)
      return []
    }

    const { data: blockedMe, error: blockedMeError } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', currentUserId)

    if (blockedMeError) {
      setMessage('Erro ao carregar bloqueios: ' + blockedMeError.message)
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
      setMessage('Erro ao carregar seguimentos: ' + error.message)
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
      setMessage('Erro ao carregar posts salvos: ' + error.message)
      return []
    }

    return data || []
  }

  async function loadLikes() {
    const { data, error } = await supabase.from('likes').select('*')

    if (error) {
      setMessage('Erro ao carregar curtidas: ' + error.message)
      return
    }

    setLikes(data || [])
  }

  async function loadComments(currentBlockedIds: string[] = blockedUserIds) {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar comentários: ' + error.message)
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
      post.category === 'adulto' ||
      post.category === 'sensual'
    )
  }

  async function loadSavedPosts(
    currentUserId: string,
    currentBookmarks: SavedBookmark[],
    currentBlockedIds: string[],
    currentFollows: Follow[],
    allowSensitiveContent: boolean
  ) {
    const postIds = currentBookmarks.map((bookmark) => bookmark.post_id)

    if (postIds.length === 0) {
      setPosts([])
      return
    }

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
      .in('id', postIds)

    if (error) {
      setMessage('Erro ao carregar posts salvos: ' + error.message)
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

    let mediaByPost: Record<string, PostMedia[]> = {}

    if (postIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at')
        .in('post_id', postIds)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error('Erro ao carregar mídias dos posts salvos:', mediaError.message)
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
      .sort((a, b) => {
        const orderA = bookmarkOrder.get(a.id) ?? 999999
        const orderB = bookmarkOrder.get(b.id) ?? 999999
        return orderA - orderB
      })

    setPosts(normalizedPosts)
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

  function getVisibilityLabel(value: Post['visibility']) {
    if (value === 'public') return 'Público'
    if (value === 'followers') return 'Só seguidores'

    return 'Privado'
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
      setMessage('Erro ao remover post dos salvos: ' + error.message)

      const freshBookmarks = await loadBookmarks(userId)
      setBookmarks(freshBookmarks)

      await loadSavedPosts(
        userId,
        freshBookmarks,
        blockedUserIds,
        follows,
        currentProfile?.show_sensitive_content || false
      )
    }
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

    const { data: existingLike, error: checkError } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle()

    if (checkError) {
      setMessage('Erro ao verificar curtida: ' + checkError.message)
      return
    }

    if (existingLike) {
      setLikes((current) => current.filter((like) => like.id !== existingLike.id))

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        setMessage('Erro ao remover curtida: ' + error.message)
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
      setMessage('Erro ao curtir: ' + error.message)
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
      setMessage('Não foi possível copiar o link do post.')
    }
  }

  async function handleReportPost(postId: string, postOwnerId: string) {
    if (!userId) return

    if (postOwnerId === userId) {
      setMessage('Você não pode denunciar sua própria publicação.')
      return
    }

    const reason = window.prompt(
      'Informe o motivo da denúncia.\nEx.: spam, nudez indevida, assédio, conteúdo ofensivo'
    )

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
      setMessage('Erro ao denunciar publicação: ' + error.message)
      setReportingPostId(null)
      return
    }

    setReportedPostIds((prev) => [...prev, postId])
    setMessage('Publicação denunciada com sucesso.')
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
        <p>Carregando salvos...</p>
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
        displayName={currentProfile?.display_name || currentProfile?.username || 'Minha conta'}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full max-w-2xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-42rem)/2))] lg:py-8">
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-50 text-yellow-600 dark:bg-yellow-950/40 dark:text-yellow-300">
              <Bookmark className="h-6 w-6 fill-current" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
                Posts salvos
              </h1>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Tudo que você salvou fica guardado aqui, visível apenas para você.
              </p>
            </div>
          </div>

          {message && (
            <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </p>
          )}
        </div>

        <div className="space-y-4 sm:space-y-5">
          {posts.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <Bookmark className="mx-auto mb-3 h-10 w-10 text-zinc-400" />

              <p className="font-medium text-zinc-800 dark:text-zinc-200">
                Nenhum post salvo ainda.
              </p>

              <p className="mt-1 text-sm">
                Quando você tocar em “Salvar” em algum post, ele vai aparecer aqui.
              </p>

              <Link
                href="/feed"
                className="mt-5 inline-flex rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
              >
                Voltar para o feed
              </Link>
            </div>
          )}

          {posts.map((post) => {
            const postComments = comments.filter((comment) => comment.post_id === post.id)
            const postLikes = likes.filter((like) => like.post_id === post.id)

            const userLiked = likes.some(
              (like) => like.post_id === post.id && like.user_id === userId
            )

            const postSaved = savedPostIds.has(post.id)

            const authorName =
              post.profiles?.display_name || post.profiles?.username || 'Usuário'

            const authorUsername = post.profiles?.username || 'usuario'
            const authorAvatar = post.profiles?.avatar_url || ''
            const isOwnPost = post.user_id === userId
            const postMedia = getPostMedia(post)

            const isSensitivePostItem = isSensitivePost(post)

            const shouldShowSensitiveWarning =
              isSensitivePostItem && !currentProfile?.show_sensitive_content

            return (
              <article
                key={post.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 transition dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
              >
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
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="break-words font-semibold text-black dark:text-white">
                        {authorName}
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
                    onEdit={() => router.push(`/post/${post.id}`)}
                    onDelete={() => router.push(`/post/${post.id}`)}
                    onReport={() => handleReportPost(post.id, post.user_id)}
                  />
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-zinc-500">{post.category}</p>

                  <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {getVisibilityLabel(post.visibility)}
                  </span>

                  {isSensitivePostItem && (
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                      18+
                    </span>
                  )}

                  {postSaved && (
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                      Salvo
                    </span>
                  )}
                </div>

                {shouldShowSensitiveWarning ? (
                  <SensitiveContent>
                    {post.content && (
                      <p className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base">
                        {post.content}
                      </p>
                    )}

                    <LinkPreview content={post.content} />

                    <PostMediaGallery media={postMedia} />
                  </SensitiveContent>
                ) : (
                  <>
                    {post.content && (
                      <p className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base">
                        {post.content}
                      </p>
                    )}

                    <LinkPreview content={post.content} />

                    <PostMediaGallery media={postMedia} />
                  </>
                )}

                <PostActions
                  commentsCount={postComments.length}
                  likesCount={postLikes.length}
                  liked={userLiked}
                  saved={postSaved}
                  copied={copiedPostId === post.id}
                  onLike={() => handleToggleLike(post.id)}
                  onCommentClick={() => router.push(`/post/${post.id}`)}
                  onSave={() => handleToggleBookmark(post.id)}
                  onShare={() => handleCopyPostLink(post.id)}
                />

                <p className="mb-1 mt-3 text-xs text-zinc-500 dark:text-zinc-600">
                  Salvo em sua lista
                </p>

                <p className="text-xs text-zinc-500 dark:text-zinc-600">
                  Publicado em {new Date(post.created_at).toLocaleString('pt-BR')}
                </p>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}