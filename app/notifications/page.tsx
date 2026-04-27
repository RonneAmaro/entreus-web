'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type NotificationRow = {
  id: string
  user_id: string
  actor_id: string
  type: 'follow' | 'like' | 'comment'
  post_id: string | null
  comment_id: string | null
  created_at: string
  read: boolean
}

type ActorProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type PostPreview = {
  id: string
  content: string | null
  image_url: string | null
}

type CommentPreview = {
  id: string
  content: string
}

type NotificationItem = {
  id: string
  user_id: string
  actor_id: string
  type: 'follow' | 'like' | 'comment'
  post_id: string | null
  comment_id: string | null
  created_at: string
  read: boolean
  actor_profile: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
  post_preview: {
    content: string | null
    image_url: string | null
  } | null
  comment_preview: {
    content: string
  } | null
}

export default function NotificationsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadNotifications() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          actor_id,
          type,
          post_id,
          comment_id,
          created_at,
          read
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        setMessage('Erro ao carregar notificações: ' + error.message)
        setLoading(false)
        return
      }

      const notificationsData: NotificationRow[] = data || []

      const actorIds = [...new Set(notificationsData.map((item) => item.actor_id).filter(Boolean))]
      const postIds = [...new Set(notificationsData.map((item) => item.post_id).filter(Boolean))] as string[]
      const commentIds = [...new Set(notificationsData.map((item) => item.comment_id).filter(Boolean))] as string[]

      let actorProfilesMap: Record<string, ActorProfile> = {}
      let postsMap: Record<string, PostPreview> = {}
      let commentsMap: Record<string, CommentPreview> = {}

      if (actorIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', actorIds)

        if (profilesError) {
          setMessage('Erro ao carregar perfis das notificações: ' + profilesError.message)
          setLoading(false)
          return
        }

        actorProfilesMap = Object.fromEntries(
          (profilesData || []).map((profile) => [profile.id, profile])
        )
      }

      if (postIds.length > 0) {
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('id, content, image_url')
          .in('id', postIds)

        if (postsError) {
          setMessage('Erro ao carregar posts das notificações: ' + postsError.message)
          setLoading(false)
          return
        }

        postsMap = Object.fromEntries(
          (postsData || []).map((post) => [post.id, post])
        )
      }

      if (commentIds.length > 0) {
        const { data: commentsData, error: commentsError } = await supabase
          .from('comments')
          .select('id, content')
          .in('id', commentIds)

        if (commentsError) {
          setMessage('Erro ao carregar comentários das notificações: ' + commentsError.message)
          setLoading(false)
          return
        }

        commentsMap = Object.fromEntries(
          (commentsData || []).map((comment) => [comment.id, comment])
        )
      }

      const finalNotifications: NotificationItem[] = notificationsData.map((item) => ({
        ...item,
        actor_profile: actorProfilesMap[item.actor_id]
          ? {
              username: actorProfilesMap[item.actor_id].username,
              display_name: actorProfilesMap[item.actor_id].display_name,
              avatar_url: actorProfilesMap[item.actor_id].avatar_url,
            }
          : null,
        post_preview: item.post_id && postsMap[item.post_id]
          ? {
              content: postsMap[item.post_id].content,
              image_url: postsMap[item.post_id].image_url,
            }
          : null,
        comment_preview: item.comment_id && commentsMap[item.comment_id]
          ? {
              content: commentsMap[item.comment_id].content,
            }
          : null,
      }))

      setNotifications(finalNotifications)

      const unreadIds = finalNotifications.filter((item) => !item.read).map((item) => item.id)

      if (unreadIds.length > 0) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .in('id', unreadIds)
      }

      setLoading(false)
    }

    loadNotifications()
  }, [router])

  function truncateText(text: string | null | undefined, max = 90) {
    if (!text || !text.trim()) return ''
    const clean = text.trim()
    if (clean.length <= max) return clean
    return clean.slice(0, max) + '...'
  }

  function getNotificationTitle(item: NotificationItem) {
    const actorName =
      item.actor_profile?.display_name || item.actor_profile?.username || 'Usuário'

    if (item.type === 'follow') {
      return `${actorName} começou a seguir você.`
    }

    if (item.type === 'like') {
      return `${actorName} curtiu sua publicação.`
    }

    if (item.type === 'comment') {
      return `${actorName} comentou na sua publicação.`
    }

    return 'Você recebeu uma nova notificação.'
  }

  function getNotificationLink(item: NotificationItem) {
    if (item.post_id) {
      return `/feed?post=${item.post_id}`
    }

    if (item.actor_profile?.username) {
      return `/u/${item.actor_profile.username}`
    }

    return '/feed'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-4">
        <p>Carregando notificações...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">EntreUS</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Notificações</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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
        {message && (
          <div className="mb-4 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
            {message}
          </div>
        )}

        <div className="space-y-4">
          {notifications.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              Nenhuma notificação ainda.
            </div>
          )}

          {notifications.map((item) => {
            const actorName =
              item.actor_profile?.display_name || item.actor_profile?.username || 'Usuário'

            return (
              <Link
                key={item.id}
                href={getNotificationLink(item)}
                className="block bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-5 border border-zinc-200 dark:border-zinc-800 hover:opacity-95 transition"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {item.actor_profile?.avatar_url ? (
                    <img
                      src={item.actor_profile.avatar_url}
                      alt={actorName}
                      className="w-12 h-12 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
                      {actorName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-black dark:text-white font-medium break-words text-sm sm:text-base">
                      {getNotificationTitle(item)}
                    </p>

                    {item.type === 'comment' && item.comment_preview?.content && (
                      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 break-words">
                        <span className="font-medium">Comentário:</span>{' '}
                        "{truncateText(item.comment_preview.content, 120)}"
                      </p>
                    )}

                    {(item.type === 'comment' || item.type === 'like') && (
                      <div className="mt-2">
                        {item.post_preview?.content ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400 break-words">
                            <span className="font-medium">No post:</span>{' '}
                            "{truncateText(item.post_preview.content, 120)}"
                          </p>
                        ) : item.post_preview?.image_url ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            <span className="font-medium">No post:</span> publicação com imagem
                          </p>
                        ) : null}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-zinc-500 mt-3">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}