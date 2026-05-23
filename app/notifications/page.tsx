'use client'

import AppSidebar from '../components/AppSidebar'
import MobileNavigation from '../components/MobileNavigation'
import BrandHeader from '../components/BrandHeader'
import UserBadges from '../components/UserBadges'
import Link from 'next/link'
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Coins, Gift, Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { supabase } from '@/lib/supabase'

type CurrentProfile = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  show_sensitive_content?: boolean | null
}

type Notification = {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  post_id: string | null
  comment_id: string | null
  user_gift_id: string | null
  itacash_purchase_request_id: string | null
  amount: number | null
  read: boolean | null
  created_at: string
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type PostSummary = {
  id: string
  content: string | null
}

type CommentSummary = {
  id: string
  content: string | null
}

type GiftSummary = {
  id: string
  price_paid_itacash: number
  gift: {
    name: string
  } | null
}

type GiftSummaryRow = {
  id: string
  price_paid_itacash: number
  gift:
    | {
        name: string
      }
    | {
        name: string
      }[]
    | null
}

type ItaCashPurchaseRequestSummary = {
  id: string
  amount_itacash: number
  status: string
  rejection_reason: string | null
}

type NotificationView = Notification & {
  actor: ProfileSummary | null
  post: PostSummary | null
  comment: CommentSummary | null
  gift: GiftSummary | null
  itacashPurchaseRequest: ItaCashPurchaseRequestSummary | null
}

function getInitial(text: string) {
  if (!text) return 'U'
  return text.slice(0, 1).toUpperCase()
}

function getNotificationIcon(type: string) {
  if (type === 'like') return <Heart className="h-5 w-5 text-red-500" />
  if (type === 'comment') return <MessageCircle className="h-5 w-5 text-blue-500" />
  if (type === 'repost') return <Repeat2 className="h-5 w-5 text-green-500" />
  if (type === 'follow') return <UserPlus className="h-5 w-5 text-green-500" />
  if (type === 'gift_received') return <Gift className="h-5 w-5 text-blue-500" />
  if (type === 'tip_received') return <Coins className="h-5 w-5 text-emerald-500" />
  if (isPromotionalItaCashNotification(type)) return <Coins className="h-5 w-5 text-blue-500" />
  if (type === 'itacash_purchase_approved') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
  if (type === 'itacash_purchase_rejected') return <AlertTriangle className="h-5 w-5 text-red-500" />

  return <Bell className="h-5 w-5 text-zinc-500" />
}

function getNotificationAmount(notification: NotificationView) {
  const value = notification.amount || notification.itacashPurchaseRequest?.amount_itacash || 0
  return Number.isFinite(value) && value > 0 ? value : null
}

function isPromotionalItaCashNotification(type: string) {
  return type === 'promotional_itacash' ||
    type === 'promotional_itacash_credit' ||
    type === 'itacash_promotional_credit'
}

function isItaCashPurchaseStatusNotification(type: string) {
  return type === 'itacash_purchase_approved' || type === 'itacash_purchase_rejected'
}

function isItaCashFinancialNotification(type: string) {
  return isPromotionalItaCashNotification(type) || isItaCashPurchaseStatusNotification(type)
}

function getItaCashNotificationText(notification: NotificationView) {
  if (isPromotionalItaCashNotification(notification.type)) {
    const amount = getNotificationAmount(notification)
    return amount
      ? `Voce recebeu ${amount} ItaCash promocional da equipe EntreUS.`
      : 'Voce recebeu ItaCash promocional da equipe EntreUS.'
  }

  if (notification.type === 'itacash_purchase_approved') {
    const amount = getNotificationAmount(notification)
    return amount
      ? `Sua compra de ${amount} ItaCash foi aprovada e o saldo ja esta na sua carteira.`
      : 'Sua compra de ItaCash foi aprovada e o saldo ja esta na sua carteira.'
  }

  if (notification.type === 'itacash_purchase_rejected') {
    const amount = getNotificationAmount(notification)
    const reason = notification.itacashPurchaseRequest?.rejection_reason?.trim()
    const baseMessage = amount
      ? `Sua compra de ${amount} ItaCash foi recusada.`
      : 'Sua compra de ItaCash foi recusada.'

    return reason ? `${baseMessage} Motivo: ${reason}` : baseMessage
  }

  return 'Atualizacao ItaCash disponivel na sua carteira.'
}

function getNotificationActionText(type: string) {
  if (type === 'like') return 'curtiu sua publicação.'
  if (type === 'comment') return 'comentou na sua publicação.'
  if (type === 'repost') return 'repostou sua publicação.'
  if (type === 'follow') return 'começou a seguir você.'

  return 'interagiu com você.'
}

function getNotificationActionTextView(notification: NotificationView) {
  if (notification.type === 'gift_received') {
    const giftName = notification.gift?.gift?.name || 'um presente'
    return `enviou ${giftName} para voce.`
  }
  if (notification.type === 'tip_received') {
    return `enviou apoio em ItaCash para voce.`
  }
  if (notification.type === 'promotional_itacash') {
    return `Voce recebeu ItaCash promocional.`
  }
  if (notification.type === 'itacash_purchase_approved') {
    const amount = notification.amount || notification.itacashPurchaseRequest?.amount_itacash
    return amount
      ? `Sua compra de ${amount} ItaCash foi aprovada e o saldo já está na sua carteira.`
      : 'Sua compra de ItaCash foi aprovada e o saldo já está na sua carteira.'
  }
  if (notification.type === 'itacash_purchase_rejected') {
    const amount = notification.amount || notification.itacashPurchaseRequest?.amount_itacash
    const reason = notification.itacashPurchaseRequest?.rejection_reason?.trim()
    const baseMessage = amount
      ? `Sua compra de ${amount} ItaCash foi recusada.`
      : 'Sua compra de ItaCash foi recusada.'

    return reason ? `${baseMessage} Motivo: ${reason}` : baseMessage
  }

  return getNotificationActionText(notification.type)
}

function getPostPreview(content: string | null) {
  if (!content) return 'Publicação sem texto.'

  const clean = content.replace(/\s+/g, ' ').trim()

  if (clean.length <= 120) return clean

  return `${clean.slice(0, 120)}...`
}

function getNotificationHref(notification: NotificationView) {
  if (notification.type === 'follow' && notification.actor?.username) {
    return `/u/${notification.actor.username}`
  }

  if (
    notification.type === 'gift_received' ||
    isItaCashFinancialNotification(notification.type)
  ) {
    return '/wallet'
  }

  if (notification.post_id) {
    return `/feed?post=${notification.post_id}`
  }

  return '/notifications'
}

export default function NotificationsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)

  const [notifications, setNotifications] = useState<NotificationView[]>([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

      setUserId(user.id)
      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, show_sensitive_content')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setCurrentProfile({
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: profileData.avatar_url,
          show_sensitive_content: profileData.show_sensitive_content || false,
        })
      }

      await Promise.all([
        loadNotifications(user.id),
        loadUnreadNotificationsCount(user.id),
      ])

      setLoading(false)
    }

    loadPage()
  }, [router])

  async function loadUnreadNotificationsCount(currentUserId: string = userId) {
    if (!currentUserId) return

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    if (error) {
      setMessage('Erro ao carregar contagem de notificações: ' + error.message)
      return
    }

    setUnreadNotificationsCount(count || 0)
  }

  async function loadNotifications(currentUserId: string = userId) {
    if (!currentUserId) return

    let { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, actor_id, type, post_id, comment_id, user_gift_id, itacash_purchase_request_id, amount, read, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(80)

    if (error && error.message.includes('itacash_purchase_request_id')) {
      console.warn('[Notifications] itacash_purchase_request_id unavailable, loading base notifications:', error.message)
      const fallback = await supabase
        .from('notifications')
        .select('id, user_id, actor_id, type, post_id, comment_id, user_gift_id, amount, read, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(80)

      data = (fallback.data || []).map((item) => ({
        ...item,
        itacash_purchase_request_id: null,
      }))
      error = fallback.error
    }

    if (error) {
      setMessage('Erro ao carregar notificações: ' + error.message)
      return
    }

    const rawNotifications = (data || []) as Notification[]

    const actorIds = Array.from(
      new Set(rawNotifications.map((item) => item.actor_id).filter(Boolean))
    ) as string[]

    const postIds = Array.from(
      new Set(rawNotifications.map((item) => item.post_id).filter(Boolean))
    ) as string[]

    const commentIds = Array.from(
      new Set(rawNotifications.map((item) => item.comment_id).filter(Boolean))
    ) as string[]

    const userGiftIds = Array.from(
      new Set(rawNotifications.map((item) => item.user_gift_id).filter(Boolean))
    ) as string[]

    const itacashPurchaseRequestIds = Array.from(
      new Set(rawNotifications.map((item) => item.itacash_purchase_request_id).filter(Boolean))
    ) as string[]

    let profilesById: Record<string, ProfileSummary> = {}
    let postsById: Record<string, PostSummary> = {}
    let commentsById: Record<string, CommentSummary> = {}
    let giftsById: Record<string, GiftSummary> = {}
    let purchaseRequestsById: Record<string, ItaCashPurchaseRequestSummary> = {}

    if (actorIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', actorIds)

      if (profilesError) {
        console.error('Erro ao carregar perfis das notificações:', profilesError.message)
      }

      profilesById = ((profilesData || []) as ProfileSummary[]).reduce(
        (acc, profile) => {
          acc[profile.id] = profile
          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    if (postIds.length > 0) {
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('id, content')
        .in('id', postIds)

      if (postsError) {
        console.error('Erro ao carregar posts das notificações:', postsError.message)
      }

      postsById = ((postsData || []) as PostSummary[]).reduce(
        (acc, post) => {
          acc[post.id] = post
          return acc
        },
        {} as Record<string, PostSummary>
      )
    }

    if (commentIds.length > 0) {
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('id, content')
        .in('id', commentIds)

      if (commentsError) {
        console.error('Erro ao carregar comentários das notificações:', commentsError.message)
      }

      commentsById = ((commentsData || []) as CommentSummary[]).reduce(
        (acc, comment) => {
          acc[comment.id] = comment
          return acc
        },
        {} as Record<string, CommentSummary>
      )
    }

    if (userGiftIds.length > 0) {
      const { data: giftsData, error: giftsError } = await supabase
        .from('user_gifts')
        .select('id, price_paid_itacash, gift:digital_gifts(name)')
        .in('id', userGiftIds)

      if (giftsError) {
        console.error('Erro ao carregar presentes das notificacoes:', giftsError.message)
      }

      giftsById = ((giftsData || []) as GiftSummaryRow[]).reduce(
        (acc, gift) => {
          const giftInfo = Array.isArray(gift.gift)
            ? gift.gift[0] || null
            : gift.gift

          acc[gift.id] = {
            id: gift.id,
            price_paid_itacash: gift.price_paid_itacash,
            gift: giftInfo,
          }
          return acc
        },
        {} as Record<string, GiftSummary>
      )
    }

    if (itacashPurchaseRequestIds.length > 0) {
      const { data: purchaseRequestsData, error: purchaseRequestsError } = await supabase
        .from('itacash_purchase_requests')
        .select('id, amount_itacash, status, rejection_reason')
        .in('id', itacashPurchaseRequestIds)

      if (purchaseRequestsError) {
        console.error('Erro ao carregar compras ItaCash das notificacoes:', purchaseRequestsError.message)
      }

      purchaseRequestsById = ((purchaseRequestsData || []) as ItaCashPurchaseRequestSummary[]).reduce(
        (acc, request) => {
          acc[request.id] = request
          return acc
        },
        {} as Record<string, ItaCashPurchaseRequestSummary>
      )
    }

    const normalizedNotifications: NotificationView[] = rawNotifications.map((item) => ({
      ...item,
      actor: item.actor_id ? profilesById[item.actor_id] || null : null,
      post: item.post_id ? postsById[item.post_id] || null : null,
      comment: item.comment_id ? commentsById[item.comment_id] || null : null,
      gift: item.user_gift_id ? giftsById[item.user_gift_id] || null : null,
      itacashPurchaseRequest: item.itacash_purchase_request_id
        ? purchaseRequestsById[item.itacash_purchase_request_id] || null
        : null,
    }))

    setNotifications(normalizedNotifications)
  }

  async function handleMarkNotificationAsRead(notificationId: string) {
    if (!userId) return

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification
      )
    )

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      setMessage('Erro ao marcar notificação como lida: ' + error.message)
      await loadNotifications(userId)
      return
    }

    await loadUnreadNotificationsCount(userId)
  }

  async function handleMarkAllAsRead() {
    if (!userId) return

    setMarkingAll(true)
    setMessage('')

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read: true,
      }))
    )

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      setMessage('Erro ao marcar notificações como lidas: ' + error.message)
      await loadNotifications(userId)
      await loadUnreadNotificationsCount(userId)
      setMarkingAll(false)
      return
    }

    setUnreadNotificationsCount(0)
    setMarkingAll(false)
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

  const hasUnread = useMemo(() => {
    return notifications.some((notification) => !notification.read)
  }, [notifications])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <p>Carregando notificações...</p>
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
        displayName={currentProfile?.display_name || currentProfile?.username || 'Minha conta'}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      <section className="w-full max-w-3xl overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(104px+((100vw-104px-48rem)/2))] lg:py-8">
        <BrandHeader
          subtitle="Notificações"
          description="Acompanhe curtidas, comentários, reposts e novos seguidores."
          compact
          rightContent={
            hasUnread ? (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
              >
                <CheckCheck className="h-4 w-4" />
                {markingAll ? 'Marcando...' : 'Marcar como lidas'}
              </button>
            ) : null
          }
        />

        {message && (
          <p className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {message}
          </p>
        )}

        <div className="mt-5 space-y-4">
          {notifications.length === 0 && (
            <div className="rounded-[1.75rem] border border-blue-200/70 bg-white/90 p-7 text-center text-zinc-500 shadow-sm shadow-blue-500/5 ring-1 ring-black/5 backdrop-blur dark:border-blue-400/15 dark:bg-slate-950/80 dark:text-zinc-400 dark:ring-white/10">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200/70 dark:bg-blue-950/35 dark:text-blue-300 dark:ring-blue-900/60">
                <Bell className="h-7 w-7" />
              </span>

              <p className="font-black text-zinc-900 dark:text-white">
                Nenhuma notificação ainda.
              </p>

              <p className="mt-1 text-sm">
                Quando alguém curtir, comentar, repostar ou seguir você, aparecerá aqui.
              </p>

              <Link
                href="/feed"
                className="mt-5 inline-flex rounded-full bg-blue-500 px-5 py-2 text-sm font-black text-white shadow-sm shadow-blue-500/25 transition hover:-translate-y-0.5 hover:bg-blue-400 active:scale-95"
              >
                Voltar para o feed
              </Link>
            </div>
          )}

          {notifications.map((notification) => {
            const isItaCashPurchaseStatus = isItaCashPurchaseStatusNotification(notification.type)
            const isItaCashFinancial = isItaCashFinancialNotification(notification.type)
            const actorName = isItaCashFinancial
              ? 'EntreUS'
              : notification.actor?.display_name ||
                notification.actor?.username ||
                'Usuario'

            const actorUsername = notification.actor?.username || 'usuario'
            const actorAvatar = isItaCashFinancial ? '' : notification.actor?.avatar_url || ''
            const href = getNotificationHref(notification)
            const unread = !notification.read

            return (
              <Link
                key={notification.id}
                href={href}
                onClick={() => handleMarkNotificationAsRead(notification.id)}
                className={`block rounded-2xl border p-4 transition hover:-translate-y-[1px] hover:shadow-sm dark:hover:bg-zinc-900 sm:p-5 ${
                  unread
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    {actorAvatar ? (
                      <img
                        src={actorAvatar}
                        alt={actorName}
                        className="h-12 w-12 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {getInitial(actorName)}
                      </div>
                    )}

                    <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-white shadow dark:border-zinc-900 dark:bg-zinc-900">
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="inline-flex max-w-full items-center gap-1 break-words font-semibold text-zinc-950 dark:text-white">
                          {notification.actor_id && !isItaCashFinancial && (
                            <UserBadges userId={notification.actor_id} size="sm" max={1} />
                          )}

                          <span className="min-w-0 break-words">
                            {isItaCashFinancial
                              ? getItaCashNotificationText(notification)
                              : `${actorName} ${getNotificationActionTextView(notification)}`}
                          </span>
                        </p>

                        {notification.actor?.username && !isItaCashFinancial && (
                          <p className="mt-0.5 text-sm text-zinc-500">
                            @{actorUsername}
                          </p>
                        )}
                      </div>

                      {unread && (
                        <span className="mt-1 w-fit rounded-full bg-blue-500 px-2 py-1 text-[11px] font-bold text-white">
                          Nova
                        </span>
                      )}
                    </div>

                    {notification.comment?.content && (
                      <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Comentário: “{notification.comment.content}”
                      </p>
                    )}

                    {notification.post && (
                      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                        No post: “{getPostPreview(notification.post.content)}”
                      </p>
                    )}

                    {notification.type === 'gift_received' && notification.gift && (
                      <p className="mt-3 rounded-xl bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
                        Voce ganhou um presente! {notification.gift.price_paid_itacash} ItaCash recebidos.
                      </p>
                    )}

                    {notification.type === 'tip_received' && (
                      <p className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                        {notification.amount && notification.amount > 0
                          ? `Voce recebeu apoio em ItaCash! ${notification.amount} ItaCash recebidos.`
                          : 'Voce recebeu apoio em ItaCash.'}
                      </p>
                    )}

                    {isPromotionalItaCashNotification(notification.type) && (
                      <p className="mt-3 rounded-xl bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
                        {getItaCashNotificationText(notification)}
                      </p>
                    )}

                    {notification.type === 'itacash_purchase_approved' && (
                      <p className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                        {getItaCashNotificationText(notification)}
                      </p>
                    )}

                    {notification.type === 'itacash_purchase_rejected' && (
                      <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-100">
                        {getItaCashNotificationText(notification)}
                      </p>
                    )}

                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                      {new Date(notification.created_at).toLocaleString('pt-BR')}
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
