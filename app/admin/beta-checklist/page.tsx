'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import {
  BETA_CHECKLIST_ITEMS,
  BETA_CHECKLIST_STORAGE_KEY,
  betaChecklistStatusLabels,
  betaChecklistStatuses,
  buildBetaChecklistReport,
  calculateBetaChecklistSummary,
  filterBetaChecklistItems,
  getBetaChecklistItemStatus,
  type BetaChecklistFilter,
  type BetaChecklistProgress,
  type BetaChecklistStatus,
} from '@/lib/beta-checklist'
import { supabase } from '@/lib/supabase'

type AdminState = 'loading' | 'denied' | 'ready'

const filterOptions: Array<{ value: BetaChecklistFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'passed', label: 'Passou' },
  { value: 'bug', label: 'Bug' },
  { value: 'review', label: 'Revisar' },
]

function getStatusClassName(status: BetaChecklistStatus) {
  if (status === 'passed') {
    return 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
  }

  if (status === 'bug') {
    return 'border-red-300/35 bg-red-500/15 text-red-100'
  }

  if (status === 'review') {
    return 'border-amber-300/35 bg-amber-500/15 text-amber-100'
  }

  return 'border-white/10 bg-white/5 text-zinc-300'
}

function getSummaryCardClassName(kind: BetaChecklistStatus | 'total') {
  if (kind === 'passed') return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-50'
  if (kind === 'bug') return 'border-red-300/25 bg-red-500/10 text-red-50'
  if (kind === 'review') return 'border-amber-300/25 bg-amber-500/10 text-amber-50'
  if (kind === 'pending') return 'border-white/10 bg-zinc-950/80 text-zinc-100'

  return 'border-blue-300/25 bg-blue-500/10 text-blue-50'
}

function parseStoredProgress(value: string | null): BetaChecklistProgress {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as BetaChecklistProgress
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const nextProgress: BetaChecklistProgress = {}

    for (const [itemId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue

      const status = betaChecklistStatuses.includes(entry.status as BetaChecklistStatus)
        ? entry.status
        : undefined
      const note = typeof entry.note === 'string' ? entry.note.slice(0, 240) : ''

      if (status || note.trim()) {
        nextProgress[itemId] = { status, note }
      }
    }

    return nextProgress
  } catch {
    return {}
  }
}

function getRouteParts(route: string) {
  return route.split(',').map((part) => part.trim()).filter(Boolean)
}

