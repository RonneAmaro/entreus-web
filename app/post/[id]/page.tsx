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
  avatar_url: string | null
}

type Post = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url?: string | null
  visibility?: 'public' | 'followers' | 'private'
}

type FollowProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
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
  const [blockLoading, setBlockLoading] = useState(false)
  const [reportingUser, setReportingUser] = useState(false)
  const [reportedUser, setReportedUser] = useState(false)

  const [isBlockedByMe, setIsBlockedByMe] = useState(false)
  const [hasBlockedMe, setHasBlockedMe] = useState(false)

  const [showFollowersModal, setShowFollowersModal] = useState(false)
  const [showFollowingModal, setShowFollowingModal] = useState(false)
  const [followersList, setFollowersList] = useState<FollowProfile[]>([])
  const [followingList, setFollowingList] = useState<FollowProfile[]>([])
  const [loadingFollowers, setLoadingFollowers] = useState(false)
  const [loadingFollowing, setLoadingFollowing] = useState(false)

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
        .select('id, username, display_name, bio, avatar_url')
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

      const isOwn = user.id === profileData.id

      if (!isOwn) {
        const { data: blockedByMeData, error: blockedByMeError } = await supabase
          .from('blocks')
          .select('id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', profileData.id)
          .maybeSingle()

        if (blockedByMeError) {
          setMessage('Erro ao verificar bloqueio: ' + blockedByMeError.message)
          setLoading(false)
          return
        }

        const { data: hasBlockedMeData, error: hasBlockedMeError } = await supabase
          .from('blocks')
          .select('id')
          .eq('blocker_id', profileData.id)
          .eq('blocked_id', user.id)
          .maybeSingle()

        if (hasBlockedMeError) {
          setMessage('Erro ao verificar bloqueio: ' + hasBlockedMeError.message)
          setLoading(false)
          return
        }

        const blockedByMe = !!blockedByMeData
        const blockedMe = !!hasBlockedMeData

        setIsBlockedByMe(blockedByMe)
        setHasBlockedMe(blockedMe)

        if (!blockedByMe && !blockedMe) {
          const { data: followData } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', profileData.id)
            .maybeSingle()

          setIsFollowing(!!followData)

          const { data: postsData, error: postsError } = await supabase
            .from('posts')
            .select('id, content, category, created_at, user_id, image_url, visibility')
            .eq('user_id', profileData.id)
            .order('created_at', { ascending: false })

          if (postsError) {
            setMessage('Erro ao carregar posts: ' + postsError.message)
            setLoading(false)
            return
          }

          const visiblePosts = (postsData || []).filter((post: Post) => {
            const visibility = post.visibility || 'public'
            if (visibility === 'public') return true
            if (visibility === 'followers') return !!followData
            return false
          })

          setPosts(visiblePosts)

          const { data: followersData, error: followersError } = await supabase
            .from('follows')
            .select('id')
            .eq('following_id', profileData.id)

          if (followersError) {
            setMessage('Erro ao carregar seguidores: ' + followersError.message)
            setLoading(false)
            return
          }

          setFollowersCount(followersData?.length || 0)

          const { data: followingData, error: followingError } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', profileData.id)

          if (followingError) {
            setMessage('Erro ao carregar seguindo: ' + followingError.message)
            setLoading(false)
            return
          }

          setFollowingCount(followingData?.length || 0)
        } else {
          setPosts([])
          setFollowersCount(0)
          setFollowingCount(0)
          setIsFollowing(false)
        }
      } else {
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('id, content, category, created_at, user_id, image_url, visibility')
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
          .select('id')
          .eq('following_id', profileData.id)

        if (followersError) {
          setMessage('Erro ao carregar seguidores: ' + followersError.message)
          setLoading(false)
          return
        }

        setFollowersCount(followersData?.length || 0)

        const { data: followingData, error: followingError } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', profileData.id)

        if (followingError) {
          setMessage('Erro ao carregar seguindo: ' + followingError.message)
          setLoading(false)
          return
        }

        setFollowingCount(followingData?.length || 0)
      }

      setLoading(false)
    }

    loadPage()
  }, [username, router])

  async function refreshProfileState(profileId: string, currentUserId: string) {
    const isOwn = currentUserId === profileId

    if (!isOwn) {
      const { data: blockedByMeData } = await supabase
        .from('blocks')
        .select('id')
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', profileId)
        .maybeSingle()

      const { data: hasBlockedMeData } = await supabase
        .from('blocks')
        .select('id')
        .eq('blocker_id', profileId)
        .eq('blocked_id', currentUserId)
        .maybeSingle()

      const blockedByMe = !!blockedByMeData
      const blockedMe = !!hasBlockedMeData

      setIsBlockedByMe(blockedByMe)
      setHasBlockedMe(blockedMe)

      if (blockedByMe || blockedMe) {
        setPosts([])
        setFollowersCount(0)
        setFollowingCount(0)
        setIsFollowing(false)
        return
      }

      const { data: followData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', profileId)
        .maybeSingle()

      setIsFollowing(!!followData)

      const { data: postsData } = await supabase
        .from('posts')
        .select('id, content, category, created_at, user_id, image_url, visibility')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })

      const visiblePosts = (postsData || []).filter((post: Post) => {
        const visibility = post.visibility || 'public'
        if (visibility === 'public') return true
        if (visibility === 'followers') return !!followData
        return false
      })

      setPosts(visiblePosts)
    }

    const { data: followersData } = await supabase
      .from('follows')
      .select('id')
      .eq('following_id', profileId)

    setFollowersCount(followersData?.length || 0)

    const { data: followingData } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', profileId)

    setFollowingCount(followingData?.length || 0)
  }

  async function handleToggleFollow() {
    if (!profile || !loggedUserId) return
    if (loggedUserId === profile.id) return
    if (isBlockedByMe || hasBlockedMe) {
      setMessage('Não é possível seguir enquanto houver bloqueio entre vocês.')
      return
    }

    setFollowLoading(true)
    setMessage('')

    const { data: existingFollow, error: checkError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', loggedUserId)
      .eq('following_id', profile.id)
      .maybeSingle()

    if (checkError) {
      setMessage('Erro ao verificar seguimento: ' + checkError.message)
      setFollowLoading(false)
      return
    }

    if (existingFollow) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('id', existingFollow.id)

      if (error) {
        setMessage('Erro ao deixar de seguir: ' + error.message)
        setFollowLoading(false)
        return
      }
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
    }

    await refreshProfileState(profile.id, loggedUserId)
    setFollowLoading(false)
  }

  async function handleToggleBlock() {
    if (!profile || !loggedUserId) return
    if (loggedUserId === profile.id) return

    setBlockLoading(true)
    setMessage('')

    if (isBlockedByMe) {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', loggedUserId)
        .eq('blocked_id', profile.id)

      if (error) {
        setMessage('Erro ao desbloquear usuário: ' + error.message)
        setBlockLoading(false)
        return
      }

      setMessage('Usuário desbloqueado com sucesso.')
    } else {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', loggedUserId)
        .eq('following_id', profile.id)

      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', profile.id)
        .eq('following_id', loggedUserId)

      const { error } = await supabase.from('blocks').insert({
        blocker_id: loggedUserId,
        blocked_id: profile.id,
      })

      if (error) {
        setMessage('Erro ao bloquear usuário: ' + error.message)
        setBlockLoading(false)
        return
      }

      setMessage('Usuário bloqueado com sucesso.')
    }

    await refreshProfileState(profile.id, loggedUserId)
    setBlockLoading(false)
  }

  async function handleReportUser() {
    if (!profile || !loggedUserId) return
    if (loggedUserId === profile.id) {
      setMessage('Você não pode denunciar seu próprio perfil.')
      return
    }

    const reason = window.prompt(
      'Informe o motivo da denúncia.\nEx.: assédio, perfil falso, conteúdo ofensivo, spam'
    )

    if (!reason || !reason.trim()) {
      return
    }

    setReportingUser(true)
    setMessage('')

    const { error } = await supabase.from('reports').insert({
      reporter_id: loggedUserId,
      reported_user_id: profile.id,
      reason: reason.trim(),
    })

    if (error) {
      setMessage('Erro ao denunciar usuário: ' + error.message)
      setReportingUser(false)
      return
    }

    setReportedUser(true)
    setMessage('Usuário denunciado com sucesso.')
    setReportingUser(false)
  }

  async function loadFollowersList() {
    if (!profile) return

    setLoadingFollowers(true)

    const { data: followsData, error: followsError } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', profile.id)

    if (followsError) {
      setMessage('Erro ao carregar seguidores: ' + followsError.message)
      setLoadingFollowers(false)
      return
    }

    const followerIds = (followsData || []).map((item) => item.follower_id).filter(Boolean)

    if (followerIds.length === 0) {
      setFollowersList([])
      setLoadingFollowers(false)
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', followerIds)

    if (profilesError) {
      setMessage('Erro ao carregar seguidores: ' + profilesError.message)
      setLoadingFollowers(false)
      return
    }

    setFollowersList(profilesData || [])
    setLoadingFollowers(false)
  }

  async function loadFollowingList() {
    if (!profile) return

    setLoadingFollowing(true)

    const { data: followsData, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id)

    if (followsError) {
      setMessage('Erro ao carregar seguindo: ' + followsError.message)
      setLoadingFollowing(false)
      return
    }

    const followingIds = (followsData || []).map((item) => item.following_id).filter(Boolean)

    if (followingIds.length === 0) {
      setFollowingList([])
      setLoadingFollowing(false)
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', followingIds)

    if (profilesError) {
      setMessage('Erro ao carregar seguindo: ' + profilesError.message)
      setLoadingFollowing(false)
      return
    }

    setFollowingList(profilesData || [])
    setLoadingFollowing(false)
  }

  async function handleOpenFollowers() {
    setShowFollowersModal(true)
    await loadFollowersList()
  }

  async function handleOpenFollowing() {
    setShowFollowingModal(true)
    await loadFollowingList()
  }

  function getVisibilityLabel(value?: Post['visibility']) {
    if (value === 'followers') return 'Só seguidores'
    if (value === 'private') return 'Privado'
    return 'Público'
  }

  function renderProfileListItem(item: FollowProfile) {
    const itemName = item.display_name || item.username

    return (
      <Link
        key={item.id}
        href={`/u/${item.username}`}
        onClick={() => {
          setShowFollowersModal(false)
          setShowFollowingModal(false)
        }}
        className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      >
        {item.avatar_url ? (
          <img
            src={item.avatar_url}
            alt={itemName}
            className="w-12 h-12 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
            {itemName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0">
          <p className="font-semibold text-black dark:text-white break-words">{itemName}</p>
          <p className="text-sm text-zinc-500 break-all">@{item.username}</p>
        </div>
      </Link>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>Carregando perfil...</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
        <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">EntreUS</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Só Entre Nós</p>
            </div>

            <Link
              href="/feed"
              className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Voltar ao feed
            </Link>
          </div>
        </header>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-700 dark:text-zinc-300">{message || 'Perfil não encontrado.'}</p>
          </div>
        </section>
      </main>
    )
  }

  const displayName = profile.display_name || profile.username
  const isOwnProfile = loggedUserId === profile.id

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">EntreUS</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Só Entre Nós</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {isOwnProfile && (
              <Link
                href="/profile"
                className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Meu perfil
              </Link>
            )}

            <Link
              href="/feed"
              className="w-full sm:w-auto text-center border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Voltar ao feed
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-20 h-20 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold text-black dark:text-white break-words">
                    {displayName}
                  </h2>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-1 break-all">@{profile.username}</p>
                </div>
              </div>

              {!isOwnProfile && !hasBlockedMe && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={followLoading || isBlockedByMe}
                    className={`px-4 py-2 rounded-xl font-medium transition text-sm ${
                      isFollowing
                        ? 'border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                    } ${followLoading || isBlockedByMe ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {followLoading ? 'Carregando...' : isFollowing ? 'Seguindo' : 'Seguir'}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockLoading}
                    className={`px-4 py-2 rounded-xl font-medium transition text-sm ${
                      isBlockedByMe
                        ? 'border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        : 'border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950'
                    } ${blockLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {blockLoading
                      ? 'Carregando...'
                      : isBlockedByMe
                      ? 'Desbloquear'
                      : 'Bloquear'}
                  </button>

                  <button
                    type="button"
                    onClick={handleReportUser}
                    disabled={reportingUser || reportedUser}
                    className={`px-4 py-2 rounded-xl font-medium transition text-sm ${
                      reportedUser
                        ? 'border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
                        : 'border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950'
                    } ${reportingUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {reportingUser
                      ? 'Enviando...'
                      : reportedUser
                      ? 'Usuário denunciado'
                      : 'Denunciar'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-sm">
              <button
                type="button"
                onClick={handleOpenFollowers}
                className="text-left rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                <span className="block font-semibold text-black dark:text-white text-base sm:text-lg">
                  {followersCount}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">seguidores</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFollowing}
                className="text-left rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                <span className="block font-semibold text-black dark:text-white text-base sm:text-lg">
                  {followingCount}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">seguindo</span>
              </button>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-3">
                <span className="block font-semibold text-black dark:text-white text-base sm:text-lg">
                  {posts.length}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">publicações</span>
              </div>
            </div>

            <div>
              {hasBlockedMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  Você não pode visualizar este perfil porque este usuário te bloqueou.
                </p>
              ) : isBlockedByMe ? (
                <p className="text-zinc-700 dark:text-zinc-300">
                  Você bloqueou este usuário. Desbloqueie para voltar a ver o conteúdo dele.
                </p>
              ) : (
                <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words text-sm sm:text-base">
                  {profile.bio?.trim() || 'Este usuário ainda não adicionou uma bio.'}
                </p>
              )}
            </div>

            {message && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
            )}
          </div>
        </div>

        {!hasBlockedMe && !isBlockedByMe && (
          <>
            <div className="mb-4">
              <h3 className="text-lg sm:text-xl font-semibold text-black dark:text-white break-words">
                Publicações de {displayName}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {posts.length} publicação(ões)
              </p>
            </div>

            <div className="space-y-4 sm:space-y-5">
              {posts.length === 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                  Nenhuma publicação visível ainda.
                </div>
              )}

              {posts.map((post) => (
                <article
                  key={post.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="mb-3 flex items-center gap-3 min-w-0">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={displayName}
                        className="w-12 h-12 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="font-semibold text-black dark:text-white break-words">{displayName}</p>
                      <p className="text-sm text-zinc-500 break-all">@{profile.username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <p className="text-sm text-zinc-500">
                      {post.category || 'Sem categoria'}
                    </p>
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                      {getVisibilityLabel(post.visibility)}
                    </span>
                  </div>

                  {post.content && (
                    <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-4 break-words text-sm sm:text-base">
                      {post.content}
                    </p>
                  )}

                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt="Imagem da publicação"
                      className="w-full max-h-[24rem] sm:max-h-[32rem] object-cover rounded-2xl border border-zinc-200 dark:border-zinc-700"
                    />
                  )}

                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-4">
                    {new Date(post.created_at).toLocaleString('pt-BR')}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {showFollowersModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-black dark:text-white">Seguidores</h3>
              <button
                type="button"
                onClick={() => setShowFollowersModal(false)}
                className="border border-zinc-300 dark:border-zinc-700 px-3 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            <div className="p-3 sm:p-4 overflow-y-auto">
              {loadingFollowers ? (
                <p className="text-zinc-500 dark:text-zinc-400">Carregando seguidores...</p>
              ) : followersList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">Nenhum seguidor ainda.</p>
              ) : (
                <div className="space-y-2">{followersList.map(renderProfileListItem)}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-black dark:text-white">Seguindo</h3>
              <button
                type="button"
                onClick={() => setShowFollowingModal(false)}
                className="border border-zinc-300 dark:border-zinc-700 px-3 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            <div className="p-3 sm:p-4 overflow-y-auto">
              {loadingFollowing ? (
                <p className="text-zinc-500 dark:text-zinc-400">Carregando usuários...</p>
              ) : followingList.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">Este usuário ainda não segue ninguém.</p>
              ) : (
                <div className="space-y-2">{followingList.map(renderProfileListItem)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}