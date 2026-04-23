'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

type Post = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url: string | null
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

export default function FeedPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadingPostImage, setUploadingPostImage] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
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
      await loadPosts()
      await loadComments()
      await loadLikes()
      setLoading(false)
    }

    loadUserAndData()
  }, [router])

  async function loadPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        category,
        created_at,
        user_id,
        image_url,
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

    const normalizedPosts = (data || []).map((post: any) => ({
      ...post,
      profiles: Array.isArray(post.profiles) ? post.profiles[0] || null : post.profiles,
    }))

    setPosts(normalizedPosts)
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
    }))

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

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault()

    if (!content.trim() && !selectedImage) {
      setMessage('Escreva algo ou escolha uma imagem antes de publicar.')
      return
    }

    setMessage('')

    let uploadedImageUrl: string | null = null

    if (selectedImage) {
      uploadedImageUrl = await uploadPostImage(selectedImage)
      if (selectedImage && !uploadedImageUrl) {
        return
      }
    }

    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      content: content.trim() || null,
      category,
      image_url: uploadedImageUrl,
      visibility: 'public',
      is_sensitive: category === 'sensual' || category === 'adulto',
    })

    if (error) {
      setMessage('Erro ao publicar: ' + error.message)
      return
    }

    setContent('')
    setCategory('cotidiano')
    setSelectedImage(null)
    setImagePreview('')
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

    const { error } = await supabase
      .from('posts')
      .update({ content: editContent })
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao editar: ' + error.message)
      return
    }

    setMessage('Post editado com sucesso!')
    setEditingPostId(null)
    setEditContent('')
    await loadPosts()
  }

  async function handleCreateComment(postId: string) {
    const text = commentInputs[postId]?.trim()

    if (!text) {
      setMessage('Escreva um comentário antes de enviar.')
      return
    }

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: userId,
      content: text,
    })

    if (error) {
      setMessage('Erro ao comentar: ' + error.message)
      return
    }

    setCommentInputs((prev) => ({
      ...prev,
      [postId]: '',
    }))

    setMessage('Comentário publicado com sucesso!')
    await loadComments()
  }

  async function handleToggleLike(postId: string) {
    const alreadyLiked = likes.find(
      (like) => like.post_id === postId && like.user_id === userId
    )

    if (alreadyLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', alreadyLiked.id)

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

  function removeSelectedImage() {
    setSelectedImage(null)
    setImagePreview('')
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center">
        <p>Carregando feed...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Só Entre Nós</p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/profile"
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Meu perfil
          </Link>

          {mounted && (
            <button
              onClick={handleToggleTheme}
              className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
          )}

          <button
            onClick={handleLogout}
            className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Sair
          </button>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Logado como: <span className="text-black dark:text-white">{email}</span>
        </div>

        <form
          onSubmit={handleCreatePost}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 mb-6"
        >
          <label className="block mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            O que você quer compartilhar?
          </label>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva sobre seu dia, uma viagem, um café, um pensamento..."
            className="w-full min-h-32 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none"
          />

          <div className="mt-4">
            <label className="block mb-2 text-sm text-zinc-700 dark:text-zinc-300">
              Imagem da publicação
            </label>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleSelectImage(e.target.files?.[0] || null)}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none"
            />

            <p className="text-xs text-zinc-500 mt-2">
              Formatos aceitos: JPG, PNG e WEBP. Tamanho máximo: 5MB.
            </p>
          </div>

          {imagePreview && (
            <div className="mt-4">
              <p className="text-sm text-zinc-500 mb-3">Prévia da imagem</p>
              <img
                src={imagePreview}
                alt="Prévia"
                className="w-full max-h-96 object-cover rounded-2xl border border-zinc-200 dark:border-zinc-700"
              />

              <button
                type="button"
                onClick={removeSelectedImage}
                className="mt-3 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950"
              >
                Remover imagem
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none"
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

            <button
              type="submit"
              disabled={uploadingPostImage}
              className={`px-6 py-3 rounded-xl font-medium ${
                uploadingPostImage
                  ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                  : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
              }`}
            >
              {uploadingPostImage ? 'Enviando imagem...' : 'Publicar'}
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>}
        </form>

        <div className="space-y-4">
          {posts.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
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

            return (
              <article
                key={post.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800"
              >
                <div className="mb-3">
                  <Link
                    href={`/u/${authorUsername}`}
                    className="flex items-center gap-3 hover:opacity-80 transition"
                  >
                    {authorAvatar ? (
                      <img
                        src={authorAvatar}
                        alt={authorName}
                        className="w-12 h-12 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <p className="font-semibold text-black dark:text-white">{authorName}</p>
                      <p className="text-sm text-zinc-500">@{authorUsername}</p>
                    </div>
                  </Link>
                </div>

                <p className="text-sm text-zinc-500 mb-2">{post.category}</p>

                {post.user_id === userId && (
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => handleStartEdit(post)}
                      className="text-sm border border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="text-sm border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Excluir
                    </button>
                  </div>
                )}

                {isEditing ? (
                  <div className="mb-4">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full min-h-28 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none"
                    />

                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => handleSaveEdit(post.id)}
                        className="bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-xl font-medium hover:opacity-90"
                      >
                        Salvar
                      </button>

                      <button
                        onClick={handleCancelEdit}
                        className="border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {post.content && (
                      <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-4">
                        {post.content}
                      </p>
                    )}

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Imagem da publicação"
                        className="w-full max-h-[32rem] object-cover rounded-2xl border border-zinc-200 dark:border-zinc-700"
                      />
                    )}
                  </>
                )}

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${
                      userLiked
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

                            <div className="flex-1">
                              <Link
                                href={`/u/${commentAuthorUsername}`}
                                className="block hover:opacity-80 transition"
                              >
                                <p className="font-semibold text-black dark:text-white">
                                  {commentAuthorName}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  @{commentAuthorUsername}
                                </p>
                              </Link>

                              <p className="text-zinc-800 dark:text-zinc-200 mt-2">
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
                      className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
                    />

                    <button
                      onClick={() => handleCreateComment(post.id)}
                      className="bg-black text-white dark:bg-zinc-100 dark:text-black px-5 py-3 rounded-xl font-medium hover:opacity-90"
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