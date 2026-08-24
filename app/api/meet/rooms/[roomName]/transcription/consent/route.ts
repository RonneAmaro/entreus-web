import { NextResponse } from 'next/server'
import { hasRoomExpired, jsonError } from '@/lib/meet-server'
import {
  MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE,
  MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE,
  MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE,
  assertParticipantsAreAdults,
  getMeetTranscriptionAccess,
  getOpenMeetTranscript,
  hasMeetTranscriptExpired,
  listValidatedConnectedParticipants,
  reconcileMeetTranscriptionConsentState,
  recordMeetTranscriptConsent,
  toPublicMeetTranscript,
} from '@/lib/meet/transcription-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ConsentContext = {
  params: Promise<{ roomName: string }>
}

type ConsentBody = {
  action?: unknown
}

export async function POST(request: Request, context: ConsentContext): Promise<Response> {
  const { roomName } = await context.params
  const access = await getMeetTranscriptionAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error ?? jsonError('Não foi possível validar sua sessão.', 500)
  if (access.room.status !== 'active' || hasRoomExpired(access.room)) {
    return jsonError('Esta sala não está ativa para consentimento de transcrição.', 403)
  }

  let body: ConsentBody
  try {
    body = (await request.json()) as ConsentBody
  } catch {
    return jsonError('Consentimento inválido.', 400)
  }
  if (body.action !== 'accept' && body.action !== 'revoke') {
    return jsonError('Escolha de consentimento inválida.', 400)
  }

  try {
    let transcript = await getOpenMeetTranscript(access.supabase, access.room.id)
    if (!transcript) return jsonError('Não existe transcrição aguardando consentimento.', 404)
    if (hasMeetTranscriptExpired(transcript)) {
      await reconcileMeetTranscriptionConsentState(access.supabase, access.room, transcript)
      return jsonError('Não existe transcrição aguardando consentimento.', 404)
    }

    const participants = await listValidatedConnectedParticipants(access.supabase, access.room)
    const current = participants.find(({ member }) => member.id === access.membership.id)
    if (!current) {
      return jsonError('Entre na chamada para responder ao consentimento de transcrição.', 409)
    }

    const age = await assertParticipantsAreAdults(access.supabase, [current])
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

    const consent = await recordMeetTranscriptConsent(access.supabase, {
      transcript,
      room: access.room,
      member: access.membership,
      participantIdentity: current.participant.identity,
      action: body.action,
    })
    if (body.action === 'accept' && consent.revoked_at) {
      return jsonError('Este consentimento foi revogado. Solicite uma nova sessão.', 409)
    }
    transcript = await reconcileMeetTranscriptionConsentState(
      access.supabase,
      access.room,
      transcript,
      { participants },
    )
    if (hasMeetTranscriptExpired(transcript)) {
      return jsonError('Não existe transcrição aguardando consentimento.', 404)
    }

    return NextResponse.json({
      ok: true,
      transcript: toPublicMeetTranscript(transcript, consent, {
        isModerator: access.isModerator,
      }),
    })
  } catch {
    return jsonError('Não foi possível registrar o consentimento.', 500)
  }
}
