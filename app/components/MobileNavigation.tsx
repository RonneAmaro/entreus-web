'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Bookmark,
  Bug,
  Coins,
  Compass,
  Gift,
  Home,
  FlaskConical,
  HelpCircle,
  ImagePlus,
  Lightbulb,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Moon,
  PenLine,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Trophy,
  User,
  UserX,
  Video,
  Wallet,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'
import type { LanguageCode } from '@/lib/translations'

type MobileNavigationProps = {
  email: string
  displayName?: string
  avatarUrl?: string | null
  unreadNotificationsCount?: number
  unreadMessagesCount?: number
  mounted: boolean
  theme?: string
  onToggleTheme: () => void
  onLogout: () => void
  onPostClick: () => void
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

function getInitial(text: string) {
  if (!text) return 'U'
  return text.slice(0, 1).toUpperCase()
}

export default function MobileNavigation({
  email,
  displayName = 'Minha conta',
  avatarUrl,
  unreadNotificationsCount = 0,
  unreadMessagesCount,
  mounted,
  theme,
  onToggleTheme,
  onLogout,
  onPostClick,
}: MobileNavigationProps) {
  const pathname = usePathname()
  const { language, languages, setLanguage, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [openMoreOptions, setOpenMoreOptions] = useState(false)
  const [openPostMenu, setOpenPostMenu] = useState(false)
  const [internalUnreadMessagesCount, setInternalUnreadMessagesCount] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)

  const isMessagesPage = pathname === '/messages' || pathname.startsWith('/messages/')

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

  useEffect(() => {
    loadAdminStatus()
  }, [])

  async function loadAdminStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setIsAdmin(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      setIsAdmin(false)
      return
    }

    setIsAdmin(data?.role === 'admin')
  }

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

  function closeMenu() {
    setOpen(false)
  }

  function closeMoreOptions() {
    setOpenMoreOptions(false)
  }

  function handlePostAction() {
    setOpenPostMenu(false)
    onPostClick()
  }

  function isActive(path: string) {
    if (path === '/feed') {
      return pathname === '/feed' || pathname === '/'
    }

    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function drawerLinkClass(path: string) {
    const active = isActive(path)

    return [
      'flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium transition',
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-900',
    ].join(' ')
  }

  function drawerIconClass(path: string) {
    return `h-5 w-5 ${isActive(path) ? 'stroke-[2.5]' : ''}`
  }

  function bottomLinkClass(path: string) {
    const active = isActive(path)

    return [
      'relative flex items-center justify-center transition',
      active
        ? 'text-blue-500 dark:text-blue-400'
        : 'text-zinc-800 dark:text-zinc-100',
    ].join(' ')
  }

  function bottomIconWrapperClass(path: string) {
    const active = isActive(path)

    return [
      'flex h-11 w-11 items-center justify-center rounded-full transition',
      active
        ? 'bg-blue-50 dark:bg-blue-950/40'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-900',
    ].join(' ')
  }

  function bottomIconClass(path: string) {
    return `h-6 w-6 ${isActive(path) ? 'stroke-[2.6]' : ''}`
  }

  function formatBadge(value: number) {
    return value > 99 ? '99+' : value
  }

  return (
    <>
      <header className="fixed left-0 top-0 z-50 flex h-14 w-full items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-black lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label={t('mobile.openProfileMenu')}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : email ? (
            <span className="text-sm font-bold">
              {getInitial(displayName || email)}
            </span>
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        <Link
          href="/feed"
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          aria-label={t('mobile.goHome')}
        >
          <Image
            src="/logo.png"
            alt="EntreUS"
            width={96}
            height={44}
            className="h-auto w-[82px] object-contain"
            priority
          />
        </Link>

        <button
          type="button"
          onClick={() => setOpenMoreOptions((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-800 shadow-sm transition hover:bg-zinc-200 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label={t('more.open')}
          title={t('more.title')}
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </header>

      {openMoreOptions && (
        <div className="fixed inset-0 z-[58] lg:hidden">
          <button
            type="button"
            onClick={closeMoreOptions}
            className="absolute inset-0 bg-black/20"
            aria-label={t('more.close')}
          />

          <div className="absolute right-4 top-16 max-h-[calc(100dvh-5rem)] w-[min(320px,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200 bg-white p-2 shadow-2xl [scrollbar-color:rgba(96,165,250,0.45)_transparent] [scrollbar-width:thin] dark:border-blue-400/15 dark:bg-zinc-950 dark:ring-1 dark:ring-white/10">
            <div className="sticky top-0 z-10 rounded-2xl bg-white/95 px-3 py-3 backdrop-blur-xl dark:bg-zinc-950/95">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">
                {t('more.title')}
              </p>
            </div>

            <div className="space-y-1">
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={closeMoreOptions}
                  className={drawerLinkClass('/admin')}
                >
                  <ShieldCheck className={drawerIconClass('/admin')} />
                  Admin
                </Link>
              )}

              <Link
                href="/lab"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/lab')}
              >
                <FlaskConical className={drawerIconClass('/lab')} />
                {t('lab.name')}
              </Link>

              <Link
                href="/saved"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/saved')}
              >
                <Bookmark className={drawerIconClass('/saved')} />
                {t('nav.saved')}
              </Link>

              <Link
                href="/help"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/help')}
              >
                <HelpCircle className={drawerIconClass('/help')} />
                Ajuda
              </Link>

              <Link
                href="/suggestions"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/suggestions')}
              >
                <Lightbulb className={drawerIconClass('/suggestions')} />
                Sugestoes
              </Link>

              <Link
                href="/challenges"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/challenges')}
              >
                <Trophy className={drawerIconClass('/challenges')} />
                Desafios
              </Link>

              <Link
                href="/wallet"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/wallet')}
              >
                <Wallet className={drawerIconClass('/wallet')} />
                Carteira
              </Link>

              <Link
                href="/buy-itacash"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/buy-itacash')}
              >
                <Coins className={drawerIconClass('/buy-itacash')} />
                Comprar ItaCash
              </Link>

              <Link
                href="/gifts"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/gifts')}
              >
                <Gift className={drawerIconClass('/gifts')} />
                Presentes
              </Link>

              <Link
                href="/feedback"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/feedback')}
              >
                <Bug className={drawerIconClass('/feedback')} />
                Reportar bug
              </Link>

              <Link
                href="/privacy"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/privacy')}
              >
                <Shield className={drawerIconClass('/privacy')} />
                {t('settings.privacy')}
              </Link>

              <Link
                href="/blocked"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/blocked')}
              >
                <UserX className={drawerIconClass('/blocked')} />
                {t('settings.blocked')}
              </Link>

              <Link
                href="/settings"
                onClick={closeMoreOptions}
                className={drawerLinkClass('/settings')}
              >
                <Settings className={drawerIconClass('/settings')} />
                {t('settings.settings')}
              </Link>

              <div className="rounded-2xl px-3 py-3">
                <label className="mb-2 block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {t('language.label')}
                </label>

                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {languages.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.nativeName}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-zinc-500">
                  {t('language.helper')}
                </p>
              </div>

              {mounted && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme()
                    closeMoreOptions()
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}

                  {theme === 'dark' ? t('theme.light') : t('theme.dark')}
                </button>
              )}

              <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />

              <button
                type="button"
                onClick={() => {
                  closeMoreOptions()
                  onLogout()
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-5 w-5" />
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            onClick={closeMenu}
            className="absolute inset-0 bg-black/50"
            aria-label={t('more.closeMenu')}
          />

          <aside className="relative h-full w-[82%] max-w-[340px] overflow-y-auto border-r border-zinc-200 bg-white px-5 py-5 shadow-2xl dark:border-zinc-800 dark:bg-black">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-lg font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitial(displayName || email)
                  )}
                </div>

                <p className="max-w-[230px] truncate text-base font-bold text-zinc-900 dark:text-white">
                  {displayName}
                </p>

                <p className="max-w-[230px] truncate text-sm text-zinc-500">
                  {email}
                </p>
              </div>

              <button
                type="button"
                onClick={closeMenu}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label={t('more.closeMenu')}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="space-y-1">
              <Link
                href="/profile"
                onClick={closeMenu}
                className={drawerLinkClass('/profile')}
              >
                <User className={drawerIconClass('/profile')} />
                {t('nav.myProfile')}
              </Link>

              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={closeMenu}
                  className={drawerLinkClass('/admin')}
                >
                  <ShieldCheck className={drawerIconClass('/admin')} />
                  Admin
                </Link>
              )}

              <Link
                href="/feed"
                onClick={closeMenu}
                className={drawerLinkClass('/feed')}
              >
                <Home className={drawerIconClass('/feed')} />
                {t('nav.home')}
              </Link>

              <Link
                href="/search"
                onClick={closeMenu}
                className={drawerLinkClass('/search')}
              >
                <Compass className={drawerIconClass('/search')} />
                {t('nav.explore')}
              </Link>

              <Link
                href="/notifications"
                onClick={closeMenu}
                className={drawerLinkClass('/notifications')}
              >
                <div className="relative">
                  <Bell className={drawerIconClass('/notifications')} />

                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                      {formatBadge(unreadNotificationsCount)}
                    </span>
                  )}
                </div>
                {t('nav.notifications')}
              </Link>

              <Link
                href="/messages"
                onClick={closeMenu}
                className={drawerLinkClass('/messages')}
              >
                <div className="relative">
                  <MessageCircle className={drawerIconClass('/messages')} />

                  {visibleUnreadMessagesCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                      {formatBadge(visibleUnreadMessagesCount)}
                    </span>
                  )}
                </div>
                {t('nav.messages')}
              </Link>

              <Link
                href="/meet"
                onClick={closeMenu}
                className={drawerLinkClass('/meet')}
              >
                <Video className={drawerIconClass('/meet')} />
                Meet
              </Link>

              <Link
                href="/saved"
                onClick={closeMenu}
                className={drawerLinkClass('/saved')}
              >
                <Bookmark className={drawerIconClass('/saved')} />
                {t('nav.saved')}
              </Link>

              <Link
                href="/lab"
                onClick={closeMenu}
                className={drawerLinkClass('/lab')}
              >
                <FlaskConical className={drawerIconClass('/lab')} />
                {t('lab.name')}
              </Link>

              <Link
                href="/help"
                onClick={closeMenu}
                className={drawerLinkClass('/help')}
              >
                <HelpCircle className={drawerIconClass('/help')} />
                Ajuda
              </Link>

              <Link
                href="/suggestions"
                onClick={closeMenu}
                className={drawerLinkClass('/suggestions')}
              >
                <Lightbulb className={drawerIconClass('/suggestions')} />
                Sugestoes
              </Link>

              <Link
                href="/challenges"
                onClick={closeMenu}
                className={drawerLinkClass('/challenges')}
              >
                <Trophy className={drawerIconClass('/challenges')} />
                Desafios
              </Link>

              <Link
                href="/wallet"
                onClick={closeMenu}
                className={drawerLinkClass('/wallet')}
              >
                <Wallet className={drawerIconClass('/wallet')} />
                Carteira
              </Link>

              <Link
                href="/buy-itacash"
                onClick={closeMenu}
                className={drawerLinkClass('/buy-itacash')}
              >
                <Coins className={drawerIconClass('/buy-itacash')} />
                Comprar ItaCash
              </Link>

              <Link
                href="/gifts"
                onClick={closeMenu}
                className={drawerLinkClass('/gifts')}
              >
                <Gift className={drawerIconClass('/gifts')} />
                Presentes
              </Link>

              <Link
                href="/feedback"
                onClick={closeMenu}
                className={drawerLinkClass('/feedback')}
              >
                <Bug className={drawerIconClass('/feedback')} />
                Reportar bug
              </Link>

              <div className="my-4 border-t border-zinc-200 dark:border-zinc-800" />

              <Link
                href="/privacy"
                onClick={closeMenu}
                className={drawerLinkClass('/privacy')}
              >
                <Shield className={drawerIconClass('/privacy')} />
                {t('settings.privacy')}
              </Link>

              <Link
                href="/blocked"
                onClick={closeMenu}
                className={drawerLinkClass('/blocked')}
              >
                <UserX className={drawerIconClass('/blocked')} />
                {t('settings.blocked')}
              </Link>

              <Link
                href="/settings"
                onClick={closeMenu}
                className={drawerLinkClass('/settings')}
              >
                <Settings className={drawerIconClass('/settings')} />
                {t('settings.settings')}
              </Link>

              {mounted && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme()
                    closeMenu()
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}

                  {theme === 'dark' ? t('theme.light') : t('theme.dark')}
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-5 w-5" />
                {t('auth.logout')}
              </button>
            </nav>
          </aside>
        </div>
      )}

      {!isMessagesPage && openPostMenu && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            onClick={() => setOpenPostMenu(false)}
            className="absolute inset-0"
            aria-label={t('mobile.closePostOptions')}
          />

          <div className="absolute bottom-36 right-5 z-[80] flex flex-col items-end gap-6">
            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                {t('mobile.publish')}
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <PenLine className="h-6 w-6" />
              </span>
            </button>

            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                {t('mobile.photos')}
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <ImagePlus className="h-6 w-6" />
              </span>
            </button>

            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                {t('mobile.videos')}
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <Video className="h-6 w-6" />
              </span>
            </button>
          </div>
        </div>
      )}

      {!isMessagesPage && (
        <button
          type="button"
          onClick={() => setOpenPostMenu((current) => !current)}
          className="fixed bottom-20 right-5 z-[75] flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl transition hover:bg-blue-400 active:scale-95 dark:bg-blue-500 lg:hidden"
          aria-label={t('mobile.openPostOptions')}
        >
          {openPostMenu ? (
            <X className="h-8 w-8" />
          ) : (
            <Plus className="h-9 w-9" />
          )}
        </button>
      )}

      <nav className="fixed bottom-0 left-0 z-50 grid h-16 w-full grid-cols-6 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black lg:hidden">
        <Link
          href="/feed"
          className={bottomLinkClass('/feed')}
          aria-label={t('nav.home')}
        >
          <span className={bottomIconWrapperClass('/feed')}>
            <Home className={bottomIconClass('/feed')} />
          </span>
        </Link>

        <Link
          href="/search"
          className={bottomLinkClass('/search')}
          aria-label={t('nav.explore')}
        >
          <span className={bottomIconWrapperClass('/search')}>
            <Compass className={bottomIconClass('/search')} />
          </span>
        </Link>

        <Link
          href="/messages"
          className={bottomLinkClass('/messages')}
          aria-label={t('nav.messages')}
        >
          <span className={`${bottomIconWrapperClass('/messages')} relative`}>
            <MessageCircle className={bottomIconClass('/messages')} />

            {visibleUnreadMessagesCount > 0 && (
              <span className="absolute left-1/2 top-1 ml-2 flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                {formatBadge(visibleUnreadMessagesCount)}
              </span>
            )}
          </span>
        </Link>

        <Link
          href="/meet"
          className={bottomLinkClass('/meet')}
          aria-label="Meet"
        >
          <span className={bottomIconWrapperClass('/meet')}>
            <Video className={bottomIconClass('/meet')} />
          </span>
        </Link>

        <Link
          href="/notifications"
          className={bottomLinkClass('/notifications')}
          aria-label={t('nav.notifications')}
        >
          <span className={`${bottomIconWrapperClass('/notifications')} relative`}>
            <Bell className={bottomIconClass('/notifications')} />

            {unreadNotificationsCount > 0 && (
              <span className="absolute left-1/2 top-1 ml-2 flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                {formatBadge(unreadNotificationsCount)}
              </span>
            )}
          </span>
        </Link>

        <Link
          href="/profile"
          className={bottomLinkClass('/profile')}
          aria-label={t('nav.profile')}
        >
          <span className={bottomIconWrapperClass('/profile')}>
            <User className={bottomIconClass('/profile')} />
          </span>
        </Link>
      </nav>
    </>
  )
}
