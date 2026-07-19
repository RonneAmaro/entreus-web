'use client'

import { memo } from 'react'
import { Bookmark, Gift, Heart, MessageCircle, Repeat2, Share2 } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

type PostActionsProps = {
  commentsCount: number
  likesCount: number
  repostsCount?: number
  liked: boolean
  reposted?: boolean
  saved?: boolean
  copied?: boolean
  showGift?: boolean
  showTip?: boolean
  onLike: () => void
  onCommentClick: () => void
  onRepost?: () => void
  onSave?: () => void
  onGift?: () => void
  onTip?: () => void
  onShare: () => void
}

function ActionTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-zinc-950/95 px-2.5 py-1 text-[11px] font-black text-white opacity-0 shadow-lg shadow-zinc-950/20 ring-1 ring-blue-300/10 backdrop-blur transition group-hover/action:opacity-100 group-focus-visible/action:opacity-100 sm:block">
      {label}
    </span>
  )
}

function PostActions({
  commentsCount,
  likesCount,
  repostsCount = 0,
  liked,
  reposted = false,
  saved = false,
  copied = false,
  showGift = false,
  showTip = false,
  onLike,
  onCommentClick,
  onRepost,
  onSave,
  onGift,
  onTip,
  onShare,
}: PostActionsProps) {
  const { t } = useLanguage()
  const actionColumns = 5 + (showGift ? 1 : 0) + (showTip ? 1 : 0)
  const actionButtonClass =
    'group/action relative flex h-10 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:h-10 sm:min-w-10 sm:px-2'
  const countClass = 'min-w-[14px] text-center text-xs font-black leading-none'

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <div className={`${actionColumns === 7 ? 'grid-cols-7' : actionColumns === 6 ? 'grid-cols-6' : 'grid-cols-5'} grid items-center gap-1 sm:flex sm:justify-between sm:gap-1.5`}>
        <button
          type="button"
          onClick={onLike}
          className={`${actionButtonClass} ${
            liked
              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
              : 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
          }`}
          aria-label={liked ? t('post.actions.unlike') : t('post.actions.like')}
        >
          <Heart className={`h-5 w-5 shrink-0 ${liked ? 'fill-current' : ''}`} />
          <span className={countClass}>{likesCount}</span>
          <ActionTooltip label={t('post.actions.like')} />
        </button>

        <button
          type="button"
          onClick={onCommentClick}
          className={`${actionButtonClass} hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30`}
          aria-label={t('post.actions.comment')}
        >
          <MessageCircle className="h-5 w-5 shrink-0" />
          <span className={countClass}>{commentsCount}</span>
          <ActionTooltip label={t('post.actions.comment')} />
        </button>

        <button
          type="button"
          onClick={onRepost}
          className={`${actionButtonClass} ${
            reposted
              ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
              : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
          }`}
          aria-label={reposted ? t('post.actions.removeRepost') : t('post.actions.repost')}
        >
          <Repeat2 className="h-5 w-5 shrink-0" />
          <span className={countClass}>{repostsCount}</span>
          <ActionTooltip label={t('post.actions.repost')} />
        </button>

        <button
          type="button"
          onClick={onSave}
          className={`${actionButtonClass} ${
            saved
              ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950/30'
              : 'hover:bg-yellow-50 hover:text-yellow-500 dark:hover:bg-yellow-950/30'
          }`}
          aria-label={saved ? t('post.actions.removeSaved') : t('post.actions.save')}
        >
          <Bookmark className={`h-5 w-5 shrink-0 ${saved ? 'fill-current' : ''}`} />
          <ActionTooltip label={t('post.actions.save')} />
        </button>

        {showGift && (
          <button
            type="button"
            onClick={onGift}
            className={`${actionButtonClass} overflow-visible text-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30`}
            aria-label={t('post.actions.gift')}
          >
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-300 opacity-70 motion-safe:animate-ping" aria-hidden="true" />
            <Gift className="h-5 w-5 shrink-0 transition duration-200 group-hover/action:-translate-y-0.5 group-hover/action:rotate-6 group-active/action:scale-95" />
            <ActionTooltip label={t('post.actions.gift')} />
          </button>
        )}

        {showTip && (
          <button
            type="button"
            onClick={onTip}
            className={`${actionButtonClass} text-sky-500 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/30`}
            aria-label={t('post.actions.tip')}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 ring-1 ring-sky-300/25">
              <img
                src="/itacash.png"
                alt=""
                loading="lazy"
                className="h-5 w-5 rounded-full object-contain"
              />
            </span>
            <ActionTooltip label={t('post.actions.tip')} />
          </button>
        )}

        <button
          type="button"
          onClick={onShare}
          className={`${actionButtonClass} ${
            copied
              ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
              : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
          }`}
          aria-label={copied ? t('post.actions.linkCopied') : t('post.actions.share')}
        >
          <Share2 className="h-5 w-5 shrink-0" />
          <ActionTooltip label={t('post.actions.share')} />
        </button>
      </div>
    </div>
  )
}

export default memo(PostActions)
