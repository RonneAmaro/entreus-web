export type SubmitGuard = {
  current: boolean
}

export function claimSubmitGuard(guard: SubmitGuard) {
  if (guard.current) return false

  guard.current = true
  return true
}

export function releaseSubmitGuard(guard: SubmitGuard) {
  guard.current = false
}

export async function runSubmitGuarded<T>({
  guard,
  blockedValue,
  task,
}: {
  guard: SubmitGuard
  blockedValue: T
  task: () => Promise<T>
}) {
  if (!claimSubmitGuard(guard)) return blockedValue

  try {
    return await task()
  } finally {
    releaseSubmitGuard(guard)
  }
}
