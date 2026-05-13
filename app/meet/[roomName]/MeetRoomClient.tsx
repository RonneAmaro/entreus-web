'use client'

import {
  LiveKitRoom,
  VideoConference,
} from '@livekit/components-react'
import '@livekit/components-styles'
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
      setError('Informe um nome para entrar na sala.')
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
        throw new Error(data.ok ? 'Falha ao entrar na sala.' : data.error)
      }

      setToken(data.token)
      setServerUrl(data.url)
      setJoinState('connected')
    } catch (joinError) {
      setJoinState('error')
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'Não foi possível entrar na sala agora.',
      )
    }
  }

  if (joinState === 'connected' && token && serverUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video
          data-lk-theme="default"
          className="min-h-[72vh] bg-zinc-950"
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
          <VideoConference />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="grid flex-1 items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8">
        <div className="mb-8">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
            Chamada ao vivo
          </p>
          <h2 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
            Entrar na sala
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Esta tela valida a base do LiveKit no EntreUS. O nome abaixo é
            provisório até conectarmos com o usuário logado.
          </p>
        </div>

        <label className="block text-sm font-medium text-zinc-300" htmlFor="participant-name">
          Nome na chamada
        </label>
        <input
          id="participant-name"
          value={participantName}
          maxLength={80}
          onChange={(event) => setParticipantName(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500"
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
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {joinState === 'loading' ? 'Entrando...' : 'Entrar na sala'}
        </button>
      </section>

      <aside className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8">
        <div className="aspect-video rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="flex h-full items-center justify-center rounded-xl bg-zinc-900">
            <div className="text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-zinc-700 bg-zinc-950" />
              <p className="text-sm font-medium text-zinc-200">
                Preview da sala
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                A chamada abre aqui após gerar o token seguro.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3">
            <span className="block text-xs text-zinc-500">Sala</span>
            <strong className="mt-1 block break-all font-medium text-zinc-200">
              {roomName}
            </strong>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3">
            <span className="block text-xs text-zinc-500">Status</span>
            <strong className="mt-1 block font-medium text-zinc-200">
              {joinState === 'loading' ? 'Conectando' : 'Pronto'}
            </strong>
          </div>
        </div>
      </aside>
    </div>
  )
}
