'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Inbox,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import UserBadges from '../components/UserBadges'

type CurrentProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ConversationRow = {
  id: string
  type: string
  direct_key: string | null
  created_by: string
  created_at: string
  updated_at: string
}

type ParticipantRow = {
  conversation_id: string
  user_id: string
  last_read_at: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  type?: 'text' | 'call'
  call_type?: 'voice' | 'video' | null
  call_status?: 'missed' | 'declined' | 'ended' | 'canceled' | null
  call_duration_seconds?: number | null
  delivered_at?: string | null
  read_at?: string | null
  created_at: string
  deleted_at: string | null
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ConversationItem = {
  id: string
  updated_at: string
  otherUser: ProfileSummary | null
  lastMessage: MessageRow | null
  isUnread: boolean
  archived: boolean
}

type ConversationUserState = {
  conversation_id: string
  user_id: string
  cleared_at: string | null
  archived_at: string | null
  deleted_at: string | null
}

type ConversationView = 'recent' | 'archived'

function getDisplayName(profile: ProfileSummary | CurrentProfile | null) {
  if (!profile) return 'Usuário EntreUS'
  return profile.display_name || profile.username || 'Usuário EntreUS'
}

function getUsername(profile: ProfileSummary | null) {
  if (!profile?.username) return '@usuario'
  return `@${profile.username}`
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U'
}

function formatDate(value: string) {
  const date = new Date(value)
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInHours = diffInMs / (1000 * 60 * 60)

  if (diffInHours < 24) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function getMessagePreview(message: MessageRow | null, currentUserId: string) {
  if (!message) return 'Conversa iniciada.'
  if (message.deleted_at) return 'Mensagem apagada'
  if (message.type === 'call') {
    if (message.call_status === 'declined') return 'Chamada recusada'
    if (message.call_status === 'canceled') return 'Chamada cancelada'

    const kind = message.call_type === 'video' ? 'vídeo' : 'voz'
    if (message.call_status === 'missed') return `Chamada de ${kind} não atendida`
    if (message.call_status === 'ended') return `Chamada de ${kind} encerrada`

    return 'Evento de chamada'
  }

  const prefix = message.sender_id === currentUserId ? 'Você: ' : ''
  const content = message.content?.trim()

  return `${prefix}${content || 'Mídia enviada'}`
}

export default function MessagesPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [conversationView, setConversationView] = useState<ConversationView>('recent')

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [conversations, setConversations] = useState<ConversationItem[]>([])

  const visibleConversations = useMemo(() => {
    return conversations.filter((conversation) =>
      conversationView === 'archived' ? conversation.archived : !conversation.archived
    )
  }, [conversationView, conversations])

  const sortedConversations = useMemo(() => {
    return [...visibleConversations].sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [visibleConversations])

  const recentConversationsCount = useMemo(
    () => conversations.filter((conversation) => !conversation.archived).length,
    [conversations]
  )

  const archivedConversationsCount = useMemo(
    () => conversations.filter((conversation) => conversation.archived).length,
    [conversations]
  )

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) return sortedConversations

    return sortedConversations.filter((conversation) => {
      const name = getDisplayName(conversation.otherUser).toLowerCase()
      const username = getUsername(conversation.otherUser).toLowerCase()
      const preview = getMessagePreview(conversation.lastMessage, userId).toLowerCase()

      return name.includes(query) || username.includes(query) || preview.includes(query)
    })
  }, [searchQuery, sortedConversations, userId])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadPage() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setCurrentProfile(profileData as CurrentProfile)
      }

      await Promise.all([
        loadUnreadNotificationsCount(user.id),
        loadConversations(user.id),
      ])

      setLoading(false)
    }

    loadPage()
  }, [router])

  useEffect(() => {
    if (!userId) return

    let refreshTimer: number | null = null

    function scheduleMessagesRefresh() {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }

      refreshTimer = window.setTimeout(() => {
        loadConversations(userId)
        loadUnreadNotificationsCount(userId)
      }, 300)
    }

    const messagesChannel = supabase
      .channel(`messages-page-list-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const receivedMessage = payload.new as MessageRow

            if (receivedMessage.sender_id !== userId && !receivedMessage.delivered_at) {
              markMessageAsDelivered(receivedMessage.id)
            }
          }

          scheduleMessagesRefresh()
        }
      )
      .subscribe()

    const participantsChannel = supabase
      .channel(`messages-page-participants-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleMessagesRefresh()
        }
      )
      .subscribe()

    const conversationStateChannel = supabase
      .channel(`messages-page-state-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_user_state',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleMessagesRefresh()
        }
      )
      .subscribe()

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }

      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(participantsChannel)
      supabase.removeChannel(conversationStateChannel)
    }
  }, [userId])

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

  async function markMessageAsDelivered(messageId: string) {
    const { error } = await supabase
      .from('messages')
      .update({
        delivered_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .is('delivered_at', null)

    if (error) {
      console.error('Erro ao marcar mensagem como entregue:', error.message)
    }
  }

  async function loadConversations(currentUserId: string) {
    setMessage('')

    const { data: myParticipants, error: myParticipantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .eq('user_id', currentUserId)

    if (myParticipantsError) {
      setMessage('Erro ao carregar conversas: ' + myParticipantsError.message)
      return
    }

    const myParticipantRows = (myParticipants || []) as ParticipantRow[]
    const conversationIds = myParticipantRows.map((item) => item.conversation_id)

    if (conversationIds.length === 0) {
      setConversations([])
      return
    }

    const myParticipantByConversation = myParticipantRows.reduce(
      (acc, participant) => {
        acc[participant.conversation_id] = participant
        return acc
      },
      {} as Record<string, ParticipantRow>
    )

    const { data: conversationStatesData, error: conversationStatesError } = await supabase
      .from('conversation_user_state')
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .eq('user_id', currentUserId)
      .in('conversation_id', conversationIds)

    if (conversationStatesError) {
      setMessage('Erro ao carregar estado das conversas: ' + conversationStatesError.message)
      return
    }

    const stateByConversation = ((conversationStatesData || []) as ConversationUserState[]).reduce(
      (acc, item) => {
        acc[item.conversation_id] = item
        return acc
      },
      {} as Record<string, ConversationUserState>
    )

    const { data: conversationsData, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, type, direct_key, created_by, created_at, updated_at')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })

    if (conversationsError) {
      setMessage('Erro ao carregar conversas: ' + conversationsError.message)
      return
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', conversationIds)

    if (participantsError) {
      setMessage('Erro ao carregar participantes: ' + participantsError.message)
      return
    }

    const participantRows = (participantsData || []) as ParticipantRow[]

    const otherUserIds = Array.from(
      new Set(
        participantRows
          .map((item) => item.user_id)
          .filter((participantUserId) => participantUserId !== currentUserId)
      )
    )

    let profilesById: Record<string, ProfileSummary> = {}

    if (otherUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', otherUserIds)

      if (profilesError) {
        setMessage('Erro ao carregar perfis: ' + profilesError.message)
        return
      }

      profilesById = ((profilesData || []) as ProfileSummary[]).reduce(
        (acc, profile) => {
          acc[profile.id] = profile
          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, call_type, call_status, call_duration_seconds, created_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300)

    if (messagesError) {
      setMessage('Erro ao carregar últimas mensagens: ' + messagesError.message)
      return
    }

    const lastMessageByConversation: Record<string, MessageRow> = {}

    for (const item of (messagesData || []) as MessageRow[]) {
      const currentState = stateByConversation[item.conversation_id]
      const clearedAt = currentState?.cleared_at
        ? new Date(currentState.cleared_at).getTime()
        : 0
      const deletedAt = currentState?.deleted_at
        ? new Date(currentState.deleted_at).getTime()
        : 0
      const hiddenBefore = Math.max(clearedAt, deletedAt)

      if (hiddenBefore && new Date(item.created_at).getTime() <= hiddenBefore) {
        continue
      }

      if (!lastMessageByConversation[item.conversation_id]) {
        lastMessageByConversation[item.conversation_id] = item
      }
    }

    const items: ConversationItem[] = ((conversationsData || []) as ConversationRow[]).flatMap(
      (conversation) => {
        const participants = participantRows.filter(
          (participant) => participant.conversation_id === conversation.id
        )

        const otherParticipant = participants.find(
          (participant) => participant.user_id !== currentUserId
        )

        const lastMessage = lastMessageByConversation[conversation.id] || null
        const myParticipant = myParticipantByConversation[conversation.id]
        const currentState = stateByConversation[conversation.id]
        const deletedAt = currentState?.deleted_at
          ? new Date(currentState.deleted_at).getTime()
          : 0
        const lastMessageAt = lastMessage?.created_at
          ? new Date(lastMessage.created_at).getTime()
          : 0
        const reactivatedAfterDelete = !!(deletedAt && lastMessageAt > deletedAt)

        if (deletedAt && !reactivatedAfterDelete) {
          return []
        }

        const archived = !!currentState?.archived_at && !reactivatedAfterDelete
        const lastReadAt = myParticipant?.last_read_at
          ? new Date(myParticipant.last_read_at).getTime()
          : 0
        const clearedAt = currentState?.cleared_at
          ? new Date(currentState.cleared_at).getTime()
          : 0

        const isUnread = !!(
          lastMessage &&
          !lastMessage.deleted_at &&
          lastMessage.sender_id !== currentUserId &&
          new Date(lastMessage.created_at).getTime() > clearedAt &&
          new Date(lastMessage.created_at).getTime() > lastReadAt
        )

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: otherParticipant ? profilesById[otherParticipant.user_id] || null : null,
          lastMessage,
          isUnread,
          archived,
        }
      }
    )

    setConversations(items)
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <div className="flex items-center gap-3 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Carregando mensagens...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        displayName={currentProfile?.display_name || undefined}
        username={currentProfile?.username || null}
        email={email}
        avatarUrl={currentProfile?.avatar_url || null}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={getDisplayName(currentProfile)}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full overflow-hidden px-3 py-20 pb-24 sm:px-6 lg:mx-auto lg:flex lg:h-screen lg:max-w-[1280px] lg:pl-[104px] lg:pr-0 lg:py-0">
        <aside className="flex min-h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800/70 dark:bg-black lg:h-screen lg:w-[390px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none">
          <div className="shrink-0 border-b border-zinc-200/70 bg-white/90 px-5 py-5 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/90">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
                  Bate-papo
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Suas conversas privadas
                </p>
              </div>

              <Link
                href="/search"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:scale-105 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-full border border-zinc-200/70 bg-zinc-100/80 px-4 py-3 text-zinc-500 transition focus-within:border-blue-400 dark:border-zinc-800/70 dark:bg-zinc-950">
              <Search className="h-5 w-5 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar conversas"
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 rounded-full border border-zinc-200/70 bg-zinc-100/80 p-1 dark:border-zinc-800/70 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => setConversationView('recent')}
                className={`rounded-full px-3 py-2 text-sm font-black transition ${
                  conversationView === 'recent'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white'
                }`}
              >
                Recentes
                <span className="ml-1 text-xs opacity-75">{recentConversationsCount}</span>
              </button>

              <button
                type="button"
                onClick={() => setConversationView('archived')}
                className={`rounded-full px-3 py-2 text-sm font-black transition ${
                  conversationView === 'archived'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white'
                }`}
              >
                Arquivadas
                <span className="ml-1 text-xs opacity-75">{archivedConversationsCount}</span>
              </button>
            </div>
          </div>

          {message && (
            <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </div>
          )}

          {filteredConversations.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div className="rounded-[2rem] border border-dashed border-zinc-200 bg-zinc-50/80 p-7 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm dark:bg-zinc-900 dark:text-blue-300">
                  <Inbox className="h-7 w-7" />
                </div>

                <h3 className="text-lg font-black text-zinc-950 dark:text-white">
                  {conversationView === 'archived' ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa ainda'}
                </h3>

                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Encontre uma pessoa, abra o perfil e toque em “Mensagem” para começar um bate-papo privado.
                </p>

                <Link
                  href="/search"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:scale-[1.02] hover:bg-blue-700"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Explorar usuários
                </Link>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredConversations.map((conversation) => {
                const otherUser = conversation.otherUser
                const name = getDisplayName(otherUser)
                const preview = getMessagePreview(conversation.lastMessage, userId)

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${conversation.id}`}
                    className={`mx-3 my-1 flex items-center gap-3 rounded-[1.6rem] border px-3 py-3.5 transition ${
                      conversation.isUnread
                        ? 'border-blue-500/20 bg-blue-50/70 hover:bg-blue-50 dark:border-blue-500/20 dark:bg-blue-950/20 dark:hover:bg-blue-950/30'
                        : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {otherUser?.avatar_url ? (
                        <img
                          src={otherUser.avatar_url}
                          alt={name}
                          className="h-12 w-12 rounded-full border border-zinc-300 object-cover shadow-sm dark:border-zinc-700"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-base font-bold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {getInitial(name)}
                        </div>
                      )}

                      {conversation.isUnread && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-sm shadow-blue-500/40 dark:border-black" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {otherUser?.id && (
                          <UserBadges userId={otherUser.id} size="sm" max={1} />
                        )}

                        <p className={`truncate font-bold ${
                          conversation.isUnread
                            ? 'text-zinc-950 dark:text-white'
                            : 'text-zinc-800 dark:text-zinc-100'
                        }`}>
                          {name}
                        </p>
                      </div>

                      <p
                        className={`mt-1 truncate text-sm ${
                          conversation.isUnread
                            ? 'font-semibold text-zinc-800 dark:text-zinc-100'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {preview}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-zinc-500">
                      <span>
                        {formatDate(conversation.lastMessage?.created_at || conversation.updated_at)}
                      </span>

                      {conversation.isUnread && (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-blue-600/30">
                          Nova
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </aside>

        <div className="hidden min-h-0 flex-1 items-center justify-center overflow-hidden bg-white p-6 dark:bg-black lg:flex">
          <div className="relative w-full max-w-xl overflow-hidden rounded-[2.5rem] border border-zinc-200/70 bg-zinc-50 p-8 text-center shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/40">
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />

            <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-blue-300 dark:ring-zinc-800">
              <MessageCircle className="h-11 w-11" />
            </div>

            <div className="relative">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">
                Mensagens privadas
              </p>

              <h2 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
                Selecione uma conversa
              </h2>

              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Escolha alguém na lista ao lado para abrir o bate-papo. No celular, toque em uma conversa para abrir em tela cheia.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                  💬 Mensagens rápidas
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                  🎙️ Áudio e mídia
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                  🔒 Conversas privadas
                </span>
              </div>

              <Link
                href="/search"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:scale-[1.02] hover:bg-blue-700"
              >
                <MessageSquarePlus className="h-4 w-4" />
                Nova conversa
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
