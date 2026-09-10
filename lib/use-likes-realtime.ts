'use client'

import { useEffect, useRef } from 'react'
import { createSocialRealtimeSubscription } from '@/lib/social-realtime'
import { supabase } from '@/lib/supabase'

type UseLikesRealtimeRefreshOptions = {
  enabled: boolean
  channelName: string
  refresh: () => void | Promise<void>
  debounceMs?: number
}

// Likes DELETE events do not carry post_id until a future replica-identity
// migration. Subscribe once per surface and use the event only as an
// invalidation signal; each surface keeps its own authoritative likes query.
export function useLikesRealtimeRefresh({
  enabled,
  channelName,
  refresh,
  debounceMs = 800,
}: UseLikesRealtimeRefreshOptions) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    const subscription = createSocialRealtimeSubscription(supabase, {
      channelName,
      table: 'likes',
      onEvent: () => { void refreshRef.current() },
      debounceMs,
    })

    return () => subscription.unsubscribe()
  }, [channelName, debounceMs, enabled])
}
