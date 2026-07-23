'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  CloudCog,
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

type RecordingDiagnostics = {
  ready: boolean
  egressEnabled: boolean
  hasMeetRecordingsBucketName: boolean
  hasR2AccessConfig: boolean
  hasLiveKitServerConfig: boolean
  missing: string[]
  warnings: string[]
  storagePolicy: {
    compressionProfile: 'economy' | 'standard'
    compressionDescription: string
    storageUsage: string
    maxDurationSeconds: number
    maxExpectedFileSizeBytes: number
    retentionDays: number
    retentionWarning: string
  }
}

function DiagnosticItem({
  title,
  description,
  ready,
}: {
  title: string
  description: string
  ready: boolean
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ready ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-100'}`}>
          {ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <span>
          <span className="block text-sm font-black text-white">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-zinc-400">{description}</span>
        </span>
      </div>
    </article>
  )
}

export default function AdminMeetRecordingPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [diagnostics, setDiagnostics] = useState<RecordingDiagnostics | null>(null)

  function formatRecordingDuration(totalSeconds: number) {
    const minutes = Math.round(totalSeconds / 60)
    return t('admin.meetRecording.durationMinutes', { count: minutes })
  }

  function formatRecordingMegabytes(bytes: number) {
    return t('admin.meetRecording.sizeMb', { count: Math.round(bytes / (1024 * 1024)) })
  }

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setMessage(t('admin.meetRecording.messages.sessionExpired'))
      setDiagnosticsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/meet-recording/diagnostics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = (await response.json().catch(() => null)) as
        | (RecordingDiagnostics & { error?: string })
        | null

      if (!response.ok || !data) {
        setDiagnostics(null)
        setMessage(t('admin.meetRecording.messages.loadFailed'))
        return
      }

      setDiagnostics(data)
    } catch {
      setDiagnostics(null)
      setMessage(t('admin.meetRecording.messages.connectionFailed'))
    } finally {
      setDiagnosticsLoading(false)
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
        router.replace('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        setMessage(t('admin.meetRecording.messages.adminCheckFailed'))
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
        void loadDiagnostics()
      }
    }

    void loadPage()
  }, [loadDiagnostics, router, t])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('admin.meetRecording.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('post.restrictedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">{t('admin.meetRecording.accessDeniedDescription')}</p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            {t('admin.creatorWithdrawals.admin')}
          </Link>
          <button
            type="button"
            onClick={() => void loadDiagnostics()}
            disabled={diagnosticsLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {diagnosticsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('admin.meetRecording.actions.refresh')}
          </button>
        </div>

        <header className="mt-6 rounded-[2rem] border border-blue-300/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,64,175,0.16),rgba(2,6,23,0.96))] p-6 shadow-xl shadow-blue-950/15 ring-1 ring-blue-300/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
            <CircleDot className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{t('admin.meetRecording.title')}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100/80 sm:text-base">
            {t('admin.meetRecording.description')}
          </p>
        </header>

        <section className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-50">
          {t('admin.meetRecording.banner')}
        </section>

        {message ? (
          <section className="mt-5 rounded-3xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-100">
            {message}
          </section>
        ) : null}

        {diagnosticsLoading && !diagnostics ? (
          <section className="mt-5 flex min-h-52 items-center justify-center rounded-[2rem] border border-white/10 bg-zinc-950/80 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('admin.meetRecording.loadingDiagnostics')}
          </section>
        ) : diagnostics ? (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2">
              <DiagnosticItem
                title={t('admin.meetRecording.items.migration.title')}
                description={t('admin.meetRecording.items.migration.description')}
                ready={false}
              />
              <DiagnosticItem
                title={t('admin.meetRecording.items.bucket.title')}
                description={
                  diagnostics.hasMeetRecordingsBucketName && diagnostics.hasR2AccessConfig
                    ? t('admin.meetRecording.items.bucket.ready')
                    : t('admin.meetRecording.items.bucket.pending')
                }
                ready={diagnostics.hasMeetRecordingsBucketName && diagnostics.hasR2AccessConfig}
              />
              <DiagnosticItem
                title={t('admin.meetRecording.items.egress.title')}
                description={
                  diagnostics.hasLiveKitServerConfig
                    ? t('admin.meetRecording.items.egress.ready')
                    : t('admin.meetRecording.items.egress.pending')
                }
                ready={diagnostics.hasLiveKitServerConfig}
              />
              <DiagnosticItem
                title={t('admin.meetRecording.items.compression.title')}
                description={t('admin.meetRecording.items.compression.description', {
                  profile: diagnostics.storagePolicy.compressionProfile,
                  description: diagnostics.storagePolicy.compressionDescription,
                })}
                ready={diagnostics.storagePolicy.compressionProfile === 'economy'}
              />
              <DiagnosticItem
                title={t('admin.meetRecording.items.retention.title')}
                description={t('admin.meetRecording.items.retention.description', {
                  days: diagnostics.storagePolicy.retentionDays,
                })}
                ready={diagnostics.storagePolicy.retentionDays > 0}
              />
              <DiagnosticItem
                title={t('admin.meetRecording.items.optIn.title')}
                description={diagnostics.egressEnabled ? t('admin.meetRecording.items.optIn.enabled') : t('admin.meetRecording.items.optIn.disabled')}
                ready={diagnostics.egressEnabled}
              />
            </section>

            <section className="mt-5 rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-blue-50">
              <h2 className="text-lg font-black">{t('admin.meetRecording.storagePolicyTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-blue-100/85">
                {diagnostics.storagePolicy.storageUsage}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">{t('admin.meetRecording.storage.profile')}</dt>
                  <dd className="mt-1 text-sm font-black capitalize">{diagnostics.storagePolicy.compressionProfile}</dd>
                </div>
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">{t('admin.meetRecording.storage.limit')}</dt>
                  <dd className="mt-1 text-sm font-black">
                    {formatRecordingDuration(diagnostics.storagePolicy.maxDurationSeconds)} · {formatRecordingMegabytes(diagnostics.storagePolicy.maxExpectedFileSizeBytes)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-blue-200/15 bg-black/15 p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-blue-100/60">{t('admin.meetRecording.storage.retention')}</dt>
                  <dd className="mt-1 text-sm font-black">{t('admin.meetRecording.retentionDays', { count: diagnostics.storagePolicy.retentionDays })}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-blue-100/70">{diagnostics.storagePolicy.retentionWarning}</p>
            </section>

            <section className={`mt-5 rounded-[2rem] border p-5 ${diagnostics.ready ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-50' : 'border-amber-300/25 bg-amber-500/10 text-amber-50'}`}>
              <div className="flex items-start gap-3">
                <CloudCog className="mt-0.5 h-6 w-6 shrink-0" />
                <div>
                  <h2 className="text-lg font-black">
                    {t('admin.meetRecording.readyTitle', { status: diagnostics.ready ? t('admin.meetRecording.yes') : t('admin.meetRecording.no') })}
                  </h2>
                  <p className="mt-2 text-sm leading-6">
                    {diagnostics.ready ? t('admin.meetRecording.readyDescription') : t('admin.meetRecording.notReadyDescription')}
                  </p>
                </div>
              </div>
            </section>

            {diagnostics.missing.length > 0 ? (
              <section className="mt-5 rounded-[2rem] border border-red-300/20 bg-red-500/10 p-5 text-red-100">
                <h2 className="text-base font-black">{t('admin.meetRecording.pendingItemsTitle')}</h2>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6">
                  {diagnostics.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}

            {diagnostics.warnings.length > 0 ? (
              <section className="mt-5 rounded-[2rem] border border-amber-300/20 bg-amber-500/10 p-5 text-amber-50">
                <h2 className="text-base font-black">{t('admin.meetRecording.manualChecksTitle')}</h2>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6">
                  {diagnostics.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
