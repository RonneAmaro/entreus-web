'use client'

import PostComposer from '../components/PostComposer'
import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import PostMoreMenu from '../components/PostMoreMenu'
import PostMediaGallery from '../components/PostMediaGallery'
import PostActions from '../components/PostActions'
import Link from 'next/link'
import { Edit3, MoreHorizontal, Trash2 } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

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
  profiles: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
  media?: PostMedia[]
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

function FeedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightedPostId = searchParams.get('post') || ''
  const { theme, setTheme } = useTheme()

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
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .single()

      if (!profileError && profileData) {
        setCurrentProfile(profileData as CurrentProfile)
      }

      const blockedIds = await loadBlockedUserIds(user.id)
      setBlockedUserIds(blockedIds)

      const followsData = await loadFollows()
      setFollows(followsData)

      await Promise.all([
        loadPosts(user.id, blockedIds, followsData),
        loadComments(blockedIds),
        loadLikes(),
        loadCommentLikes(),
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

    const rawPosts = (data || []).map((post: any) => ({
      ...post,
      visibility: (post.visibility || 'public') as VisibilityType,
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
        profiles: Array.isArray(comment.profiles)
          ? comment.profiles[0] || null
          : comment.profiles,
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

  async function loadCommentLikes() {
    const { data, error } = await supabase
      .from('comment_likes')
      .select('id, comment_id, user_id')

    if (error) {
      setMessage('Erro ao carregar curtidas dos comentários: ' + error.message)
      return
    }

    setCommentLikes(data || [])
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

  function isImage(file: File) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  }

  function isVideo(file: File) {
    return ['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)
  }

  async function uploadMediaFile(file: File) {
    if (!userId) return null

    if (isImage(file)) {
      const maxSizeInBytes = 5 * 1024 * 1024

      if (file.size > maxSizeInBytes) {
        setMessage('Cada imagem deve ter no máximo 5MB.')
        return null
      }

      setUploadingPostImage(true)

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const filePath = `${userId}/post-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      setUploadingPostImage(false)

      if (uploadError) {
        setMessage('Erro ao enviar imagem do post: ' + uploadError.message)
        return null
      }

      const { data: publicUrlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath)

      return {
        url: publicUrlData.publicUrl,
        type: 'image' as const,
      }
    }

    if (isVideo(file)) {
      const maxSizeInBytes = 30 * 1024 * 1024

      if (file.size > maxSizeInBytes) {
        setMessage('Cada vídeo deve ter no máximo 30MB.')
        return null
      }

      setUploadingPostVideo(true)

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4'
      const filePath = `${userId}/video-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('post-videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      setUploadingPostVideo(false)

      if (uploadError) {
        setMessage('Erro ao enviar vídeo do post: ' + uploadError.message)
        return null
      }

      const { data: publicUrlData } = supabase.storage
        .from('post-videos')
        .getPublicUrl(filePath)

      return {
        url: publicUrlData.publicUrl,
        type: 'video' as const,
      }
    }

    setMessage('Envie apenas imagens JPG, PNG, WEBP ou vídeos MP4, WEBM, OGG.')
    return null
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
      setMessage('Escreva algo ou escolha uma mídia antes de publicar.')
      return
    }

    if (finalMediaFiles.length > 5) {
      setMessage('Você pode publicar no máximo 5 mídias por publicação.')
      return
    }

    setMessage('')

    const uploadedMedia: {
      url: string
      type: 'image' | 'video'
    }[] = []

    for (const file of finalMediaFiles) {
      const uploaded = await uploadMediaFile(file)

      if (!uploaded) {
        return
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
      setMessage('Erro ao publicar: ' + error.message)
      return
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
        setMessage('Post criado, mas houve erro ao salvar mídias: ' + mediaError.message)
        await loadPosts()
        await loadComments()
        await loadLikes()
        await loadCommentLikes()
        return
      }
    }

    setMessage('Publicado com sucesso!')

    await loadPosts()
    await loadComments()
    await loadLikes()
    await loadCommentLikes()
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
    await loadCommentLikes()
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
    await loadCommentLikes()
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
        setMessage('Erro ao remover curtida do comentário: ' + error.message)
        return
      }
    } else {
      const { error } = await supabase.from('comment_likes').insert({
        comment_id: commentId,
        user_id: userId,
      })

      if (error) {
        setMessage('Erro ao curtir comentário: ' + error.message)
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
      setMessage('O comentário não pode ficar vazio.')
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
      setMessage('Erro ao editar comentário: ' + error.message)
      setSavingCommentId(null)
      return
    }

    setMessage('Comentário editado com sucesso.')
    setEditingCommentId(null)
    setEditCommentContent('')
    setSavingCommentId(null)

    await loadComments()
  }

  async function handleDeleteComment(commentId: string) {
    const confirmDelete = window.confirm('Tem certeza que deseja excluir este comentário?')

    if (!confirmDelete) return

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao excluir comentário: ' + error.message)
      return
    }

    setMessage('Comentário excluído com sucesso.')
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

  function getVisibilityLabel(value: Post['visibility']) {
    if (value === 'public') return 'Público'
    if (value === 'followers') return 'Só seguidores'

    return 'Privado'
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

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>Carregando feed...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-black dark:bg-black dark:text-white transition-colors">
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
        onPostClick={handlePostComposerFocus}
      />

      <section className="w-full max-w-2xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-42rem)/2))] lg:py-8">
        <div className="mb-4 sm:mb-6 text-sm text-zinc-500 dark:text-zinc-400 break-all">
          Logado como:{' '}
          <span className="text-black dark:text-white">
            {email}
          </span>
        </div>

        <div id="post-composer" className="mb-6 scroll-mt-24">
          <PostComposer
            userName={currentProfile?.display_name || currentProfile?.username || email || 'Usuário'}
            userAvatarUrl={currentProfile?.avatar_url || null}
            submitting={uploadingPostImage || uploadingPostVideo}
            onSubmit={handleCreatePost}
          />

          {message && (
            <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {message}
            </p>
          )}
        </div>

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
            const postMedia = getPostMedia(post)

            return (
              <article
                id={`post-${post.id}`}
                key={post.id}
                className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border transition ${isHighlighted
                    ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900'
                    : 'border-zinc-200 dark:border-zinc-800'
                  }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <Link
                    href={`/u/${authorUsername}`}
                    className="flex min-w-0 items-center gap-3 hover:opacity-80 transition"
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

                      <p className="text-sm text-zinc-500 break-all">
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
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${isFollowingAuthor
                          ? 'border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                          : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
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
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <p className="text-sm text-zinc-500">
                    {post.category}
                  </p>

                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {getVisibilityLabel(post.visibility)}
                  </span>

                  {isHighlighted && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      Destaque da notificação
                    </span>
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

                    <PostMediaGallery media={postMedia} />
                  </>
                )}

                <PostActions
                  commentsCount={postComments.length}
                  likesCount={postLikes.length}
                  liked={userLiked}
                  copied={copiedPostId === post.id}
                  onLike={() => handleToggleLike(post.id)}
                  onCommentClick={() => handleFocusCommentInput(post.id)}
                  onShare={() => handleCopyPostLink(post.id)}
                />

                <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-3 mb-4">
                  {new Date(post.created_at).toLocaleString('pt-BR')}
                </p>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
                    Comentários
                  </h3>

                  <div className="space-y-3 mb-4">
                    {postComments.length === 0 && (
                      <p className="text-sm text-zinc-500">
                        Nenhum comentário ainda.
                      </p>
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
                          className="rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-800"
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

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <Link
                                  href={`/u/${commentAuthorUsername}`}
                                  className="block min-w-0 hover:opacity-80 transition"
                                >
                                  <p className="font-semibold text-black dark:text-white break-words">
                                    {commentAuthorName}
                                  </p>

                                  <p className="text-xs text-zinc-500 break-all">
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
                                      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                      aria-label="Opções do comentário"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>

                                    {openCommentMenuId === comment.id && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setOpenCommentMenuId(null)}
                                          className="fixed inset-0 z-40 cursor-default"
                                          aria-label="Fechar menu"
                                        />

                                        <div className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                                          <button
                                            type="button"
                                            onClick={() => handleStartEditComment(comment)}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                                          >
                                            <Edit3 className="h-4 w-4" />
                                            Editar comentário
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleDeleteComment(comment.id)}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            Excluir comentário
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
                                    className="w-full min-h-24 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                                  />

                                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveCommentEdit(comment.id)}
                                      disabled={savingCommentId === comment.id}
                                      className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
                                    >
                                      {savingCommentId === comment.id
                                        ? 'Salvando...'
                                        : 'Salvar'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={handleCancelEditComment}
                                      className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-zinc-800 dark:text-zinc-200 mt-2 break-words">
                                  {comment.content}
                                </p>
                              )}

                              <div className="mt-2 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCommentLike(comment.id)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${userLikedComment
                                      ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                                      : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                  <span>{userLikedComment ? '♥' : '♡'}</span>
                                  <span>{likesForComment.length}</span>
                                </button>

                                <p className="text-xs text-zinc-500">
                                  {new Date(comment.created_at).toLocaleString('pt-BR')}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      id={`comment-input-${post.id}`}
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