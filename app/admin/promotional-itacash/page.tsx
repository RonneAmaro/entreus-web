'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Gift,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useLanguage } from '@/app/components/LanguageProvider'
import { supabase } from '@/lib/supabase'
import { isAdminRole } from '@/lib/admin'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type UserProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type PromotionalGrant = {
  id: string
  admin_id: string
  user_id: string
  amount_itacash: number
  reason: string
  campaign: string | null
  status: string
  transaction_id: string | null
  created_at: string
}

function getInitial(text: string) {
  if (!text) return ''
  return text.slice(0, 1).toUpperCase()
}

function formatBRLFromItaCash(value: number, locale: string) {
  return (value * 0.1).toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminPromotionalItaCashPage() {
  const router = useRouter()
  const { language, t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserProfile[]>([])
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState('')
  const [campaign, setCampaign] = useState('')
  const [grants, setGrants] = useState<PromotionalGrant[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, UserProfile>>({})

  useEffect(() => {
    loadPage()
  }, [])

  const amountItacash = useMemo(() => {
    const parsed = Number.parseInt(amount, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [amount])

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
      setMessage(t('admin.promotionalItaCash.messages.adminCheckFailed'))
      setLoading(false)
      return
    }

    const loadedAdminProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }

    setAdminProfile(loadedAdminProfile)

    if (!isAdminRole(loadedAdminProfile.role)) {
      setLoading(false)
      return
    }

    await loadRecentGrants()
    setLoading(false)
  }

  async function searchUsers(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setMessage('')

    const cleanQuery = query.trim()

    if (cleanQuery.length < 2) {
      setMessage(t('admin.promotionalItaCash.messages.queryTooShort'))
      return
    }

    setSearching(true)

    const safeQuery = cleanQuery.replace(/[%,]/g, '')
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
      .limit(12)

    setSearching(false)

    if (error) {
      setMessage(t('admin.promotionalItaCash.messages.searchFailed'))
      return
    }

    setResults((data || []) as UserProfile[])
  }

  async function loadRecentGrants() {
    const { data, error } = await supabase
      .from('itacash_promotional_grants')
      .select('id, admin_id, user_id, amount_itacash, reason, campaign, status, transaction_id, created_at')
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) {
      setMessage(t('admin.promotionalItaCash.messages.loadGrantsFailed'))
      return
    }

    const rows = (data || []) as PromotionalGrant[]
    setGrants(rows)

    const userIds = Array.from(new Set(rows.map((grant) => grant.user_id)))

    if (userIds.length === 0) {
      setProfilesById({})
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds)

    if (profilesError) {
      setMessage(t('admin.promotionalItaCash.messages.profilesFailed'))
      return
    }

    const profileMap = ((profilesData || []) as UserProfile[]).reduce(
      (acc, profile) => {
        acc[profile.id] = profile
        return acc
      },
      {} as Record<string, UserProfile>
    )

    setProfilesById(profileMap)
  }

  async function submitGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (!selectedUser) {
      setMessage(t('admin.promotionalItaCash.messages.userRequired'))
      return
    }

    if (amountItacash <= 0) {
      setMessage(t('admin.promotionalItaCash.messages.amountInvalid'))
      return
    }

    if (!reason.trim()) {
      setMessage(t('admin.promotionalItaCash.messages.reasonRequired'))
      return
    }

    setSubmitting(true)

    const { error } = await supabase.rpc('grant_promotional_itacash', {
      p_user_id: selectedUser.id,
      p_amount_itacash: amountItacash,
      p_reason: reason.trim(),
      p_campaign: campaign.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      setMessage(t('admin.promotionalItaCash.messages.submitFailed'))
      return
    }

    setMessage(t('admin.promotionalItaCash.messages.submitSuccess'))
    setSelectedUser(null)
    setResults([])
    setQuery('')
    setAmount('100')
    setReason('')
    setCampaign('')
    await loadRecentGrants()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('admin.promotionalItaCash.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdminRole(adminProfile.role)) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('admin.promotionalItaCash.accessDeniedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">
            {t('admin.promotionalItaCash.accessDeniedDescription')}
          </p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-8 text-white">
      <section className="relative mx-auto w-full max-w-7xl">
        <div className="pointer-events-none absolute -right-24 top-12 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />

        <header className="relative z-10 mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/feed"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('messages.detail.back')}
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              {t('admin.promotionalItaCash.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              {t('admin.promotionalItaCash.description')}
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">{t('admin.promotionalItaCash.admin')}</p>
            <p className="mt-1 font-black">{adminProfile.email || adminProfile.id}</p>
          </div>
        </header>

        <div className="relative z-10 mb-6 rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50 ring-1 ring-amber-300/10">
          {t('admin.promotionalItaCash.notice')}
        </div>

        {message && (
          <div className="relative z-10 mb-5 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        )}

        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <section className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/10">
            <form onSubmit={searchUsers} className="flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="text-sm font-black text-zinc-200">{t('admin.promotionalItaCash.search.label')}</span>
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 focus-within:border-blue-300">
                  <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('admin.promotionalItaCash.search.placeholder')}
                    aria-label={t('admin.promotionalItaCash.search.label')}
                    title={t('admin.promotionalItaCash.search.label')}
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={searching}
                aria-label={t('admin.promotionalItaCash.search.button')}
                title={t('admin.promotionalItaCash.search.button')}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t('admin.promotionalItaCash.search.button')}
              </button>
            </form>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {results.length === 0 && query.trim().length >= 2 && !searching ? (
                <div className="sm:col-span-2 rounded-3xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                  {t('admin.promotionalItaCash.search.empty')}
                </div>
              ) : results.map((profile) => {
                const active = selectedUser?.id === profile.id
                const name = profile.display_name || profile.username || t('admin.promotionalItaCash.fallback.user')

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedUser(profile)}
                  className={`flex items-center gap-3 rounded-3xl border p-3 text-left transition hover:-translate-y-0.5 ${
                      active
                        ? 'border-blue-300/40 bg-blue-500/15'
                        : 'border-white/10 bg-black/30 hover:border-blue-300/20'
                    }`}
                  >
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={name}
                        title={name}
                        className="h-12 w-12 rounded-full border border-blue-300/20 object-cover"
                      />
                    ) : (
                      <span
                        aria-label={name}
                        title={name}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-950/40 text-sm font-black text-blue-100"
                      >
                        {getInitial(name) || getInitial(t('admin.promotionalItaCash.fallback.user'))}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-black">{name}</span>
                      <span className="block truncate text-sm text-zinc-500">@{profile.username || t('admin.promotionalItaCash.fallback.username')}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <form onSubmit={submitGrant} className="mt-6 border-t border-white/10 pt-5">
              <div className="mb-5 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">{t('admin.promotionalItaCash.selected.label')}</p>
                <p className="mt-1 text-lg font-black">
                  {selectedUser
                    ? selectedUser.display_name || selectedUser.username || selectedUser.id
                    : t('admin.promotionalItaCash.selected.empty')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-zinc-200">{t('admin.promotionalItaCash.form.amount')}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-label={t('admin.promotionalItaCash.form.amount')}
                    title={t('admin.promotionalItaCash.form.amount')}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-lg font-black text-white outline-none focus:border-blue-300"
                  />
                </label>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{t('admin.promotionalItaCash.summary.equivalent')}</p>
                  <p className="mt-2 text-2xl font-black">{formatBRLFromItaCash(amountItacash, language)}</p>
                  <p className="text-sm text-zinc-500">{t('admin.promotionalItaCash.summary.conversion')}</p>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-sm font-black text-zinc-200">{t('admin.promotionalItaCash.form.reason')}</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder={t('admin.promotionalItaCash.form.reasonPlaceholder')}
                  aria-label={t('admin.promotionalItaCash.form.reason')}
                  title={t('admin.promotionalItaCash.form.reason')}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-black text-zinc-200">{t('admin.promotionalItaCash.form.campaign')}</span>
                <input
                  value={campaign}
                  onChange={(event) => setCampaign(event.target.value)}
                  placeholder={t('admin.promotionalItaCash.form.campaignPlaceholder')}
                  aria-label={t('admin.promotionalItaCash.form.campaign')}
                  title={t('admin.promotionalItaCash.form.campaign')}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-300"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                aria-label={t('admin.promotionalItaCash.form.submit')}
                title={t('admin.promotionalItaCash.form.submit')}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                {t('admin.promotionalItaCash.form.submit')}
              </button>
            </form>
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-black">{t('admin.promotionalItaCash.history.title')}</h2>
                <p className="text-sm text-zinc-500">{t('admin.promotionalItaCash.history.description')}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {grants.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                  {t('admin.promotionalItaCash.history.empty')}
                </div>
              ) : (
                grants.map((grant) => {
                  const profile = profilesById[grant.user_id]
                  const name = profile?.display_name || profile?.username || t('admin.promotionalItaCash.fallback.user')

                  return (
                    <article key={grant.id} className="rounded-3xl border border-white/10 bg-black/30 p-4 transition hover:border-blue-300/20 hover:bg-blue-950/10">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-200">
                          <Coins className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black">{name}</p>
                              <p className="truncate text-sm text-zinc-500">@{profile?.username || t('admin.promotionalItaCash.fallback.username')}</p>
                            </div>
                            <p className="shrink-0 text-lg font-black text-emerald-300">+{grant.amount_itacash}</p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">{grant.reason}</p>
                          {grant.campaign && (
                            <span className="mt-2 inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-black text-blue-200">
                              {grant.campaign}
                            </span>
                          )}
                          <p className="mt-2 text-xs text-zinc-500">{formatDate(grant.created_at, language)}</p>
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
