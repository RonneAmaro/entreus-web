import { getRoomByName, getSupabaseAdmin } from '@/lib/meet-server'
import { getLiveKitServerConfig } from '@/lib/meet/livekit-room-server'
import { finishMeetRoomAfterLiveKitEnded } from '@/lib/meet/room-lifecycle-reconciliation-server'
import { logServerEvent } from '@/lib/logging/safe-logger'
import { WebhookReceiver } from 'livekit-server-sdk'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const config = getLiveKitServerConfig()
  const supabase = getSupabaseAdmin()
  if (!config || !supabase) {
    return NextResponse.json({ ok: false, error: 'Webhook indisponível.' }, { status: 500 })
  }

  const rawBody = await request.text()
  const authorization = request.headers.get('authorization') || undefined

  let event
  try {
    event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(
      rawBody,
      authorization,
    )
  } catch (error) {
    logServerEvent('warn', { event: 'meet.livekit_webhook_rejected', error })
    return NextResponse.json({ ok: false, error: 'Webhook inválido.' }, { status: 401 })
  }

  if (event.event !== 'room_finished' || !event.room?.name) {
    return NextResponse.json({ ok: true })
  }

  try {
    const room = await getRoomByName(supabase, event.room.name)
    if (!room) return NextResponse.json({ ok: true })

    const finalized = await finishMeetRoomAfterLiveKitEnded(supabase, room)
    if (finalized.cleanupError) {
      logServerEvent('error', {
        event: 'meet.livekit_webhook_recording_cleanup_failed',
        error: finalized.cleanupError,
      })
      return NextResponse.json({ ok: false, error: 'Falha ao sincronizar webhook.' }, { status: 500 })
    }
  } catch (error) {
    logServerEvent('error', { event: 'meet.livekit_webhook_room_finish_failed', error })
    return NextResponse.json({ ok: false, error: 'Falha ao sincronizar webhook.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
