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
    <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <button
        type="button"
        onClick={onLike}
        className={`group flex items-center gap-2 rounded-full px-2 py-2 text-sm transition sm:px-3 ${
          liked
            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
            : 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
        }`}
        title={liked ? 'Remover curtida' : 'Curtir'}
      >
        <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
        <span className="min-w-[16px] text-left">{likesCount}</span>
      </button>

      <button
        type="button"
        onClick={onCommentClick}
        className="group flex items-center gap-2 rounded-full px-2 py-2 text-sm transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30 sm:px-3"
        title="Comentar"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="min-w-[16px] text-left">{commentsCount}</span>
      </button>

      <button
        type="button"
        onClick={onRepost}
        className={`group flex items-center gap-2 rounded-full px-2 py-2 text-sm transition sm:px-3 ${
          reposted
            ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
            : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
        }`}
        title={reposted ? 'Remover repost' : 'Repostar'}
      >
        <Repeat2 className="h-5 w-5" />
        <span className="min-w-[16px] text-left">{repostsCount}</span>
      </button>

      <button
        type="button"
        onClick={onSave}
        className={`group flex items-center gap-2 rounded-full px-2 py-2 text-sm transition sm:px-3 ${
          saved
            ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950/30'
            : 'hover:bg-yellow-50 hover:text-yellow-500 dark:hover:bg-yellow-950/30'
        }`}
        title={saved ? 'Remover dos salvos' : 'Salvar post'}
      >
        <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
        <span className="hidden sm:inline">{saved ? 'Salvo' : 'Salvar'}</span>
      </button>

      <button
        type="button"
        onClick={onShare}
        className={`group flex items-center gap-2 rounded-full px-2 py-2 text-sm transition sm:px-3 ${
          copied
            ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30'
            : 'hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30'
        }`}
        title={copied ? 'Link copiado' : 'Compartilhar'}
      >
        <Share2 className="h-5 w-5" />
        <span className="hidden sm:inline">
          {copied ? 'Copiado' : 'Compartilhar'}
        </span>
      </button>
    </div>
  )
}