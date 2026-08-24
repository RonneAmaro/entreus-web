import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canJoinRoom,
  canModerate,
  expireRoomIfNeeded,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  hasRoomExpired,
  jsonError,
  requireUser,
  type MeetMember,
  type MeetRoom,
} from '@/lib/meet-server'
import {
  listLiveKitMeetParticipants,
  type LiveKitParticipantSummary,
  type LiveKitRoomService,
} from './livekit-room-server'
import {
  ENTREUS_LIVEKIT_ATTRIBUTES,
  validateServerIssuedParticipantIdentity,
} from './participant-identity'

export const MEET_TRANSCRIPT_RETENTION_DAYS = 15
export const MEET_TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  'A transcrição não está disponível nesta instalação.'
export const MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE =
  'A transcrição não está disponível para participantes menores de 18 anos.'
export const MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE =
  'Não foi possível confirmar a elegibilidade etária de todos os participantes.'
export const MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE =
  'A transcrição exige verificação de maioridade aprovada para todos os participantes.'

export type MeetTranscriptStatus =
  | 'pending_consent'
  | 'ready'
  | 'active'
  | 'paused'
  | 'ended'
  | 'failed'

export type MeetTranscript = {
  id: string
  room_id: string
  status: MeetTranscriptStatus
  started_at: string | null
  ended_at: string | null
  created_by: string
  retention_expires_at: string
  language: string | null
  provider: string | null
  provider_model: string | null
  created_at: string
  updated_at: string
}

export type MeetTranscriptConsent = {
  id: string
  transcript_id: string
  room_id: string
  member_id: string
  user_id: string
  livekit_participant_identity: string
  accepted_at: string | null
  revoked_at: string | null
}

type ParticipantProfile = {
  id: string
  birth_date: string | null
  is_minor: boolean | null
}

type ApprovedAgeVerification = {
  user_id: string
  birth_date: string | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export type ValidatedParticipant = {
  participant: LiveKitParticipantSummary
  member: MeetMember
}

export function getTranscriptRetentionExpiry(now = new Date()) {
  return new Date(now.getTime() + MEET_TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function hasMeetTranscriptExpired(
  transcript: Pick<MeetTranscript, 'retention_expires_at'>,
  now = new Date(),
) {
  const expiresAt = Date.parse(transcript.retention_expires_at)
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime()
}

export function evaluateTranscriptionAge(
  profile: ParticipantProfile | null,
  verification: ApprovedAgeVerification | null,
  now = new Date(),
) {
  if (!profile?.birth_date) return { eligible: false as const, reason: 'unknown' as const }
  const birthDate = new Date(`${profile.birth_date}T00:00:00.000Z`)
  if (Number.isNaN(birthDate.getTime())) return { eligible: false as const, reason: 'unknown' as const }

  const adultCutoff = new Date(Date.UTC(
    now.getUTCFullYear() - 18,
    now.getUTCMonth(),
    now.getUTCDate(),
  ))
  if (profile.is_minor === true || birthDate > adultCutoff) {
    return { eligible: false as const, reason: 'minor' as const }
  }
  if (
    verification?.status !== 'approved'
    || !verification.reviewed_by
    || !verification.reviewed_at
    || verification.birth_date !== profile.birth_date
  ) {
    return { eligible: false as const, reason: 'unverified' as const }
  }

  const verifiedBirthDate = new Date(`${verification.birth_date}T00:00:00.000Z`)
  if (Number.isNaN(verifiedBirthDate.getTime()) || verifiedBirthDate > adultCutoff) {
    return { eligible: false as const, reason: 'minor' as const }
  }
  return { eligible: true as const }
}

export async function getMeetTranscriptionAccess(request: Request, roomName: string) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error ?? jsonError('Não foi possível validar sua sessão.', 500) }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuração Supabase ausente no servidor.', 500) }

  const room = await getRoomByName(supabase, roomName)
  if (!room) return { error: jsonError('Sala não encontrada.', 404) }

  const updatedRoom = await expireRoomIfNeeded(supabase, room)
  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)
  if (
    !canJoinRoom(membership)
    || membership?.room_id !== updatedRoom.id
    || membership.user_id !== auth.user.id
  ) {
    return { error: jsonError('Você não tem acesso à transcrição desta sala.', 403) }
  }

  return {
    auth,
    supabase,
    room: updatedRoom,
    membership: membership as MeetMember,
    isModerator: canModerate(membership) || updatedRoom.owner_id === auth.user.id,
  }
}

