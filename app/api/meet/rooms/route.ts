import {
  getMembership,
  getProfileDisplayName,
  getSupabaseAdmin,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const FREE_DURATION_MINUTES = 20
const ROOM_PREFIXES = ['sala', 'meet', 'entreus']

type CreateRoomBody = {
  title?: unknown
}

function createRoomName() {
  const prefix = ROOM_PREFIXES[Math.floor(Math.random() * ROOM_PREFIXES.length)]
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6)
  return `${prefix}-${suffix}`
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  let body: CreateRoomBody = {}

  try {
    body = (await request.json()) as CreateRoomBody
  } catch {
    body = {}
  }

  const title =
    typeof body.title === 'string' && body.title.trim().length > 0
      ? body.title.trim().slice(0, 120)
      : null

  const startsAt = new Date()
  const expiresAt = addMinutes(startsAt, FREE_DURATION_MINUTES)
  const displayName = await getProfileDisplayName(supabase, auth.user)

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const roomName = createRoomName()

    const { data: room, error: roomError } = await supabase
      .from('meet_rooms')
      .insert({
        room_name: roomName,
        title,
        owner_id: auth.user.id,
        plan: 'free',
        status: 'active',
        max_duration_minutes: FREE_DURATION_MINUTES,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single()

    if (roomError) {
      if (roomError.code === '23505') continue
      return jsonError('Não foi possível criar a sala.', 500)
    }

    const { error: memberError } = await supabase.from('meet_room_members').insert({
      room_id: room.id,
      user_id: auth.user.id,
      role: 'owner',
      status: 'approved',
      display_name: displayName,
      approved_at: startsAt.toISOString(),
    })

    if (memberError) {
      return jsonError('Sala criada, mas não foi possível registrar o dono.', 500)
    }

    const origin = new URL(request.url).origin

    return NextResponse.json({
      ok: true,
      roomName,
      roomUrl: `${origin}/meet/${roomName}`,
      expiresAt: expiresAt.toISOString(),
      maxDurationMinutes: FREE_DURATION_MINUTES,
    })
  }

  return jsonError('Não foi possível gerar um nome único para a sala.', 500)
}

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  const { data, error } = await supabase
    .from('meet_rooms')
    .select('room_name, title, status, starts_at, expires_at, max_duration_minutes')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return jsonError('Não foi possível listar suas salas.', 500)
  }

  return NextResponse.json({ ok: true, rooms: data ?? [] })
}
