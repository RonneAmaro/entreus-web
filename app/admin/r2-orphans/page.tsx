'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  DatabaseZap,
  FileQuestion,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { useLanguage } from '@/app/components/LanguageProvider'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type OrphanSample = {
  key: string
  size: number
  lastModified: string | null
}

type R2OrphansAudit = {
  ok: boolean
  dryRun: boolean
  deleted: boolean
  totalObjectsAnalyzed: number
  totalReferencedObjects: number
  totalPossibleOrphans: number
  estimatedOrphanBytes: number
  possibleOrphanMegabytes?: number
  limitPerPrefix?: number
  warnings?: string[]
  sampleOrphans?: OrphanSample[]
}

const AUDIT_LIMIT = 50

export default function AdminR2OrphansPage() {
  const router = useRouter()
  const { language, t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [auditLoading, setAuditLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [audit, setAudit] = useState<R2OrphansAudit | null>(null)

  const sampleOrphans = useMemo(() => audit?.sampleOrphans || [], [audit?.sampleOrphans])

  function formatNumber(value: number | null | undefined) {
    return new Intl.NumberFormat(language).format(value || 0)
  }

  function formatBytes(value: number | null | undefined) {
    const bytes = value || 0
    const unitBase = 1024
    if (bytes < unitBase) return `${bytes} B`

    const units = ['KB', 'MB', 'GB', 'TB']
    let size = bytes / unitBase
    let unitIndex = 0

    while (size >= unitBase && unitIndex < units.length - 1) {
      size /= unitBase
      unitIndex += 1
    }

    return `${size.toLocaleString(language, { maximumFractionDigits: 2 })} ${units[unitIndex]}`
  }

  function formatDate(value: string | null) {
    if (!value) return t('admin.r2Orphans.fallback.notProvided')

    return new Date(value).toLocaleString(language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getPrefix(key: string) {
    if (key.startsWith('posts/')) return t('admin.r2Orphans.prefix.posts')
    if (key.startsWith('comments/')) return t('admin.r2Orphans.prefix.comments')
    return t('admin.r2Orphans.prefix.unknown')
  }

  function getApproximateType(key: string) {
    const extension = key.split('.').pop()?.toLowerCase()

    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension || '')) return t('admin.r2Orphans.types.image')
    if (['mp4', 'webm', 'mov', 'ogg'].includes(extension || '')) return t('admin.r2Orphans.types.video')
    return t('admin.r2Orphans.types.file')
  }

  useEffect(() => {
    void loadPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPage() {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage(t('admin.r2Orphans.messages.adminCheckFailed'))
      setLoading(false)
      return
    }

    const loadedProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }

    setAdminProfile(loadedProfile)
    setLoading(false)

    if (isAdminRole(loadedProfile.role)) {
      await loadAudit()
    }
  }

  async function loadAudit() {
    setAuditLoading(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage(t('admin.r2Orphans.messages.sessionExpired'))
      setAuditLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/admin/r2/orphans?limit=${AUDIT_LIMIT}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = (await response.json().catch(() => null)) as (R2OrphansAudit & { error?: string }) | null

      if (!response.ok || !data?.ok) {
        setMessage(t('admin.r2Orphans.messages.loadFailed'))
        setAudit(null)
        return
      }

      setAudit(data)
    } catch {
      setMessage(t('admin.r2Orphans.messages.connectionFailed'))
      setAudit(null)
    } finally {
      setAuditLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('admin.r2Orphans.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('post.restrictedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">{t('admin.r2Orphans.accessDeniedDescription')}</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/admin" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            {t('admin.creatorWithdrawals.admin')}
          </Link>

          <button
            type="button"
            onClick={loadAudit}
            disabled={auditLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('admin.r2Orphans.actions.refresh')}
          </button>
        </div>

        <header className="mt-6 rounded-[2rem] border border-blue-300/25 bg-blue-500/10 p-6 shadow-xl shadow-blue-950/10 ring-1 ring-blue-300/10">
          <DatabaseZap className="h-10 w-10 text-blue-100" />
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{t('admin.r2Orphans.title')}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100/80 sm:text-base">
            {t('admin.r2Orphans.description')}
          </p>
        </header>

        <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
          {t('admin.r2Orphans.notice')}
        </div>

        {message && (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{message}</span>
            <button
              type="button"
              onClick={loadAudit}
              className="rounded-full border border-red-200/20 px-4 py-2 text-xs font-black transition hover:bg-red-500/20"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {auditLoading && !audit ? (
          <div className="mt-5 flex min-h-64 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/80 text-zinc-400 ring-1 ring-white/5">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('admin.r2Orphans.loadingAudit')}
          </div>
        ) : audit ? (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
                <HardDrive className="h-6 w-6 text-blue-200" />
                <p className="mt-4 text-sm font-bold text-zinc-500">{t('admin.r2Orphans.summary.analyzed')}</p>
                <p className="mt-1 text-3xl font-black">{formatNumber(audit.totalObjectsAnalyzed)}</p>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
                <CheckCircle2 className="h-6 w-6 text-emerald-200" />
                <p className="mt-4 text-sm font-bold text-zinc-500">{t('admin.r2Orphans.summary.referenced')}</p>
                <p className="mt-1 text-3xl font-black">{formatNumber(audit.totalReferencedObjects)}</p>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
                <FileQuestion className="h-6 w-6 text-amber-200" />
                <p className="mt-4 text-sm font-bold text-zinc-500">{t('admin.r2Orphans.summary.orphans')}</p>
                <p className="mt-1 text-3xl font-black">{formatNumber(audit.totalPossibleOrphans)}</p>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
                <AlertTriangle className="h-6 w-6 text-red-200" />
                <p className="mt-4 text-sm font-bold text-zinc-500">{t('admin.r2Orphans.summary.size')}</p>
                <p className="mt-1 text-3xl font-black">{formatBytes(audit.estimatedOrphanBytes)}</p>
              </article>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('admin.r2Orphans.meta.mode')}</p>
                <p className="mt-2 text-lg font-black">{audit.dryRun ? t('admin.r2Orphans.mode.enabled') : t('admin.r2Orphans.mode.disabled')}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('admin.r2Orphans.meta.deletion')}</p>
                <p className="mt-2 text-lg font-black">{audit.deleted ? t('admin.r2Orphans.deletion.deleted') : t('admin.r2Orphans.deletion.none')}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('admin.r2Orphans.meta.limit')}</p>
                <p className="mt-2 text-lg font-black">{formatNumber(audit.limitPerPrefix)} {t('admin.r2Orphans.meta.limitSuffix')}</p>
              </div>
            </div>

            {audit.warnings && audit.warnings.length > 0 && (
              <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
                <p className="font-black">{t('admin.r2Orphans.warningsTitle')}</p>
                <p className="mt-2">{audit.warnings.join(' | ')}</p>
              </div>
            )}

            <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black">{t('admin.r2Orphans.sampleTitle')}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{t('admin.r2Orphans.sampleDescription')}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-300">
                  {formatNumber(sampleOrphans.length)} {t('admin.r2Orphans.sampleItems')}
                </span>
              </div>

              {sampleOrphans.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-100">
                  <p className="font-black">{t('admin.r2Orphans.empty.title')}</p>
                  <p className="mt-2 text-sm leading-6">
                    {t('admin.r2Orphans.empty.description')}
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10">
                  <div className="grid min-w-[760px] grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_11rem] gap-3 border-b border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                    <span>{t('admin.r2Orphans.table.key')}</span>
                    <span>{t('admin.r2Orphans.table.prefix')}</span>
                    <span>{t('admin.r2Orphans.table.type')}</span>
                    <span>{t('admin.r2Orphans.table.size')}</span>
                    <span>{t('admin.r2Orphans.table.modified')}</span>
                  </div>

                  <div className="divide-y divide-white/10">
                    {sampleOrphans.map((item) => (
                      <article
                        key={item.key}
                        className="grid min-w-[760px] grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_11rem] items-center gap-3 px-4 py-3 text-sm text-zinc-300"
                      >
                        <p className="break-all font-mono text-xs text-zinc-200">{item.key}</p>
                        <p>{getPrefix(item.key)}</p>
                        <p>{getApproximateType(item.key)}</p>
                        <p>{formatBytes(item.size)}</p>
                        <p>{formatDate(item.lastModified)}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  )
}