export async function listValidatedConnectedParticipants(
  supabase: SupabaseClient,
  room: MeetRoom,
  service?: LiveKitRoomService,
): Promise<ValidatedParticipant[]> {
  const participants = await listLiveKitMeetParticipants(room.room_name, service)
  const nonHumanKinds = new Set([1, 2, 4, 7, 8])
  const humans = participants.filter((participant) => !nonHumanKinds.has(participant.kind ?? 0))
  if (humans.length === 0) return []

  const memberIds = humans.map(
    (participant) => participant.attributes?.[ENTREUS_LIVEKIT_ATTRIBUTES.memberId] || '',
  )
  if (memberIds.some((memberId) => !memberId)) {
    throw new Error('MEET_TRANSCRIPTION_UNATTRIBUTED_PARTICIPANT')
  }

  const { data, error } = await supabase
    .from('meet_room_members')
    .select('*')
    .eq('room_id', room.id)
    .in('id', memberIds)
  if (error) throw error

  const members = new Map(((data ?? []) as MeetMember[]).map((member) => [member.id, member]))
  return humans.map((participant) => {
    const memberId = participant.attributes?.[ENTREUS_LIVEKIT_ATTRIBUTES.memberId] || ''
    const member = members.get(memberId)
    if (!member || !validateServerIssuedParticipantIdentity({
      identity: participant.identity,
      attributes: participant.attributes,
      roomId: room.id,
      member,
    })) {
      throw new Error('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
    }
    return { participant, member }
  })
}

export async function assertParticipantsAreAdults(
  supabase: SupabaseClient,
  participants: ValidatedParticipant[],
  now = new Date(),
) {
  const userIds = [...new Set(participants.map(({ member }) => member.user_id))]
  if (userIds.length === 0) return { eligible: false as const, reason: 'unknown' as const }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, birth_date, is_minor')
    .in('id', userIds)
  if (error) throw error

  const profiles = new Map(((data ?? []) as ParticipantProfile[]).map((profile) => [profile.id, profile]))
  const { data: verificationData, error: verificationError } = await supabase
    .from('age_verification_requests')
    .select('user_id, birth_date, status, reviewed_by, reviewed_at')
    .in('user_id', userIds)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
  if (verificationError) throw verificationError

  const verifications = new Map<string, ApprovedAgeVerification>()
  for (const row of (verificationData ?? []) as ApprovedAgeVerification[]) {
    if (row.reviewed_by && row.reviewed_at && !verifications.has(row.user_id)) {
      verifications.set(row.user_id, row)
    }
  }
  for (const userId of userIds) {
    const eligibility = evaluateTranscriptionAge(
      profiles.get(userId) ?? null,
      verifications.get(userId) ?? null,
      now,
    )
    if (!eligibility.eligible) return eligibility
  }
  return { eligible: true as const }
}

export async function getOpenMeetTranscript(supabase: SupabaseClient, roomId: string) {
  const { data, error } = await supabase
    .from('meet_transcripts')
    .select('*')
    .eq('room_id', roomId)
    .in('status', ['pending_consent', 'ready', 'active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as MeetTranscript | null
}

export async function getMeetTranscriptById(supabase: SupabaseClient, transcriptId: string) {
  const { data, error } = await supabase
    .from('meet_transcripts')
    .select('*')
    .eq('id', transcriptId)
    .maybeSingle()
  if (error) throw error
  return data as MeetTranscript | null
}

export async function getTranscriptConsent(
  supabase: SupabaseClient,
  transcriptId: string,
  memberId: string,
) {
  const { data, error } = await supabase
    .from('meet_transcript_consents')
    .select('*')
    .eq('transcript_id', transcriptId)
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) throw error
  return data as MeetTranscriptConsent | null
}

async function upsertMissingTranscriptConsents(
  supabase: SupabaseClient,
  transcript: MeetTranscript,
  room: MeetRoom,
  participants: ValidatedParticipant[],
) {
  if (participants.length === 0) return
  const { error } = await supabase
    .from('meet_transcript_consents')
    .upsert(participants.map(({ participant, member }) => ({
      transcript_id: transcript.id,
      room_id: room.id,
      member_id: member.id,
      user_id: member.user_id,
      livekit_participant_identity: participant.identity,
    })), {
      onConflict: 'transcript_id,member_id',
      ignoreDuplicates: true,
    })
  if (error) throw error
}

async function updateTranscriptStatus(
  supabase: SupabaseClient,
  transcript: MeetTranscript,
  status: MeetTranscriptStatus,
  now: string,
) {
  const values: Record<string, string> = { status }
  if (status === 'ended' || status === 'failed') values.ended_at = transcript.ended_at || now

  const { data, error } = await supabase
    .from('meet_transcripts')
    .update(values)
    .eq('id', transcript.id)
    .eq('status', transcript.status)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return (data as MeetTranscript | null) ?? await getMeetTranscriptById(supabase, transcript.id) ?? transcript
}

export async function reconcileMeetTranscriptionConsentState(
  supabase: SupabaseClient,
  room: MeetRoom,
  transcript: MeetTranscript,
  options: {
    participants?: ValidatedParticipant[]
    service?: LiveKitRoomService
    now?: Date
  } = {},
) {
  if (transcript.status === 'ended' || transcript.status === 'failed') return transcript
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()

  if (
    room.status !== 'active'
    || hasRoomExpired(room)
    || Date.parse(transcript.retention_expires_at) <= now.getTime()
  ) {
    return updateTranscriptStatus(supabase, transcript, 'ended', nowIso)
  }

  const participants = options.participants
    ?? await listValidatedConnectedParticipants(supabase, room, options.service)
  const age = await assertParticipantsAreAdults(supabase, participants, now)
  if (!age.eligible) return updateTranscriptStatus(supabase, transcript, 'ended', nowIso)

  await upsertMissingTranscriptConsents(supabase, transcript, room, participants)
  const memberIds = participants.map(({ member }) => member.id)
  let consentRows: Array<Pick<MeetTranscriptConsent, 'member_id' | 'accepted_at' | 'revoked_at'>> = []
  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('meet_transcript_consents')
      .select('member_id, accepted_at, revoked_at')
      .eq('transcript_id', transcript.id)
      .in('member_id', memberIds)
    if (error) throw error
    consentRows = (data ?? []) as typeof consentRows
  }

  if (consentRows.some((consent) => consent.revoked_at)) {
    return updateTranscriptStatus(supabase, transcript, 'ended', nowIso)
  }

  const acceptedMemberIds = new Set(
    consentRows
      .filter((consent) => consent.accepted_at && !consent.revoked_at)
      .map((consent) => consent.member_id),
  )
  const allCurrentParticipantsAccepted = memberIds.length > 0
    && memberIds.every((memberId) => acceptedMemberIds.has(memberId))

  if (allCurrentParticipantsAccepted && ['pending_consent', 'paused'].includes(transcript.status)) {
    return updateTranscriptStatus(supabase, transcript, 'ready', nowIso)
  }
  if (!allCurrentParticipantsAccepted && transcript.status === 'ready') {
    return updateTranscriptStatus(supabase, transcript, 'pending_consent', nowIso)
  }
  if (!allCurrentParticipantsAccepted && transcript.status === 'active') {
    return updateTranscriptStatus(supabase, transcript, 'paused', nowIso)
  }
  return transcript
}

export async function recordMeetTranscriptConsent(
  supabase: SupabaseClient,
  input: {
    transcript: MeetTranscript
    room: MeetRoom
    member: MeetMember
    participantIdentity: string
    action: 'accept' | 'revoke'
    now?: Date
  },
) {
  const now = (input.now ?? new Date()).toISOString()
  const insertValues = {
    transcript_id: input.transcript.id,
    room_id: input.room.id,
    member_id: input.member.id,
    user_id: input.member.user_id,
    livekit_participant_identity: input.participantIdentity,
    ...(input.action === 'accept' ? { accepted_at: now } : { revoked_at: now }),
  }
  const { error: upsertError } = await supabase
    .from('meet_transcript_consents')
    .upsert(insertValues, {
      onConflict: 'transcript_id,member_id',
      ignoreDuplicates: true,
    })
  if (upsertError) throw upsertError

  let consent = await getTranscriptConsent(supabase, input.transcript.id, input.member.id)
  if (!consent) throw new Error('MEET_TRANSCRIPT_CONSENT_NOT_FOUND')
  if (input.action === 'accept' && consent.revoked_at) return consent

  const column = input.action === 'accept' ? 'accepted_at' : 'revoked_at'
  if (!consent[column]) {
    let query = supabase
      .from('meet_transcript_consents')
      .update({ [column]: now })
      .eq('id', consent.id)
      .is(column, null)
    if (input.action === 'accept') query = query.is('revoked_at', null)
    const { data, error } = await query.select('*').maybeSingle()
    if (error) throw error
    consent = (data as MeetTranscriptConsent | null)
      ?? await getTranscriptConsent(supabase, input.transcript.id, input.member.id)
      ?? consent
  }
  return consent
}

export type MeetTranscriptionTrackAuthorization =
  | {
      authorized: true
      transcriptId: string
      roomId: string
      memberId: string
      userId: string
      livekitParticipantIdentity: string
      sourceTrackSid: string
    }
  | {
      authorized: false
      reason:
        | 'transcript_unavailable'
        | 'room_unavailable'
        | 'consent_gate_closed'
        | 'participant_unavailable'
        | 'microphone_track_unavailable'
        | 'consent_required'
    }

/**
 * Server-only authorization boundary for a future authenticated STT worker.
 * Call immediately before subscribing to the exact LiveKit microphone track.
 * No browser route or worker transport is intentionally provided in Phase 1.
 */
export async function authorizeMeetTranscriptionTrack(
  supabase: SupabaseClient,
  input: {
    transcriptId: string
    livekitParticipantIdentity: string
    participantAttributes: Record<string, string>
    sourceTrackSid: string
    service?: LiveKitRoomService
    now?: Date
  },
): Promise<MeetTranscriptionTrackAuthorization> {
  const transcript = await getMeetTranscriptById(supabase, input.transcriptId)
  const now = input.now ?? new Date()
  if (
    !transcript
    || !['pending_consent', 'ready', 'active', 'paused'].includes(transcript.status)
    || Date.parse(transcript.retention_expires_at) <= now.getTime()
  ) return { authorized: false, reason: 'transcript_unavailable' }

  const { data: roomData, error: roomError } = await supabase
    .from('meet_rooms')
    .select('*')
    .eq('id', transcript.room_id)
    .maybeSingle()
  if (roomError) throw roomError
  const room = roomData as MeetRoom | null
  if (!room || room.status !== 'active' || hasRoomExpired(room)) {
    return { authorized: false, reason: 'room_unavailable' }
  }

  const participants = await listValidatedConnectedParticipants(supabase, room, input.service)
  const reconciled = await reconcileMeetTranscriptionConsentState(supabase, room, transcript, {
    participants,
    now,
  })
  if (!['ready', 'active'].includes(reconciled.status)) {
    return { authorized: false, reason: 'consent_gate_closed' }
  }

  const current = participants.find(
    ({ participant }) => participant.identity === input.livekitParticipantIdentity,
  )
  if (!current || !validateServerIssuedParticipantIdentity({
    identity: input.livekitParticipantIdentity,
    attributes: input.participantAttributes,
    roomId: room.id,
    member: current.member,
  })) return { authorized: false, reason: 'participant_unavailable' }

  const microphoneTrack = current.participant.tracks?.find(
    (track) => track.sid === input.sourceTrackSid && track.type === 0 && track.source === 2,
  )
  if (!microphoneTrack) return { authorized: false, reason: 'microphone_track_unavailable' }

  const consent = await getTranscriptConsent(supabase, transcript.id, current.member.id)
  if (
    !consent?.accepted_at
    || consent.revoked_at
    || consent.room_id !== room.id
    || consent.user_id !== current.member.user_id
  ) return { authorized: false, reason: 'consent_required' }

  return {
    authorized: true,
    transcriptId: transcript.id,
    roomId: room.id,
    memberId: current.member.id,
    userId: current.member.user_id,
    livekitParticipantIdentity: current.participant.identity,
    sourceTrackSid: microphoneTrack.sid,
  }
}

export function toPublicMeetTranscript(
  transcript: MeetTranscript,
  consent: MeetTranscriptConsent | null,
  options: { isModerator: boolean; pendingConsentCount?: number },
) {
  return {
    id: transcript.id,
    status: transcript.status,
    retentionExpiresAt: transcript.retention_expires_at,
    consent: consent
      ? { acceptedAt: consent.accepted_at, revokedAt: consent.revoked_at }
      : null,
    requiresConsent: !consent?.accepted_at && !consent?.revoked_at,
    pendingConsentCount: options.isModerator ? options.pendingConsentCount ?? null : null,
    providerReady: false,
    // A future authenticated worker handshake must supply this server-side.
    // Never derive it from a text-stream topic, attributes or browser input.
    trustedPublisherIdentity: null,
  }
}

export type FinalTranscriptSegmentInput = {
  transcriptId: string
  livekitParticipantIdentity: string
  participantAttributes: Record<string, string>
  sourceTrackSid?: string | null
  providerSegmentId?: string | null
  text: string
  language?: string | null
  startOffsetMs?: number | null
  endOffsetMs?: number | null
  final: boolean
}

export async function persistFinalTranscriptSegment(
  supabase: SupabaseClient,
  input: FinalTranscriptSegmentInput,
) {
  if (!input.final) return { persisted: false as const, reason: 'interim' as const }
  const text = input.text.trim()
  if (!text || text.length > 4000) throw new Error('MEET_TRANSCRIPT_SEGMENT_TEXT_INVALID')

  const userId = input.participantAttributes[ENTREUS_LIVEKIT_ATTRIBUTES.userId]
  const memberId = input.participantAttributes[ENTREUS_LIVEKIT_ATTRIBUTES.memberId]
  if (!userId || !memberId) throw new Error('MEET_TRANSCRIPT_SPEAKER_IDENTITY_INVALID')

  const { data: transcriptData, error: transcriptError } = await supabase
    .from('meet_transcripts')
    .select('*')
    .eq('id', input.transcriptId)
    .maybeSingle()
  if (transcriptError) throw transcriptError
  const transcript = transcriptData as MeetTranscript | null
  if (!transcript || transcript.status !== 'active') {
    throw new Error('MEET_TRANSCRIPT_NOT_ACTIVE')
  }
  if (Date.parse(transcript.retention_expires_at) <= Date.now()) {
    throw new Error('MEET_TRANSCRIPT_EXPIRED')
  }

  const { data: roomData, error: roomError } = await supabase
    .from('meet_rooms')
    .select('*')
    .eq('id', transcript.room_id)
    .maybeSingle()
  if (roomError) throw roomError
  const room = roomData as MeetRoom | null
  if (!room || room.status !== 'active' || hasRoomExpired(room)) {
    throw new Error('MEET_TRANSCRIPT_ROOM_NOT_ACTIVE')
  }

  const { data: memberData, error: memberError } = await supabase
    .from('meet_room_members')
    .select('*')
    .eq('room_id', transcript.room_id)
    .eq('id', memberId)
    .maybeSingle()
  if (memberError) throw memberError
  const member = memberData as MeetMember | null
  if (!member || !validateServerIssuedParticipantIdentity({
    identity: input.livekitParticipantIdentity,
    attributes: input.participantAttributes,
    roomId: transcript.room_id,
    member,
  })) {
    throw new Error('MEET_TRANSCRIPT_SPEAKER_NOT_AUTHORIZED')
  }

  const consent = await getTranscriptConsent(supabase, transcript.id, member.id)
  if (
    !consent?.accepted_at ||
    consent.revoked_at ||
    consent.user_id !== member.user_id ||
    consent.room_id !== transcript.room_id
  ) {
    throw new Error('MEET_TRANSCRIPT_CONSENT_REQUIRED')
  }

  const { data, error } = await supabase
    .from('meet_transcript_segments')
    .insert({
      transcript_id: transcript.id,
      room_id: transcript.room_id,
      member_id: member.id,
      user_id: member.user_id,
      livekit_participant_identity: input.livekitParticipantIdentity,
      source_track_sid: input.sourceTrackSid || null,
      speaker_display_name: member.display_name,
      original_text: text,
      language: input.language || null,
      start_offset_ms: input.startOffsetMs ?? null,
      end_offset_ms: input.endOffsetMs ?? null,
      provider_segment_id: input.providerSegmentId || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { persisted: true as const, id: (data as { id: string }).id }
}
