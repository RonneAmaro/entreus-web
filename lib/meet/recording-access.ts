import { isAdminRole } from '@/lib/admin'
import {
  canJoinRoom,
  canModerate,
  expireRoomIfNeeded,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { canManageMeetRecording } from './recording-permissions'

type RecordingProfile = {
  role: string | null
  is_minor: boolean | null
  vip_status: string | null
  vip_expires_at: string | null
}

export async function getMeetRecordingAccess(request: Request, roomName: string) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuração Supabase ausente no servidor.', 500) }

  const room = await getRoomByName(supabase, roomName)
  if (!room) return { error: jsonError('Sala não encontrada.', 404) }

  const updatedRoom = await expireRoomIfNeeded(supabase, room)
  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_minor, vip_status, vip_expires_at')
    .eq('id', auth.user.id)
    .maybeSingle()

  const recordingProfile = profile as RecordingProfile | null
  const isPlatformAdmin = isAdminRole(recordingProfile?.role)
  const isRoomModerator = canModerate(membership) || updatedRoom.owner_id === auth.user.id
  const vipExpiry = recordingProfile?.vip_expires_at
  const isVipActive = Boolean(
    recordingProfile?.vip_status === 'active' && vipExpiry && Date.parse(vipExpiry) > Date.now(),
  )

  return {
    auth,
    supabase,
    room: updatedRoom,
    membership,
    isApprovedParticipant: canJoinRoom(membership),
    isRoomModerator,
    isPlatformAdmin,
    isVipActive,
    isMinor: Boolean(recordingProfile?.is_minor),
    canManage: canManageMeetRecording({
      authenticated: true,
      isRoomModerator,
      isPlatformAdmin,
    }),
  }
}
