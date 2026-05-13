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
  Mic,
  MonitorUp,
  PhoneOff,
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

function PortugueseConference() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [screenShareEnabled, setScreenShareEnabled] = useState(false)

  const controlClass =
    'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 data-[lk-enabled=false]:bg-black data-[lk-enabled=false]:text-zinc-400'

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-hidden bg-black">
        <GridLayout
          tracks={tracks}
          className="h-full p-2 sm:p-3 [&_.lk-participant-metadata]:hidden [&_.lk-participant-tile]:overflow-hidden [&_.lk-participant-tile]:rounded-[1.4rem] [&_.lk-participant-tile]:border [&_.lk-participant-tile]:border-zinc-800 [&_.lk-participant-tile]:bg-zinc-950"
        >
          <ParticipantTile />
        </GridLayout>
      </div>

      <RoomAudioRenderer />

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-zinc-800 bg-zinc-950/95 px-3 py-3">
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

        <DisconnectButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500">
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
      <div className="mx-auto flex h-[calc(100vh-132px)] max-h-[720px] min-h-[460px] w-full max-w-7xl flex-col overflow-hidden rounded-[1.7rem] border border-zinc-800 bg-zinc-950 shadow-2xl ring-1 ring-white/5 max-sm:h-[calc(100vh-156px)] max-sm:min-h-[520px]">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video
          data-lk-theme="default"
          className="h-full bg-zinc-950"
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
    <div className="grid flex-1 items-center gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[1.7rem] border border-zinc-800 bg-zinc-950/95 p-5 shadow-2xl ring-1 ring-white/5 sm:p-8">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-blue-300" />
            Pronto
          </div>
          <h2 className="text-3xl font-black tracking-normal text-white">
            Entrar na sala
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Informe como você quer aparecer para os participantes e entre na
            chamada ao vivo.
          </p>
        </div>

        <label
          className="block text-sm font-semibold text-zinc-200"
          htmlFor="participant-name"
        >
          Nome na chamada
        </label>
        <input
          id="participant-name"
          value={participantName}
          maxLength={80}
          onChange={(event) => setParticipantName(event.target.value)}
          className="mt-3 w-full rounded-full border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
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
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
      </section>

      <aside className="rounded-[1.7rem] border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl ring-1 ring-white/5 sm:p-5">
        <div className="aspect-video overflow-hidden rounded-[1.35rem] border border-zinc-800 bg-black p-3">
          <div className="flex h-full items-center justify-center rounded-2xl bg-zinc-900">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700 bg-black">
                <Video className="h-7 w-7 text-blue-300" />
              </div>
              <p className="text-sm font-semibold text-zinc-100">
                Sala EntreUS
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                A chamada abre aqui depois da conexão segura.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0 rounded-2xl border border-zinc-800 bg-black px-4 py-3">
            <span className="block text-xs text-zinc-500">Sala</span>
            <strong className="mt-1 block truncate font-semibold text-zinc-200">
              {roomName}
            </strong>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3">
            <span className="block text-xs text-zinc-500">Status</span>
            <strong className="mt-1 block font-semibold text-zinc-200">
              {joinState === 'loading' ? 'Conectando...' : 'Pronto'}
            </strong>
          </div>
        </div>
      </aside>
    </div>
  )
}
