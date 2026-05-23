'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type AdminPendingAlerts = {
  itacashPurchases: number
  ageVerifications: number
  reports: number
  feedbackReports: number
}

type AdminPendingAlertKey = keyof AdminPendingAlerts

type UseAdminPendingAlertsOptions = {
  enabled?: boolean
  onNewPending?: () => void
}

const emptyCounts: AdminPendingAlerts = {
  itacashPurchases: 0,
  ageVerifications: 0,
  reports: 0,
  feedbackReports: 0,
}

const ADMIN_PENDING_CACHE_MS = 15000

let cachedCounts: AdminPendingAlerts | null = null
let cachedErrors: Partial<Record<AdminPendingAlertKey, string>> = {}
let cachedAt = 0
let pendingCountsRequest: Promise<{
  counts: AdminPendingAlerts
  errors: Partial<Record<AdminPendingAlertKey, string>>
}> | null = null

export function getAdminPendingTotal(counts: AdminPendingAlerts) {
  return counts.itacashPurchases + counts.ageVerifications + counts.reports + counts.feedbackReports
}

async function countRows(
  table: string,
  applyFilter?: (query: any) => unknown
) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })

  if (applyFilter) {
    query = applyFilter(query) as typeof query
  }

  const { count, error } = await query
  if (error) throw error

  return count || 0
}

async function countReports() {
  try {
    return await countRows('reports', (query) =>
      query.or('status.is.null,status.eq.pending')
    )
  } catch (error) {
    console.warn('[AdminAlerts] Reports status filter unavailable, counting all reports:', error)
    return countRows('reports')
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
      countRows('age_verification_requests', (query) => query.eq('status', 'pending')),
      countReports(),
      countRows('internal_feedback_reports', (query) => query.in('status', ['open', 'triaged', 'in_progress'])),
    ])

    const nextCounts: AdminPendingAlerts = {
      itacashPurchases: results[0].status === 'fulfilled' ? results[0].value : 0,
      ageVerifications: results[1].status === 'fulfilled' ? results[1].value : 0,
      reports: results[2].status === 'fulfilled' ? results[2].value : 0,
      feedbackReports: results[3].status === 'fulfilled' ? results[3].value : 0,
    }
    const nextErrors: Partial<Record<AdminPendingAlertKey, string>> = {}

    if (results[0].status === 'rejected') nextErrors.itacashPurchases = 'Nao foi possivel carregar'
    if (results[1].status === 'rejected') nextErrors.ageVerifications = 'Nao foi possivel carregar'
    if (results[2].status === 'rejected') nextErrors.reports = 'Nao foi possivel carregar'
    if (results[3].status === 'rejected') nextErrors.feedbackReports = 'Nao foi possivel carregar'

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
  const [counts, setCounts] = useState<AdminPendingAlerts>(emptyCounts)
  const [errors, setErrors] = useState<Partial<Record<AdminPendingAlertKey, string>>>({})
  const [loading, setLoading] = useState(false)
  const previousTotalRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)
  const channelNameRef = useRef(`admin-pending-alerts-${Math.random().toString(36).slice(2)}`)

  const loadCounts = useCallback(async () => {
    if (!enabled) {
      setCounts(emptyCounts)
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
    }, 250)
  }, [loadCounts])

  useEffect(() => {
    loadCounts()
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
    document.addEventListener('visibilitychange', handleVisibilityRefresh)

    return () => {
      window.removeEventListener('focus', handleFocusRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [enabled, scheduleCountsRefresh])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itacash_purchase_requests' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'age_verification_requests' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, scheduleCountsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_feedback_reports' }, scheduleCountsRefresh)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, scheduleCountsRefresh])

  return {
    counts,
    errors,
    loading,
    totalPending: getAdminPendingTotal(counts),
    refresh: loadCounts,
  }
}
