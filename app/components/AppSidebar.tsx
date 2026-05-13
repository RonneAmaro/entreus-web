'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  User,
  Video,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import MoreMenu from './MoreMenu'
import { useLanguage } from './LanguageProvider'

type AppSidebarProps = {
  unreadNotificationsCount?: number
  unreadMessagesCount?: number
  mounted: boolean
  theme?: string
  displayName?: string
  username?: string | null
  email?: string
  avatarUrl?: string | null
  onToggleTheme: () => void
  onLogout: () => void
}

type MyConversationParticipant = {
  conversation_id: string
  last_read_at: string | null
}

type LastMessage = {
  id: string
  conversation_id: string
  sender_id: string
  created_at: string
  deleted_at: string | null
}

export default function AppSidebar({
  unreadNotificationsCount = 0,
  unreadMessagesCount,
  mounted,
  theme,
  displayName,
  username,
  email,
  avatarUrl,
  onToggleTheme,
  onLogout,
}: AppSidebarProps) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<'nav' | 'profile' | null>(null)
  const [internalUnreadMessagesCount, setInternalUnreadMessagesCount] = useState(0)

  const visibleUnreadMessagesCount =
    unreadMessagesCount ?? internalUnreadMessagesCount

  useEffect(() => {
    if (typeof unreadMessagesCount === 'number') return

    loadUnreadMessagesCount()

    const interval = window.setInterval(() => {
      loadUnreadMessagesCount()
    }, 30000)

    return () => {
      window.clearInterval(interval)
    }
  }, [pathname, unreadMessagesCount])

  async function loadUnreadMessagesCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setInternalUnreadMessagesCount(0)
      return
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id)

    if (participantsError) {
      console.error('Erro ao carregar contador de mensagens:', participantsError.message)
      setInternalUnreadMessagesCount(0)
      return
    }

    const participants = (participantsData || []) as MyConversationParticipant[]
    const conversationIds = participants.map((item) => item.conversation_id)

    if (conversationIds.length === 0) {
      setInternalUnreadMessagesCount(0)
      return
    }

    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, created_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300)

    if (messagesError) {
      console.error('Erro ao carregar últimas mensagens:', messagesError.message)
      setInternalUnreadMessagesCount(0)
      return
    }

    const lastMessageByConversation: Record<string, LastMessage> = {}

    for (const message of (messagesData || []) as LastMessage[]) {
      if (!lastMessageByConversation[message.conversation_id]) {
        lastMessageByConversation[message.conversation_id] = message
      }
    }

    let count = 0

    for (const participant of participants) {
      const lastMessage = lastMessageByConversation[participant.conversation_id]

      if (!lastMessage) continue
      if (lastMessage.deleted_at) continue
      if (lastMessage.sender_id === user.id) continue

      const lastMessageTime = new Date(lastMessage.created_at).getTime()
      const lastReadTime = participant.last_read_at
        ? new Date(participant.last_read_at).getTime()
        : 0

      if (lastMessageTime > lastReadTime) {
        count += 1
      }
    }

    setInternalUnreadMessagesCount(count)
  }

  function handlePostClick() {
    const composer = document.getElementById('post-composer')

    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' })

      const textarea = composer.querySelector('textarea')

      if (textarea instanceof HTMLTextAreaElement) {
        setTimeout(() => textarea.focus(), 350)
      }
    }
  }

  function isActive(path: string) {
    if (path === '/feed') {
      return pathname === '/feed' || pathname === '/'
    }

    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function navLinkClass(path: string) {
    const active = isActive(path)

    return [
      'flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium transition',
      active
        ? 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
        : 'text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900',
    ].join(' ')
  }

  function navIconClass(path: string) {
    return `h-6 w-6 shrink-0 ${isActive(path) ? 'stroke-[2.5]' : ''}`
  }

  function formatBadge(value: number) {
    return value > 99 ? '99+' : value
  }

  function getInitial(name: string) {
    if (!name) return 'U'
    return name.slice(0, 1).toUpperCase()
  }

  function getEmailPrefix(value?: string) {
    if (!value) return ''
    return value.split('@')[0] || value
  }

  const isMoreActive =
    pathname === '/privacy' ||
    pathname === '/blocked' ||
    pathname === '/settings' ||
    pathname === '/lab' ||
    pathname.startsWith('/lab/')

  const profileName =
    displayName || username || getEmailPrefix(email) || t('common.user')
  const profileHandle = username ? `@${username}` : getEmailPrefix(email)

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[270px] flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black lg:left-[max(0px,calc((100vw-1280px)/2))] lg:flex">
      <div className="flex h-full flex-col overflow-y-auto px-5 py-5">
        <Link
          href="/feed"
          className="mb-8 flex w-full shrink-0 items-center justify-center"
          aria-label={t('mobile.goHome')}
        >
          <div className="flex w-full justify-center">
            <Image
              src="/logo.png"
              alt="Logo EntreUS"
              width={220}
              height={180}
              className="mx-auto block h-auto w-full max-w-[185px] object-contain"
              priority
            />
          </div>
        </Link>

        <nav className="flex flex-col gap-2 pb-4">
          <Link href="/feed" className={navLinkClass('/feed')}>
            <Home className={navIconClass('/feed')} />
            <span>{t('nav.home')}</span>
          </Link>

          <Link href="/search" className={navLinkClass('/search')}>
            <Compass className={navIconClass('/search')} />
            <span>{t('nav.explore')}</span>
          </Link>

          <Link href="/notifications" className={`relative ${navLinkClass('/notifications')}`}>
            <div className="relative shrink-0">
              <Bell className={navIconClass('/notifications')} />

              {unreadNotificationsCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {formatBadge(unreadNotificationsCount)}
                </span>
              )}
            </div>

            <span>{t('nav.notifications')}</span>
          </Link>

          <Link href="/messages" className={`relative ${navLinkClass('/messages')}`}>
            <div className="relative shrink-0">
              <MessageCircle className={navIconClass('/messages')} />

              {visibleUnreadMessagesCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {formatBadge(visibleUnreadMessagesCount)}
                </span>
              )}
            </div>

            <span>{t('nav.messages')}</span>
          </Link>

          <Link href="/meet" className={navLinkClass('/meet')}>
            <Video className={navIconClass('/meet')} />
            <span>Meet</span>
          </Link>

          <Link href="/saved" className={navLinkClass('/saved')}>
            <Bookmark className={navIconClass('/saved')} />
            <span>{t('nav.saved')}</span>
          </Link>

          <Link href="/profile" className={navLinkClass('/profile')}>
            <User className={navIconClass('/profile')} />
            <span>{t('nav.profile')}</span>
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setMoreMenuAnchor((current) => (current === 'nav' ? null : 'nav'))
              }
              className={[
                'flex w-full items-center gap-4 rounded-full px-4 py-3 text-lg font-medium transition',
                isMoreActive
                  ? 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                  : 'text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900',
              ].join(' ')}
            >
              <MoreHorizontal className={`h-6 w-6 shrink-0 ${isMoreActive ? 'stroke-[2.5]' : ''}`} />
              <span>{t('nav.more')}</span>
            </button>

            {moreMenuAnchor === 'nav' && (
              <>
                <button
                  type="button"
                  onClick={() => setMoreMenuAnchor(null)}
                  className="fixed inset-0 z-[998] cursor-default bg-transparent"
                  aria-label="Fechar menu"
                />

                <MoreMenu
                  mounted={mounted}
                  theme={theme}
                  onToggleTheme={onToggleTheme}
                  onLogout={onLogout}
                  onClose={() => setMoreMenuAnchor(null)}
                />
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handlePostClick}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            <PenLine className="h-5 w-5 shrink-0" />
            <span>{t('nav.post')}</span>
          </button>
        </nav>

        <div className="relative mt-auto">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-left shadow-sm shadow-black/10 ring-1 ring-white/10 transition hover:border-blue-400/40 hover:bg-blue-950/25 hover:shadow-blue-500/10">
            <Link
              href="/profile"
              className="flex min-w-0 flex-1 items-center gap-3"
              title="Conta"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profileName}
                  className="h-11 w-11 shrink-0 rounded-full border border-blue-400/30 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-950/30 text-sm font-black text-blue-100">
                  {getInitial(profileName)}
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {profileName}
                </p>

                {profileHandle && (
                  <p className="truncate text-sm text-slate-400">
                    {profileHandle}
                  </p>
                )}
              </div>
            </Link>

            <button
              type="button"
              onClick={() =>
                setMoreMenuAnchor((current) => (current === 'profile' ? null : 'profile'))
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Conta"
              title="Conta"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          {moreMenuAnchor === 'profile' && (
            <>
              <button
                type="button"
                onClick={() => setMoreMenuAnchor(null)}
                className="fixed inset-0 z-[998] cursor-default bg-transparent"
                aria-label="Fechar menu"
              />

              <MoreMenu
                mounted={mounted}
                theme={theme}
                onToggleTheme={onToggleTheme}
                onLogout={onLogout}
                onClose={() => setMoreMenuAnchor(null)}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
