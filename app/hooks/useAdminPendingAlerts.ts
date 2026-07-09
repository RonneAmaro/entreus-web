'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  emptyAdminPendingAlerts,
  getAdminPendingTotal,
  type AdminPendingAlertKey,
  type AdminPendingAlerts,
} from '@/lib/admin-pending-alerts'

type UseAdminPendingAlertsOptions = {
  enabled?: boolean
  onNewPending?: () => void
}

const ADMIN_PENDING_CACHE_MS = 30000
export const ADMIN_PENDING_ALERTS_CHANGED_EVENT = 'entreus:admin-pending-alerts-changed'

type SupabaseQueryBuilder = ReturnType<typeof supabase.from>
type SupabaseCountQuery = ReturnType<SupabaseQueryBuilder['select']>

let cachedCounts: AdminPendingAlerts | null = null
let cachedErrors: Partial<Record<AdminPendingAlertKey, string>> = {}
let cachedAt = 0
let pendingCountsRequest: Promise<{
  counts: AdminPendingAlerts
  errors: Partial<Record<AdminPendingAlertKey, string>>
}> | null = null

async function countRows(
  table: string,
  applyFilter?: (query: SupabaseCountQuery) => SupabaseCountQuery
) {
  let query: SupabaseCountQuery = supabase.from(table).select('id', { count: 'exact', head: true })

  if (applyFilter) {
    query = applyFilter(query)
  }

  const { count, error } = await query
  if (error) throw error

  return count || 0
}

async function countReports() {
  return countRows('reports', (query) =>
    query.or('status.is.null,status.eq.pending')
  )
}

export function notifyAdminPendingAlertsChanged() {
  cachedCounts = null
  cachedErrors = {}
  cachedAt = 0
  pendingCountsRequest = null

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_PENDING_ALERTS_CHANGED_EVENT))
  }
}

async function loadAdminPendingCounts() {
  const now = Date.now()

  if (cachedCounts && now - cachedAt < ADMIN_PENDING_CACHE_MS) {
    return {
      counts: cachedCounts,
      errors: cachedErrors,
    }
  }

  if (pendingCountsRequest) {
    return pendingCountsRequest
  }

  pendingCountsRequest = (async () => {
    const results = await Promise.allSettled([
      countRows('itacash_purchase_requests', (query) => query.eq('status', 'pending')),
      countRows('creator_withdrawal_requests', (query) => query.eq('status', 'pending')),
      countRows('age_verification_requests', (query) => query.eq('status', 'pending')),
      countReports(),
      countRows('internal_feedback_reports', (query) => query.in('status', ['open', 'triaged', 'in_progress'])),
    ])

    const nextCounts: AdminPendingAlerts = {
      itacashPurchases: results[0].status === 'fulfilled' ? results[0].value : 0,
      creatorWithdrawals: results[1].status === 'fulfilled' ? results[1].value : 0,
      ageVerifications: results[2].status === 'fulfilled' ? results[2].value : 0,
      reports: results[3].status === 'fulfilled' ? results[3].value : 0,
      feedbackReports: results[4].status === 'fulfilled' ? results[4].value : 0,
    }
    const nextErrors: Partial<Record<AdminPendingAlertKey, string>> = {}

    if (results[0].status === 'rejected') nextErrors.itacashPurchases = 'Nao foi possivel carregar'
    if (results[1].status === 'rejected') nextErrors.creatorWithdrawals = 'Nao foi possivel carregar'
    if (results[2].status === 'rejected') nextErrors.ageVerifications = 'Nao foi possivel carregar'
    if (results[3].status === 'rejected') nextErrors.reports = 'Nao foi possivel carregar'
    if (results[4].status === 'rejected') nextErrors.feedbackReports = 'Nao foi possivel carregar'

    Object.entries(nextErrors).forEach(([key, value]) => {
      console.warn('[AdminAlerts] Count unavailable:', { key, message: value })
    })

    cachedCounts = nextCounts
    cachedErrors = nextErrors
    cachedAt = Date.now()

    return {
      counts: nextCounts,
      errors: nextErrors,
    }
  })()

  try {
    return await pendingCountsRequest
  } finally {
    pendingCountsRequest = null
  }
}

export function useAdminPendingAlerts({
  enabled = true,
  onNewPending,
}: UseAdminPendingAlertsOptions = {}) {
  const [counts, setCounts] = useState<AdminPendingAlerts>(() =>
    enabled && cachedCounts ? cachedCounts : emptyAdminPendingAlerts
  )
  const [errors, setErrors] = useState<Partial<Record<AdminPendingAlertKey, string>>>(() =>
    enabled ? cachedErrors : {}
  )
  const [loading, setLoading] = useState(false)
  const previousTotalRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)
  const channelId = useId()
  const channelName = `admin-pending-alerts-${channelId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const loadCounts = useCallback(async () => {
    if (!enabled) {
      setCounts(emptyAdminPendingAlerts)
      setErrors({})
      setLoading(false)
      previousTotalRef.current = 0
      return
    }

    setLoading(true)

    const { counts: nextCounts, errors: nextErrors } = await loadAdminPendingCounts()

    const nextTotal = getAdminPendingTotal(nextCounts)
    if (previousTotalRef.current > 0 && nextTotal > previousTotalRef.current) {
      onNewPending?.()
    }

    previousTotalRef.current = nextTotal
    setCounts(nextCounts)
    setErrors(nextErrors)
    setLoading(false)
  }, [enabled, onNewPending])

  const scheduleCountsRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      cachedAt = 0
      void loadCounts()
    }, 500)
  }, [loadCounts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCounts()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadCounts])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    function handleFocusRefresh() {
      scheduleCountsRefresh()
    }

    function handleVisibilityRefresh() {
      if (document.visibilityState === 'visible') {
        scheduleCountsRefresh()
      }
    }

    window.addEventListener('focus', handleFocusRefresh)
    window.addEventListener(ADMIN_PENDING_ALERTS_CHANGED_EVENT, handleFocusRefresh)
    document.addEventListener('visibilitychange', handleVisibilityRefresh)

    return () => {
      window.removeEventListener('focus', handleFocusRefresh)
      window.removeEventListener(ADMIN_PENDING_ALERTS_CHANGED_EVENT, handleFocusRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [enabled, scheduleCountsRefresh])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itacash_purchase_requests' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creator_withdrawal_requests' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'age_verification_requests' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_feedback_reports' }, scheduleCountsRefresh)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, enabled, scheduleCountsRefresh])

  return {
    counts,
    errors,
    loading,
    totalPending: getAdminPendingTotal(counts),
    refresh: loadCounts,
  }
}
