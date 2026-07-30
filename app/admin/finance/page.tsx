'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  Pencil,
  PlusCircle,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { useLanguage } from '@/app/components/LanguageProvider'
import { isAdminRole } from '@/lib/admin'
import {
  FINANCIAL_EXPENSE_CATEGORIES,
  FINANCIAL_INCOME_CATEGORIES,
  calculateFinancialSummary,
  getFinancialCategoriesForKind,
  validateFinancialRecordInput,
  type FinancialCategory,
  type FinancialRecord,
  type FinancialRecordKind,
  type FinancialSummary,
} from '@/lib/admin-finance'
import { supabase } from '@/lib/supabase'

type AdminProfile = {
  id: string
  email?: string
  role: string | null
}

type FormState = {
  kind: FinancialRecordKind
  category: FinancialCategory
  description: string
  amount: string
  occurred_on: string
  payment_method: string
  notes: string
}

type FinanceApiResponse = {
  ok?: boolean
  records?: FinancialRecord[]
  record?: FinancialRecord
  summary?: FinancialSummary
  reason?: string
  error?: string
  details?: string[]
}

const MONTH_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const
const VALIDATION_MESSAGES = {
  kindRequired: 'Selecione se o lancamento e entrada ou saida.',
  categoryInvalid: 'Selecione uma categoria valida para o tipo escolhido.',
  descriptionRequired: 'Informe uma descricao para o lancamento.',
  amountPositive: 'Informe um valor maior que zero.',
  dateInvalid: 'Informe uma data valida.',
} as const
const FINANCE_ERROR_REASONS = [
  'not_authenticated',
  'admin_required',
  'invalid_payload',
  'record_not_found',
  'table_unavailable',
  'internal',
] as const

type FinanceErrorReason = (typeof FINANCE_ERROR_REASONS)[number]

function getLocaleFromLanguage(language: string) {
  return language === 'pt-BR' ? 'pt-BR' : language
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function makeInitialForm(): FormState {
  return {
    kind: 'income',
    category: 'manual_income',
    description: '',
    amount: '',
    occurred_on: todayDateInput(),
    payment_method: '',
    notes: '',
  }
}

function formatDate(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) return fallback

  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) return fallback

  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function recordAmountClass(record: FinancialRecord) {
  return record.kind === 'income' ? 'text-emerald-200' : 'text-red-200'
}

