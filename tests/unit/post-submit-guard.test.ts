import { describe, expect, it } from 'vitest'
import {
  claimSubmitGuard,
  releaseSubmitGuard,
  runSubmitGuarded,
  type SubmitGuard,
} from '../../lib/post-submit-guard'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

describe('post submit guard', () => {
  it('allows one submit and blocks another until released', () => {
    const guard: SubmitGuard = { current: false }

    expect(claimSubmitGuard(guard)).toBe(true)
    expect(claimSubmitGuard(guard)).toBe(false)

    releaseSubmitGuard(guard)

    expect(claimSubmitGuard(guard)).toBe(true)
  })

  it('calls the submit task only once for simultaneous attempts', async () => {
    const guard: SubmitGuard = { current: false }
    const deferred = createDeferred<boolean>()
    let submitCalls = 0

    const firstSubmit = runSubmitGuarded({
      guard,
      blockedValue: false,
      task: async () => {
        submitCalls += 1
        return deferred.promise
      },
    })
    const secondSubmit = runSubmitGuarded({
      guard,
      blockedValue: false,
      task: async () => {
        submitCalls += 1
        return true
      },
    })

    expect(await secondSubmit).toBe(false)
    expect(submitCalls).toBe(1)

    deferred.resolve(true)

    expect(await firstSubmit).toBe(true)
    expect(guard.current).toBe(false)
  })

  it('releases the guard on success and on error', async () => {
    const guard: SubmitGuard = { current: false }

    await expect(
      runSubmitGuarded({
        guard,
        blockedValue: false,
        task: async () => true,
      }),
    ).resolves.toBe(true)
    expect(guard.current).toBe(false)

    await expect(
      runSubmitGuarded({
        guard,
        blockedValue: false,
        task: async () => {
          throw new Error('publish failed')
        },
      }),
    ).rejects.toThrow('publish failed')
    expect(guard.current).toBe(false)
  })
})
