import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type MeetRoom = {
  id: string
  room_name: string
  title: string | null
  owner_id: string
  plan: 'free' | 'vip'
  status: 'active' | 'expired' | 'ended'
  max_duration_minutes: number
  starts_at: string
  expires_at: string
  ended_at: string | null
  is_recording_enabled: boolean
  is_translation_enabled: boolean
}

export type MeetMember = {
  id: string
  room_id: string
  user_id: string
  role: 'owner' | 'admin' | 'participant'
  status: 'pending' | 'approved' | 'rejected' | 'left'
  display_name: string | null
  hand_raised: boolean
  hand_raised_at: string | null
  requested_at: string
  approved_at: string | null
  rejected_at: string | null
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function requireUser(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization')

  if (!url || !anonKey) {
    return { error: jsonError('Configuração Supabase ausente no servidor.', 500) }
  }

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return { error: jsonError('Entre na sua conta para continuar.', 401) }
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  })

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser()

  if (error || !user) {
    return { error: jsonError('Sessão inválida ou expirada.', 401) }
  }

  return { user }
}

export async function getProfileDisplayName(supabase: SupabaseClient, user: User) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle()

  const profile = data as { display_name?: string | null; username?: string | null } | null
  return profile?.display_name || profile?.username || user.email || 'Usuário EntreUS'
}

export async function getRoomByName(supabase: SupabaseClient, roomName: string) {
  const { data, error } = await supabase
    .from('meet_rooms')
    .select('*')
    .eq('room_name', roomName)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as MeetRoom | null
}

export async function getMembership(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('meet_room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as MeetMember | null
}

export function hasRoomExpired(room: MeetRoom) {
  return room.status === 'expired' || (room.plan === 'free' && Date.now() > Date.parse(room.expires_at))
}

export async function expireRoomIfNeeded(supabase: SupabaseClient, room: MeetRoom) {
  if (room.status !== 'active' || room.plan !== 'free' || Date.now() <= Date.parse(room.expires_at)) {
    return room
  }

  const { data, error } = await supabase
    .from('meet_rooms')
    .update({ status: 'expired' })
    .eq('id', room.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data as MeetRoom
}

export function canModerate(member: MeetMember | null) {
  return Boolean(member && member.status === 'approved' && ['owner', 'admin'].includes(member.role))
}

export function canJoinRoom(member: MeetMember | null) {
  return Boolean(member && member.status === 'approved')
}

export function publicRoom(room: MeetRoom, userId: string) {
  return {
    roomName: room.room_name,
    title: room.title,
    ownerId: room.owner_id,
    isOwner: room.owner_id === userId,
    plan: room.plan,
    status: room.status,
    startsAt: room.starts_at,
    expiresAt: room.expires_at,
    maxDurationMinutes: room.max_duration_minutes,
    isRecordingEnabled: room.is_recording_enabled,
    isTranslationEnabled: room.is_translation_enabled,
  }
}

export function publicMembership(member: MeetMember | null) {
  if (!member) return null

  return {
    id: member.id,
    role: member.role,
    status: member.status,
    displayName: member.display_name,
    handRaised: member.hand_raised,
  }
}
