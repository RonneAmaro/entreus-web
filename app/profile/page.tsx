'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import BrandHeader from '../components/BrandHeader'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Camera, Maximize2, ShieldAlert, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PostCard from '../components/PostCard'
import UserBadges from '../components/UserBadges'

type VisibilityType = 'public' | 'followers' | 'private'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  country: string | null
  birth_date: string | null
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

type Like = {
  id: string
  post_id: string
  user_id: string
}

type Comment = {
  id: string
  post_id: string
  user_id: string
}

type BookmarkItem = {
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

export default function ProfilePage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [showSensitiveContent, setShowSensitiveContent] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [reposts, setReposts] = useState<Repost[]>([])
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])
  const [showAvatarModal, setShowAvatarModal] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadPage() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, avatar_url, country, birth_date, show_sensitive_content'
        )
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setMessage('Erro ao carregar perfil: ' + error.message)
        setLoading(false)
        return
      }

      const loadedProfile: Profile = data || {
        id: user.id,
        username: '',
        display_name: '',
        bio: '',
        avatar_url: '',
        country: '',
        birth_date: '',
        show_sensitive_content: false,
      }

      setProfile(loadedProfile)
      setUsername(loadedProfile.username || '')
      setDisplayName(loadedProfile.display_name || '')
      setBio(loadedProfile.bio || '')
      setCountry(loadedProfile.country || '')
      setBirthDate(loadedProfile.birth_date || '')
      setAvatarUrl(loadedProfile.avatar_url || '')
      setAvatarPreview(loadedProfile.avatar_url || '')
      setShowSensitiveContent(loadedProfile.show_sensitive_content || false)

      await Promise.all([
        loadProfileActivity(user.id, loadedProfile),
        loadLikes(),
        loadComments(),
        loadBookmarks(user.id),
        loadReposts(loadedProfile),
        loadUnreadNotificationsCount(user.id),
      ])

      setLoading(false)
    }

    loadPage()
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

  function sanitizeUsername(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30)
  }

  async function loadLikes() {
    const { data, error } = await supabase
      .from('likes')
      .select('id, post_id, user_id')

    if (error) {
      setMessage('Erro ao carregar curtidas: ' + error.message)
      return
    }

    setLikes(data || [])
  }

  async function loadComments() {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, user_id')

    if (error) {
      setMessage('Erro ao carregar comentários: ' + error.message)
      return
    }

    setComments(data || [])
  }

  async function loadBookmarks(currentUserId: string = userId) {
    if (!currentUserId) return

    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)

    if (error) {
      setMessage('Erro ao carregar salvos: ' + error.message)
      return
    }

    setBookmarks(data || [])
  }

  async function loadReposts(currentProfileData: Profile | null = profile) {
    const { data, error } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage('Erro ao carregar reposts: ' + error.message)
      return
    }

    const rawReposts = data || []

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
        (acc, profileItem) => {
          acc[profileItem.id] = {
            username: profileItem.username,
            display_name: profileItem.display_name,
            avatar_url: profileItem.avatar_url,
          }

          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    const normalizedReposts: Repost[] = rawReposts.map((repost) => {
      const isCurrentUser = repost.user_id === userId

      return {
        ...repost,
        profiles:
          profilesById[repost.user_id] ||
          (isCurrentUser && currentProfileData
            ? {
                username: currentProfileData.username || 'usuario',
                display_name: currentProfileData.display_name,
                avatar_url: currentProfileData.avatar_url,
              }
            : null),
      }
    })

    setReposts(normalizedReposts)
  }

  async function loadProfileActivity(currentUserId: string, currentProfileData: Profile) {
    const { data: myRepostsData, error: myRepostsError } = await supabase
      .from('reposts')
      .select('id, post_id, user_id, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (myRepostsError) {
      setMessage('Erro ao carregar seus reposts: ' + myRepostsError.message)
      return
    }

    const repostPostIds = (myRepostsData || []).map((repost) => repost.post_id)

    const { data: ownPostsData, error: ownPostsError } = await supabase
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
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (ownPostsError) {
      setMessage('Erro ao carregar suas publicações: ' + ownPostsError.message)
      return
    }

    const ownPosts = (ownPostsData || []).map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
      is_sensitive: post.is_sensitive || false,
      profiles: Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles,
    })) as Post[]

    let repostedPosts: Post[] = []

    if (repostPostIds.length > 0) {
      const { data: repostedPostsData, error: repostedPostsError } = await supabase
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
        .in('id', repostPostIds)

      if (repostedPostsError) {
        setMessage('Erro ao carregar posts repostados: ' + repostedPostsError.message)
        return
      }

      repostedPosts = (repostedPostsData || []).map((post: any) => ({
        ...post,
        visibility: (post.visibility || 'public') as VisibilityType,
        is_sensitive: post.is_sensitive || false,
        profiles: Array.isArray(post.profiles)
          ? post.profiles[0] || null
          : post.profiles,
      })) as Post[]
    }

    const allPostsMap = new Map<string, Post>()

    for (const post of [...ownPosts, ...repostedPosts]) {
      allPostsMap.set(post.id, post)
    }

    const allPosts = Array.from(allPostsMap.values())
    const allPostIds = allPosts.map((post) => post.id)

    let mediaByPost: Record<string, PostMedia[]> = {}

    if (allPostIds.length > 0) {
      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at')
        .in('post_id', allPostIds)
        .order('position', { ascending: true })

      if (mediaError) {
        console.error('Erro ao carregar mídias do perfil:', mediaError.message)
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

    const normalizedPosts = allPosts.map((post) => ({
      ...post,
      media: mediaByPost[post.id] || [],
    }))

    setPosts(normalizedPosts)

    const currentUserReposts: Repost[] = (myRepostsData || []).map((repost) => ({
      ...repost,
      profiles: {
        username: currentProfileData.username || 'usuario',
        display_name: currentProfileData.display_name,
        avatar_url: currentProfileData.avatar_url,
      },
    }))

    setReposts((current) => {
      const otherReposts = current.filter((repost) => repost.user_id !== currentUserId)
      return [...otherReposts, ...currentUserReposts]
    })
  }

  async function handleAvatarSelect(file: File | null) {
    if (!file || !userId) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie uma imagem JPG, PNG ou WEBP.')
      return
    }

    const maxSizeInBytes = 5 * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setMessage('O avatar deve ter no máximo 5MB.')
      return
    }

    setUploadingAvatar(true)
    setMessage('')

    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setMessage('Erro ao enviar avatar: ' + uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    setAvatarUrl(publicUrlData.publicUrl)
    setAvatarPreview(publicUrlData.publicUrl)
    setUploadingAvatar(false)
    setMessage('Avatar atualizado. Agora salve o perfil.')
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()

    if (!userId) return

    const normalizedUsername = sanitizeUsername(username)

    if (!normalizedUsername) {
      setMessage('Escolha um username válido.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: existingUsername, error: usernameCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .neq('id', userId)
      .maybeSingle()

    if (usernameCheckError) {
      setMessage('Erro ao verificar username: ' + usernameCheckError.message)
      setSaving(false)
      return
    }

    if (existingUsername) {
      setMessage('Esse username já está em uso.')
      setSaving(false)
      return
    }

    const payload = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
      country: country.trim() || null,
      birth_date: birthDate || null,
      show_sensitive_content: showSensitiveContent,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('profiles').upsert(payload)

    if (error) {
      setMessage('Erro ao salvar perfil: ' + error.message)
      setSaving(false)
      return
    }

    const updatedProfile: Profile = {
      id: userId,
      username: normalizedUsername,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
      country: country.trim() || null,
      birth_date: birthDate || null,
      show_sensitive_content: showSensitiveContent,
    }

    setUsername(normalizedUsername)
    setProfile(updatedProfile)

    setMessage('Perfil salvo com sucesso.')
    setSaving(false)

    await loadProfileActivity(userId, updatedProfile)
    await loadReposts(updatedProfile)
  }

  async function handleToggleBookmark(postId: string) {
    if (!userId) return

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
        setMessage('Erro ao remover dos salvos: ' + error.message)
        await loadBookmarks(userId)
      }

      return
    }

    const optimisticBookmark: BookmarkItem = {
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
      setMessage('Erro ao salvar post: ' + error.message)
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
    if (!userId || !profile) return

    const repostedPost = posts.find((post) => post.id === postId)

    if (repostedPost?.user_id === userId) {
      setMessage('Você não precisa repostar sua própria publicação.')
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
        setMessage('Erro ao remover repost: ' + error.message)
        await loadReposts(profile)
      }

      return
    }

    const optimisticRepost: Repost = {
      id: crypto.randomUUID(),
      post_id: postId,
      user_id: userId,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile.username || 'usuario',
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
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
      setMessage('Erro ao repostar: ' + error.message)
      await loadReposts(profile)
      return
    }

    if (data) {
      setReposts((current) =>
        current.map((repost) =>
          repost.id === optimisticRepost.id
            ? {
                ...data,
                profiles: optimisticRepost.profiles,
              }
            : repost
        )
      )
    }
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

    const existingLike = likes.find(
      (like) => like.post_id === postId && like.user_id === userId
    )

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

  async function handleDeletePost(postId: string) {
    const confirmDelete = window.confirm('Tem certeza que deseja excluir esta publicação?')

    if (!confirmDelete) return

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao excluir: ' + error.message)
      return
    }

    setMessage('Post excluído com sucesso.')

    if (profile) {
      await loadProfileActivity(userId, profile)
      await loadReposts(profile)
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

  const feedItems = useMemo<FeedItem[]>(() => {
    const postMap = new Map<string, Post>()

    for (const post of posts) {
      postMap.set(post.id, post)
    }

    const ownPostItems: FeedItem[] = posts
      .filter((post) => post.user_id === userId)
      .map((post) => ({
        type: 'post',
        id: `post-${post.id}`,
        created_at: post.created_at,
        post,
      }))

    const myRepostItems = reposts
      .filter((repost) => repost.user_id === userId)
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

    return [...ownPostItems, ...myRepostItems].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [posts, reposts, userId])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <p>Carregando perfil...</p>
      </main>
    )
  }

  const publicProfileUrl = username ? `/u/${username}` : '#'
  const profileName = displayName || username || 'Usuário'

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={displayName || username || 'Minha conta'}
        avatarUrl={avatarPreview || avatarUrl || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full max-w-4xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
        <BrandHeader
          subtitle="Meu perfil"
          description="Edite suas informações, personalize sua presença e acompanhe suas publicações e reposts."
          compact
          rightContent={
            <div className="flex flex-wrap gap-2">
              {username && (
                <Link
                  href={publicProfileUrl}
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                >
                  Ver perfil público
                </Link>
              )}

              <Link
                href="/feed"
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
              >
                Voltar ao feed
              </Link>
            </div>
          }
        />

        {message && (
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSaveProfile}
          className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3 sm:items-start">
                <button
                  type="button"
                  onClick={() => avatarPreview && setShowAvatarModal(true)}
                  disabled={!avatarPreview}
                  className="group relative h-32 w-32 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 text-zinc-700 shadow-sm transition hover:opacity-90 disabled:cursor-default dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 sm:h-36 sm:w-36"
                  title={avatarPreview ? 'Ver foto de perfil' : 'Foto de perfil'}
                  aria-label={avatarPreview ? 'Ver foto de perfil' : 'Foto de perfil'}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={profileName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-4xl font-bold">
                      {profileName.charAt(0).toUpperCase()}
                    </span>
                  )}

                  {avatarPreview && (
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white transition group-hover:flex">
                      <Maximize2 className="h-6 w-6" />
                    </span>
                  )}
                </button>

                <label
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                  title="Alterar foto de perfil"
                >
                  <Camera className="h-4 w-4" />
                  <span>Alterar foto</span>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleAvatarSelect(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>

                {uploadingAvatar && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Enviando avatar...
                  </p>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="inline-flex max-w-full items-center gap-2 break-words text-2xl font-bold text-black dark:text-white">
                  <UserBadges userId={userId} size="md" max={1} />

                  <span className="min-w-0 break-words">
                    {profileName}
                  </span>
                </h2>

                <p className="mt-1 break-all text-zinc-500 dark:text-zinc-400">
                  @{username || 'seu_username'}
                </p>

                {bio && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
                    {bio}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
                    {feedItems.length} atividades
                  </span>

                  <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
                    {posts.filter((post) => post.user_id === userId).length} publicações
                  </span>

                  <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
                    {reposts.filter((repost) => repost.user_id === userId).length} reposts
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                  Nome de exibição
                </label>

                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome visível"
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 sm:text-base"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                  Username
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                  placeholder="seu_username"
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 sm:text-base"
                />

                <p className="mt-2 text-xs text-zinc-500">
                  Use letras minúsculas, números e underline.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                  Bio
                </label>

                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Fale um pouco sobre você..."
                  className="min-h-28 w-full resize-none rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 sm:text-base"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                    País
                  </label>

                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Brasil"
                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 sm:text-base"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                    Data de nascimento
                  </label>

                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 sm:text-base"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/60 dark:bg-yellow-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                      <ShieldAlert className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-white">
                        Preferência de conteúdo 18+
                      </h3>

                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        Quando ativado, publicações adultas ou sensíveis poderão aparecer no seu feed.
                      </p>

                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                        Quando desativado, o feed poderá ocultar esse tipo de conteúdo.
                      </p>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-yellow-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 dark:border-yellow-800 dark:bg-zinc-950 dark:text-white">
                    <input
                      type="checkbox"
                      checked={showSensitiveContent}
                      onChange={(e) => setShowSensitiveContent(e.target.checked)}
                      className="h-5 w-5 accent-yellow-600"
                    />

                    Permitir 18+
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className={`w-full rounded-xl px-6 py-3 font-medium sm:w-auto ${
                  saving || uploadingAvatar
                    ? 'cursor-not-allowed bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                    : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
                }`}
              >
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>

              {username && (
                <Link
                  href={publicProfileUrl}
                  className="w-full rounded-xl border border-zinc-300 px-6 py-3 text-center hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:w-auto"
                >
                  Abrir perfil público
                </Link>
              )}
            </div>
          </div>
        </form>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                Minhas atividades
              </h2>

              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Suas publicações e reposts aparecem aqui.
              </p>
            </div>

            <Link
              href="/feed"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-900"
            >
              Ir ao feed
            </Link>
          </div>

          <div className="space-y-4 sm:space-y-5">
            {feedItems.length === 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  Nenhuma atividade ainda.
                </p>

                <p className="mt-1 text-sm">
                  Quando você publicar ou repostar algo, aparecerá aqui.
                </p>
              </div>
            )}

            {feedItems.map((item) => {
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

              return (
                <PostCard
                  key={item.id}
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
                  showSensitiveContent={showSensitiveContent}
                  repostInfo={item.type === 'repost' ? item.repost : null}
                  footerLabel={
                    item.type === 'post'
                      ? `Publicado em ${new Date(post.created_at).toLocaleString('pt-BR')}`
                      : undefined
                  }
                  onLike={() => handleToggleLike(post.id)}
                  onCommentClick={() => router.push(`/post/${post.id}`)}
                  onRepost={() => handleToggleRepost(post.id)}
                  onSave={() => handleToggleBookmark(post.id)}
                  onShare={() => handleCopyPostLink(post.id)}
                  onCopy={() => handleCopyPostLink(post.id)}
                  onEdit={() => router.push(`/post/${post.id}`)}
                  onDelete={() => handleDeletePost(post.id)}
                  onReport={() => handleReportPost(post.id, post.user_id)}
                />
              )
            })}
          </div>
        </section>
      </section>

      {showAvatarModal && avatarPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowAvatarModal(false)}
            className="absolute inset-0 cursor-default"
            aria-label="Fechar foto de perfil"
          />

          <div className="relative z-[91] w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAvatarModal(false)}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={avatarPreview}
              alt={profileName}
              className="mx-auto aspect-square w-full max-w-sm rounded-3xl object-cover"
            />

            <p className="mt-3 text-center text-sm font-semibold text-white">
              {profileName}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}