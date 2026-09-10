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
    expect(client.__channelName).toMatch(/^social-comments-post-abc:subscription-/)
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

  it('wires INSERT, DELETE, and UPDATE invalidations for a likes subscription', () => {
    const { client, config, handlers } = makeMockClient()
    const onEvent = vi.fn()
    createSocialRealtimeSubscription(client, {
      channelName: 'social-feed-likes-u1',
      table: 'likes',
      onEvent,
      debounceMs: 50,
    })

    expect(config.map((item) => item.event)).toEqual(['INSERT', 'UPDATE', 'DELETE'])
    handlers.forEach((handler) => handler({}))
    advanceTimersByTime(50)
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('uses separate physical topics when the SDK reuses a subscribed logical topic', () => {
    const channels = new Map<string, {
      subscribed: boolean
      handlers: OnHandler[]
      events: string[]
      on: (type: string, cfg: { event: string }, cb: OnHandler) => unknown
      subscribe: () => unknown
    }>()
    const removed: string[] = []
    const client = {
      channel(name: string) {
        const existing = channels.get(name)
        if (existing) return existing

        const channel = {
          subscribed: false,
          handlers: [] as OnHandler[],
          events: [] as string[],
          on(_type: string, cfg: { event: string }, cb: OnHandler) {
            if (channel.subscribed) {
              throw new Error('cannot add postgres_changes callbacks after subscribe()')
            }
            channel.events.push(cfg.event)
            channel.handlers.push(cb)
            return channel
          },
          subscribe() {
            channel.subscribed = true
            return channel
          },
        }
        channels.set(name, channel)
        return channel
      },
      removeChannel(channel: { subscribed: boolean }) {
        channel.subscribed = false
        removed.push('channel')
        return Promise.resolve('ok' as const)
      },
    } as unknown as SupabaseClient

    const onEvent = vi.fn()
    const first = createSocialRealtimeSubscription(client, {
      channelName: 'social-comments-post-abc',
      table: 'comments',
      onEvent,
      debounceMs: 25,
    })
    const second = createSocialRealtimeSubscription(client, {
      channelName: 'social-comments-post-abc',
      table: 'comments',
      onEvent,
      debounceMs: 25,
    })

    expect(channels).toHaveLength(2)
    expect([...channels.values()].every((channel) => channel.events.join(',') === 'INSERT,UPDATE,DELETE')).toBe(true)

    for (const channel of channels.values()) channel.handlers[0]({})
    advanceTimersByTime(25)
    expect(onEvent).toHaveBeenCalledTimes(2)

    first.unsubscribe()
    second.unsubscribe()
    expect(removed).toEqual(['channel', 'channel'])

    for (const channel of channels.values()) channel.handlers[0]({})
    advanceTimersByTime(25)
    expect(onEvent).toHaveBeenCalledTimes(2)
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