export default function AdminBetaChecklistPage() {
  const router = useRouter()
  const [adminState, setAdminState] = useState<AdminState>('loading')
  const [adminLabel, setAdminLabel] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<BetaChecklistProgress>({})
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [statusFilter, setStatusFilter] = useState<BetaChecklistFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    let active = true

    async function verifyAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        setMessage('Nao foi possivel verificar permissao admin.')
        setAdminState('denied')
        return
      }

      if (!isAdminRole(profileData?.role)) {
        setAdminState('denied')
        return
      }

      setAdminLabel(user.email || user.id)
      setAdminState('ready')
    }

    void verifyAdmin()

    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const timer = window.setTimeout(() => {
      setProgress(parseStoredProgress(window.localStorage.getItem(BETA_CHECKLIST_STORAGE_KEY)))
      setProgressLoaded(true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!progressLoaded || typeof window === 'undefined') return

    window.localStorage.setItem(BETA_CHECKLIST_STORAGE_KEY, JSON.stringify(progress))
  }, [progress, progressLoaded])

  const summary = useMemo(
    () => calculateBetaChecklistSummary(BETA_CHECKLIST_ITEMS, progress),
    [progress],
  )

  const visibleItems = useMemo(
    () => filterBetaChecklistItems(BETA_CHECKLIST_ITEMS, progress, {
      status: statusFilter,
      query: searchQuery,
    }),
    [progress, searchQuery, statusFilter],
  )

  function updateItemStatus(itemId: string, status: BetaChecklistStatus) {
    setProgress((current) => {
      const currentEntry = current[itemId]
      const note = currentEntry?.note || ''
      const nextProgress = { ...current }

      if (status === 'pending' && !note.trim()) {
        delete nextProgress[itemId]
        return nextProgress
      }

      nextProgress[itemId] = {
        ...currentEntry,
        status,
        note,
      }

      return nextProgress
    })
  }

  function updateItemNote(itemId: string, note: string) {
    const safeNote = note.slice(0, 240)

    setProgress((current) => {
      const currentEntry = current[itemId]
      const status = getBetaChecklistItemStatus(current, itemId)
      const nextProgress = { ...current }

      if (status === 'pending' && !safeNote.trim()) {
        delete nextProgress[itemId]
        return nextProgress
      }

      nextProgress[itemId] = {
        ...currentEntry,
        status,
        note: safeNote,
      }

      return nextProgress
    })
  }

  async function handleCopyReport() {
    const report = buildBetaChecklistReport(BETA_CHECKLIST_ITEMS, progress)

    try {
      await navigator.clipboard.writeText(report)
      setCopyMessage('Relatório copiado para a área de transferência.')
    } catch {
      setCopyMessage('Nao foi possivel copiar automaticamente. Tente novamente no navegador.')
    }
  }

  function handleClearProgress() {
    const confirmed = window.confirm('Limpar todo o progresso salvo neste navegador?')

    if (!confirmed) return

    setProgress({})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(BETA_CHECKLIST_STORAGE_KEY)
    }
    setCopyMessage('Progresso local limpo.')
  }

  if (adminState === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando checklist...
      </main>
    )
  }

  if (adminState !== 'ready') {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">
            Esta area e exclusiva para administradores da plataforma.
          </p>
          {message && (
            <p className="mt-3 rounded-2xl border border-red-200/20 bg-red-500/10 p-3 text-sm">
              {message}
            </p>
          )}
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-200/80">
              Beta fechado
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Checklist interativo de testes
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
              Use este checklist para validar o EntreUS antes de liberar usuarios beta.
              O progresso fica salvo apenas neste navegador.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Admin</p>
            <p className="mt-1 font-black">{adminLabel}</p>
          </div>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className={`rounded-[1.5rem] border p-4 ${getSummaryCardClassName('total')}`}>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Total</p>
            <p className="mt-2 text-3xl font-black">{summary.total}</p>
            <p className="mt-1 text-xs opacity-75">{summary.completionPercent}% concluido</p>
          </div>
          <div className={`rounded-[1.5rem] border p-4 ${getSummaryCardClassName('passed')}`}>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Passou</p>
            <p className="mt-2 text-3xl font-black">{summary.passed}</p>
          </div>
          <div className={`rounded-[1.5rem] border p-4 ${getSummaryCardClassName('bug')}`}>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Bug</p>
            <p className="mt-2 text-3xl font-black">{summary.bug}</p>
          </div>
          <div className={`rounded-[1.5rem] border p-4 ${getSummaryCardClassName('review')}`}>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Revisar</p>
            <p className="mt-2 text-3xl font-black">{summary.review}</p>
          </div>
          <div className={`rounded-[1.5rem] border p-4 ${getSummaryCardClassName('pending')}`}>
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Pendente</p>
            <p className="mt-2 text-3xl font-black">{summary.pending}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/85 p-4 text-zinc-100">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Visiveis</p>
            <p className="mt-2 text-3xl font-black">{visibleItems.length}</p>
            <p className="mt-1 text-xs text-zinc-500">apos filtros</p>
          </div>
        </div>

        <div className="mb-6 rounded-[2rem] border border-white/10 bg-zinc-950/85 p-4 shadow-xl shadow-black/20 ring-1 ring-white/5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por item, categoria ou rota..."
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300/50 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyReport}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition hover:bg-blue-50"
              >
                <Copy className="h-4 w-4" />
                Copiar relatório
              </button>
              <button
                type="button"
                onClick={handleClearProgress}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-red-300/25 bg-red-500/10 px-4 text-sm font-black text-red-100 transition hover:bg-red-500/20"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar progresso
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 pr-1 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              <Filter className="h-4 w-4" />
              Filtros
            </span>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  statusFilter === option.value
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {copyMessage && (
            <p className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-50">
              {copyMessage}
            </p>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 text-sm font-semibold text-zinc-300 shadow-xl shadow-black/20">
            Nenhum item encontrado.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleItems.map((item) => {
              const status = getBetaChecklistItemStatus(progress, item.id)
              const note = progress[item.id]?.note || ''

              return (
                <article
                  key={item.id}
                  className="rounded-[2rem] border border-white/10 bg-zinc-950/85 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
                          {item.category}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClassName(status)}`}>
                          {betaChecklistStatusLabels[status]}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-black">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
                    </div>

                    <label className="block shrink-0">
                      <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                        Status
                      </span>
                      <select
                        value={status}
                        onChange={(event) => updateItemStatus(item.id, event.target.value as BetaChecklistStatus)}
                        className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm font-black text-white outline-none transition focus:border-blue-300/50 focus:ring-4 focus:ring-blue-500/10"
                      >
                        {betaChecklistStatuses.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {betaChecklistStatusLabels[statusOption]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {getRouteParts(item.route).map((route) => {
                      const isConcreteRoute = route.startsWith('/') && !route.includes('[')

                      return isConcreteRoute ? (
                        <Link
                          key={`${item.id}-${route}`}
                          href={route}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-zinc-100 transition hover:border-blue-300/30 hover:bg-blue-500/15"
                        >
                          {route}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span
                          key={`${item.id}-${route}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-zinc-400"
                        >
                          {route}
                        </span>
                      )
                    })}
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Observação curta
                    </span>
                    <textarea
                      value={note}
                      onChange={(event) => updateItemNote(item.id, event.target.value)}
                      maxLength={240}
                      rows={3}
                      placeholder="Ex.: passou no Chrome mobile; revisar copy; bug no upload..."
                      className="w-full resize-none rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-300/50 focus:ring-4 focus:ring-blue-500/10"
                    />
                    <span className="mt-1 block text-right text-[11px] font-semibold text-zinc-500">
                      {note.length}/240
                    </span>
                  </label>
                </article>
              )
            })}
          </div>
        )}

        <div className="mt-6 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-sm leading-6 text-blue-50 ring-1 ring-blue-300/10">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-1 h-5 w-5 shrink-0 text-blue-100" />
            <div>
              <p className="font-black">Roteiro complementar</p>
              <p className="mt-1 text-blue-50/80">
                Use este painel como ferramenta pratica da rodada atual. Para contexto completo, consulte
                {' '}
                <Link href="/admin" className="font-black underline underline-offset-2">o painel admin</Link>
                {' '}e os documentos Markdown do beta fechado no repositorio.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
