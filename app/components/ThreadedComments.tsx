'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, MessageCircle, MoreHorizontal, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  MAX_VISUAL_COMMENT_DEPTH,
  REPLY_PAGE_SIZE,
  ROOT_COMMENT_PAGE_SIZE,
  commentHasContent,
  getVisualCommentDepth,
  mergeComments,
  type ThreadedComment,
  type ThreadedCommentMedia,
} from '@/lib/threaded-comments'
import type { ExpressionAsset } from '@/lib/expressions/expression-types'
import ExpressionAttachment from './expressions/ExpressionAttachment'
import ExpressionPicker from './expressions/ExpressionPicker'
import { useLanguage } from './LanguageProvider'
import { formatDateTime } from '@/lib/i18n'

const SELECT = `id, post_id, user_id, parent_comment_id, content, expression, depth, reply_count, deleted_at, edited_at, created_at, profiles(username, display_name, avatar_url)`

function normalize(row: ThreadedComment & { profiles: ThreadedComment['profiles'] | ThreadedComment['profiles'][] }) {
  return { ...row, profiles: Array.isArray(row.profiles) ? row.profiles[0] || null : row.profiles } as ThreadedComment
}

type Props = {
  postId: string
  currentUserId: string
  refreshVersion?: number
  onCountChange?: () => void
}

