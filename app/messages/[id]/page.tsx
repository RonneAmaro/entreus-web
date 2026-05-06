'use client'

import AppSidebar from '../../components/AppSidebar'
import MobileNavigation from '../../components/MobileNavigation'
import UserBadges from '../../components/UserBadges'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type CurrentProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ParticipantRow = {
  id: string
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
  updated_at: string
  deleted_at: string | null
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

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const conversationId = typeof params.id === 'string' ? params.id : ''

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [otherProfile, setOtherProfile] = useState<ProfileSummary | null>(null)
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  const otherUserId = useMemo(() => {
    return participants.find((participant) => participant.user_id !== userId)?.user_id || ''
  }, [participants, userId])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadPage() {
      if (!conversationId) {
        setMessage('Conversa inválida.')
        setLoading(false)
        return
      }

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
        loadConversation(user.id),
      ])

      setLoading(false)
    }

    loadPage()
  }, [conversationId, router])

  useEffect(() => {
    if (!conversationId || !userId) return

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const receivedMessage = payload.new as MessageRow

          setMessages((current) => {
            const exists = current.some((item) => item.id === receivedMessage.id)
            if (exists) return current

            return [...current, receivedMessage]
          })

          markConversationAsRead(userId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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

  async function loadConversation(currentUserId: string) {
    setMessage('')

    const { data: membership, error: membershipError } = await supabase
      .from('conversation_participants')
      .select('id, conversation_id, user_id, last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (membershipError) {
      setMessage('Erro ao verificar conversa: ' + membershipError.message)
      return
    }

    if (!membership) {
      setMessage('Você não participa desta conversa.')
      return
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('id, conversation_id, user_id, last_read_at')
      .eq('conversation_id', conversationId)

    if (participantsError) {
      setMessage('Erro ao carregar participantes: ' + participantsError.message)
      return
    }

    const participantRows = (participantsData || []) as ParticipantRow[]
    setParticipants(participantRows)

    const participantUserIds = participantRows.map((participant) => participant.user_id)

    if (participantUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', participantUserIds)

      if (profilesError) {
        setMessage('Erro ao carregar perfil da conversa: ' + profilesError.message)
        return
      }

      const profiles = (profilesData || []) as ProfileSummary[]
      const other = profiles.find((profile) => profile.id !== currentUserId) || null
      setOtherProfile(other)
    }

    await loadMessages()
    await markConversationAsRead(currentUserId)
  }

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at, updated_at, deleted_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar mensagens: ' + error.message)
      return
    }

    setMessages((data || []) as MessageRow[])
  }

  async function markConversationAsRead(currentUserId: string) {
    await supabase
      .from('conversation_participants')
      .update({
        last_read_at: new Date().toISOString(),
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
  }

  async function hasBlockBetweenUsers(currentUserId: string, targetUserId: string) {
    if (!targetUserId) return false

    const { data: blockedByMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', targetUserId)
      .maybeSingle()

    const { data: blockedMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', targetUserId)
      .eq('blocked_id', currentUserId)
      .maybeSingle()

    return !!blockedByMe || !!blockedMe
  }

  async function handleSendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const content = newMessage.trim()

    if (!content || !userId || !conversationId) return

    const blocked = await hasBlockBetweenUsers(userId, otherUserId)

    if (blocked) {
      setMessage('Não é possível enviar mensagem enquanto houver bloqueio entre vocês.')
      return
    }

    setSending(true)
    setMessage('')

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
      })
      .select('id, conversation_id, sender_id, content, created_at, updated_at, deleted_at')
      .single()

    if (error) {
      setMessage('Erro ao enviar mensagem: ' + error.message)
      setSending(false)
      return
    }

    if (data) {
      setMessages((current) => {
        const exists = current.some((item) => item.id === data.id)
        if (exists) return current

        return [...current, data as MessageRow]
      })
    }

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    await markConversationAsRead(userId)

    setNewMessage('')
    setSending(false)
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

  const otherName = getDisplayName(otherProfile)

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <div className="flex items-center gap-3 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Carregando conversa...</span>
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

      <section className="flex min-h-screen w-full max-w-4xl flex-col overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
        <div className="mb-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:px-5">
            <Link
              href="/messages"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-900"
              aria-label="Voltar para mensagens"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {otherProfile?.avatar_url ? (
              <img
                src={otherProfile.avatar_url}
                alt={otherName}
                className="h-12 w-12 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {getInitial(otherName)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {otherProfile?.id && (
                  <UserBadges userId={otherProfile.id} size="sm" max={1} />
                )}

                <h1 className="truncate text-base font-bold text-zinc-950 dark:text-white sm:text-lg">
                  {otherName}
                </h1>
              </div>

              <p className="truncate text-sm text-zinc-500">
                {getUsername(otherProfile)}
              </p>
            </div>

            {otherProfile?.username && (
              <Link
                href={`/u/${otherProfile.username}`}
                className="hidden rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 sm:inline-flex"
              >
                Ver perfil
              </Link>
            )}
          </div>

          {message && (
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </div>
          )}

          <div className="flex min-h-[55vh] flex-col gap-3 bg-zinc-50 p-4 dark:bg-zinc-950 sm:p-5">
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-center">
                <div>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-zinc-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
                    <Send className="h-6 w-6" />
                  </div>

                  <h2 className="font-bold text-zinc-950 dark:text-white">
                    Início da conversa
                  </h2>

                  <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                    Envie a primeira mensagem para começar a conversa.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((item) => {
                const isMine = item.sender_id === userId

                return (
                  <div
                    key={item.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm shadow-sm sm:max-w-[70%] ${
                        isMine
                          ? 'rounded-br-md bg-black text-white dark:bg-white dark:text-black'
                          : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {item.deleted_at ? 'Mensagem apagada.' : item.content}
                      </p>

                      <p
                        className={`mt-2 text-[11px] ${
                          isMine
                            ? 'text-white/70 dark:text-black/60'
                            : 'text-zinc-500'
                        }`}
                      >
                        {formatMessageTime(item.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="flex gap-3 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <input
              type="text"
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Escreva uma mensagem..."
              className="min-w-0 flex-1 rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 sm:text-base"
            />

            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-semibold transition ${
                sending || !newMessage.trim()
                  ? 'cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                  : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
              }`}
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}