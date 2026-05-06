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
}

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

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [conversations, setConversations] = useState<ConversationItem[]>([])

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [conversations])

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
      .select('id, conversation_id, sender_id, content, created_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300)

    if (messagesError) {
      setMessage('Erro ao carregar últimas mensagens: ' + messagesError.message)
      return
    }

    const lastMessageByConversation: Record<string, MessageRow> = {}

    for (const item of (messagesData || []) as MessageRow[]) {
      if (!lastMessageByConversation[item.conversation_id]) {
        lastMessageByConversation[item.conversation_id] = item
      }
    }

    const items: ConversationItem[] = ((conversationsData || []) as ConversationRow[]).map(
      (conversation) => {
        const participants = participantRows.filter(
          (participant) => participant.conversation_id === conversation.id
        )

        const otherParticipant = participants.find(
          (participant) => participant.user_id !== currentUserId
        )

        const lastMessage = lastMessageByConversation[conversation.id] || null
        const myParticipant = myParticipantByConversation[conversation.id]
        const lastReadAt = myParticipant?.last_read_at
          ? new Date(myParticipant.last_read_at).getTime()
          : 0

        const isUnread = !!(
          lastMessage &&
          !lastMessage.deleted_at &&
          lastMessage.sender_id !== currentUserId &&
          new Date(lastMessage.created_at).getTime() > lastReadAt
        )

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: otherParticipant ? profilesById[otherParticipant.user_id] || null : null,
          lastMessage,
          isUnread,
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

      <section className="w-full overflow-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[270px] lg:flex lg:h-screen lg:w-[calc(100vw-270px)] lg:px-0 lg:py-0">
        <aside className="flex min-h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-black lg:h-screen lg:w-[390px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none">
          <div className="shrink-0 border-b border-zinc-200 px-5 py-5 dark:border-zinc-800">
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-3 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <Search className="h-5 w-5 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar conversas"
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white"
              />
            </div>
          </div>

          {message && (
            <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </div>
          )}

          {filteredConversations.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <Inbox className="h-7 w-7" />
                </div>

                <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                  Nenhuma conversa
                </h3>

                <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                  Abra o perfil de uma pessoa e toque em “Mensagem” para iniciar uma conversa.
                </p>

                <Link
                  href="/search"
                  className="mt-5 inline-flex rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
                >
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
                    className="flex items-center gap-3 border-b border-zinc-100 px-4 py-4 transition hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-950"
                  >
                    <div className="relative shrink-0">
                      {otherUser?.avatar_url ? (
                        <img
                          src={otherUser.avatar_url}
                          alt={name}
                          className="h-14 w-14 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-lg font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {getInitial(name)}
                        </div>
                      )}

                      {conversation.isUnread && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 dark:border-black" />
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

                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {preview}
                      </p>
                    </div>

                    <div className="shrink-0 text-right text-xs text-zinc-500">
                      {formatDate(conversation.lastMessage?.created_at || conversation.updated_at)}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </aside>

        <div className="hidden min-h-0 flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black lg:flex">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white text-zinc-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
              <MessageCircle className="h-9 w-9" />
            </div>

            <h2 className="text-2xl font-black text-zinc-950 dark:text-white">
              Selecione uma conversa
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Escolha uma conversa na coluna ao lado para abrir o bate-papo.
              No celular, toque em uma conversa para abrir em tela cheia.
            </p>

            <Link
              href="/search"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Nova conversa
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
