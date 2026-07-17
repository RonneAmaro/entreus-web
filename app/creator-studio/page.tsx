'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, BarChart3, CheckCircle2, Circle, Eye, Heart, Loader2, MessageCircle, Users } from 'lucide-react'
import CreatorStudioShell, { type CreatorStudioSection } from '../components/creator/CreatorStudioShell'
import ItaCashAmount from '../components/ItaCashAmount'
import { supabase } from '@/lib/supabase'
import type { CreatorPeriod, CreatorStudioOverview, CreatorStudioPost } from '@/lib/creator/creator-studio'

export default function CreatorStudioPage() {
  const [active, setActive] = useState<CreatorStudioSection>('overview')
  const [overview, setOverview] = useState<CreatorStudioOverview | null>(null)
  const [content, setContent] = useState<CreatorStudioPost[]>([])
  const [period, setPeriod] = useState<CreatorPeriod>(30)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('all')

  async function load(selectedPeriod: CreatorPeriod, cursor?: string) {
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { window.location.assign('/login'); return }
    const params = new URLSearchParams({ period: String(selectedPeriod) })
    if (cursor) params.set('cursor', cursor)
    const response = await fetch(`/api/creator-studio/overview?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
    const body = await response.json().catch(() => null) as { ok?: boolean; overview?: CreatorStudioOverview; error?: string } | null
    if (!response.ok || !body?.ok || !body.overview) setError(body?.error || 'Não foi possível carregar o Creator Studio.')
    else {
      setOverview(body.overview)
      setContent((current) => cursor ? [...current, ...body.overview!.content.filter((post) => !current.some(({ id }) => id === post.id))] : body.overview!.content)
    }
    setLoading(false); setLoadingMore(false)
  }
  useEffect(() => { const task = window.setTimeout(() => void load(period), 0); return () => window.clearTimeout(task) }, [period])
  const filtered = useMemo(() => content.filter((post) => (!search || post.content.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))) && (visibility === 'all' || post.visibility === visibility)), [content, search, visibility])

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black"><p role="status" className="flex items-center gap-2 font-bold text-zinc-600 dark:text-zinc-300"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> Carregando Creator Studio</p></main>
  if (error || !overview) return <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-black"><div role="alert" className="max-w-md rounded-3xl bg-white p-6 text-center shadow-xl dark:bg-zinc-950"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><h1 className="mt-3 text-xl font-black">Creator Studio indisponível</h1><p className="mt-2 text-zinc-500">{error}</p><button onClick={() => void load(period)} className="mt-4 rounded-full bg-blue-600 px-4 py-2 font-bold text-white">Tentar novamente</button></div></main>

  return <CreatorStudioShell active={active} onChange={setActive}>
    {overview.partialErrors.length > 0 && <p role="status" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Alguns dados estão temporariamente indisponíveis: {overview.partialErrors.join(', ')}.</p>}
    {active === 'overview' && <div className="space-y-5"><Heading title={`Olá, ${overview.profile.displayName}`} description="Sua atividade real no EntreUS, sem projeções ou números simulados." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric value={overview.metrics.posts} label="Publicações" icon={BarChart3} /><Metric value={overview.metrics.views} label={`Views · ${period} dias`} icon={Eye} /><Metric value={overview.metrics.likes} label="Curtidas" icon={Heart} /><Metric value={overview.metrics.comments} label="Comentários" icon={MessageCircle} /><Metric value={overview.metrics.followers} label="Seguidores" icon={Users} /></div>
      <section className="grid gap-4 lg:grid-cols-2"><Panel title="Ações rápidas"><div className="grid gap-2 sm:grid-cols-2"><Quick href="/feed?compose=text" label="Criar publicação" /><Quick href={`/u/${overview.profile.username}`} label="Ver perfil público" /><button onClick={() => setActive('content')} className="min-h-11 rounded-2xl bg-zinc-100 px-4 text-left font-bold dark:bg-zinc-900">Gerenciar conteúdo</button><button onClick={() => setActive('earnings')} className="min-h-11 rounded-2xl bg-zinc-100 px-4 text-left font-bold dark:bg-zinc-900">Consultar ganhos</button></div></Panel><Panel title="Checklist do criador"><ul className="space-y-2">{overview.checklist.map((item) => <li key={item.id}><Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-2xl px-2 hover:bg-zinc-100 dark:hover:bg-zinc-900">{item.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-zinc-400" />}<span className="font-semibold">{item.label}</span></Link></li>)}</ul></Panel></section></div>}
    {active === 'content' && <div className="space-y-4"><Heading title="Conteúdo" description="Publicações da sua conta, em ordem recente." /><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input value={search} onChange={(e) => setSearch(e.target.value.slice(0, 80))} placeholder="Buscar no conteúdo carregado" aria-label="Buscar conteúdo" className="min-h-11 rounded-2xl border border-zinc-300 bg-white px-4 dark:border-zinc-700 dark:bg-zinc-950" /><select value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Filtrar por visibilidade" className="min-h-11 rounded-2xl border border-zinc-300 bg-white px-4 dark:border-zinc-700 dark:bg-zinc-950"><option value="all">Todas</option><option value="public">Públicas</option><option value="followers">Seguidores</option><option value="private">Privadas</option></select></div><ContentList posts={filtered} />{overview.nextCursor && <button disabled={loadingMore} onClick={() => void load(period, overview.nextCursor!)} className="min-h-11 w-full rounded-full border border-zinc-300 font-bold dark:border-zinc-700">{loadingMore ? 'Carregando…' : 'Carregar mais'}</button>}</div>}
    {active === 'interactions' && <div className="space-y-4"><Heading title="Interações" description="Comentários e curtidas das publicações carregadas." /><ContentList posts={content.filter((post) => post.comments > 0 || post.likes > 0)} empty="Nenhuma interação disponível nesta página." /></div>}
    {active === 'insights' && <div className="space-y-4"><Heading title="Métricas" description="Visualizações registradas pelo analytics existente." /><div className="flex flex-wrap gap-2">{([7, 30, 90] as CreatorPeriod[]).map((value) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)} className="min-h-11 rounded-full border border-zinc-300 px-4 font-bold aria-pressed:bg-blue-600 aria-pressed:text-white dark:border-zinc-700">{value} dias</button>)}</div><Panel title={`Resumo acessível · ${period} dias`}><p>Visualizações: {overview.metrics.views === null ? 'indisponíveis' : overview.metrics.views.toLocaleString('pt-BR')}. Curtidas: {overview.metrics.likes ?? 'indisponíveis'}. Comentários: {overview.metrics.comments ?? 'indisponíveis'}.</p></Panel></div>}
    {active === 'earnings' && <div className="space-y-4"><Heading title="Ganhos" description="Consolidação dos registros ItaCash existentes. Valores pendentes não são saldo disponível." /><div className="grid gap-3 sm:grid-cols-2"><Money label="Saldo disponível" value={overview.earnings.availableBalance} /><Money label="Saques pendentes" value={overview.earnings.pendingWithdrawals} /><Money label="Gorjetas registradas" value={overview.earnings.tipsReceived} /><Money label="Posts pagos registrados" value={overview.earnings.paidPostsReceived} /></div><div className="flex flex-wrap gap-2"><Quick href="/wallet" label="Abrir carteira" /><Quick href="/creator-dashboard" label="Solicitações de saque" /></div></div>}
    {active === 'profile' && <div className="space-y-4"><Heading title="Perfil público" description="Prévia dos dados que já são públicos." /><Panel title={overview.profile.displayName}><p className="text-sm text-zinc-500">@{overview.profile.username}</p><p className="mt-3 whitespace-pre-wrap">{overview.profile.bio || 'Biografia ainda não preenchida.'}</p><div className="mt-4 flex gap-2"><Quick href={`/u/${overview.profile.username}`} label="Ver perfil" /><Quick href="/profile" label="Editar perfil" /></div></Panel></div>}
    {active === 'settings' && <div className="space-y-4"><Heading title="Configurações" description="Atalhos para fontes de verdade já existentes." /><div className="grid gap-3 sm:grid-cols-2"><Quick href="/settings" label="Privacidade e segurança" /><Quick href="/profile" label="Perfil e identidade" /><Quick href="/notifications" label="Notificações" /><Quick href="/wallet" label="Carteira e movimentações" /></div></div>}
  </CreatorStudioShell>
}

function Heading({ title, description }: { title: string; description: string }) { return <header><h2 className="text-2xl font-black sm:text-3xl">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p></header> }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-white/10"><h3 className="font-black">{title}</h3><div className="mt-3">{children}</div></section> }
function Quick({ href, label }: { href: string; label: string }) { return <Link href={href} className="flex min-h-11 items-center rounded-2xl bg-zinc-100 px-4 font-bold hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-900 dark:hover:bg-zinc-800">{label}</Link> }
function Metric({ value, label, icon: Icon }: { value: number | null; label: string; icon: typeof Heart }) { return <article className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-white/10"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{label}</p><Icon className="h-4 w-4 text-blue-500" /></div><p className="mt-3 text-2xl font-black">{value === null ? 'Indisponível' : value.toLocaleString('pt-BR')}</p></article> }
function Money({ label, value }: { label: string; value: number | null }) { return <article className="rounded-[1.5rem] bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"><p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{label}</p><div className="mt-3 text-xl font-black">{value === null ? 'Indisponível' : <ItaCashAmount amount={value} size="lg" />}</div></article> }
function ContentList({ posts, empty = 'Nenhuma publicação encontrada.' }: { posts: CreatorStudioPost[]; empty?: string }) { if (!posts.length) return <p className="rounded-3xl bg-white p-6 text-center text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">{empty}</p>; return <div className="space-y-3">{posts.map((post) => <article key={post.id} className="rounded-[1.5rem] bg-white p-4 ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-white/10"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="line-clamp-2 font-semibold">{post.content || 'Publicação sem legenda'}</p><p className="mt-1 text-xs text-zinc-500">{new Date(post.createdAt).toLocaleDateString('pt-BR')} · {post.visibility} · {post.moderationStatus === 'active' ? 'Publicado' : post.moderationStatus === 'hidden' ? 'Restrito' : 'Removido'}{post.isPaid ? ' · Pago' : ''}</p></div><Link href={`/post/${post.id}`} className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-bold dark:border-zinc-700">Abrir</Link></div><p className="mt-3 text-xs text-zinc-500">{post.likes} curtidas · {post.comments} comentários · {post.views === null ? 'views indisponíveis' : `${post.views} views`}</p></article>)}</div> }
