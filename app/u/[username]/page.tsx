'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
}

type Post = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
}

export default function PublicProfilePage() {
  const params = useParams()
  const router = useRouter()
  const username = typeof params.username === 'string' ? params.username : ''

  const [loggedUserId, setLoggedUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    async function loadPage() {
      setLoading(true)
      setMessage('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setLoggedUserId(user.id)

      if (!username) {
        setMessage('Usuário inválido.')
        setLoading(false)
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio')
        .eq('username', username)
        .maybeSingle()

      if (profileError) {
        setMessage('Erro ao carregar perfil: ' + profileError.message)
        setLoading(false)
        return
      }

      if (!profileData) {
        setMessage('Perfil não encontrado.')
        setLoading(false)
        return
      }

      setProfile(profileData)

      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('id, content, category, created_at, user_id')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })

      if (postsError) {
        setMessage('Erro ao carregar posts: ' + postsError.message)
        setLoading(false)
        return
      }

      setPosts(postsData || [])

      const { data: followersData, error: followersError } = await supabase
        .from('follows')
        .select('id', { count: 'exact' })
        .eq('following_id', profileData.id)

      if (followersError) {
        setMessage('Erro ao carregar seguidores: ' + followersError.message)
        setLoading(false)
        return
      }

      setFollowersCount(followersData?.length || 0)

      const { data: followingData, error: followingError } = await supabase
        .from('follows')
        .select('id', { count: 'exact' })
        .eq('follower_id', profileData.id)

      if (followingError) {
        setMessage('Erro ao carregar seguindo: ' + followingError.message)
        setLoading(false)
        return
      }

      setFollowingCount(followingData?.length || 0)

      if (user.id !== profileData.id) {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle()

        if (followError) {
          setMessage('Erro ao verificar seguimento: ' + followError.message)
          setLoading(false)
          return
        }

        setIsFollowing(!!followData)
      }

      setLoading(false)
    }

    loadPage()
  }, [username, router])

  async function refreshFollowStats(profileId: string, currentUserId: string) {
    const { data: followersData, error: followersError } = await supabase
      .from('follows')
      .select('id', { count: 'exact' })
      .eq('following_id', profileId)

    if (!followersError) {
      setFollowersCount(followersData?.length || 0)
    }

    const { data: followingData, error: followingError } = await supabase
      .from('follows')
      .select('id', { count: 'exact' })
      .eq('follower_id', profileId)

    if (!followingError) {
      setFollowingCount(followingData?.length || 0)
    }

    if (currentUserId !== profileId) {
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', profileId)
        .maybeSingle()

      if (!followError) {
        setIsFollowing(!!followData)
      }
    }
  }

  async function handleToggleFollow() {
    if (!profile || !loggedUserId) return
    if (loggedUserId === profile.id) return

    setFollowLoading(true)
    setMessage('')

    if (isFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', loggedUserId)
        .eq('following_id', profile.id)

      if (error) {
        setMessage('Erro ao deixar de seguir: ' + error.message)
        setFollowLoading(false)
        return
      }

      setIsFollowing(false)
      setFollowersCount((prev) => Math.max(prev - 1, 0))
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: loggedUserId,
        following_id: profile.id,
      })

      if (error) {
        setMessage('Erro ao seguir: ' + error.message)
        setFollowLoading(false)
        return
      }

      setIsFollowing(true)
      setFollowersCount((prev) => prev + 1)
    }

    await refreshFollowStats(profile.id, loggedUserId)
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Carregando perfil...</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-black text-white">
        <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">EntreUS</h1>
            <p className="text-sm text-zinc-400">Só Entre Nós</p>
          </div>

          <Link
            href="/feed"
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Voltar ao feed
          </Link>
        </header>

        <section className="max-w-3xl mx-auto px-6 py-8">
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
            <p className="text-zinc-300">{message || 'Perfil não encontrado.'}</p>
          </div>
        </section>
      </main>
    )
  }

  const displayName = profile.display_name || profile.username
  const isOwnProfile = loggedUserId === profile.id

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EntreUS</h1>
          <p className="text-sm text-zinc-400">Só Entre Nós</p>
        </div>

        <div className="flex gap-3">
          {isOwnProfile && (
            <Link
              href="/profile"
              className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
            >
              Meu perfil
            </Link>
          )}

          <Link
            href="/feed"
            className="border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-900"
          >
            Voltar ao feed
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
          <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
            <div>
              <h2 className="text-2xl font-bold text-white">{displayName}</h2>
              <p className="text-zinc-400 mt-1">@{profile.username}</p>
            </div>

            {!isOwnProfile && (
              <button
                type="button"
                onClick={handleToggleFollow}
                disabled={followLoading}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  isFollowing
                    ? 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                    : 'bg-white text-black hover:opacity-90'
                } ${followLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {followLoading ? 'Carregando...' : isFollowing ? 'Seguindo' : 'Seguir'}
              </button>
            )}
          </div>

          <div className="mt-4 flex gap-6 text-sm text-zinc-300">
            <p>
              <span className="font-semibold text-white">{posts.length}</span> publicações
            </p>
            <p>
              <span className="font-semibold text-white">{followersCount}</span> seguidores
            </p>
            <p>
              <span className="font-semibold text-white">{followingCount}</span> seguindo
            </p>
          </div>

          <div className="mt-4">
            <p className="text-zinc-200 whitespace-pre-wrap">
              {profile.bio?.trim() || 'Este usuário ainda não adicionou uma bio.'}
            </p>
          </div>

          {message && (
            <p className="mt-4 text-sm text-zinc-400">{message}</p>
          )}
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">
            Publicações de {displayName}
          </h3>
          <p className="text-sm text-zinc-400">
            {posts.length} publicação(ões)
          </p>
        </div>

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
                <p className="font-semibold text-white">{displayName}</p>
                <p className="text-sm text-zinc-500">@{profile.username}</p>
              </div>

              <p className="text-sm text-zinc-500 mb-2">
                {post.category || 'Sem categoria'}
              </p>

              <p className="text-zinc-200 whitespace-pre-wrap">
                {post.content || ''}
              </p>

              <p className="text-xs text-zinc-600 mt-4">
                {new Date(post.created_at).toLocaleString('pt-BR')}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}