'use client'

import { useParticipants, useTextStream } from '@livekit/components-react'
import { Captions, Loader2, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTrustedCaptionPublisher } from '@/lib/meet/caption-source'

type PublicTranscript = {
  id: string
  status: 'pending_consent' | 'ready' | 'active' | 'paused' | 'ended' | 'failed'
  retentionExpiresAt: string
  consent: { acceptedAt: string | null; revokedAt: string | null } | null
  requiresConsent: boolean
  pendingConsentCount: number | null
  providerReady: boolean
  trustedPublisherIdentity: string | null
}

type TranscriptResponse =
  | { ok: true; transcript: PublicTranscript | null }
  | { ok: false; error: string }

const TRANSCRIBED_TRACK_ATTRIBUTE = 'lk.transcribed_track_id'
const TRANSCRIPTION_FINAL_ATTRIBUTE = 'lk.transcription_final'
const TRANSCRIPTION_SEGMENT_ATTRIBUTE = 'lk.segment_id'
const TRANSCRIPTION_TOPIC = 'lk.transcription'

export default function MeetTranscriptionPanel({
  roomName,
  isModerator,
  authHeaders,
}: {
  roomName: string
  isModerator: boolean
  authHeaders: () => Promise<{ Authorization: string } | null>
}) {
  const participants = useParticipants()
  const { textStreams } = useTextStream(TRANSCRIPTION_TOPIC)
  const [transcript, setTranscript] = useState<PublicTranscript | null>(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [action, setAction] = useState<'idle' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)

  const loadTranscript = useCallback(async () => {
    const headers = await authHeaders()
    if (!headers) return
    try {
      const response = await fetch(
        `/api/meet/rooms/${encodeURIComponent(roomName)}/transcription`,
        { headers, cache: 'no-store' },
      )
      const data = (await response.json()) as TranscriptResponse
      if (!response.ok || !data.ok) {
        setError(data.ok ? 'Não foi possível atualizar as legendas.' : data.error)
        return
      }
      setTranscript(data.transcript)
      setError(null)
    } catch {
      setError('Não foi possível atualizar as legendas.')
    }
  }, [authHeaders, roomName])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadTranscript(), 0)
    const timer = window.setInterval(() => void loadTranscript(), 5000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [loadTranscript])

  async function postAction(path: string, body?: object) {
    const headers = await authHeaders()
    if (!headers) return
    setAction('loading')
    setError(null)
    try {
      const response = await fetch(
        `/api/meet/rooms/${encodeURIComponent(roomName)}/transcription${path}`,
        {
          method: 'POST',
          headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      const data = (await response.json()) as TranscriptResponse
      if (!response.ok || !data.ok) {
        setError(data.ok ? 'Não foi possível atualizar a transcrição.' : data.error)
        return
      }
      setTranscript(data.transcript)
    } catch {
      setError('A transcrição falhou, mas sua chamada continua normalmente.')
    } finally {
      setAction('idle')
    }
  }

  const captionLines = useMemo(() => {
    const trustedStreams = textStreams.filter((stream) => isTrustedCaptionPublisher({
      actualPublisherIdentity: stream.participantInfo.identity,
      trustedPublisherIdentity: transcript?.trustedPublisherIdentity ?? null,
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
  }, [participants, textStreams, transcript?.trustedPublisherIdentity])

  const isActive = transcript?.status === 'active'
  const showConsent = Boolean(
    transcript?.requiresConsent
    && ['pending_consent', 'ready', 'active', 'paused'].includes(transcript.status),
  )

  return (
    <>
      <div className="absolute right-3 top-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 sm:right-5 sm:top-5">
        {isModerator && !transcript ? (
          <button
            type="button"
            onClick={() => void postAction('')}
            disabled={action === 'loading'}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-blue-300/30 bg-black/75 px-4 py-2 text-xs font-bold text-blue-50 shadow-xl backdrop-blur-xl transition hover:bg-blue-500/20 disabled:opacity-50"
          >
            {action === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Captions className="h-4 w-4" />}
            Solicitar legendas
          </button>
        ) : null}

        {transcript ? (
          <button
            type="button"
            onClick={() => setCaptionsEnabled((current) => !current)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold shadow-xl backdrop-blur-xl ${
              isActive
                ? 'border-emerald-300/40 bg-emerald-950/80 text-emerald-50'
                : 'border-amber-300/30 bg-black/75 text-amber-50'
            }`}
            title="Ativar ou ocultar a visualização de legendas"
          >
            <Captions className="h-4 w-4" />
            {isActive
              ? `Legendas ${captionsEnabled ? 'ativas' : 'ocultas'}`
              : transcript.status === 'ready'
                ? 'Consentimentos concluídos'
                : 'Aguardando consentimento'}
          </button>
        ) : null}

        {error ? (
          <p role="alert" className="max-w-sm rounded-2xl border border-amber-300/25 bg-black/80 px-4 py-2 text-xs font-semibold text-amber-50 shadow-xl backdrop-blur-xl">
            {error}
          </p>
        ) : null}
      </div>

      {transcript?.status === 'ready' && !transcript.providerReady ? (
        <div role="status" className="pointer-events-none absolute bottom-24 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-amber-300/25 bg-black/80 px-4 py-3 text-center text-xs font-semibold text-amber-50 shadow-2xl backdrop-blur-xl">
          Todos consentiram. O serviço de reconhecimento de fala ainda não está configurado; a chamada continua normalmente.
        </div>
      ) : null}

      {isActive && captionsEnabled && captionLines.length > 0 ? (
        <div aria-live="polite" className="pointer-events-none absolute bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 space-y-2 text-center">
          {captionLines.map((line) => (
            <p key={line.id} className="inline-block max-w-full rounded-2xl bg-black/85 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-xl sm:text-base">
              <span className="mr-2 font-black text-blue-200">{line.speaker}</span>
              <span className={line.final ? '' : 'text-zinc-300'}>{line.text}</span>
            </p>
          ))}
        </div>
      ) : null}

      {showConsent ? (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="transcription-consent-title">
          <section className="w-full max-w-lg rounded-[2rem] border border-blue-300/25 bg-[linear-gradient(145deg,rgba(7,18,45,0.98),rgba(4,8,18,0.99))] p-6 shadow-2xl sm:p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-300/30 bg-blue-500/15 text-blue-100">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 id="transcription-consent-title" className="mt-5 text-2xl font-black text-white">Autorizar transcrição?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-200">
              Se você aceitar, apenas sua fala durante esta reunião poderá gerar legendas no idioma original. Somente trechos finais serão guardados por até 15 dias. Áudio bruto e legendas provisórias não serão armazenados.
            </p>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              Este consentimento é separado da gravação. Você pode recusar; nesse caso, a sessão de transcrição será encerrada e a chamada continuará.
            </p>
            {error ? <p role="alert" className="mt-4 text-sm font-semibold text-amber-100">{error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void postAction('/consent', { action: 'revoke' })}
                disabled={action === 'loading'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-sm font-bold text-zinc-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Não autorizo
              </button>
              <button
                type="button"
                onClick={() => void postAction('/consent', { action: 'accept' })}
                disabled={action === 'loading'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {action === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Aceitar transcrição
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