export default function ThreadedComments({ postId, currentUserId, refreshVersion = 0, onCountChange }: Props) {
  const { t } = useLanguage()
  const [roots, setRoots] = useState<ThreadedComment[]>([])
  const [replies, setReplies] = useState<Record<string, ThreadedComment[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [hasMoreRoots, setHasMoreRoots] = useState(false)
  const [hasMoreReplies, setHasMoreReplies] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function hydrateMedia(comments: ThreadedComment[]) {
    const commentIds = comments.map(({ id }) => id)
    if (commentIds.length === 0) return comments

    const { data, error: mediaError } = await supabase
      .from('comment_media')
      .select('id, comment_id, user_id, media_url, media_type, created_at')
      .in('comment_id', commentIds)

    if (mediaError) {
      console.warn('Comment media unavailable:', mediaError.message)
      return comments
    }

    const mediaByCommentId = ((data || []) as ThreadedCommentMedia[]).reduce<Record<string, ThreadedCommentMedia[]>>(
      (all, media) => ({ ...all, [media.comment_id]: [...(all[media.comment_id] || []), media] }),
      {},
    )
    return comments.map((comment) => ({ ...comment, media: mediaByCommentId[comment.id] || [] }))
  }

  const loadRoots = useCallback(async (append = false) => {
    setLoadingTarget(append ? 'roots' : null)
    if (!append) setLoading(true)
    setError('')
    let query = supabase.from('comments').select(SELECT)
      .eq('post_id', postId).is('parent_comment_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(ROOT_COMMENT_PAGE_SIZE + 1)
    const cursor = append ? roots[roots.length - 1] : null
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    const { data, error: queryError } = await query
    if (queryError) {
      setError(t('post.comments.loadError'))
    } else {
      const page = await hydrateMedia((data || []).slice(0, ROOT_COMMENT_PAGE_SIZE).map((row) => normalize(row as never)))
      setRoots((current) => append ? [...current, ...page.filter((item) => !current.some(({ id }) => id === item.id))] : page)
      setHasMoreRoots((data || []).length > ROOT_COMMENT_PAGE_SIZE)
    }
    setLoading(false)
    setLoadingTarget(null)
  }, [postId, roots, t])

  useEffect(() => {
    const task = window.setTimeout(() => void loadRoots(false), 0)
    return () => window.clearTimeout(task)
  }, [postId, refreshVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReplies(parent: ThreadedComment, append = false) {
    setLoadingTarget(parent.id)
    setError('')
    const current = replies[parent.id] || []
    let query = supabase.from('comments').select(SELECT)
      .eq('post_id', postId).eq('parent_comment_id', parent.id)
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(REPLY_PAGE_SIZE + 1)
    const cursor = append ? current[current.length - 1] : null
    if (cursor) query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`)
    const { data, error: queryError } = await query
    if (queryError) setError(t('post.comments.repliesLoadError'))
    else {
      const page = await hydrateMedia((data || []).slice(0, REPLY_PAGE_SIZE).map((row) => normalize(row as never)))
      setReplies((all) => ({ ...all, [parent.id]: append ? mergeComments(current, page) : page }))
      setHasMoreReplies((all) => ({ ...all, [parent.id]: (data || []).length > REPLY_PAGE_SIZE }))
      setExpanded((all) => new Set(all).add(parent.id))
    }
    setLoadingTarget(null)
  }

  function collapse(parentId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      next.delete(parentId)
      return next
    })
  }

  async function refreshNode(comment: ThreadedComment) {
    if (comment.parent_comment_id) {
      const parent = [...roots, ...Object.values(replies).flat()].find(({ id }) => id === comment.parent_comment_id)
      if (parent) await loadReplies(parent)
    } else {
      await loadRoots(false)
    }
    onCountChange?.()
  }

  if (loading) return <div role="status" className="flex items-center gap-2 py-4 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {t('post.comments.loading')}</div>

  return <section aria-label={t('post.comments.label')} className="mt-4 border-t border-zinc-200/70 pt-4 dark:border-zinc-800/70">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-100">{t('post.comments.conversation')}</h3>
      <span className="text-xs font-semibold text-zinc-500">{t('post.comments.pageSize')}</span>
    </div>
    {error && <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
    {roots.length === 0 ? <p className="py-3 text-sm text-zinc-500">{t('post.comments.empty')}</p> :
      <div role="list" className="space-y-3">{roots.map((root) =>
        <CommentNode key={root.id} comment={root} currentUserId={currentUserId} childrenByParent={replies}
          expanded={expanded} hasMoreReplies={hasMoreReplies} loadingTarget={loadingTarget}
          onExpand={loadReplies} onCollapse={collapse} onRefresh={refreshNode} />)}
      </div>}
    {hasMoreRoots && <button type="button" onClick={() => void loadRoots(true)} disabled={loadingTarget === 'roots'} className="mt-4 min-h-11 w-full rounded-full border border-zinc-300 px-4 text-sm font-bold dark:border-zinc-700">
      {loadingTarget === 'roots' ? t('common.loading') : t('post.comments.loadMore')}
    </button>}
  </section>
}

type NodeProps = {
  comment: ThreadedComment
  currentUserId: string
  childrenByParent: Record<string, ThreadedComment[]>
  expanded: Set<string>
  hasMoreReplies: Record<string, boolean>
  loadingTarget: string | null
  onExpand: (comment: ThreadedComment, append?: boolean) => Promise<void>
  onCollapse: (id: string) => void
  onRefresh: (comment: ThreadedComment) => Promise<void>
}

function CommentNode(props: NodeProps) {
  const { t, language } = useLanguage()
  const { comment, currentUserId, childrenByParent, expanded, hasMoreReplies, loadingTarget, onExpand, onCollapse, onRefresh } = props
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const children = childrenByParent[comment.id] || []
  const open = expanded.has(comment.id)
  const visualDepth = getVisualCommentDepth(comment.depth)
  const author = comment.profiles?.display_name || comment.profiles?.username || 'Pessoa'

  useEffect(() => { if (replying) input.current?.focus() }, [replying])
  const closeReply = () => { setReplying(false); trigger.current?.focus() }

  return <div role="listitem" aria-label={`Comentário no nível ${comment.depth + 1}`} className={comment.depth ? 'mt-3' : ''}>
    <article className="relative rounded-[1.35rem] bg-zinc-50/90 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-900/75 dark:ring-zinc-800/70"
      style={{ marginInlineStart: `${visualDepth * 12}px` }}>
      {comment.depth >= MAX_VISUAL_COMMENT_DEPTH && <div aria-hidden className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-blue-400/60" />}
      <div className="flex gap-3">
        <Avatar comment={comment} author={author} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div><strong className="text-sm">{author}</strong>{comment.profiles?.username && <span className="ml-1 text-xs text-zinc-500">@{comment.profiles.username}</span>}
              {comment.depth >= MAX_VISUAL_COMMENT_DEPTH && comment.parent_comment_id && <p className="text-xs font-semibold text-blue-600 dark:text-blue-300">respondendo na conversa</p>}</div>
            {!comment.deleted_at && <div className="relative">
              <button type="button" onClick={() => setMenu(!menu)} aria-label={t('post.comments.options')} className="min-h-10 min-w-10 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800"><MoreHorizontal className="mx-auto h-4 w-4" /></button>
              {menu && <div className="absolute right-0 z-20 w-36 rounded-xl border bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                {comment.user_id === currentUserId ? <>
                  <button type="button" onClick={() => { setEditing(true); setMenu(false) }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('post.comments.edit')}</button>
                  <button type="button" onClick={async () => { setMenu(false); if (!window.confirm(t('post.comments.delete'))) return; const { error } = await supabase.rpc('delete_threaded_comment', { p_comment_id: comment.id }); if (!error) await onRefresh(comment) }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">{t('post.comments.delete')}</button>
                </> : <button type="button" disabled={reported} onClick={async () => {
                  const reason = window.prompt(t('post.comments.reportPrompt'))
                  if (!reason) return
                  const { error } = await supabase.rpc('report_threaded_comment', { p_comment_id: comment.id, p_reason: reason, p_client_request_id: crypto.randomUUID() })
                  if (!error) { setReported(true); setMenu(false) }
                }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-red-600 hover:bg-red-50 disabled:text-zinc-400 dark:hover:bg-red-950/30">{reported ? t('post.comments.reported') : t('post.comments.report')}</button>}
              </div>}
            </div>}
          </div>
          {comment.deleted_at ? <p className="mt-2 italic text-zinc-500" aria-label={t('post.comments.removed')}>{t('post.comments.removed')}</p> :
            editing ? <CommentComposer mode="edit" comment={comment} currentUserId={currentUserId} inputRef={input} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await onRefresh(comment) }} /> :
            <><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-200">{comment.content}</p>
              {comment.expression && <div className="mt-2"><ExpressionAttachment expression={comment.expression} compact /></div>}</>}
          {!comment.deleted_at && comment.media && comment.media.length > 0 && <div className="mt-3 space-y-2">
            {comment.media.map((media) => <div key={media.id} className="overflow-hidden rounded-xl border border-blue-400/15 bg-black">
              {media.media_type === 'video' ? <video src={media.media_url} controls playsInline preload="metadata" className="max-h-80 w-full bg-black object-contain" /> :
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.media_url} alt={media.media_type === 'gif' ? 'GIF do comentário' : 'Imagem do comentário'} loading="lazy" className="max-h-80 w-full object-contain" />}
            </div>)}
          </div>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {!comment.deleted_at && <button ref={trigger} type="button" onClick={() => setReplying(true)} className="min-h-9 rounded-full px-2 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-800">{t('post.comments.reply')}</button>}
            <time dateTime={comment.created_at}>{formatDateTime(language, comment.created_at)}</time>
            {comment.edited_at && <span>{t('post.comments.edited')}</span>}
          </div>
          {replying && <CommentComposer mode="reply" comment={comment} currentUserId={currentUserId} inputRef={input} onCancel={closeReply} onSaved={async () => { closeReply(); await onExpand(comment); await onRefresh(comment) }} />}
        </div>
      </div>
    </article>
    {comment.reply_count > 0 && <div className="ml-3">
      {!open ? <button type="button" aria-expanded="false" aria-controls={`replies-${comment.id}`} onClick={() => void onExpand(comment)} disabled={loadingTarget === comment.id} className="mt-2 flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30">
        {loadingTarget === comment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />} Ver {comment.reply_count} {comment.reply_count === 1 ? 'resposta' : 'respostas'}
      </button> : <div id={`replies-${comment.id}`} className="border-l border-blue-300/50 pl-1 dark:border-blue-800/60">
        {children.map((child) => <CommentNode key={child.id} {...props} comment={child} />)}
        <div className="flex flex-wrap gap-2">
          {hasMoreReplies[comment.id] && <button type="button" onClick={() => void onExpand(comment, true)} className="min-h-10 rounded-full px-3 text-sm font-bold text-blue-700 dark:text-blue-300">Ver mais respostas</button>}
          <button type="button" aria-expanded="true" aria-controls={`replies-${comment.id}`} onClick={() => onCollapse(comment.id)} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-zinc-600 dark:text-zinc-300"><ChevronUp className="h-4 w-4" /> Recolher</button>
        </div>
      </div>}
    </div>}
  </div>
}

function Avatar({ comment, author }: { comment: ThreadedComment; author: string }) {
  return comment.deleted_at ? <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800"><MessageCircle className="h-4 w-4" /></div> :
    // eslint-disable-next-line @next/next/no-img-element
    comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full object-cover" /> :
      <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-200">{author.charAt(0).toUpperCase()}</div>
}

function CommentComposer({ mode, comment, currentUserId, inputRef, onCancel, onSaved }: { mode: 'reply' | 'edit'; comment: ThreadedComment; currentUserId: string; inputRef: React.RefObject<HTMLTextAreaElement | null>; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useLanguage()
  const [content, setContent] = useState(mode === 'edit' ? comment.content : '')
  const [expression, setExpression] = useState<ExpressionAsset | null>(mode === 'edit' ? comment.expression || null : null)
  const [picker, setPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const requestId = useMemo(() => crypto.randomUUID(), [])
  async function submit() {
    if (!commentHasContent(content, expression)) { setError(t('post.comments.replyRequired')); return }
    setSending(true); setError('')
    const result = mode === 'reply'
      ? await supabase.rpc('create_threaded_comment', { p_post_id: comment.post_id, p_content: content, p_expression: expression, p_parent_comment_id: comment.id, p_client_request_id: requestId })
      : await supabase.rpc('edit_threaded_comment', { p_comment_id: comment.id, p_content: content, p_expression: expression })
    if (result.error) { setError(result.error.message); setSending(false); return }
    await onSaved()
    setSending(false)
  }
  return <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
    <label className="sr-only" htmlFor={`composer-${mode}-${comment.id}`}>{mode === 'reply' ? t('post.comments.replyPlaceholder', { username: comment.profiles?.username || 'comment' }) : t('post.comments.editPlaceholder')}</label>
    <textarea ref={inputRef} id={`composer-${mode}-${comment.id}`} value={content} onChange={(event) => setContent(event.target.value.slice(0, 2000))} placeholder={mode === 'reply' ? t('post.comments.replyPlaceholder', { username: comment.profiles?.username || 'user' }) : t('post.comments.editPlaceholder')} className="min-h-20 w-full resize-none bg-transparent p-2 text-sm outline-none" />
    {expression && <div className="flex items-start gap-2 p-2"><ExpressionAttachment expression={expression} compact /><button type="button" aria-label={t('post.comments.removeExpression')} onClick={() => setExpression(null)}><X className="h-4 w-4" /></button></div>}
    {error && <p role="alert" className="px-2 text-xs text-red-600">{error}</p>}
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setPicker(true)} className="min-h-10 rounded-full px-3 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('post.comments.expression')}</button>
      <div className="flex gap-1"><button type="button" onClick={onCancel} className="min-h-10 rounded-full px-3 text-xs font-bold">{t('common.cancel')}</button><button type="button" onClick={() => void submit()} disabled={sending} className="flex min-h-10 items-center gap-1 rounded-full bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{mode === 'reply' ? t('post.comments.reply') : t('post.comments.save')}</button></div>
    </div>
    <ExpressionPicker open={picker} context="reply" userId={currentUserId} onClose={() => setPicker(false)} returnFocusRef={inputRef} onSelect={(asset) => asset.kind === 'emoji' ? setContent((value) => value + asset.providerId) : setExpression(asset)} />
  </div>
}
