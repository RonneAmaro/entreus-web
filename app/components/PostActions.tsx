'use client'

import { Bookmark, Coins, Gift, Heart, MessageCircle, Repeat2, Share2 } from 'lucide-react'
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

export default function PostActions({
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

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <div className={`${actionColumns === 7 ? 'grid-cols-7' : actionColumns === 6 ? 'grid-cols-6' : 'grid-cols-5'} grid items-center gap-1 sm:flex sm:justify-between sm:gap-2`}>
        <button
          type="button"
          onClick={onLike}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            liked
              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
              : 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
          }`}
          title={liked ? t('postActions.unlike') : t('postActions.like')}
          aria-label={liked ? t('postActions.unlike') : t('postActions.like')}
        >
          <Heart className={`h-5 w-5 shrink-0 ${liked ? 'fill-current' : ''}`} />
          <span className="min-w-[14px] text-center text-xs font-medium sm:min-w-[16px] sm:text-left sm:text-sm">
            {likesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onCommentClick}
          className="group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30 sm:justify-start sm:gap-2 sm:px-3"
          title={t('postActions.comment')}
          aria-label={t('postActions.comment')}
        >
          <MessageCircle className="h-5 w-5 shrink-0" />
          <span className="min-w-[14px] text-center text-xs font-medium sm:min-w-[16px] sm:text-left sm:text-sm">
            {commentsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onRepost}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            reposted
              ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
              : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
          }`}
          title={reposted ? t('postActions.removeRepost') : t('postActions.repost')}
          aria-label={reposted ? t('postActions.removeRepost') : t('postActions.repost')}
        >
          <Repeat2 className="h-5 w-5 shrink-0" />
          <span className="min-w-[14px] text-center text-xs font-medium sm:min-w-[16px] sm:text-left sm:text-sm">
            {repostsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onSave}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            saved
              ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950/30'
              : 'hover:bg-yellow-50 hover:text-yellow-500 dark:hover:bg-yellow-950/30'
          }`}
          title={saved ? t('postActions.removeSaved') : t('postActions.savePost')}
          aria-label={saved ? t('postActions.removeSaved') : t('postActions.savePost')}
        >
          <Bookmark className={`h-5 w-5 shrink-0 ${saved ? 'fill-current' : ''}`} />
          <span className="hidden font-medium sm:inline">
            {saved ? t('postActions.saved') : t('postActions.save')}
          </span>
        </button>

        {showGift && (
          <button
            type="button"
            onClick={onGift}
            className="group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm text-blue-500 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 sm:justify-start sm:gap-2 sm:px-3"
            title="Presentear"
            aria-label="Presentear"
          >
            <Gift className="h-5 w-5 shrink-0" />
            <span className="hidden font-medium sm:inline">
              Presentear
            </span>
          </button>
        )}

        {showTip && (
          <button
            type="button"
            onClick={onTip}
            className="group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 sm:justify-start sm:gap-2 sm:px-3"
            title="Apoiar"
            aria-label="Apoiar"
          >
            <Coins className="h-5 w-5 shrink-0" />
            <span className="hidden font-medium sm:inline">
              Apoiar
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onShare}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            copied
              ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
              : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
          }`}
          title={copied ? t('postActions.linkCopied') : t('postActions.share')}
          aria-label={copied ? t('postActions.linkCopied') : t('postActions.share')}
        >
          <Share2 className="h-5 w-5 shrink-0" />
          <span className="hidden font-medium sm:inline">
            {copied ? t('postActions.copied') : t('postActions.share')}
          </span>
        </button>
      </div>
    </div>
  )
}