export default function AdminFinancePage() {
  const router = useRouter()
  const { language, t } = useLanguage()
  const currentDate = new Date()
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null)
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [historicalSummary, setHistoricalSummary] = useState<FinancialSummary>({
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    recordCount: 0,
  })
  const [form, setForm] = useState<FormState>(makeInitialForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1))
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()))
  const [filterKind, setFilterKind] = useState<'all' | FinancialRecordKind>('all')
  const [filterCategory, setFilterCategory] = useState<'all' | FinancialCategory>('all')

  const locale = getLocaleFromLanguage(language)
  const isAdmin = isAdminRole(adminProfile?.role)
  const monthlySummary = useMemo(() => calculateFinancialSummary(records), [records])
  const categoryOptions = getFinancialCategoriesForKind(form.kind)
  const filterCategoryOptions = [
    ...FINANCIAL_INCOME_CATEGORIES,
    ...FINANCIAL_EXPENSE_CATEGORIES,
  ]
  const months = useMemo(
    () => MONTH_VALUES.map((value) => ({ value, label: t(`admin.finance.month.${value}`) })),
    [t],
  )
  const summaryCards = useMemo(() => [
    { title: t('admin.finance.summary.incomeMonth'), value: monthlySummary.incomeCents, tone: 'emerald' },
    { title: t('admin.finance.summary.expenseMonth'), value: monthlySummary.expenseCents, tone: 'red' },
    {
      title: t('admin.finance.summary.netMonth'),
      value: monthlySummary.netCents,
      tone: monthlySummary.netCents >= 0 ? 'cyan' : 'amber',
    },
    {
      title: t('admin.finance.summary.historicalTotal'),
      value: historicalSummary.netCents,
      tone: historicalSummary.netCents >= 0 ? 'blue' : 'amber',
    },
    { title: t('admin.finance.summary.records'), value: monthlySummary.recordCount, tone: 'zinc', count: true },
  ], [
    historicalSummary.netCents,
    monthlySummary.expenseCents,
    monthlySummary.incomeCents,
    monthlySummary.netCents,
    monthlySummary.recordCount,
    t,
  ])

  function translateKind(kind: FinancialRecordKind | 'all') {
    if (kind === 'all') return t('admin.finance.filters.kind')
    return t(`admin.finance.kind.${kind}`)
  }

  function translateCategory(category: FinancialCategory | 'all') {
    if (category === 'all') return t('admin.finance.filters.category')
    return t(`admin.finance.category.${category}`)
  }

  function translateValidationError(error: string) {
    if (error === VALIDATION_MESSAGES.kindRequired) return t('admin.finance.validation.kindRequired')
    if (error === VALIDATION_MESSAGES.categoryInvalid) return t('admin.finance.validation.categoryInvalid')
    if (error === VALIDATION_MESSAGES.descriptionRequired) return t('admin.finance.validation.descriptionRequired')
    if (error === VALIDATION_MESSAGES.amountPositive) return t('admin.finance.validation.amountPositive')
    if (error === VALIDATION_MESSAGES.dateInvalid) return t('admin.finance.validation.dateInvalid')
    return error
  }

  function translateFinanceReason(reason?: string, fallbackKey = 'admin.finance.messages.loadRecordsFailed') {
    if (!reason) return t(fallbackKey)
    const normalized = reason as FinanceErrorReason
    if ((FINANCE_ERROR_REASONS as readonly string[]).includes(normalized)) {
      return t(`admin.finance.errors.${normalized}`)
    }
    return t(fallbackKey)
  }

  function formatMoney(value: number) {
    return value.toLocaleString(locale, {
      style: 'currency',
      currency: 'BRL',
    })
  }

  function formatMoneyFromCents(value: number) {
    return formatMoney(value / 100)
  }

  useEffect(() => {
    void loadPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function getSessionToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.access_token || ''
  }

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
      setMessage(t('admin.finance.messages.adminCheckFailed', { error: profileError.message }))
      setLoading(false)
      return
    }

    const loadedAdminProfile = {
      id: user.id,
      email: user.email,
      role: profileData?.role || 'user',
    }

    setAdminProfile(loadedAdminProfile)

    if (isAdminRole(loadedAdminProfile.role)) {
      await loadRecords()
    }

    setLoading(false)
  }

  async function fetchFinanceRecords(params: URLSearchParams) {
    const token = await getSessionToken()

    if (!token) {
      throw new Error(t('admin.finance.messages.sessionExpired'))
    }

    const query = params.toString()
    const response = await fetch(`/api/admin/finance/records${query ? `?${query}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = (await response.json().catch(() => null)) as FinanceApiResponse | null

    if (!response.ok || !data?.ok) {
      throw new Error(translateFinanceReason(data?.reason, 'admin.finance.messages.loadRecordsFailed'))
    }

    return data
  }

  async function loadRecords() {
    setRecordsLoading(true)
    setMessage('')

    try {
      const params = new URLSearchParams()
      params.set('month', filterMonth)
      params.set('year', filterYear)
      if (filterKind !== 'all') params.set('kind', filterKind)
      if (filterCategory !== 'all') params.set('category', filterCategory)

      const [monthlyData, historicalData] = await Promise.all([
        fetchFinanceRecords(params),
        fetchFinanceRecords(new URLSearchParams()),
      ])

      setRecords(monthlyData.records || [])
      setHistoricalSummary(historicalData.summary || calculateFinancialSummary(historicalData.records || []))
    } catch (error) {
      setRecords([])
      setMessage(error instanceof Error ? error.message : t('admin.finance.messages.loadFailed'))
    } finally {
      setRecordsLoading(false)
    }
  }

  function updateFormKind(kind: FinancialRecordKind) {
    setForm((current) => ({
      ...current,
      kind,
      category: getFinancialCategoriesForKind(kind)[0],
    }))
  }

  function resetForm() {
    setForm(makeInitialForm())
    setEditingId(null)
  }

  function editRecord(record: FinancialRecord) {
    setEditingId(record.id || null)
    setForm({
      kind: record.kind,
      category: record.category,
      description: record.description,
      amount: formatMoneyFromCents(record.amount_cents),
      occurred_on: record.occurred_on,
      payment_method: record.payment_method || '',
      notes: record.notes || '',
    })
  }

  async function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const validation = validateFinancialRecordInput(form)
    if (!validation.ok) {
      setMessage(validation.errors.map(translateValidationError).join(' '))
      return
    }

    const token = await getSessionToken()
    if (!token) {
      setMessage(t('admin.finance.messages.sessionExpired'))
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        editingId ? `/api/admin/finance/records/${editingId}` : '/api/admin/finance/records',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(form),
        },
      )
      const data = (await response.json().catch(() => null)) as FinanceApiResponse | null

      if (!response.ok || !data?.ok) {
        const details = Array.isArray(data?.details)
          ? data.details.map((detail) => translateValidationError(detail)).join(' ')
          : ''
        throw new Error(details || translateFinanceReason(data?.reason, 'admin.finance.messages.saveFailed'))
      }

      setMessage(editingId ? t('admin.finance.messages.updated') : t('admin.finance.messages.created'))
      resetForm()
      await loadRecords()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('admin.finance.messages.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(record: FinancialRecord) {
    if (!record.id) return
    if (!window.confirm(t('admin.finance.messages.deleteConfirm'))) return

    const token = await getSessionToken()
    if (!token) {
      setMessage(t('admin.finance.messages.sessionExpired'))
      return
    }

    setMessage('')

    const response = await fetch(`/api/admin/finance/records/${record.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = (await response.json().catch(() => null)) as FinanceApiResponse | null

    if (!response.ok || !data?.ok) {
      setMessage(translateFinanceReason(data?.reason, 'admin.finance.messages.deleteFailed'))
      return
    }

    setMessage(t('admin.finance.messages.deleted'))
    if (editingId === record.id) resetForm()
    await loadRecords()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('common.loading')}
      </main>
    )
  }

  if (!adminProfile || !isAdmin) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">{t('post.restrictedTitle')}</h1>
          <p className="mt-2 text-sm leading-6">
            {t('admin.creatorWithdrawals.accessDeniedDescription')}
          </p>
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            {t('messages.detail.back')}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('admin.creatorWithdrawals.admin')}
            </Link>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{t('admin.finance.title')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              {t('admin.finance.description')}
            </p>
          </div>

          <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100 lg:max-w-sm">
            <p className="font-black">{t('admin.finance.manualPanelTitle')}</p>
            <p className="mt-1 text-amber-100/80">
              {t('admin.finance.manualPanelDescription')}
            </p>
          </div>
        </header>

        {message && (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {message}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((item) => (
            <div
              key={item.title}
              className="rounded-[1.5rem] border border-white/10 bg-zinc-950/90 p-4 shadow-xl shadow-black/20 ring-1 ring-white/5"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{item.title}</p>
              <p className={`mt-3 text-2xl font-black ${
                item.tone === 'emerald'
                  ? 'text-emerald-200'
                  : item.tone === 'red'
                    ? 'text-red-200'
                    : item.tone === 'amber'
                      ? 'text-amber-200'
                      : item.tone === 'cyan'
                        ? 'text-cyan-200'
                        : item.tone === 'blue'
                          ? 'text-blue-200'
                          : 'text-white'
              }`}>
                {'count' in item && item.count ? item.value.toLocaleString(locale) : formatMoney(item.value)}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[26rem_1fr]">
          <form onSubmit={submitRecord} className="rounded-[1.5rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{editingId ? t('admin.finance.form.editTitle') : t('admin.finance.form.createTitle')}</h2>
                <p className="mt-1 text-sm leading-5 text-zinc-500">{t('admin.finance.form.description')}</p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  aria-label={t('admin.finance.form.cancelEdit')}
                  title={t('admin.finance.form.cancelEdit')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                {t('admin.finance.form.kind')}
                <select
                  value={form.kind}
                  onChange={(event) => updateFormKind(event.target.value as FinancialRecordKind)}
                  className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                >
                  <option value="income">{translateKind('income')}</option>
                  <option value="expense">{translateKind('expense')}</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                {t('admin.finance.form.category')}
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as FinancialCategory }))}
                  className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{translateCategory(category)}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                {t('admin.finance.form.descriptionLabel')}
                <input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                  placeholder={t('admin.finance.form.descriptionPlaceholder')}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                  {t('admin.finance.form.amount')}
                  <input
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                    placeholder={formatMoney(0)}
                    inputMode="decimal"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                  {t('admin.finance.form.date')}
                  <input
                    type="date"
                    value={form.occurred_on}
                    onChange={(event) => setForm((current) => ({ ...current, occurred_on: event.target.value }))}
                    className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                  />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                {t('admin.finance.form.paymentMethod')}
                <input
                  value={form.payment_method}
                  onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value }))}
                  className="h-11 rounded-2xl border border-white/10 bg-black px-3 text-white outline-none focus:border-cyan-300/60"
                  placeholder={t('admin.finance.form.paymentMethodPlaceholder')}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-zinc-200">
                {t('admin.finance.form.notes')}
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-24 rounded-2xl border border-white/10 bg-black px-3 py-3 text-white outline-none focus:border-cyan-300/60"
                  placeholder={t('admin.finance.form.notesPlaceholder')}
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cyan-400 px-5 text-sm font-black text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                {editingId ? t('admin.finance.form.saveChanges') : t('admin.finance.form.addRecord')}
              </button>
            </div>
          </form>

          <section className="rounded-[1.5rem] border border-white/10 bg-zinc-950/90 p-5 ring-1 ring-white/5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-black">{t('admin.finance.records.title')}</h2>
                <p className="mt-1 text-sm text-zinc-500">{t('admin.finance.records.description')}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <select
                  value={filterMonth}
                  onChange={(event) => setFilterMonth(event.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-black px-3 text-sm text-white"
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>{month.label}</option>
                  ))}
                </select>
                <input
                  value={filterYear}
                  onChange={(event) => setFilterYear(event.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-black px-3 text-sm text-white"
                  inputMode="numeric"
                />
                <select
                  value={filterKind}
                  onChange={(event) => {
                    setFilterKind(event.target.value as 'all' | FinancialRecordKind)
                    setFilterCategory('all')
                  }}
                  className="h-10 rounded-xl border border-white/10 bg-black px-3 text-sm text-white"
                >
                  <option value="all">{translateKind('all')}</option>
                  <option value="income">{translateKind('income')}</option>
                  <option value="expense">{translateKind('expense')}</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={(event) => setFilterCategory(event.target.value as 'all' | FinancialCategory)}
                  className="h-10 rounded-xl border border-white/10 bg-black px-3 text-sm text-white"
                >
                  <option value="all">{translateCategory('all')}</option>
                  {filterCategoryOptions.map((category) => (
                    <option key={category} value={category}>{translateCategory(category)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadRecords}
                  disabled={recordsLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition hover:bg-zinc-200 disabled:opacity-60"
                >
                  {recordsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {t('admin.finance.filters.apply')}
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-2 rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-zinc-300 md:grid-cols-3">
              <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-200" /> {t('admin.finance.notices.noAutomaticPayments')}</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-200" /> {t('admin.finance.notices.manualPayouts')}</p>
              <p className="flex items-center gap-2"><Banknote className="h-4 w-4 text-cyan-200" /> {t('admin.finance.notices.internalControl')}</p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">{t('admin.finance.table.date')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.kind')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.category')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.description')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.amount')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.paymentMethod')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.createdAt')}</th>
                    <th className="px-4 py-3">{t('admin.finance.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {records.map((record) => (
                    <tr key={record.id} className="bg-black/30 align-top text-zinc-200">
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(record.occurred_on, locale, t('common.notProvided'))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{translateKind(record.kind)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{translateCategory(record.category)}</td>
                      <td className="min-w-52 px-4 py-3">
                        <p className="font-bold text-white">{record.description}</p>
                        {record.notes && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{record.notes}</p>}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 font-black ${recordAmountClass(record)}`}>
                        {record.kind === 'expense' ? '-' : '+'}{formatMoneyFromCents(record.amount_cents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{record.payment_method || t('common.notProvided')}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(record.created_at, locale, t('common.notProvided'))}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editRecord(record)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-100 transition hover:bg-white/10"
                            aria-label={t('admin.finance.table.editRecord')}
                            title={t('admin.finance.table.editRecord')}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRecord(record)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-100 transition hover:bg-red-500/20"
                            aria-label={t('admin.finance.table.deleteRecord')}
                            title={t('admin.finance.table.deleteRecord')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-zinc-500" colSpan={8}>
                        {t('admin.finance.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
