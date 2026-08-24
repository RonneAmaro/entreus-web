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

  try {
    let existing = await getOpenMeetTranscript(access.supabase, access.room.id)
    if (existing && hasMeetTranscriptExpired(existing)) {
      await reconcileMeetTranscriptionConsentState(access.supabase, access.room, existing)
      existing = null
    }
    if (existing) return jsonError('Já existe uma solicitação de transcrição nesta sala.', 409)

    const participants = await listValidatedConnectedParticipants(access.supabase, access.room)
    if (participants.length === 0) {
      return jsonError('Nenhum participante conectado foi encontrado para solicitar consentimento.', 409)
    }

    const age = await assertParticipantsAreAdults(access.supabase, participants)
    if (!age.eligible) {
      return jsonError(
        age.reason === 'minor'
          ? MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE
          : age.reason === 'unverified'
            ? MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE
            : MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE,
        403,
      )
    }

    const transcriptId = crypto.randomUUID()
    const now = new Date().toISOString()
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
    if (error || !data) return jsonError('Não foi possível solicitar a transcrição.', 500)

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
      await access.supabase
        .from('meet_transcripts')
        .update({ status: 'failed', ended_at: now })
        .eq('id', transcriptId)
        .eq('status', 'pending_consent')
      return jsonError('Não foi possível registrar a solicitação de consentimento.', 500)
    }

    return publicTranscriptResponse(access, data as MeetTranscript)
  } catch {
    return jsonError('Não foi possível solicitar a transcrição.', 500)
  }
}
