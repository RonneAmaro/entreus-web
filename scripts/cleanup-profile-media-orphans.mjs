import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CLEANUP_PATH = '/api/internal/profile-media-orphan-cleanup'

export function parseProfileMediaCleanupUrl(value) {
  try {
    const url = new URL(value)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) return null
    if (url.username || url.password || url.search || url.hash || url.pathname !== CLEANUP_PATH) return null
    return url.toString()
  } catch { return null }
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const args = new Set(argv)
  const execute = args.has('--execute')
  const limitArg = argv.find((value) => value.startsWith('--limit='))
  const parsedLimit = Number(limitArg?.split('=', 2)[1])
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 10
  const secret = environment.PROFILE_MEDIA_CLEANUP_SECRET
  const endpoint = parseProfileMediaCleanupUrl(environment.PROFILE_MEDIA_CLEANUP_URL || `http://localhost:3000${CLEANUP_PATH}`)

  if (!secret || secret.length < 32 || !endpoint) {
    console.error('Profile media cleanup is not configured.')
    return 2
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-profile-media-cleanup-secret': secret },
      body: JSON.stringify({ limit, dryRun: !execute }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) throw new Error('rejected')
    console.log(JSON.stringify({ dryRun: !execute, ...payload.result }))
    return 0
  } catch {
    console.error('Profile media cleanup failed without exposing internal details.')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main()
}
