'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  FileArchive,
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

type AttachmentAuditItem = {
  id: string
  createdAt: string | null
  roomNameMasked: string
  attachmentName: string
  attachmentSize: number
  status: 'active' | 'expired'
}

type AttachmentAuditResponse = {
  ok: boolean
  dryRun: boolean
  deletesFiles: boolean
  policy: {
    ttlHours: number
    cutoffIso: string
    description: string
  }
  summary: {
    totalAttachments: number
    auditedAttachments: number
    hasMoreThanAuditLimit: boolean
    activeAttachments: number
    expiredAttachments: number
    totalApproxBytes: number
    activeApproxBytes: number
    expiredApproxBytes: number
  }
  recentAttachments: AttachmentAuditItem[]
  error?: string
}

export default function AdminMeetAttachmentsPage() {
  const router = useRouter()
  const { language, t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [auditLoading, setAuditLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [audit, setAudit] = useState<AttachmentAuditResponse | null>(null)

  function formatBytes(bytes: number | null | undefined) {
    const value = Number.isFinite(bytes) && bytes && bytes > 0 ? bytes : 0
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} KB`
    return `${(value / (1024 * 1024)).toLocaleString(language, { maximumFractionDigits: 1 })} MB`
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return t('admin.meetAttachments.fallback.dateUnavailable')

    try {
      return new Date(value).toLocaleString(language)
    } catch {
      return t('admin.meetAttachments.fallback.dateUnavailable')
    }
  }

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage(t('admin.meetAttachments.messages.sessionExpired'))
      setAuditLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/meet/attachments/audit', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = (await response.json().catch(() => null)) as AttachmentAuditResponse | null

      if (!response.ok || !data?.ok) {
        setMessage(t('admin.meetAttachments.messages.loadFailed'))
        setAudit(null)
      } else {
        setAudit(data)
      }
    } catch {
      setMessage(t('admin.meetAttachments.messages.connectionFailed'))
      setAudit(null)
    } finally {
      setAuditLoading(false)
    }
  }, [t])

  useEffect(() => {
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
        setMessage(t('admin.meetAttachments.messages.adminCheckFailed'))
        setLoading(false)
        return
      }

      const profile = {
        id: user.id,
        email: user.email,
        role: profileData?.role || 'user',
      }

      setAdminProfile(profile)
      setLoading(false)

      if (isAdminRole(profile.role)) {
        void loadAudit()
      }
    }

    void loadPage()
  }, [loadAudit, router, t])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('admin.meetAttachments.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('post.restrictedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">{t('admin.meetAttachments.accessDeniedDescription')}</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
          </Link>
        </section>
      </main>
    )
  }

  const summary = audit?.summary

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            {t('admin.creatorWithdrawals.admin')}
          </Link>
          <Link href="/admin/security-check" className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-100 transition hover:bg-blue-500/20">
            <ShieldAlert className="h-4 w-4" />
            {t('admin.meetAttachments.links.securityCheck')}
          </Link>
        </div>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-zinc-950/90 p-6 ring-1 ring-white/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <FileArchive className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-black">{t('admin.meetAttachments.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {t('admin.meetAttachments.description')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-100">
              {t('admin.meetAttachments.badges.auditMode')}
            </span>
            <span className="rounded-full border border-blue-300/25 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">
              {t('admin.meetAttachments.badges.policy24h')}
            </span>
            <span className="rounded-full border border-zinc-300/20 bg-white/10 px-3 py-1 text-xs font-black text-zinc-100">
              {t('admin.meetAttachments.badges.noDownload')}
            </span>
          </div>
        </header>

        {message && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[2rem] border border-amber-300/20 bg-amber-500/10 p-5 text-amber-100 ring-1 ring-amber-300/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">{t('admin.meetAttachments.noticeTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-amber-100/85">
                  {t('admin.meetAttachments.noticeDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAudit()}
              disabled={auditLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('admin.meetAttachments.actions.refresh')}
            </button>
          </div>
        </section>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 ring-1 ring-white/5">
            <Database className="h-5 w-5 text-blue-100" />
            <p className="mt-3 text-3xl font-black">{summary?.totalAttachments ?? '-'}</p>
            <p className="mt-1 text-sm text-zinc-400">{t('admin.meetAttachments.summary.attachments')}</p>
          </article>
          <article className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100 ring-1 ring-emerald-300/10">
            <CheckCircle2 className="h-5 w-5" />
            <p className="mt-3 text-3xl font-black">{summary?.activeAttachments ?? '-'}</p>
            <p className="mt-1 text-sm text-emerald-100/75">{t('admin.meetAttachments.summary.active')}</p>
            <p className="mt-2 text-xs font-semibold text-emerald-100/60">
              {formatBytes(summary?.activeApproxBytes)} {t('admin.meetAttachments.summary.approximate')}
            </p>
          </article>
          <article className="rounded-3xl border border-red-300/20 bg-red-500/10 p-4 text-red-100 ring-1 ring-red-300/10">
            <Clock3 className="h-5 w-5" />
            <p className="mt-3 text-3xl font-black">{summary?.expiredAttachments ?? '-'}</p>
            <p className="mt-1 text-sm text-red-100/75">{t('admin.meetAttachments.summary.expired')}</p>
            <p className="mt-2 text-xs font-semibold text-red-100/60">
              {formatBytes(summary?.expiredApproxBytes)} {t('admin.meetAttachments.summary.approximate')}
            </p>
          </article>
          <article className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100 ring-1 ring-blue-300/10">
            <HardDrive className="h-5 w-5" />
            <p className="mt-3 text-3xl font-black">{formatBytes(summary?.totalApproxBytes)}</p>
            <p className="mt-1 text-sm text-blue-100/75">{t('admin.meetAttachments.summary.totalSize')}</p>
          </article>
        </div>

        {summary?.hasMoreThanAuditLimit && (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {t('admin.meetAttachments.limitedSample', {
              audited: summary.auditedAttachments,
              total: summary.totalAttachments,
            })}
          </div>
        )}

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black">{t('admin.meetAttachments.recentTitle')}</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {t('admin.meetAttachments.recentDescription')}
              </p>
            </div>
            {audit?.policy && (
              <p className="text-xs font-semibold text-zinc-500">
                {t('admin.meetAttachments.cutoffLabel', { date: formatDate(audit.policy.cutoffIso) })}
              </p>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1.2fr_0.8fr_1.4fr_0.7fr_0.7fr] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-500 md:grid">
              <span>{t('admin.meetAttachments.table.createdAt')}</span>
              <span>{t('admin.meetAttachments.table.room')}</span>
              <span>{t('admin.meetAttachments.table.file')}</span>
              <span>{t('admin.meetAttachments.table.size')}</span>
              <span>{t('admin.meetAttachments.table.status')}</span>
            </div>

            {auditLoading && !audit ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('admin.meetAttachments.loading')}
              </div>
            ) : audit?.recentAttachments.length ? (
              <div className="divide-y divide-white/10">
                {audit.recentAttachments.map((item) => (
                  <article key={item.id} className="grid gap-2 px-4 py-3 text-sm text-zinc-300 md:grid-cols-[1.2fr_0.8fr_1.4fr_0.7fr_0.7fr] md:items-center">
                    <p>{formatDate(item.createdAt)}</p>
                    <p className="font-semibold text-zinc-400">{item.roomNameMasked}</p>
                    <p className="break-words font-semibold text-white">{item.attachmentName}</p>
                    <p>{formatBytes(item.attachmentSize)}</p>
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${
                      item.status === 'expired'
                        ? 'border-red-300/20 bg-red-500/10 text-red-100'
                        : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                    }`}>
                      {item.status === 'expired' ? t('admin.meetAttachments.status.expired') : t('admin.meetAttachments.status.active')}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                {t('admin.meetAttachments.empty')}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
