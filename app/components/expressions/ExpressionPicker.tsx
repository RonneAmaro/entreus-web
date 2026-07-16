'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Loader2, Search, X } from 'lucide-react'
import type { ExpressionAsset, ExpressionContext, ExpressionKind, ExpressionSearchResult } from '@/lib/expressions/expression-types'
import { readExpressions, storeExpression } from '@/lib/expressions/expression-storage'
import { EMOJI_CATEGORIES } from './emoji-data'
import { supabase } from '@/lib/supabase'

type Props = { open: boolean; context: ExpressionContext; userId: string; accessToken?: string | null; onClose: () => void; onSelect: (asset: ExpressionAsset) => void; returnFocusRef?: React.RefObject<HTMLElement | null> }
const tabs: { kind: ExpressionKind; label: string }[] = [{ kind: 'emoji', label: 'Emojis' }, { kind: 'gif', label: 'GIFs' }, { kind: 'sticker', label: 'Stickers' }]

export default function ExpressionPicker({ open, context, userId, accessToken, onClose, onSelect, returnFocusRef }: Props) {
  const [kind, setKind] = useState<ExpressionKind>('emoji'), [query, setQuery] = useState(''), [items, setItems] = useState<ExpressionAsset[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const panel = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const load = useCallback(async (append = false) => {
    if (kind === 'emoji') return
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ kind, q: query, limit: '18' }); if (append && cursor) params.set('cursor', cursor)
      const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch(`/api/expressions/search?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = await response.json() as ExpressionSearchResult & { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || 'Galeria indisponível.')
      setItems((current) => append ? [...current, ...data.items] : data.items); setCursor(data.nextCursor)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Galeria indisponível.'); if (!append) setItems([]) }
    finally { setLoading(false) }
  }, [accessToken, cursor, kind, query])
  useEffect(() => { if (!open) return; panel.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); returnFocusRef?.current?.focus() } }, [onClose, open, returnFocusRef])
  useEffect(() => { if (!open || kind === 'emoji') return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void load(false), 320); return () => { if (timer.current) clearTimeout(timer.current) } }, [kind, load, open, query])
  if (!open) return null
  const select = (asset: ExpressionAsset) => { storeExpression(window.localStorage, userId, 'recent', asset); onSelect(asset); onClose() }
  const recent = readExpressions(typeof window === 'undefined' ? null : window.localStorage, userId, 'recent', kind)
  return createPortal(<div className="fixed inset-0 z-[10050] flex items-end bg-black/40 p-0 sm:items-center sm:justify-center" data-expression-context={context}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-label="Emojis, GIFs e stickers" className="max-h-[88dvh] min-h-[32rem] w-full overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-950 sm:max-h-[36rem] sm:min-h-0 sm:rounded-3xl">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><strong>Expressões</strong><button type="button" onClick={onClose} aria-label="Fechar seletor" className="min-h-11 min-w-11 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="mx-auto h-5 w-5" /></button></header>
      <div role="tablist" aria-label="Tipos de expressão" className="grid grid-cols-3 border-b border-zinc-200 dark:border-zinc-800">{tabs.map((tab) => <button key={tab.kind} type="button" role="tab" aria-selected={kind === tab.kind} onClick={() => { setKind(tab.kind); setQuery(''); setItems([]) }} className="min-h-11 border-b-2 px-2 text-sm font-bold aria-selected:border-blue-600 aria-selected:text-blue-700 dark:aria-selected:text-blue-300">{tab.label}</button>)}</div>
      {kind !== 'emoji' && <label className="m-3 flex items-center gap-2 rounded-full border border-zinc-300 px-3 dark:border-zinc-700"><Search className="h-4 w-4" /><span className="sr-only">Buscar {kind}</span><input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 80))} placeholder={`Buscar ${kind === 'gif' ? 'GIFs' : 'stickers'}`} className="min-h-11 flex-1 bg-transparent outline-none" /></label>}
      <div className="max-h-[65dvh] overflow-y-auto p-3 sm:max-h-[25rem]">
        {kind === 'emoji' ? EMOJI_CATEGORIES.map((category) => <section key={category.name}><h3 className="mb-2 mt-3 text-xs font-bold text-zinc-500">{category.name}</h3><div className="grid grid-cols-7 gap-1">{category.emojis.map((emoji) => <button key={`${category.name}-${emoji}`} type="button" aria-label={`Inserir ${emoji}`} onClick={() => select({ kind: 'emoji', provider: 'unicode', providerId: emoji, title: 'Emoji', altText: `Emoji ${emoji}` })} className="min-h-11 rounded-xl text-2xl hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800">{emoji}</button>)}</div></section>) : <>
          {recent.length > 0 && !query && <section><h3 className="mb-2 text-xs font-bold text-zinc-500">Recentes</h3><div className="mb-4 grid grid-cols-3 gap-2">{recent.slice(0, 6).map((asset) => <AssetButton key={`recent-${asset.providerId}`} asset={asset} select={select} userId={userId} />)}</div></section>}
          {loading && items.length === 0 ? <p role="status" className="flex items-center justify-center gap-2 py-12"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> Carregando</p> : error ? <div role="alert" className="py-10 text-center"><p>{error}</p><button type="button" onClick={() => void load(false)} className="mt-3 rounded-full bg-blue-600 px-4 py-2 font-bold text-white">Tentar novamente</button></div> : items.length === 0 ? <p className="py-12 text-center text-zinc-500">Nenhum resultado.</p> : <div className="grid grid-cols-3 gap-2">{items.map((asset) => <AssetButton key={asset.providerId} asset={asset} select={select} userId={userId} />)}</div>}
          {cursor && !loading && <button type="button" onClick={() => void load(true)} className="mt-4 w-full rounded-full border border-zinc-300 py-2 font-bold dark:border-zinc-700">Carregar mais</button>}
          <p className="mt-4 text-center text-xs text-zinc-500">Conteúdo por <a href="https://tenor.com/" target="_blank" rel="noreferrer" className="font-bold underline">Tenor</a></p>
        </>}
      </div>
    </div>
  </div>, document.body)
}

function AssetButton({ asset, select, userId }: { asset: ExpressionAsset; select: (asset: ExpressionAsset) => void; userId: string }) {
  return <div className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900"><button type="button" aria-label={`Selecionar ${asset.altText}`} onClick={() => select(asset)} className="h-full w-full focus-visible:outline-2 focus-visible:outline-blue-500">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={asset.previewUrl} alt="" loading="lazy" width={asset.width || 160} height={asset.height || 160} className="h-full w-full object-cover" /></button><button type="button" aria-label={`Favoritar ${asset.altText}`} onClick={() => storeExpression(window.localStorage, userId, 'favorite', asset)} className="absolute right-1 top-1 rounded-full bg-black/60 p-2 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><Heart className="h-4 w-4" /></button></div>
}
