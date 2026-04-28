'use client'

import BrandHeader from "../components/BrandHeader";
import Image from 'next/image'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

type Post = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url: string | null
  video_url: string | null
  visibility: 'public' | 'followers' | 'private'
  profiles: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  profiles: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
}

type Like = {
  id: string
  post_id: string
  user_id: string
}

type Follow = {
  id?: string
  follower_id: string
  following_id: string
}

function FeedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightedPostId = searchParams.get('post') || ''
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public')

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)

  const [imagePreview, setImagePreview] = useState('')
  const [videoPreview, setVideoPreview] = useState('')

  const [uploadingPostImage, setUploadingPostImage] = useState(false)
  const [uploadingPostVideo, setUploadingPostVideo] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [follows, setFollows] = useState<Follow[]>([])
  const [followLoadingUserId, setFollowLoadingUserId] = useState<string | null>(null)
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      const followsData = await loadFollows()
      setFollows(followsData)

      await Promise.all([
        loadPosts(user.id, blockedIds, followsData),
        loadComments(blockedIds),
        loadLikes(),
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

  async function loadPosts(
    currentUserId: string = userId,
    currentBlockedIds: string[] = blockedUserIds,
    currentFollows: Follow[] = follows
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
        profiles (
          username,
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage('Erro ao carregar posts: ' + error.message)
      return
    }

    const normalizedPosts = (data || [])
      .map((post: any) => ({
        ...post,
        visibility: (post.visibility || 'public') as 'public' | 'followers' | 'private',
        profiles: Array.isArray(post.profiles) ? post.profiles[0] || null : post.profiles,
      }))
      .filter((post: Post) => !currentBlockedIds.includes(post.user_id))
      .filter((post: Post) => canSeePost(post, currentUserId, currentFollows))

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
      setMessage('Erro ao carregar comentários: ' + error.message)
      return
    }

    const normalizedComments = (data || [])
      .map((comment: any) => ({
        ...comment,
        profiles: Array.isArray(comment.profiles) ? comment.profiles[0] || null : comment.profiles,
      }))
      .filter((comment: Comment) => !currentBlockedIds.includes(comment.user_id))

    setComments(normalizedComments)
  }

  async function loadLikes() {
    const { data, error } = await supabase.from('likes').select('*')

    if (error) {
      setMessage('Erro ao carregar curtidas: ' + error.message)
      return
    }

    setLikes(data || [])
  }

  async function refreshAfterFollowChange() {
    const freshFollows = await loadFollows()
    setFollows(freshFollows)
    await loadPosts(userId, blockedUserIds, freshFollows)
  }

  async function handleToggleFollow(targetUserId: string) {
    if (!userId || !targetUserId || userId === targetUserId) return

    if (blockedUserIds.includes(targetUserId)) {
      setMessage('Não é possível seguir um usuário bloqueado ou que te bloqueou.')
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
      setMessage('Erro ao verificar seguimento: ' + checkError.message)
      setFollowLoadingUserId(null)
      return
    }

    if (existingFollow) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('id', existingFollow.id)

      if (error) {
        setMessage('Erro ao deixar de seguir: ' + error.message)
        setFollowLoadingUserId(null)
        return
      }
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: userId,
        following_id: targetUserId,
      })

      if (error) {
        setMessage('Erro ao seguir: ' + error.message)
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

  async function uploadPostImage(file: File) {
    if (!userId) return null

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie uma imagem JPG, PNG ou WEBP.')
      return null
    }

    const maxSizeInBytes = 5 * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      setMessage('A imagem do post deve ter no máximo 5MB.')
      return null
    }

    setUploadingPostImage(true)

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${userId}/post-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setMessage('Erro ao enviar imagem do post: ' + uploadError.message)
      setUploadingPostImage(false)
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(filePath)

    setUploadingPostImage(false)
    return publicUrlData.publicUrl
  }

  async function uploadPostVideo(file: File) {
    if (!userId) return null

    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie um vídeo MP4, WEBM ou OGG.')
      return null
    }

    const maxSizeInBytes = 30 * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      setMessage('O vídeo deve ter no máximo 30MB.')
      return null
    }

    setUploadingPostVideo(true)

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4'
    const filePath = `${userId}/video-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('post-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setMessage('Erro ao enviar vídeo do post: ' + uploadError.message)
      setUploadingPostVideo(false)
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from('post-videos')
      .getPublicUrl(filePath)

    setUploadingPostVideo(false)
    return publicUrlData.publicUrl
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault()

    if (!content.trim() && !selectedImage && !selectedVideo) {
      setMessage('Escreva algo ou escolha uma mídia antes de publicar.')
      return
    }

    setMessage('')

    let uploadedImageUrl: string | null = null
    let uploadedVideoUrl: string | null = null

    if (selectedImage) {
      uploadedImageUrl = await uploadPostImage(selectedImage)
      if (selectedImage && !uploadedImageUrl) return
    }

    if (selectedVideo) {
      uploadedVideoUrl = await uploadPostVideo(selectedVideo)
      if (selectedVideo && !uploadedVideoUrl) return
    }

    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      content: content.trim() || null,
      category,
      image_url: uploadedImageUrl,
      video_url: uploadedVideoUrl,
      visibility,
      is_sensitive: category === 'sensual' || category === 'adulto',
    })

    if (error) {
      setMessage('Erro ao publicar: ' + error.message)
      return
    }

    setContent('')
    setCategory('cotidiano')
    setVisibility('public')
    setSelectedImage(null)
    setSelectedVideo(null)
    setImagePreview('')
    setVideoPreview('')
    setMessage('Publicado com sucesso!')
    await loadPosts()
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

    setMessage('Post excluído com sucesso!')
    await loadPosts()
    await loadComments()
    await loadLikes()
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
      setMessage('O post não pode ficar vazio.')
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
      setMessage('Erro ao editar: ' + error.message)
      setSavingEdit(false)
      return
    }

    setMessage('Post editado com sucesso!')
    setEditingPostId(null)
    setEditContent('')
    setSavingEdit(false)
    await loadPosts()
  }

  async function handleCreateComment(postId: string) {
    const text = commentInputs[postId]?.trim()

    if (!text) {
      setMessage('Escreva um comentário antes de enviar.')
      return
    }

    const { data: insertedComment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: text,
      })
      .select('id')
      .single()

    if (error) {
      setMessage('Erro ao comentar: ' + error.message)
      return
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

    setMessage('Comentário publicado com sucesso!')
    await loadComments()
  }

  async function handleToggleLike(postId: string) {
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
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id)

      if (error) {
        setMessage('Erro ao remover curtida: ' + error.message)
        return
      }
    } else {
      const { error } = await supabase.from('likes').insert({
        post_id: postId,
        user_id: userId,
      })

      if (error) {
        setMessage('Erro ao curtir: ' + error.message)
        return
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

    await loadLikes()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handleSelectImage(file: File | null) {
    if (!file) {
      setSelectedImage(null)
      setImagePreview('')
      return
    }

    setSelectedVideo(null)
    setVideoPreview('')

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie uma imagem JPG, PNG ou WEBP.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setSelectedImage(file)
    setImagePreview(previewUrl)
    setMessage('')
  }

  function handleSelectVideo(file: File | null) {
    if (!file) {
      setSelectedVideo(null)
      setVideoPreview('')
      return
    }

    setSelectedImage(null)
    setImagePreview('')

    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Envie um vídeo MP4, WEBM ou OGG.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setSelectedVideo(file)
    setVideoPreview(previewUrl)
    setMessage('')
  }

  function removeSelectedImage() {
    setSelectedImage(null)
    setImagePreview('')
  }

  function removeSelectedVideo() {
    setSelectedVideo(null)
    setVideoPreview('')
  }

  function getVisibilityLabel(value: Post['visibility']) {
    if (value === 'public') return 'Público'
    if (value === 'followers') return 'Só seguidores'
    return 'Privado'
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

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>Carregando feed...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-center justify-center shrink-0">
            <Image
              src="/logo.png"
              alt="Logo EntreUS"
              width={260}
              height={110}
              className="h-auto w-[200px] sm:w-[240px] object-contain"
              priority
            />

            <p className="-mt-2 text-center text-sm font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
              Só Entre Nós
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2 sm:gap-3">
            <Link
              href="/notifications"
              className="relative text-center border border-zinc-300 dark:border-zinc-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm sm:text-base"
            >
              Notificações
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </Link>

            <Link
              href="/search"
              className="text-center border border-zinc-300 dark:border-zinc-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm sm:text-base"
            >
              Buscar
            </Link>

            <Link
              href="/profile"
              className="text-center border border-zinc-300 dark:border-zinc-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm sm:text-base"
            >
              Meu perfil
            </Link>

            {mounted && (
              <button
                onClick={handleToggleTheme}
                className="border border-zinc-300 dark:border-zinc-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm sm:text-base"
              >
                {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              </button>
            )}

            <button
              onClick={handleLogout}
              className="border border-zinc-300 dark:border-zinc-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm sm:text-base col-span-2 sm:col-span-1"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-4 sm:mb-6 text-sm text-zinc-500 dark:text-zinc-400 break-all">
          Logado como: <span className="text-black dark:text-white">{email}</span>
        </div>

        <form
          onSubmit={handleCreatePost}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800 mb-6"
        >
          <label className="block mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            O que você quer compartilhar?
          </label>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva sobre seu dia, uma viagem, um café, um pensamento..."
            className="w-full min-h-32 sm:min-h-36 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none text-sm sm:text-base"
          />

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none text-sm sm:text-base"
              >
                <option value="cotidiano">Cotidiano</option>
                <option value="viagens">Viagens</option>
                <option value="lugares">Lugares</option>
                <option value="comida">Comida</option>
                <option value="pensamentos">Pensamentos</option>
                <option value="lifestyle">Lifestyle</option>
                <option value="sensual">Sensual</option>
                <option value="adulto">Adulto</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Privacidade
              </label>
              <select
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as 'public' | 'followers' | 'private')
                }
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none text-sm sm:text-base"
              >
                <option value="public">Público</option>
                <option value="followers">Só seguidores</option>
                <option value="private">Privado</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Imagem da publicação
              </label>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleSelectImage(e.target.files?.[0] || null)}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none text-sm sm:text-base"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                Vídeo da publicação
              </label>

              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg"
                onChange={(e) => handleSelectVideo(e.target.files?.[0] || null)}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none text-sm sm:text-base"
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500 mt-2">
            Imagem: JPG, PNG e WEBP até 5MB. Vídeo: MP4, WEBM ou OGG até 30MB.
          </p>

          {imagePreview && (
            <div className="mt-4">
              <p className="text-sm text-zinc-500 mb-3">Prévia da imagem</p>
              <img
                src={imagePreview}
                alt="Prévia"
                className="w-full max-h-80 sm:max-h-96 object-cover rounded-2xl border border-zinc-200 dark:border-zinc-700"
              />

              <button
                type="button"
                onClick={removeSelectedImage}
                className="mt-3 w-full sm:w-auto border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950"
              >
                Remover imagem
              </button>
            </div>
          )}

          {videoPreview && (
            <div className="mt-4">
              <p className="text-sm text-zinc-500 mb-3">Prévia do vídeo</p>
              <video
                src={videoPreview}
                controls
                className="w-full max-h-80 sm:max-h-96 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-black"
              />

              <button
                type="button"
                onClick={removeSelectedVideo}
                className="mt-3 w-full sm:w-auto border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950"
              >
                Remover vídeo
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Visibilidade atual:{' '}
              <span className="font-medium">{getVisibilityLabel(visibility)}</span>
            </p>

            <button
              type="submit"
              disabled={uploadingPostImage || uploadingPostVideo}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium ${uploadingPostImage || uploadingPostVideo
                ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                }`}
            >
              {uploadingPostImage
                ? 'Enviando imagem...'
                : uploadingPostVideo
                  ? 'Enviando vídeo...'
                  : 'Publicar'}
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>}
        </form>

        <div className="space-y-4 sm:space-y-5">
          {posts.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              Nenhuma publicação ainda.
            </div>
          )}

          {posts.map((post) => {
            const postComments = comments.filter((comment) => comment.post_id === post.id)
            const postLikes = likes.filter((like) => like.post_id === post.id)
            const userLiked = likes.some(
              (like) => like.post_id === post.id && like.user_id === userId
            )
            const isEditing = editingPostId === post.id
            const authorName =
              post.profiles?.display_name || post.profiles?.username || 'Usuário'
            const authorUsername = post.profiles?.username || 'usuario'
            const authorAvatar = post.profiles?.avatar_url || ''
            const isOwnPost = post.user_id === userId
            const isBlockedRelation = blockedUserIds.includes(post.user_id)
            const isFollowingAuthor = followStateMap.get(post.user_id) || false
            const isHighlighted = highlightedPostId === post.id

            return (
              <article
                id={`post-${post.id}`}
                key={post.id}
                className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border transition ${isHighlighted
                  ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900'
                  : 'border-zinc-200 dark:border-zinc-800'
                  }`}
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={`/u/${authorUsername}`}
                    className="flex items-center gap-3 hover:opacity-80 transition min-w-0"
                  >
                    {authorAvatar ? (
                      <img
                        src={authorAvatar}
                        alt={authorName}
                        className="w-12 h-12 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="font-semibold text-black dark:text-white break-words">
                        {authorName}
                      </p>
                      <p className="text-sm text-zinc-500 break-all">@{authorUsername}</p>
                    </div>
                  </Link>

                  {!isOwnPost && !isBlockedRelation && (
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(post.user_id)}
                      disabled={followLoadingUserId === post.user_id}
                      className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-medium transition ${isFollowingAuthor
                        ? 'border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                        } ${followLoadingUserId === post.user_id
                          ? 'opacity-60 cursor-not-allowed'
                          : ''
                        }`}
                    >
                      {followLoadingUserId === post.user_id
                        ? 'Carregando...'
                        : isFollowingAuthor
                          ? 'Seguindo'
                          : 'Seguir'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <p className="text-sm text-zinc-500">{post.category}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {getVisibilityLabel(post.visibility)}
                  </span>
                  {isHighlighted && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      Destaque da notificação
                    </span>
                  )}
                </div>

                <div className="mb-4 flex gap-2 flex-wrap">
                  {post.user_id === userId && (
                    <>
                      <button
                        onClick={() => handleStartEdit(post)}
                        className="text-sm border border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="text-sm border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        Excluir
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopyPostLink(post.id)}
                    className={`text-sm px-3 py-2 rounded-lg border ${copiedPostId === post.id
                      ? 'border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                  >
                    {copiedPostId === post.id ? 'Link copiado' : 'Copiar link'}
                  </button>

                  {post.user_id !== userId && (
                    <button
                      type="button"
                      onClick={() => handleReportPost(post.id, post.user_id)}
                      disabled={reportingPostId === post.id || reportedPostIds.includes(post.id)}
                      className={`text-sm px-3 py-2 rounded-lg ${reportedPostIds.includes(post.id)
                        ? 'border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
                        : 'border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950'
                        } ${reportingPostId === post.id ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                    >
                      {reportingPostId === post.id
                        ? 'Enviando...'
                        : reportedPostIds.includes(post.id)
                          ? 'Denunciado'
                          : 'Denunciar'}
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="mb-4">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full min-h-28 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none text-sm sm:text-base"
                    />

                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                      <button
                        onClick={() => handleSaveEdit(post.id)}
                        disabled={savingEdit}
                        className={`w-full sm:w-auto px-4 py-2 rounded-xl font-medium ${savingEdit
                          ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                          : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                          }`}
                      >
                        {savingEdit ? 'Salvando...' : 'Salvar'}
                      </button>

                      <button
                        onClick={handleCancelEdit}
                        className="w-full sm:w-auto border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {post.content && (
                      <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-4 break-words text-sm sm:text-base">
                        {post.content}
                      </p>
                    )}

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Imagem da publicação"
                        className="w-full max-h-[24rem] sm:max-h-[32rem] object-cover rounded-2xl border border-zinc-200 dark:border-zinc-700 mb-4"
                      />
                    )}

                    {post.video_url && (
                      <video
                        src={post.video_url}
                        controls
                        className="w-full max-h-[24rem] sm:max-h-[32rem] rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-black"
                      />
                    )}
                  </>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${userLiked
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                  >
                    {userLiked ? 'Curtido' : 'Curtir'}
                  </button>

                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {postLikes.length} curtida(s)
                  </span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-4 mb-4">
                  {new Date(post.created_at).toLocaleString('pt-BR')}
                </p>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
                    Comentários
                  </h3>

                  <div className="space-y-3 mb-4">
                    {postComments.length === 0 && (
                      <p className="text-sm text-zinc-500">Nenhum comentário ainda.</p>
                    )}

                    {postComments.map((comment) => {
                      const commentAuthorName =
                        comment.profiles?.display_name ||
                        comment.profiles?.username ||
                        'Usuário'
                      const commentAuthorUsername =
                        comment.profiles?.username || 'usuario'
                      const commentAuthorAvatar =
                        comment.profiles?.avatar_url || ''

                      return (
                        <div
                          key={comment.id}
                          className="bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm"
                        >
                          <div className="flex items-start gap-3">
                            <Link
                              href={`/u/${commentAuthorUsername}`}
                              className="shrink-0 hover:opacity-80 transition"
                            >
                              {commentAuthorAvatar ? (
                                <img
                                  src={commentAuthorAvatar}
                                  alt={commentAuthorName}
                                  className="w-10 h-10 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                  {commentAuthorName.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </Link>

                            <div className="flex-1 min-w-0">
                              <Link
                                href={`/u/${commentAuthorUsername}`}
                                className="block hover:opacity-80 transition"
                              >
                                <p className="font-semibold text-black dark:text-white break-words">
                                  {commentAuthorName}
                                </p>
                                <p className="text-xs text-zinc-500 break-all">@{commentAuthorUsername}</p>
                              </Link>

                              <p className="text-zinc-800 dark:text-zinc-200 mt-2 break-words">
                                {comment.content}
                              </p>

                              <p className="text-xs text-zinc-500 mt-2">
                                {new Date(comment.created_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) =>
                        setCommentInputs((prev) => ({
                          ...prev,
                          [post.id]: e.target.value,
                        }))
                      }
                      placeholder="Escreva um comentário..."
                      className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 text-sm sm:text-base"
                    />

                    <button
                      onClick={() => handleCreateComment(post.id)}
                      className="w-full sm:w-auto bg-black text-white dark:bg-zinc-100 dark:text-black px-5 py-3 rounded-xl font-medium hover:opacity-90"
                    >
                      Comentar
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
          <p>Carregando feed...</p>
        </main>
      }
    >
      <FeedContent />
    </Suspense>
  )
}