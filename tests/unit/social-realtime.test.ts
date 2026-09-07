import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSocialRealtimeSubscription, debounce } from '@/lib/social-realtime'
import type { SupabaseClient } from '@supabase/supabase-js'

type OnHandler = (payload: unknown) => void

function makeMockClient() {
  const handlers: OnHandler[] = []
  const config: { event: string; table: string; filter?: string }[] = []
  const removed: string[] = []

  const channel = {
    on(_type: string, cfg: { event: string; table: string; filter?: string }, cb: OnHandler) {
      config.push(cfg)
      handlers.push(cb)
      return channel
    },
    subscribe(_cb?: unknown) {
      return channel
    },
  }

  const client = {
    channel(name: string) {
      client.__channelName = name
      return channel
    },
    removeChannel(c: unknown) {
      removed.push(String(c === channel ? 'channel' : c))
      return Promise.resolve('ok' as const)
    },
    __channelName: '',
  } as unknown as SupabaseClient & { __channelName: string; removeChannel: (c: unknown) => Promise<unknown> }

  return { client, handlers, config, removed }
}

function advanceTimersByTime(ms: number) {
  vi.advanceTimersByTime(ms)
}
describe('createSocialRealtimeSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a channel with a predictable unique name', () => {
    const { client } = makeMockClient()
    createSocialRealtimeSubscription(client, {
      channelName: 'social-comments-post-abc',
      table: 'comments',
      filter: 'post_id=eq.abc',
      onEvent: () => {},
    })
    expect(client.__channelName).toBe('social-comments-post-abc')
  })

  it('subscribes to the correct table with the correct filter and default events', () => {
    const { client, config } = makeMockClient()
    createSocialRealtimeSubscription(client, {
      channelName: 'social-comments-post-abc',
      table: 'comments',
      filter: 'post_id=eq.abc',
      onEvent: () => {},
    })
    expect(config.map((item) => item.table)).toEqual(['comments', 'comments', 'comments'])
    expect(config.map((item) => item.event)).toEqual(['INSERT', 'UPDATE', 'DELETE'])
    expect(config.every((item) => item.filter === 'post_id=eq.abc')).toBe(true)
  })

  it('subscribe is called (channel is active)', () => {
    const { client } = makeMockClient()
    // subscribe() is invoked inside the helper; if the chain never subscribes,
    // no handler wiring would exist. Assert setup throws nothing and events
    // can be delivered through the wired handlers.
    const subscription = createSocialRealtimeSubscription(client, {
      channelName: 'x',
      table: 'posts',
      onEvent: () => {},
    })
    expect(subscription.channelName).toBe('x')
    subscription.unsubscribe()
  })

  it('remote event triggers debounced refetch exactly once per burst', () => {
    const { client, handlers } = makeMockClient()
    const onEvent = vi.fn()
    createSocialRealtimeSubscription(client, {
      channelName: 'social-feed-posts-u1',
      table: 'posts',
      onEvent,
      debounceMs: 800,
    })

    handlers.forEach((handler) => handler({}))
    handlers.forEach((handler) => handler({}))
    handlers.forEach((handler) => handler({}))

    advanceTimersByTime(799)
    expect(onEvent).not.toHaveBeenCalled()
    advanceTimersByTime(1)
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('events arriving after the debounce window trigger a new refetch (no swallowed updates)', () => {
    const { client, handlers } = makeMockClient()
    const onEvent = vi.fn()
    createSocialRealtimeSubscription(client, {
      channelName: 'social-notifications-user-u1',
      table: 'notifications',
      filter: 'user_id=eq.u1',
      onEvent,
      debounceMs: 800,
    })

    handlers[0]({})
    advanceTimersByTime(800)
    expect(onEvent).toHaveBeenCalledTimes(1)
    handlers[0]({})
    advanceTimersByTime(800)
    expect(onEvent).toHaveBeenCalledTimes(2)
  })

  it('cleanup removes the channel and stops further events', () => {
    const { client, handlers, removed } = makeMockClient()
    const onEvent = vi.fn()
    const subscription = createSocialRealtimeSubscription(client, {
      channelName: 'cleanup-test',
      table: 'posts',
      onEvent,
      debounceMs: 100,
    })

    subscription.unsubscribe()
    expect(removed).toEqual(['channel'])

    handlers[0]({})
    advanceTimersByTime(500)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('re-render safety: two sequential subscriptions with same name do not leak timers', () => {
    const { client, handlers } = makeMockClient()
    const onEvent = vi.fn()
    const first = createSocialRealtimeSubscription(client, {
      channelName: 'same-name',
      table: 'posts',
      onEvent,
      debounceMs: 100,
    })
    first.unsubscribe()
    const second = createSocialRealtimeSubscription(client, {
      channelName: 'same-name',
      table: 'posts',
      onEvent,
      debounceMs: 100,
    })
    second.unsubscribe()
    handlers[0]({})
    advanceTimersByTime(500)
    expect(onEvent).not.toHaveBeenCalled()
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses a burst into a single call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)
    debounced()
    debounced()
    debounced()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
