import { NextResponse } from 'next/server'
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { runProfileMediaOrphanCleanup, verifyProfileMediaCleanupSecret } from '@/lib/profile-media-orphan-cleanup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })

export async function POST(request: Request) {
  const secret = request.headers.get('x-profile-media-cleanup-secret')
  if (!verifyProfileMediaCleanupSecret(secret)) return reply({ ok: false, error: 'Acesso negado.' }, 401)
  const body = await request.json().catch(() => ({})) as { limit?: unknown; dryRun?: unknown }
  const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.trunc(body.limit) : 10
  const dryRun = body.dryRun !== false
  try {
    const result = await runProfileMediaOrphanCleanup({ batchSize: limit, jobId: crypto.randomUUID(), dryRun })
    return reply({ ok: true, dryRun, result })
  } catch {
    return reply({ ok: false, error: 'A limpeza nao pode ser executada agora.' }, 503)
  }
}
