'use client'

import { useParticipants, useTextStream } from '@livekit/components-react'
import { useEffect, useMemo } from 'react'
import { isTrustedCaptionPublisher } from '@/lib/meet/caption-source'
import {
  isMeetCaptionModeEnabled,
  type MeetCaptionMode,
  type MeetCaptionState,
} from '@/lib/meet/caption-preference'

const TRANSCRIBED_TRACK_ATTRIBUTE = 'lk.transcribed_track_id'
const TRANSCRIPTION_FINAL_ATTRIBUTE = 'lk.transcription_final'
const TRANSCRIPTION_SEGMENT_ATTRIBUTE = 'lk.segment_id'
const TRANSCRIPTION_TOPIC = 'lk.transcription'

export type MeetCaptionDemand = {
  enabled: boolean
  mode: MeetCaptionMode
}

export default function MeetCaptionsPanel({
  captionMode,
  captionState,
  trustedPublisherIdentity = null,
  onCaptionDemandChange,
}: {
  captionMode: MeetCaptionMode
  captionState: MeetCaptionState
  trustedPublisherIdentity?: string | null
  onCaptionDemandChange?: (demand: MeetCaptionDemand) => void
}) {
  const participants = useParticipants()
  const { textStreams } = useTextStream(TRANSCRIPTION_TOPIC)
  const captionsRequested = isMeetCaptionModeEnabled(captionMode)

  useEffect(() => {
    onCaptionDemandChange?.({ enabled: captionsRequested, mode: captionMode })
  }, [captionMode, captionsRequested, onCaptionDemandChange])

  const captionLines = useMemo(() => {
    if (captionState !== 'on') return []

    const trustedStreams = textStreams.filter((stream) => isTrustedCaptionPublisher({
      actualPublisherIdentity: stream.participantInfo.identity,
      trustedPublisherIdentity,
      participants: participants.map((participant) => ({
        identity: participant.identity,
        isAgent: participant.isAgent,
      })),
    }))
    const bySegment = new Map<string, (typeof trustedStreams)[number]>()
    for (const stream of trustedStreams) {
      const segmentId = stream.streamInfo.attributes?.[TRANSCRIPTION_SEGMENT_ATTRIBUTE]
        || stream.streamInfo.id
      bySegment.set(segmentId, stream)
    }

    return [...bySegment.values()].slice(-4).map((stream) => {
      const trackSid = stream.streamInfo.attributes?.[TRANSCRIBED_TRACK_ATTRIBUTE]
      const speaker = participants.find((participant) => {
        if (trackSid && [...participant.trackPublications.values()].some(
          (publication) => publication.trackSid === trackSid,
        )) return true
        return participant.identity === stream.participantInfo.identity
      })
      return {
        id: stream.streamInfo.attributes?.[TRANSCRIPTION_SEGMENT_ATTRIBUTE]
          || stream.streamInfo.id,
        text: stream.text,
        speaker: speaker?.name || 'Participante',
        final: stream.streamInfo.attributes?.[TRANSCRIPTION_FINAL_ATTRIBUTE] === 'true',
      }
    }).filter((line) => line.text.trim())
  }, [captionState, participants, textStreams, trustedPublisherIdentity])

  return (
    <>
      {captionState === 'unavailable' ? (
        <div id="meet-caption-status" role="status" className="pointer-events-none absolute bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-amber-300/25 bg-black/90 px-4 py-3 text-center text-xs font-semibold leading-5 text-amber-50 shadow-xl backdrop-blur-xl sm:bottom-28">
          <span className="block font-black">Legendas indisponíveis</span>
          <span className="block text-amber-100/80">O serviço de reconhecimento de fala ainda não está configurado.</span>
        </div>
      ) : null}

      {captionState === 'on' && captionLines.length > 0 ? (
        <div aria-live="polite" aria-label="Legendas ao vivo" className="pointer-events-none absolute bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 space-y-2 text-center sm:bottom-28">
          {captionLines.map((line) => (
            <p key={line.id} className="inline-block max-w-full rounded-2xl bg-black/90 px-4 py-2 text-sm leading-relaxed text-white shadow-xl backdrop-blur-xl sm:text-base">
              <span className="mr-2 font-black text-blue-200">{line.speaker}</span>
              <span className={line.final ? '' : 'text-zinc-300'}>{line.text}</span>
            </p>
          ))}
        </div>
      ) : null}
    </>
  )
}
