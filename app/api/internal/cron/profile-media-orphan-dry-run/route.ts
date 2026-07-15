import { NextResponse } from 'next/server'
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { runProfileMediaOrphanDryRunCron, verifyVercelCronAuthorization } from '@/lib/profile-media-orphan-cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })

export async function GET(request: Request) {
  if (!verifyVercelCronAuthorization(request.headers.get('authorization'))) {
    return reply({ ok: false, error: 'Acesso negado.' }, 401)
  }
  try {
    const outcome = await runProfileMediaOrphanDryRunCron()
    if (outcome.status === 'already_running') return reply({ ok: true, status: 'already_running' })
    return reply({ ok: true, status: 'succeeded', result: outcome.result })
  } catch {
    return reply({ ok: false, error: 'A verificacao nao pode ser executada agora.' }, 503)
  }
}
