import { NextResponse } from 'next/server'
import { hasRoomExpired, jsonError } from '@/lib/meet-server'
import {
  MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE,
  MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE,
  MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE,
  assertParticipantsAreAdults,
  getMeetTranscriptionAccess,
  getOpenMeetTranscript,
  getTranscriptConsent,
  getTranscriptRetentionExpiry,
  hasMeetTranscriptExpired,
  listValidatedConnectedParticipants,
  reconcileMeetTranscriptionConsentState,
  toPublicMeetTranscript,
  type MeetTranscript,
} from '@/lib/meet/transcription-server'
import { logMeetTranscriptionFailure } from '@/lib/meet/transcription-diagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TranscriptionContext = {
  params: Promise<{ roomName: string }>
}

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

function unavailableTranscriptResponse() {
  return NextResponse.json(
    { ok: true, transcript: null },
    { headers: PRIVATE_NO_STORE_HEADERS },
  )
}

async function publicTranscriptResponse(
  access: Exclude<Awaited<ReturnType<typeof getMeetTranscriptionAccess>>, { error: Response }>,
  transcript: MeetTranscript | null,
) {
  if (!transcript || hasMeetTranscriptExpired(transcript)) {
    return unavailableTranscriptResponse()
  }
  const consent = await getTranscriptConsent(access.supabase, transcript.id, access.membership.id)
  const { count, error } = await access.supabase
    .from('meet_transcript_consents')
    .select('id', { count: 'exact', head: true })
    .eq('transcript_id', transcript.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
  if (error) return jsonError('Não foi possível carregar os consentimentos.', 500)

  if (hasMeetTranscriptExpired(transcript)) return unavailableTranscriptResponse()

  return NextResponse.json({
    ok: true,
    transcript: toPublicMeetTranscript(transcript, consent, {
      isModerator: access.isModerator,
      pendingConsentCount: count ?? 0,
    }),
  }, { headers: PRIVATE_NO_STORE_HEADERS })
}

export async function GET(request: Request, context: TranscriptionContext): Promise<Response> {
  const { roomName } = await context.params
  const access = await getMeetTranscriptionAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error ?? jsonError('Não foi possível validar sua sessão.', 500)

  try {
    let transcript = await getOpenMeetTranscript(access.supabase, access.room.id)
    if (transcript) {
      if (hasMeetTranscriptExpired(transcript)) {
        await reconcileMeetTranscriptionConsentState(access.supabase, access.room, transcript)
        return unavailableTranscriptResponse()
      }
      transcript = await reconcileMeetTranscriptionConsentState(
        access.supabase,
        access.room,
        transcript,
      )
    }
    return publicTranscriptResponse(access, transcript)
  } catch {
    return jsonError('Não foi possível carregar a transcrição.', 500)
  }
}

export async function POST(request: Request, context: TranscriptionContext): Promise<Response> {
  const { roomName } = await context.params
  const access = await getMeetTranscriptionAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error ?? jsonError('Não foi possível validar sua sessão.', 500)
  if (!access.isModerator) {
    return jsonError('Somente o anfitrião ou um administrador da sala pode solicitar a transcrição.', 403)
  }
  if (access.room.status !== 'active' || hasRoomExpired(access.room)) {
    return jsonError('Esta sala não está ativa para iniciar uma transcrição.', 403)
  }

  let existing: MeetTranscript | null
  try {
    existing = await getOpenMeetTranscript(access.supabase, access.room.id)
    if (existing && hasMeetTranscriptExpired(existing)) {
      await reconcileMeetTranscriptionConsentState(access.supabase, access.room, existing)
      existing = null
    }
  } catch (error) {
    logMeetTranscriptionFailure('open_transcript_lookup', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }
  if (existing) return jsonError('Já existe uma solicitação de transcrição nesta sala.', 409)

  let participants: Awaited<ReturnType<typeof listValidatedConnectedParticipants>>
  try {
    participants = await listValidatedConnectedParticipants(access.supabase, access.room)
  } catch (error) {
    logMeetTranscriptionFailure('livekit_participants_lookup', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }
  if (participants.length === 0) {
    logMeetTranscriptionFailure(
      'livekit_participants_lookup',
      new Error('MEET_TRANSCRIPTION_NO_CONNECTED_PARTICIPANTS'),
    )
    return jsonError('Nenhum participante conectado foi encontrado para solicitar consentimento.', 409)
  }

  let age: Awaited<ReturnType<typeof assertParticipantsAreAdults>>
  try {
    age = await assertParticipantsAreAdults(access.supabase, participants)
  } catch (error) {
    logMeetTranscriptionFailure('age_validation', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }
  if (!age.eligible) {
    logMeetTranscriptionFailure(
      'age_validation',
      new Error('MEET_TRANSCRIPTION_AGE_VALIDATION_FAILED'),
    )
    return jsonError(
      age.reason === 'minor'
        ? MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE
        : age.reason === 'unverified'
          ? MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE
          : MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE,
      403,
    )
  }

  let transcript: MeetTranscript
  let transcriptId: string
  let now: string
  try {
    transcriptId = crypto.randomUUID()
    now = new Date().toISOString()
    const { data, error } = await access.supabase
      .from('meet_transcripts')
      .insert({
        id: transcriptId,
        room_id: access.room.id,
        status: 'pending_consent',
        created_by: access.auth.user.id,
        retention_expires_at: getTranscriptRetentionExpiry(new Date(now)),
      })
      .select('*')
      .single()
    if (error) throw error
    if (!data) throw new Error('MEET_TRANSCRIPTION_TRANSCRIPT_INSERT_EMPTY')
    transcript = data as MeetTranscript
  } catch (error) {
    logMeetTranscriptionFailure('transcript_insert', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }

  try {
    const { error: consentError } = await access.supabase
      .from('meet_transcript_consents')
      .insert(participants.map(({ participant, member }) => ({
        transcript_id: transcriptId,
        room_id: access.room.id,
        member_id: member.id,
        user_id: member.user_id,
        livekit_participant_identity: participant.identity,
      })))
    if (consentError) {
      logMeetTranscriptionFailure('consent_insert', consentError)
      await access.supabase
        .from('meet_transcripts')
        .update({ status: 'failed', ended_at: now })
        .eq('id', transcriptId)
        .eq('status', 'pending_consent')
      return jsonError('Não foi possível registrar a solicitação de consentimento.', 500)
    }
  } catch (error) {
    logMeetTranscriptionFailure('consent_insert', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }

  try {
    const response = await publicTranscriptResponse(access, transcript)
    if (!response.ok) {
      logMeetTranscriptionFailure(
        'public_response',
        new Error('MEET_TRANSCRIPTION_PUBLIC_RESPONSE_FAILED'),
      )
    }
    return response
  } catch (error) {
    logMeetTranscriptionFailure('public_response', error)
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }
}
