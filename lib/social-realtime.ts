import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Social realtime helper.
 *
 * Strategy: realtime events are used ONLY as invalidation signals that trigger
 * a controlled refetch through the same authoritative query the feature
 * already uses. Raw payloads are never inserted into local state, which keeps
 * RLS, visibility filters, profile hydration, blocks and pagination intact.
 */

export type SocialRealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export type SocialRealtimeOptions = {
  /** Predictable, unique channel name (per page/post/user). */
  channelName: string
  table: string
  /** Optional postgres_changes filter, e.g. `post_id=eq.<uuid>` or `user_id=eq.<uuid>`. */
  filter?: string
  events?: SocialRealtimeEventType[]
  /** Called (debounced) when a matching remote event arrives. */
  onEvent: () => void
  /** Debounce window in ms to collapse bursts into a single refetch. */
  debounceMs?: number
}

export type SocialRealtimeSubscription = {
  channelName: string
  unsubscribe: () => void
}

let fallbackSubscriptionSequence = 0

function createPhysicalChannelName(channelName: string) {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${++fallbackSubscriptionSequence}`

  return `${channelName}:subscription-${suffix}`
}

export function createSocialRealtimeSubscription(
  client: SupabaseClient,
  options: SocialRealtimeOptions,
): SocialRealtimeSubscription {
  const {
    channelName,
    table,
    filter,
    events = ['INSERT', 'UPDATE', 'DELETE'],
    onEvent,
    debounceMs = 800,
  } = options

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const debouncedOnEvent = () => {
    if (closed) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (!closed) onEvent()
    }, debounceMs)
  }

  // supabase-js reuses an existing channel for the same topic. A Strict Mode
  // remount can therefore receive a channel that has already subscribed, where
  // adding postgres_changes callbacks throws. Keep the logical name readable,
  // but make each physical SDK topic unique.
  let channel = client.channel(createPhysicalChannelName(channelName))

  for (const event of events) {
    channel = channel.on(
      'postgres_changes',
      filter
        ? { event, schema: 'public', table, filter }
        : { event, schema: 'public', table },
      debouncedOnEvent,
    )
  }

  channel.subscribe()

  return {
    channelName,
    unsubscribe() {
      closed = true
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      void client.removeChannel(channel)
    },
  }
}

export function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }) as T
}
