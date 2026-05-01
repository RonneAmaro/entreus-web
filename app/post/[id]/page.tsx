'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Heart, MessageCircle, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LinkPreview from '@/app/components/LinkPreview'
import PostMediaGallery from '@/app/components/PostMediaGallery'
import SensitiveContent from '@/app/components/SensitiveContent'

type VisibilityType = 'public' | 'followers' | 'private'

type Profile = {
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

type Like = {
  id: string
  post_id: string
  user_id: string
}

function getVisibilityLabel(value: VisibilityType) {
  if (value === 'followers') return 'Só seguidores'
  if (value === 'private') return 'Privado'
  return 'Público'
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

export default function PostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = typeof params.id === 'string' ? params.id : ''

  const [loggedUserId, setLoggedUserId] = useState('')
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingComment, setSendingComment] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [canInteract, setCanInteract] = useState(false)

  useEffect(() => {
    async function loadPostPage() {
      setLoading(true)
      setMessage('')

      if (!postId) {
        setMessage('Publicação inválida.')
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      const currentUserId = user?.id || ''
      setLoggedUserId(currentUserId)
      setCanInteract(!!currentUserId)

      const { data: postData, error: postError } = await supabase
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
        .eq('id', postId)
        .maybeSingle()

      if (postError) {
        setMessage('Erro ao carregar publicação: ' + postError.message)
        setLoading(false)
        return
      }

      if (!postData) {
        setMessage('Publicação não encontrada.')
        setLoading(false)
        return
      }

      const normalizedPost = {
        ...postData,
        visibility: (postData.visibility || 'public') as VisibilityType,
        is_sensitive: postData.is_sensitive || false,
        profiles: Array.isArray(postData.profiles)
          ? postData.profiles[0] || null
          : postData.profiles,
      } as Post

      const canSee = await checkCanSeePost(normalizedPost, currentUserId)

      if (!canSee) {
        setPost(normalizedPost)
        setMessage('Você não tem permissão para visualizar esta publicação.')
        setLoading(false)
        return
      }

      const { data: mediaData, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, user_id, media_url, media_type, position, created_at')
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
      ])

      setLoading(false)
    }

    loadPostPage()
  }, [postId])

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
        setMessage('Erro ao verificar permissão: ' + error.message)
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
      setMessage('Erro ao carregar comentários: ' + error.message)
      return
    }

    const normalizedComments = (data || []).map((comment: any) => ({
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
      setMessage('Erro ao carregar curtidas: ' + error.message)
      return
    }

    setLikes(data || [])
  }

  async function handleToggleLike() {
    if (!loggedUserId) {
      router.push('/login')
      return
    }

    const existingLike = likes.find((like) => like.user_id === loggedUserId)

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
        user_id: loggedUserId,
      })

      if (error) {
        setMessage('Erro ao curtir: ' + error.message)
        return
      }

      if (post && post.user_id !== loggedUserId) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          actor_id: loggedUserId,
          type: 'like',
          post_id: postId,
        })
      }
    }

    await loadLikes()
  }

  async function handleCreateComment(e: React.FormEvent) {
    e.preventDefault()

    if (!loggedUserId) {
      router.push('/login')
      return
    }

    const text = commentInput.trim()

    if (!text) {
      setMessage('Escreva um comentário antes de enviar.')
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
      setMessage('Erro ao comentar: ' + error.message)
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
      setCopySuccess(true)

      setTimeout(() => {
        setCopySuccess(false)
      }, 2000)
    } catch {
      setMessage('Não foi possível copiar o link.')
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-black dark:bg-black dark:text-white">
        <p>Carregando publicação...</p>
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
              Voltar
            </Link>

            <strong>EntreUS</strong>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-700 dark:text-zinc-300">
              {message || 'Publicação não encontrada.'}
            </p>
          </div>
        </section>
      </main>
    )
  }

  const authorName =
    post.profiles?.display_name || post.profiles?.username || 'Usuário'

  const authorUsername = post.profiles?.username || 'usuario'
  const authorAvatar = post.profiles?.avatar_url || ''
  const userLiked = likes.some((like) => like.user_id === loggedUserId)
  const postMedia = getPostMedia(post)

  const isSensitivePost =
    post.is_sensitive ||
    post.category === 'adulto' ||
    post.category === 'sensual'

  const blockedByVisibility =
    message === 'Você não tem permissão para visualizar esta publicação.'

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
            Voltar
          </button>

          <Link href="/feed" className="font-bold">
            EntreUS
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-6">
        {blockedByVisibility ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h1 className="text-xl font-bold">Publicação restrita</h1>

            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Essa publicação não está disponível para sua conta ou precisa de login.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-xl bg-black px-5 py-3 text-center font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                Entrar
              </Link>

              <Link
                href="/signup"
                className="rounded-xl border border-zinc-300 px-5 py-3 text-center font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Criar conta
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <Link href={`/u/${authorUsername}`} className="shrink-0">
                  {authorAvatar ? (
                    <img
                      src={authorAvatar}
                      alt={authorName}
                      className="h-12 w-12 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>

                <div className="min-w-0">
                  <Link
                    href={`/u/${authorUsername}`}
                    className="font-semibold text-black hover:underline dark:text-white"
                  >
                    {authorName}
                  </Link>

                  <p className="break-all text-sm text-zinc-500">
                    @{authorUsername}
                  </p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-500">
                  {post.category || 'Sem categoria'}
                </span>

                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {getVisibilityLabel(post.visibility)}
                </span>

                {isSensitivePost && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                    18+
                  </span>
                )}
              </div>

              {isSensitivePost ? (
                <SensitiveContent>
                  {post.content && (
                    <p className="mb-4 whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {post.content}
                    </p>
                  )}

                  <LinkPreview content={post.content} />

                  <PostMediaGallery media={postMedia} />
                </SensitiveContent>
              ) : (
                <>
                  {post.content && (
                    <p className="mb-4 whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {post.content}
                    </p>
                  )}

                  <LinkPreview content={post.content} />

                  <PostMediaGallery media={postMedia} />
                </>
              )}

              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-600">
                {new Date(post.created_at).toLocaleString('pt-BR')}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-zinc-200 pt-4 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('single-post-comment-input')
                    if (input instanceof HTMLInputElement) {
                      input.focus()
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30"
                >
                  <MessageCircle className="h-5 w-5" />
                  {comments.length}
                </button>

                <button
                  type="button"
                  onClick={handleToggleLike}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
                    userLiked
                      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                      : 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
                  }`}
                >
                  <Heart className={`h-5 w-5 ${userLiked ? 'fill-current' : ''}`} />
                  {likes.length}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
                    copySuccess
                      ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
                      : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
                  }`}
                >
                  <Share2 className="h-5 w-5" />
                  <span className="hidden sm:inline">
                    {copySuccess ? 'Copiado' : 'Compartilhar'}
                  </span>
                </button>
              </div>
            </article>

            {!canInteract && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-semibold">
                  Entre no EntreUS para interagir com esta publicação.
                </p>

                <p className="mt-1 text-sm opacity-90">
                  Crie sua conta para curtir, comentar, seguir perfis e participar da rede.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="rounded-xl bg-black px-5 py-3 text-center font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
                  >
                    Entrar
                  </Link>

                  <Link
                    href="/signup"
                    className="rounded-xl border border-blue-300 px-5 py-3 text-center font-medium hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-950"
                  >
                    Criar conta
                  </Link>
                </div>
              </div>
            )}

            <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
              <h2 className="mb-4 text-lg font-bold">Comentários</h2>

              {canInteract ? (
                <form onSubmit={handleCreateComment} className="mb-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="single-post-comment-input"
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Escreva um comentário..."
                    className="flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />

                  <button
                    type="submit"
                    disabled={sendingComment}
                    className="rounded-xl bg-black px-5 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
                  >
                    {sendingComment ? 'Enviando...' : 'Comentar'}
                  </button>
                </form>
              ) : (
                <p className="mb-5 text-sm text-zinc-500">
                  Faça login para comentar.
                </p>
              )}

              {message && !blockedByVisibility && (
                <p className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {message}
                </p>
              )}

              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    Nenhum comentário ainda.
                  </p>
                )}

                {comments.map((comment) => {
                  const commentAuthorName =
                    comment.profiles?.display_name ||
                    comment.profiles?.username ||
                    'Usuário'

                  const commentAuthorUsername =
                    comment.profiles?.username || 'usuario'

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

                          <p className="mt-2 break-words text-sm text-zinc-800 dark:text-zinc-200">
                            {comment.content}
                          </p>

                          <p className="mt-2 text-xs text-zinc-500">
                            {new Date(comment.created_at).toLocaleString('pt-BR')}
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