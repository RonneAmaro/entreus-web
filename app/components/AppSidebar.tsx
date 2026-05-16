'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  read_at?: string | null
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
  const navMoreButtonRef = useRef<HTMLButtonElement | null>(null)
  const profileMoreButtonRef = useRef<HTMLButtonElement | null>(null)
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<'nav' | 'profile' | null>(null)
  const [moreMenuPosition, setMoreMenuPosition] = useState({ left: 96, top: 12 })
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
      .select('id, conversation_id, sender_id, created_at, read_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (messagesError) {
      console.error('Erro ao carregar últimas mensagens:', messagesError.message)
      setInternalUnreadMessagesCount(0)
      return
    }

    const participantByConversation = participants.reduce(
      (acc, participant) => {
        acc[participant.conversation_id] = participant
        return acc
      },
      {} as Record<string, MyConversationParticipant>
    )

    let count = 0

    for (const message of (messagesData || []) as LastMessage[]) {
      if (message.deleted_at) continue
      if (message.sender_id === user.id) continue
      if (message.read_at) continue

      const participant = participantByConversation[message.conversation_id]
      const messageTime = new Date(message.created_at).getTime()
      const lastReadTime = participant?.last_read_at
        ? new Date(participant.last_read_at).getTime()
        : 0

      if (messageTime > lastReadTime) {
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
      'group/item relative flex h-11 min-h-11 items-center gap-0 rounded-full px-3 text-sm font-bold transition group-hover/sidebar:gap-3',
      active
        ? 'bg-blue-500/10 text-blue-100 ring-1 ring-blue-400/10'
        : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white',
    ].join(' ')
  }

  function navIconClass(path: string) {
    return `h-5 w-5 shrink-0 ${isActive(path) ? 'stroke-[2.45]' : ''}`
  }

  const navTextClass =
    'block max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/sidebar:max-w-[150px] group-hover/sidebar:opacity-100'

  const collapsedCenterClass =
    'justify-center group-hover/sidebar:justify-start'

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

  function updateMoreMenuPosition(anchor: 'nav' | 'profile') {
    if (typeof window === 'undefined') return

    const button =
      anchor === 'nav' ? navMoreButtonRef.current : profileMoreButtonRef.current

    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = 288
    const estimatedMenuHeight = Math.min(620, window.innerHeight - 24)
    const padding = 12

    const left = Math.min(
      Math.max(padding, rect.right + padding),
      window.innerWidth - menuWidth - padding
    )
    const top = Math.min(
      Math.max(padding, rect.bottom - estimatedMenuHeight),
      window.innerHeight - estimatedMenuHeight - padding
    )

    setMoreMenuPosition({ left, top })
  }

  useEffect(() => {
    if (!moreMenuAnchor) return

    updateMoreMenuPosition(moreMenuAnchor)
    const activeAnchor = moreMenuAnchor

    function handleViewportChange() {
      updateMoreMenuPosition(activeAnchor)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreMenuAnchor(null)
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreMenuAnchor])

  const isMoreActive =
    pathname === '/privacy' ||
    pathname === '/blocked' ||
    pathname === '/settings' ||
    pathname === '/help' ||
    pathname === '/suggestions' ||
    pathname === '/challenges' ||
    pathname.startsWith('/challenges/') ||
    pathname === '/feedback' ||
    pathname === '/lab' ||
    pathname.startsWith('/lab/')

  const profileName =
    displayName || username || getEmailPrefix(email) || t('common.user')
  const profileHandle = username ? `@${username}` : getEmailPrefix(email)

  return (
    <aside className="group/sidebar fixed left-0 top-0 z-40 hidden h-screen w-[76px] flex-col overflow-hidden border-r border-blue-400/10 bg-black/95 shadow-2xl shadow-black/30 backdrop-blur-2xl transition-[width,box-shadow] duration-300 hover:w-[252px] hover:shadow-blue-950/20 lg:flex">
      <div className="flex h-full flex-col overflow-x-hidden overflow-y-auto px-3 py-4 [scrollbar-width:none]">
        <Link
          href="/feed"
          className="mb-5 flex h-12 w-full shrink-0 items-center justify-center rounded-full px-0 transition hover:bg-white/5 group-hover/sidebar:justify-start group-hover/sidebar:px-2"
          aria-label={t('mobile.goHome')}
        >
          <div className="flex min-w-0 items-center gap-0 transition-[gap] duration-200 group-hover/sidebar:gap-3">
            <Image
              src="/logo-icon.png"
              alt="Logo EntreUS"
              width={40}
              height={40}
              className="h-9 w-9 shrink-0 rounded-full object-contain"
              priority
            />
            <span className={`${navTextClass} min-w-0`}>
              <span className="block text-lg font-black leading-none tracking-tight text-white">
                EntreUS
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                S&oacute; Entre N&oacute;s
              </span>
            </span>
          </div>
        </Link>

        <nav className="flex flex-col gap-1.5 pb-4">
          <Link href="/feed" className={`${navLinkClass('/feed')} ${collapsedCenterClass}`}>
            <Home className={navIconClass('/feed')} />
            <span className={navTextClass}>{t('nav.home')}</span>
          </Link>

          <Link href="/search" className={`${navLinkClass('/search')} ${collapsedCenterClass}`}>
            <Compass className={navIconClass('/search')} />
            <span className={navTextClass}>{t('nav.explore')}</span>
          </Link>

          <Link href="/notifications" className={`relative ${navLinkClass('/notifications')} ${collapsedCenterClass}`}>
            <div className="relative shrink-0">
              <Bell className={navIconClass('/notifications')} />

              {unreadNotificationsCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {formatBadge(unreadNotificationsCount)}
                </span>
              )}
            </div>

            <span className={navTextClass}>{t('nav.notifications')}</span>
          </Link>

          <Link href="/messages" className={`relative ${navLinkClass('/messages')} ${collapsedCenterClass}`}>
            <div className="relative shrink-0">
              <MessageCircle className={navIconClass('/messages')} />

              {visibleUnreadMessagesCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {formatBadge(visibleUnreadMessagesCount)}
                </span>
              )}
            </div>

            <span className={navTextClass}>{t('nav.messages')}</span>
          </Link>

          <Link href="/meet" className={`${navLinkClass('/meet')} ${collapsedCenterClass}`}>
            <Video className={navIconClass('/meet')} />
            <span className={navTextClass}>Meet</span>
          </Link>

          <Link href="/saved" className={`${navLinkClass('/saved')} ${collapsedCenterClass}`}>
            <Bookmark className={navIconClass('/saved')} />
            <span className={navTextClass}>{t('nav.saved')}</span>
          </Link>

          <Link href="/profile" className={`${navLinkClass('/profile')} ${collapsedCenterClass}`}>
            <User className={navIconClass('/profile')} />
            <span className={navTextClass}>{t('nav.profile')}</span>
          </Link>

          <div className="relative">
            <button
              ref={navMoreButtonRef}
              type="button"
              onClick={() => {
                updateMoreMenuPosition('nav')
                setMoreMenuAnchor((current) => (current === 'nav' ? null : 'nav'))
              }}
              className={[
                `flex h-11 w-full items-center gap-0 rounded-full px-3 text-sm font-bold transition group-hover/sidebar:gap-3 ${collapsedCenterClass}`,
                isMoreActive
                  ? 'bg-blue-500/10 text-blue-100 ring-1 ring-blue-400/10'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white',
              ].join(' ')}
            >
              <MoreHorizontal className={`h-5 w-5 shrink-0 ${isMoreActive ? 'stroke-[2.45]' : ''}`} />
              <span className={navTextClass}>{t('nav.more')}</span>
            </button>

            {moreMenuAnchor === 'nav' && mounted && typeof document !== 'undefined' && createPortal(
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
                  position={moreMenuPosition}
                  onToggleTheme={onToggleTheme}
                  onLogout={onLogout}
                  onClose={() => setMoreMenuAnchor(null)}
                />
              </>,
              document.body
            )}
          </div>

          <button
            type="button"
            onClick={handlePostClick}
            className={`mt-4 flex h-11 w-full items-center gap-0 rounded-full bg-white px-3 text-sm font-black text-blue-950 shadow-xl shadow-blue-500/20 ring-1 ring-blue-200/60 transition hover:bg-blue-50 hover:shadow-blue-400/30 group-hover/sidebar:gap-3 ${collapsedCenterClass}`}
          >
            <PenLine className="h-5 w-5 shrink-0" />
            <span className={navTextClass}>{t('nav.post')}</span>
          </button>
        </nav>

        <div className="relative mt-auto">
          <div className="flex h-14 items-center gap-3 rounded-full border border-blue-500/10 bg-zinc-950/95 p-1.5 text-left shadow-sm shadow-black/10 ring-1 ring-white/10 transition hover:border-blue-400/40 hover:bg-blue-950/35 hover:shadow-blue-500/10 group-hover/sidebar:rounded-2xl group-hover/sidebar:p-2">
            <Link
              href="/profile"
              className={`flex min-w-0 flex-1 items-center gap-0 transition-[gap] duration-200 group-hover/sidebar:gap-3 ${collapsedCenterClass}`}
              title="Conta"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profileName}
                  className="aspect-square h-10 w-10 shrink-0 rounded-full border border-blue-400/30 object-cover"
                />
              ) : (
                <div className="flex aspect-square h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-950/30 text-sm font-black text-blue-100">
                  {getInitial(profileName)}
                </div>
              )}

              <div className={`${navTextClass} min-w-0 flex-1`}>
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
              ref={profileMoreButtonRef}
              type="button"
              onClick={() => {
                updateMoreMenuPosition('profile')
                setMoreMenuAnchor((current) => (current === 'profile' ? null : 'profile'))
              }}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/sidebar:flex group-hover/sidebar:opacity-100"
              aria-label="Conta"
              title="Conta"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          {moreMenuAnchor === 'profile' && mounted && typeof document !== 'undefined' && createPortal(
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
                position={moreMenuPosition}
                onToggleTheme={onToggleTheme}
                onLogout={onLogout}
                onClose={() => setMoreMenuAnchor(null)}
              />
            </>,
            document.body
          )}
        </div>
      </div>
    </aside>
  )
}
