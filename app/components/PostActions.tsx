'use client'

import { Bookmark, Heart, MessageCircle, Repeat2, Share2 } from 'lucide-react'

type PostActionsProps = {
  commentsCount: number
  likesCount: number
  repostsCount?: number
  liked: boolean
  reposted?: boolean
  saved?: boolean
  copied?: boolean
  onLike: () => void
  onCommentClick: () => void
  onRepost?: () => void
  onSave?: () => void
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
  onLike,
  onCommentClick,
  onRepost,
  onSave,
  onShare,
}: PostActionsProps) {
  return (
    <div className="mt-4 border-t border-zinc-100 pt-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <div className="grid grid-cols-5 items-center gap-1 sm:flex sm:justify-between sm:gap-2">
        <button
          type="button"
          onClick={onLike}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            liked
              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
              : 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
          }`}
          title={liked ? 'Remover curtida' : 'Curtir'}
          aria-label={liked ? 'Remover curtida' : 'Curtir'}
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
          title="Comentar"
          aria-label="Comentar"
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
          title={reposted ? 'Remover repost' : 'Repostar'}
          aria-label={reposted ? 'Remover repost' : 'Repostar'}
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
          title={saved ? 'Remover dos salvos' : 'Salvar post'}
          aria-label={saved ? 'Remover dos salvos' : 'Salvar post'}
        >
          <Bookmark className={`h-5 w-5 shrink-0 ${saved ? 'fill-current' : ''}`} />
          <span className="hidden font-medium sm:inline">
            {saved ? 'Salvo' : 'Salvar'}
          </span>
        </button>

        <button
          type="button"
          onClick={onShare}
          className={`group flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:justify-start sm:gap-2 sm:px-3 ${
            copied
              ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
              : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
          }`}
          title={copied ? 'Link copiado' : 'Compartilhar'}
          aria-label={copied ? 'Link copiado' : 'Compartilhar'}
        >
          <Share2 className="h-5 w-5 shrink-0" />
          <span className="hidden font-medium sm:inline">
            {copied ? 'Copiado' : 'Compartilhar'}
          </span>
        </button>
      </div>
    </div>
  )
}