'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import BrandHeader from '../components/BrandHeader'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Inbox, Loader2, MessageCircle } from 'lucide-react'
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
  content: string
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

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MessagesPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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

    const conversationIds = (myParticipants || []).map((item) => item.conversation_id)

    if (conversationIds.length === 0) {
      setConversations([])
      return
    }

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
      .limit(200)

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

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: otherParticipant ? profilesById[otherParticipant.user_id] || null : null,
          lastMessage: lastMessageByConversation[conversation.id] || null,
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

      <section className="w-full max-w-4xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
        <BrandHeader
          subtitle="Mensagens"
          description="Converse de forma privada com outros usuários da EntreUS."
          compact
          rightContent={
            <Link
              href="/search"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
            >
              Buscar pessoas
            </Link>
          }
        />

        {message && (
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {message}
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-950 dark:text-white">
              <MessageCircle className="h-5 w-5" />
              Suas conversas
            </h2>
          </div>

          {sortedConversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Inbox className="h-7 w-7" />
              </div>

              <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                Nenhuma conversa ainda
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                Abra o perfil de uma pessoa e toque em “Mensagem” para iniciar uma conversa privada.
              </p>

              <Link
                href="/search"
                className="mt-5 inline-flex rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
              >
                Explorar usuários
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedConversations.map((conversation) => {
                const otherUser = conversation.otherUser
                const name = getDisplayName(otherUser)

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${conversation.id}`}
                    className="flex items-center gap-4 p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-950 sm:p-5"
                  >
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

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {otherUser?.id && (
                          <UserBadges userId={otherUser.id} size="sm" max={1} />
                        )}

                        <p className="truncate font-bold text-zinc-950 dark:text-white">
                          {name}
                        </p>
                      </div>

                      <p className="mt-0.5 truncate text-sm text-zinc-500">
                        {getUsername(otherUser)}
                      </p>

                      <p className="mt-2 truncate text-sm text-zinc-600 dark:text-zinc-400">
                        {conversation.lastMessage
                          ? conversation.lastMessage.deleted_at
                            ? 'Mensagem apagada'
                            : conversation.lastMessage.content
                          : 'Conversa iniciada.'}
                      </p>
                    </div>

                    <div className="hidden text-right text-xs text-zinc-500 sm:block">
                      {formatDate(conversation.lastMessage?.created_at || conversation.updated_at)}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}