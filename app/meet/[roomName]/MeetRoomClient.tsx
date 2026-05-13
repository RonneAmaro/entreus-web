'use client'

import {
  DisconnectButton,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useTracks,
} from '@livekit/components-react'
import '@livekit/components-styles'
import {
  Loader2,
  Link2,
  Mic,
  MonitorUp,
  PhoneOff,
  Share2,
  ShieldCheck,
  Video,
} from 'lucide-react'
import { Track } from 'livekit-client'
import { useEffect, useMemo, useState } from 'react'

type TokenResponse =
  | {
      ok: true
      token: string
      url: string
      roomName: string
      participantName: string
    }
  | {
      ok: false
      error: string
    }

type MeetRoomClientProps = {
  roomName: string
}

type JoinState = 'idle' | 'loading' | 'connected' | 'error'
type InviteFeedback = 'idle' | 'copied'

export function InviteActions({ compact = false }: { compact?: boolean }) {
  const [feedback, setFeedback] = useState<InviteFeedback>('idle')

  async function copyRoomLink() {
    if (typeof window === 'undefined') return

    await navigator.clipboard.writeText(window.location.href)
    setFeedback('copied')
    window.setTimeout(() => setFeedback('idle'), 2500)
  }

  async function shareRoom() {
    if (typeof window === 'undefined') return

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EntreUS Meet',
          text: 'Entre na minha sala do EntreUS Meet',
          url: window.location.href,
        })
        return
      } catch {
        return
      }
    }

    await copyRoomLink()
  }

  const baseClass = compact
    ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/35 px-3 py-2 text-xs font-semibold text-blue-50 transition hover:border-blue-400/60 hover:bg-blue-500/20'
    : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/35 px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-950/10 transition hover:border-blue-400/60 hover:bg-blue-500/20 hover:shadow-blue-500/15'

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copyRoomLink} className={baseClass}>
        <Link2 className="h-4 w-4 shrink-0" />
        {feedback === 'copied' ? 'Link copiado!' : 'Copiar link da sala'}
      </button>

      <button type="button" onClick={shareRoom} className={baseClass}>
        <Share2 className="h-4 w-4 shrink-0" />
        Compartilhar sala
      </button>
    </div>
  )
}

function PortugueseConference() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [screenShareEnabled, setScreenShareEnabled] = useState(false)

  const controlClass =
    'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/35 px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-950/10 transition hover:border-blue-400/60 hover:bg-blue-500/20 hover:shadow-blue-500/15 data-[lk-enabled=false]:border-zinc-700 data-[lk-enabled=false]:bg-black/80 data-[lk-enabled=false]:text-zinc-400'

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="min-h-0 flex-1 overflow-hidden bg-black">
        <GridLayout
          tracks={tracks}
          className="h-full p-2 sm:p-3 [&_.lk-participant-metadata]:hidden [&_.lk-participant-tile]:overflow-hidden [&_.lk-participant-tile]:rounded-[1.4rem] [&_.lk-participant-tile]:border [&_.lk-participant-tile]:border-blue-500/15 [&_.lk-participant-tile]:bg-zinc-950 [&_.lk-participant-tile]:shadow-xl"
        >
          <ParticipantTile />
        </GridLayout>
      </div>

      <RoomAudioRenderer />

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-blue-500/15 bg-blue-950/15 px-3 py-3 shadow-[0_-18px_40px_rgba(30,64,175,0.12)] backdrop-blur">
        <InviteActions compact />

        <TrackToggle
          source={Track.Source.Microphone}
          showIcon={false}
          className={controlClass}
          onChange={(enabled) => setMicrophoneEnabled(enabled)}
        >
          <Mic className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">
            {microphoneEnabled ? 'Desativar áudio' : 'Ativar áudio'}
          </span>
        </TrackToggle>

        <TrackToggle
          source={Track.Source.Camera}
          showIcon={false}
          className={controlClass}
          onChange={(enabled) => setCameraEnabled(enabled)}
        >
          <Video className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">
            {cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}
          </span>
        </TrackToggle>

        <TrackToggle
          source={Track.Source.ScreenShare}
          showIcon={false}
          className={controlClass}
          onChange={(enabled) => setScreenShareEnabled(enabled)}
        >
          <MonitorUp className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">
            {screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}
          </span>
        </TrackToggle>

        <DisconnectButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-600/90 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-950/20 transition hover:border-red-300/60 hover:bg-red-500 hover:shadow-red-500/20">
          <PhoneOff className="h-4 w-4 shrink-0" />
          <span>Sair</span>
        </DisconnectButton>
      </div>
    </div>
  )
}

