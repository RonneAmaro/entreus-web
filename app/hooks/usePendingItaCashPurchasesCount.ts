'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ItaCashPurchaseRealtimeRow = {
  status?: string | null
}

type UsePendingItaCashPurchasesCountOptions = {
  enabled?: boolean
  onNewPending?: () => void
  onChanged?: () => void
}

export function usePendingItaCashPurchasesCount({
  enabled = true,
  onNewPending,
  onChanged,
}: UsePendingItaCashPurchasesCountOptions = {}) {
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const channelNameRef = useRef(`admin-itacash-purchase-alerts-${Math.random().toString(36).slice(2)}`)

  const loadPendingCount = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0)
      setLoading(false)
      return
    }

    setLoading(true)

    const { count, error } = await supabase
      .from('itacash_purchase_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) {
      console.error('Erro ao carregar pendencias ItaCash:', error.message)
      setPendingCount(0)
      setLoading(false)
      return
    }

    setPendingCount(count || 0)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    loadPendingCount()
  }, [loadPendingCount])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'itacash_purchase_requests' },
        (payload) => {
          const newRow = payload.new as ItaCashPurchaseRealtimeRow | null

          if (payload.eventType === 'INSERT' && newRow?.status === 'pending') {
            onNewPending?.()
          }

          onChanged?.()
          loadPendingCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, loadPendingCount, onChanged, onNewPending])

  return {
    pendingCount,
    loading,
    refreshPendingCount: loadPendingCount,
  }
}
