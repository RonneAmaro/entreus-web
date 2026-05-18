'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Gift, Repeat2 } from 'lucide-react'
import PostActions from './PostActions'
import GiftModal from './GiftModal'
import TipModal from './TipModal'
import PostMediaGallery from './PostMediaGallery'
import LinkPreview, { LinkedPostText } from './LinkPreview'
import SensitiveContent from './SensitiveContent'
import PostMoreMenu from './PostMoreMenu'
import UserBadges from './UserBadges'
import TranslatePostButton from './TranslatePostButton'
import { useLanguage } from './LanguageProvider'

export type VisibilityType = 'public' | 'followers' | 'private'

export type PostCardProfile = {
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type PostCardMedia = {
  id: string
  post_id: string
  user_id: string
  media_url: string
  media_type: 'image' | 'video'
  position: number
  created_at?: string
}

export type PostCardPost = {
  id: string
  content: string | null
  category: string | null
  created_at: string
  user_id: string
  image_url: string | null
  video_url: string | null
  visibility: VisibilityType
  is_sensitive: boolean | null
  profiles: PostCardProfile | null
  media?: PostCardMedia[]
}

export type PostCardRepostInfo = {
  user_id: string
  created_at: string
  profiles: PostCardProfile | null
}

type PostCardProps = {
  post: PostCardPost
  currentUserId: string
  commentsCount: number
  likesCount: number
  repostsCount?: number
  liked: boolean
  saved?: boolean
  reposted?: boolean
  copied?: boolean
  reported?: boolean
  reporting?: boolean
  highlighted?: boolean
  showSensitiveContent?: boolean
  repostInfo?: PostCardRepostInfo | null
  footerLabel?: string
  showMenu?: boolean
  showFollowButton?: boolean
  isFollowingAuthor?: boolean
  followLoading?: boolean
  onFollowAuthor?: () => void
  onLike: () => void
  onCommentClick: () => void
  onRepost?: () => void
  onSave?: () => void
  onShare: () => void
  onCopy?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onReport?: () => void
}

function getVisibilityLabel(value: VisibilityType, t: (key: string) => string) {
  if (value === 'followers') return t('feed.visibility.followers')
  if (value === 'private') return t('feed.visibility.private')
  return t('feed.visibility.public')
}

function getCategoryLabel(value: string | null, t: (key: string) => string) {
  if (!value) return t('feed.post.noCategory')

  const key = value.toLowerCase()

  const labels: Record<string, string> = {
    cotidiano: t('feed.categories.daily'),
    viagens: t('feed.categories.travel'),
    lugares: t('feed.categories.places'),
    comida: t('feed.categories.food'),
    pensamentos: t('feed.categories.thoughts'),
    lifestyle: t('feed.categories.lifestyle'),
    sensual: '18+',
    adulto: '18+',
    '18plus': '18+',
    gift_received: 'Presente recebido',
  }

  return labels[key] || value
}

function getDateLocale(language: string) {
  const locales: Record<string, string> = {
    pt: 'pt-BR',
    en: 'en-US',
    fr: 'fr-FR',
    id: 'id-ID',
    ja: 'ja-JP',
    zh: 'zh-CN',
  }

  return locales[language] || 'pt-BR'
}

function getPostMedia(post: PostCardPost): PostCardMedia[] {
  if (post.media && post.media.length > 0) {
    return post.media
  }

  const legacyMedia: PostCardMedia[] = []

  if (post.image_url) {
    legacyMedia.push({
      id: `${post.id}-legacy-image`,
      post_id: post.id,
      user_id: post.user_id,
      media_url: post.image_url,
      media_type: 'image',
      position: 0,
    })
  }

  if (post.video_url) {
    legacyMedia.push({
      id: `${post.id}-legacy-video`,
      post_id: post.id,
      user_id: post.user_id,
      media_url: post.video_url,
      media_type: 'video',
      position: legacyMedia.length,
    })
  }

  return legacyMedia
}

function getGiftPoster(mediaUrl: string | null) {
  if (!mediaUrl) return undefined

  const fileName = mediaUrl.split('/').pop()?.replace(/\.[^.]+$/, '')
  return fileName ? `/gifts/images/${fileName}.png` : undefined
}

function parseGiftSharedContent(content: string | null) {
  if (!content) {
    return {
      message: '',
      giftName: 'Presente EntreUS',
      sender: '',
      receiver: '',
    }
  }

  const lines = content.split('\n')
  const markerIndex = lines.findIndex((line) => line.trim() === 'Presente recebido')
  const messageLines = markerIndex >= 0 ? lines.slice(0, markerIndex) : lines
  const metadataLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : []

  const findValue = (label: string) => {
    const row = metadataLines.find((line) => line.startsWith(`${label}:`))
    return row?.replace(`${label}:`, '').trim() || ''
  }

  return {
    message: messageLines.join('\n').trim(),
    giftName: findValue('Presente') || 'Presente EntreUS',
    sender: findValue('De'),
    receiver: findValue('Para'),
  }
}

function SharedGiftPostCard({ post }: { post: PostCardPost }) {
  const [mediaFailed, setMediaFailed] = useState(false)
  const media = getPostMedia(post)[0] || null
  const details = parseGiftSharedContent(post.content)

  return (
    <div className="mb-4 overflow-hidden rounded-[1.75rem] border border-blue-300/20 bg-zinc-950 p-4 text-white shadow-xl shadow-blue-950/10 ring-1 ring-white/10">
      {details.message && (
        <LinkedPostText
          content={details.message}
          className="mb-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100 sm:text-base"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-blue-300/15 bg-gradient-to-br from-blue-500/15 via-black to-zinc-950 p-3">
          {media && media.media_type === 'video' && !mediaFailed ? (
            <video
              src={media.media_url}
              poster={getGiftPoster(media.media_url)}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setMediaFailed(true)}
              className="h-full w-full rounded-2xl object-contain"
            />
          ) : media && !mediaFailed ? (
            <img
              src={media.media_url}
              alt={details.giftName}
              onError={() => setMediaFailed(true)}
              className="h-full w-full rounded-2xl object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-blue-500/10 text-blue-100">
              <Gift className="h-16 w-16 stroke-[1.5]" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-100 ring-1 ring-blue-300/20">
            <Gift className="h-3.5 w-3.5" />
            Presente recebido
          </span>

          <h3 className="mt-3 text-2xl font-black leading-tight text-white">
            {details.giftName}
          </h3>

          <div className="mt-4 grid gap-2 text-sm text-zinc-300">
            {details.sender && (
              <p>
                <span className="font-black text-blue-100">Enviado por:</span>{' '}
                {details.sender}
              </p>
            )}
            {details.receiver && (
              <p>
                <span className="font-black text-blue-100">Recebido por:</span>{' '}
                {details.receiver}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function isSensitivePost(post: PostCardPost) {
  return (
    post.is_sensitive ||
    post.category === 'adulto' ||
    post.category === 'sensual' ||
    post.category === '18plus'
  )
}

function getInitial(text: string) {
  if (!text) return 'U'
  return text.slice(0, 1).toUpperCase()
}

export default function PostCard({
  post,
  currentUserId,
  commentsCount,
  likesCount,
  repostsCount = 0,
  liked,
  saved = false,
  reposted = false,
  copied = false,
  reported = false,
  reporting = false,
  highlighted = false,
  showSensitiveContent = false,
  repostInfo = null,
  footerLabel,
  showMenu = true,
  showFollowButton = false,
  isFollowingAuthor = false,
  followLoading = false,
  onFollowAuthor,
  onLike,
  onCommentClick,
  onRepost,
  onSave,
  onShare,
  onCopy,
  onEdit,
  onDelete,
  onReport,
}: PostCardProps) {
  const { t, language } = useLanguage()
  const [giftModalOpen, setGiftModalOpen] = useState(false)
  const [tipModalOpen, setTipModalOpen] = useState(false)

  const authorName =
    post.profiles?.display_name || post.profiles?.username || t('feed.post.user')

  const authorUsername = post.profiles?.username || t('feed.post.username')
  const authorAvatar = post.profiles?.avatar_url || ''
  const isOwnPost = post.user_id === currentUserId
  const canGiftAuthor = Boolean(currentUserId && post.user_id !== currentUserId)
  const postMedia = getPostMedia(post)
  const isSharedGiftPost = post.category === 'gift_received'
  const sensitive = isSensitivePost(post)
  const shouldProtectSensitive = sensitive && !showSensitiveContent

  const reposterName =
    repostInfo?.profiles?.display_name ||
    repostInfo?.profiles?.username ||
    t('feed.post.user')

  const reposterUsername = repostInfo?.profiles?.username || t('feed.post.username')
  const reposterAvatar = repostInfo?.profiles?.avatar_url || ''
  const isOwnRepost = repostInfo?.user_id === currentUserId

  return (
    <article
      id={`post-${post.id}`}
      className={`rounded-2xl border bg-white p-4 transition dark:bg-zinc-900 sm:p-6 ${highlighted
          ? 'border-blue-500 ring-2 ring-blue-200 dark:border-blue-400 dark:ring-blue-900'
          : 'border-zinc-200 dark:border-zinc-800'
        }`}
    >
      {repostInfo && (
        <Link
          href={`/u/${reposterUsername}`}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-green-600 transition hover:opacity-80 dark:text-green-400"
        >
          {reposterAvatar ? (
            <img
              src={reposterAvatar}
              alt={reposterName}
              className="h-7 w-7 rounded-full border border-green-200 object-cover dark:border-green-800"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-green-200 bg-green-50 text-xs font-bold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              {getInitial(reposterName)}
            </div>
          )}

          <Repeat2 className="h-4 w-4" />

          <span className="inline-flex min-w-0 items-center gap-1">
            {repostInfo.user_id && (
              <UserBadges userId={repostInfo.user_id} size="sm" max={1} />
            )}

            <span className="truncate">
              {isOwnRepost ? t('feed.post.youReposted') : `${reposterName} ${t('feed.post.reposted')}`}
            </span>
          </span>
        </Link>
      )}

      <div className="mb-3 flex items-start justify-between gap-3">
        <Link
          href={`/u/${authorUsername}`}
          className="flex min-w-0 items-center gap-3 transition hover:opacity-80"
        >
          {authorAvatar ? (
            <img
              src={authorAvatar}
              alt={authorName}
              className="h-12 w-12 shrink-0 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {getInitial(authorName)}
            </div>
          )}

          <div className="min-w-0">
            <p className="inline-flex max-w-full items-center gap-1 break-words font-semibold text-black dark:text-white">
              <UserBadges userId={post.user_id} size="sm" max={1} />

              <span className="min-w-0 break-words">
                {authorName}
              </span>
            </p>

            <p className="break-all text-sm text-zinc-500">
              @{authorUsername}
            </p>
          </div>
        </Link>

        {showMenu && (
          <PostMoreMenu
            isOwnPost={isOwnPost}
            copied={copied}
            reported={reported}
            reporting={reporting}
            onCopy={onCopy || onShare}
            onEdit={onEdit || (() => { })}
            onDelete={onDelete || (() => { })}
            onReport={onReport || (() => { })}
          />
        )}
      </div>

      {showFollowButton && !isOwnPost && onFollowAuthor && (
        <div className="mb-3">
          <button
            type="button"
            onClick={onFollowAuthor}
            disabled={followLoading}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${isFollowingAuthor
                ? 'border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
              } ${followLoading ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {followLoading
              ? t('feed.actions.loading')
              : isFollowingAuthor
                ? t('feed.actions.following')
                : t('feed.actions.follow')}
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-500">
          {getCategoryLabel(post.category, t)}
        </p>

        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {getVisibilityLabel(post.visibility, t)}
        </span>

        {sensitive && (
          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            18+
          </span>
        )}

        {reposted && (
          <span className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
            Repostado
          </span>
        )}

        {saved && (
          <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            Salvo
          </span>
        )}

        {highlighted && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
            Destaque
          </span>
        )}
      </div>

      {shouldProtectSensitive ? (
        <SensitiveContent>
          {isSharedGiftPost ? (
            <SharedGiftPostCard post={post} />
          ) : post.content && (
            <LinkedPostText
              content={post.content}
              className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
            />
          )}

          <TranslatePostButton content={post.content} />

          <LinkPreview content={post.content} />

          {!isSharedGiftPost && <PostMediaGallery media={postMedia} />}
        </SensitiveContent>
      ) : (
        <>
          {isSharedGiftPost ? (
            <SharedGiftPostCard post={post} />
          ) : post.content && (
            <LinkedPostText
              content={post.content}
              className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base"
            />
          )}

          <TranslatePostButton content={post.content} />

          <LinkPreview content={post.content} />

          {!isSharedGiftPost && <PostMediaGallery media={postMedia} />}
        </>
      )}

      <PostActions
        commentsCount={commentsCount}
        likesCount={likesCount}
        repostsCount={repostsCount}
        liked={liked}
        reposted={reposted}
        saved={saved}
        copied={copied}
        showGift={canGiftAuthor}
        showTip={canGiftAuthor}
        onLike={onLike}
        onCommentClick={onCommentClick}
        onRepost={onRepost}
        onSave={onSave}
        onGift={() => setGiftModalOpen(true)}
        onTip={() => setTipModalOpen(true)}
        onShare={onShare}
      />

      <GiftModal
        open={giftModalOpen}
        currentUserId={currentUserId}
        recipient={{
          id: post.user_id,
          name: authorName,
          username: post.profiles?.username,
          avatarUrl: authorAvatar,
        }}
        onClose={() => setGiftModalOpen(false)}
      />

      <TipModal
        open={tipModalOpen}
        currentUserId={currentUserId}
        recipient={{
          id: post.user_id,
          name: authorName,
          username: post.profiles?.username,
          avatarUrl: authorAvatar,
        }}
        onClose={() => setTipModalOpen(false)}
      />

      {footerLabel ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-600">
          {footerLabel}
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-600">
          {t('feed.post.publishedAt')} {new Date(post.created_at).toLocaleString(getDateLocale(language))}
        </p>
      )}

      {repostInfo && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-600">
          {t('feed.post.repostedAt')} {new Date(repostInfo.created_at).toLocaleString(getDateLocale(language))}
        </p>
      )}
    </article>
  )
}