export default function MeetRoomClient({ roomName }: MeetRoomClientProps) {
  const [participantName, setParticipantName] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [joinState, setJoinState] = useState<JoinState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setParticipantName(`Convidado-${Math.floor(1000 + Math.random() * 9000)}`)
  }, [])

  const canJoin = useMemo(() => {
    return roomName.trim().length > 0 && participantName.trim().length > 0
  }, [participantName, roomName])

  async function handleJoin() {
    if (!canJoin) {
      setError('Erro ao entrar na sala: informe um nome para continuar.')
      setJoinState('error')
      return
    }

    setJoinState('loading')
    setError(null)
    setToken(null)
    setServerUrl(null)

    try {
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName,
          participantName,
        }),
      })

      const data = (await response.json()) as TokenResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? 'Erro ao entrar na sala.' : data.error)
      }

      setToken(data.token)
      setServerUrl(data.url)
      setJoinState('connected')
    } catch (joinError) {
      setJoinState('error')
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'Erro ao entrar na sala. Tente novamente em instantes.',
      )
    }
  }

  if (joinState === 'connected' && token && serverUrl) {
    return (
      <div className="mx-auto flex h-[calc(100vh-146px)] max-h-[720px] min-h-[460px] w-full max-w-7xl flex-col overflow-hidden rounded-[1.7rem] border border-blue-500/20 bg-black shadow-2xl shadow-blue-950/30 ring-1 ring-blue-400/10 max-sm:h-[calc(100vh-176px)] max-sm:min-h-[520px]">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video
          data-lk-theme="default"
          className="h-full bg-black"
          onDisconnected={() => {
            setJoinState('idle')
            setToken(null)
            setServerUrl(null)
          }}
          onError={(roomError) => {
            setJoinState('error')
            setError(roomError.message || 'A chamada foi interrompida.')
            setToken(null)
            setServerUrl(null)
          }}
        >
          <PortugueseConference />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center">
      <section className="grid w-full overflow-hidden rounded-[1.9rem] border border-blue-500/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,64,175,0.16),rgba(2,6,23,0.96))] shadow-2xl shadow-blue-950/25 ring-1 ring-blue-400/10 lg:grid-cols-[1fr_0.95fr]">
        <div className="p-5 sm:p-8">
          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
              <ShieldCheck className="h-4 w-4 text-blue-300" />
              Pronto
            </div>
            <h2 className="text-3xl font-black tracking-normal text-white">
              Entrar na sala
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">
              Informe como você quer aparecer para os participantes e entre na
              chamada ao vivo.
            </p>
          </div>

          <label
            className="block text-sm font-semibold text-blue-100"
            htmlFor="participant-name"
          >
            Nome na chamada
          </label>
          <input
            id="participant-name"
            value={participantName}
            maxLength={80}
            onChange={(event) => setParticipantName(event.target.value)}
            className="mt-3 w-full rounded-full border border-blue-500/20 bg-black/55 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
            placeholder="Seu nome"
          />

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleJoin}
            disabled={!canJoin || joinState === 'loading'}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {joinState === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando na sala...
              </>
            ) : (
              'Entrar na sala'
            )}
          </button>

          <div className="mt-4">
            <InviteActions />
          </div>
        </div>

        <aside className="flex min-h-[300px] items-center justify-center border-t border-blue-500/15 bg-blue-950/10 p-5 lg:border-l lg:border-t-0 sm:p-8">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-blue-500/20 bg-black/70 text-blue-300 shadow-lg shadow-blue-500/10">
              <Video className="h-9 w-9" />
            </div>
            <p className="text-base font-semibold text-zinc-100">
              Sala Entre<span className="text-blue-400">US</span>
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              A chamada abre aqui depois da conexão segura.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
              <span className="max-w-full truncate rounded-full border border-blue-500/20 bg-black/40 px-3 py-1.5 text-blue-100/80">
                Sala: {roomName}
              </span>
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-100">
                {joinState === 'loading' ? 'Conectando...' : 'Pronto'}
              </span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
