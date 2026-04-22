'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ProfileInfo = {
  username: string
  display_name: string | null
}

type Post = {
  id: string
  user_id: string
  content: string | null
  category: string | null
  created_at: string
  profiles: ProfileInfo | ProfileInfo[] | null
}

type Like = {
  post_id: string
  user_id: string
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  profiles: ProfileInfo | ProfileInfo[] | null
}

function getProfile(profile: ProfileInfo | ProfileInfo[] | null) {
  if (Array.isArray(profile)) {
    return profile[0] || null
  }

  return profile
}

export default function FeedPage() {
  const router = useRouter()

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('cotidiano')
  const [posts, setPosts] = useState<Post[]>([])
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({})
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function start() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      await loadPosts(user.id)
      setLoading(false)
    }

    start()
  }, [router])

  async function loadPosts(currentUserId: string) {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        user_id,
        content,
        category,
        created_at,
        profiles (
          username,
          display_name
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage('Erro ao carregar posts: ' + error.message)
      return
    }

    const loadedPosts = (data || []) as Post[]
    setPosts(loadedPosts)

    const postIds = loadedPosts.map((post) => post.id)

    if (postIds.length === 0) {
      setLikeCounts({})
      setLikedPosts({})
      setComments({})
      return
    }

    await loadLikes(postIds, currentUserId)
    await loadComments(postIds)
  }

  async function loadLikes(postIds: string[], currentUserId: string) {
    const { data, error } = await supabase
      .from('likes')
      .select('post_id, user_id')
      .in('post_id', postIds)

    if (error) {
      setMessage('Erro ao carregar curtidas: ' + error.message)
      return
    }

    const counts: Record<string, number> = {}
    const liked: Record<string, boolean> = {}

      ; (data as Like[]).forEach((like) => {
        counts[like.post_id] = (counts[like.post_id] || 0) + 1

        if (like.user_id === currentUserId) {
          liked[like.post_id] = true
        }
      })

    setLikeCounts(counts)
    setLikedPosts(liked)
  }

  async function loadComments(postIds: string[]) {
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
          display_name
        )
      `)
      .in('post_id', postIds)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar comentários: ' + error.message)
      return
    }

    const groupedComments: Record<string, Comment[]> = {}

      ; ((data || []) as Comment[]).forEach((comment) => {
        if (!groupedComments[comment.post_id]) {
          groupedComments[comment.post_id] = []
        }

        groupedComments[comment.post_id].push(comment)
      })

    setComments(groupedComments)
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault()

    if (!content.trim()) {
      setMessage('Escreva algo antes de publicar.')
      return
    }

    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      content,
      category,
      visibility: 'public',
      is_sensitive: category === 'sensual' || category === 'adulto',
    })

    if (error) {
      setMessage('Erro ao publicar: ' + error.message)
      return
    }

    setContent('')
    setCategory('cotidiano')
    setMessage('Publicado com sucesso!')
    await loadPosts(userId)
  }

  async function handleToggleLike(postId: string) {
    if (!userId) return

    const alreadyLiked = likedPosts[postId]

    if (alreadyLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)

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

    await loadPosts(userId)
  }

  async function handleCreateComment(e: React.FormEvent, postId: string) {
    e.preventDefault()

    const text = commentTexts[postId] || ''

    if (!text.trim()) {
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

    setCommentTexts({
      ...commentTexts,
      [postId]: '',
    })

    setMessage('Comentário enviado!')
    await loadPosts(userId)
  }
  async function handleDeleteComment(commentId: string, commentUserId: string) {
    if (commentUserId !== userId) {
      setMessage('Você só pode excluir seus próprios comentários.')
      return
    }

    const confirmDelete = window.confirm('Tem certeza que deseja excluir este comentário?')

    if (!confirmDelete) {
      return
    }

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao excluir comentário: ' + error.message)
      return
    }

    setMessage('Comentário excluído com sucesso!')
    await loadPosts(userId)
  }
  async function handleDeletePost(postId: string, postUserId: string) {
    if (postUserId !== userId) {
      setMessage('Você só pode excluir suas próprias publicações.')
      return
    }

    const confirmDelete = window.confirm('Tem certeza que deseja excluir esta publicação?')

    if (!confirmDelete) {
      return
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao excluir publicação: ' + error.message)
      return
    }

    setMessage('Publicação excluída com sucesso!')
    await loadPosts(userId)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-400">Carregando feed...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-400">Só Entre Nós</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/profile')}
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Meu perfil
          </button>

          <button
            onClick={handleLogout}
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Sair
          </button>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 text-sm text-zinc-400">
          Logado como: <span className="text-white">{email}</span>
        </div>

        <form
          onSubmit={handleCreatePost}
          className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6"
        >
          <label className="block mb-3 text-sm text-zinc-300">
            O que você quer compartilhar?
          </label>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva sobre seu dia, uma viagem, um café, um pensamento..."
            className="w-full min-h-32 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500 resize-none"
          />

          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none"
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
              className="bg-white text-black px-6 py-3 rounded-xl font-medium hover:opacity-90"
            >
              Publicar
            </button>
          </div>

          {message && (
            <p className="mt-4 text-sm text-zinc-300">{message}</p>
          )}
        </form>

        <div className="space-y-4">
          {posts.length === 0 && (
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 text-zinc-400">
              Nenhuma publicação ainda.
            </div>
          )}

          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
            >
              <div className="mb-3">
                {(() => {
                  const profile = getProfile(post.profiles)

                  return (
                    <>
                      <Link
                        href={`/u/${profile?.username || 'usuario'}`}
                        className="font-semibold hover:underline"
                      >
                        {profile?.display_name || 'Usuário'}
                      </Link>

                      <p className="text-sm text-zinc-500">
                        @{profile?.username || 'usuario'} · {post.category}
                      </p>
                    </>
                  )
                })()}
              </div>

              <p className="text-zinc-200 whitespace-pre-wrap">{post.content}</p>

              <p className="text-xs text-zinc-600 mt-4">
                {new Date(post.created_at).toLocaleString('pt-BR')}
              </p>
              {post.user_id === userId && (
                <button
                  onClick={() => handleDeletePost(post.id, post.user_id)}
                  className="mt-3 text-sm text-red-400 hover:underline"
                >
                  Excluir publicação
                </button>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => handleToggleLike(post.id)}
                  className={`px-4 py-2 rounded-xl border ${likedPosts[post.id]
                    ? 'bg-white text-black border-white'
                    : 'border-zinc-700 hover:bg-zinc-800'
                    }`}
                >
                  {likedPosts[post.id] ? 'Curtido' : 'Curtir'}
                </button>

                <span className="text-sm text-zinc-400">
                  {likeCounts[post.id] || 0} curtida
                  {(likeCounts[post.id] || 0) === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-6 border-t border-zinc-800 pt-4">
                <p className="text-sm text-zinc-400 mb-3">
                  Comentários ({comments[post.id]?.length || 0})
                </p>

                <div className="space-y-3 mb-4">
                  {(comments[post.id] || []).map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-zinc-800 rounded-xl px-4 py-3"
                    >
                      {(() => {
                        const profile = getProfile(comment.profiles)

                        return (
                          <>
                            <Link
                              href={`/u/${profile?.username || 'usuario'}`}
                              className="text-sm font-semibold hover:underline"
                            >
                              {profile?.display_name || 'Usuário'}
                            </Link>

                            <p className="text-xs text-zinc-500 mb-2">
                              @{profile?.username || 'usuario'}
                            </p>
                          </>
                        )
                      })()}
                      <p className="text-sm text-zinc-200">{comment.content}</p>
                      <p className="text-xs text-zinc-500 mt-2">
                        {new Date(comment.created_at).toLocaleString('pt-BR')}
                      </p>

                      {comment.user_id === userId && (
                        <button
                          onClick={() => handleDeleteComment(comment.id, comment.user_id)}
                          className="mt-2 text-xs text-red-400 hover:underline"
                        >
                          Excluir comentário
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => handleCreateComment(e, post.id)}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    value={commentTexts[post.id] || ''}
                    onChange={(e) =>
                      setCommentTexts({
                        ...commentTexts,
                        [post.id]: e.target.value,
                      })
                    }
                    placeholder="Escreva um comentário..."
                    className="flex-1 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
                  />

                  <button
                    type="submit"
                    className="bg-white text-black px-5 py-3 rounded-xl font-medium hover:opacity-90"
                  >
                    Comentar
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}