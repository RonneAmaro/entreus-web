'use client'

import Link from 'next/link'
import { Repeat2 } from 'lucide-react'
import PostActions from './PostActions'
import PostMediaGallery from './PostMediaGallery'
import LinkPreview from './LinkPreview'
import SensitiveContent from './SensitiveContent'
import PostMoreMenu from './PostMoreMenu'
import UserBadges from './UserBadges'
import TranslatePostButton from './TranslatePostButton'

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

function getVisibilityLabel(value: VisibilityType) {
  if (value === 'followers') return 'Só seguidores'
  if (value === 'private') return 'Privado'
  return 'Público'
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

function isSensitivePost(post: PostCardPost) {
  return (
    post.is_sensitive ||
    post.category === 'adulto' ||
    post.category === 'sensual'
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
  const authorName =
    post.profiles?.display_name || post.profiles?.username || 'Usuário'

  const authorUsername = post.profiles?.username || 'usuario'
  const authorAvatar = post.profiles?.avatar_url || ''
  const isOwnPost = post.user_id === currentUserId
  const postMedia = getPostMedia(post)
  const sensitive = isSensitivePost(post)
  const shouldProtectSensitive = sensitive && !showSensitiveContent

  const reposterName =
    repostInfo?.profiles?.display_name ||
    repostInfo?.profiles?.username ||
    'Usuário'

  const reposterUsername = repostInfo?.profiles?.username || 'usuario'
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
              {isOwnRepost ? 'Você repostou' : `${reposterName} repostou`}
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
              ? 'Carregando...'
              : isFollowingAuthor
                ? 'Seguindo'
                : 'Seguir'}
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-500">
          {post.category || 'Sem categoria'}
        </p>

        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {getVisibilityLabel(post.visibility)}
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
          {post.content && (
            <p className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base">
              {post.content}
            </p>
          )}

          <TranslatePostButton content={post.content} />

          <LinkPreview content={post.content} />

          <PostMediaGallery media={postMedia} />
        </SensitiveContent>
      ) : (
        <>
          {post.content && (
            <p className="mb-4 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200 sm:text-base">
              {post.content}
            </p>
          )}

          <TranslatePostButton content={post.content} />

          <LinkPreview content={post.content} />

          <PostMediaGallery media={postMedia} />
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
        onLike={onLike}
        onCommentClick={onCommentClick}
        onRepost={onRepost}
        onSave={onSave}
        onShare={onShare}
      />

      {footerLabel ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-600">
          {footerLabel}
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-600">
          Publicado em {new Date(post.created_at).toLocaleString('pt-BR')}
        </p>
      )}

      {repostInfo && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-600">
          Repostado em {new Date(repostInfo.created_at).toLocaleString('pt-BR')}
        </p>
      )}
    </article>
  )
}