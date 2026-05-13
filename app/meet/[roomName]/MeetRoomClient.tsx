'use client'

import { supabase } from '@/lib/supabase'
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
  Check,
  Clock3,
  Hand,
  Link2,
  Loader2,
  Mic,
  MonitorUp,
  PhoneOff,
  Share2,
  ShieldCheck,
  UserCheck,
  UserX,
  Video,
  X,
} from 'lucide-react'
import { Track } from 'livekit-client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

type RoomResponse =
  | {
      ok: true
      room: {
        roomName: string
        title: string | null
        ownerId: string
        isOwner: boolean
        plan: 'free' | 'vip'
        status: 'active' | 'expired' | 'ended'
        startsAt: string
        expiresAt: string
        maxDurationMinutes: number
        isRecordingEnabled: boolean
        isTranslationEnabled: boolean
      }
      membership: {
        id: string
        role: 'owner' | 'admin' | 'participant'
        status: 'pending' | 'approved' | 'rejected' | 'left'
        displayName?: string | null
        handRaised: boolean
      } | null
    }
  | {
      ok: false
      error: string
    }

type RequestsResponse =
  | {
      ok: true
      requests: {
        id: string
        userId: string
        displayName: string | null
        requestedAt: string
      }[]
    }
  | { ok: false; error: string }

type HandsResponse =
  | {
      ok: true
      hands: {
        userId: string
        displayName: string | null
        handRaisedAt: string | null
      }[]
    }
  | { ok: false; error: string }

type MeetRoomClientProps = {
  roomName: string
}

type JoinState = 'idle' | 'loading' | 'connected' | 'error'
type InviteFeedback = 'idle' | 'copied'

const MAX_DISPLAY_NAME_LENGTH = 60
const NAME_REQUIRED_MESSAGE = 'Informe seu nome para entrar na chamada.'

function normalizeDisplayName(value: string) {
  return value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
}

function isValidDisplayName(value: string) {
  return normalizeDisplayName(value).length >= 2
}

function formatSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

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

function PortugueseConference({
  handRaised,
  hands,
  onToggleHand,
}: {
  handRaised: boolean
  hands: Extract<HandsResponse, { ok: true }>['hands']
  onToggleHand: () => void
}) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [screenShareEnabled, setScreenShareEnabled] = useState(false)

  const controlClass =
    'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/35 px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-950/10 transition hover:border-blue-400/60 hover:bg-blue-500/20 hover:shadow-blue-500/15 data-[lk-enabled=false]:border-zinc-700 data-[lk-enabled=false]:bg-black/80 data-[lk-enabled=false]:text-zinc-400'
  const handButtonClass = handRaised
    ? 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-amber-300/45 bg-amber-300/15 px-4 py-2 text-sm font-semibold text-amber-50 shadow-lg shadow-amber-950/20 transition hover:border-amber-200/70 hover:bg-amber-300/25'
    : 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-blue-400/35 bg-black px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-950/20 transition hover:border-blue-300/70 hover:bg-blue-600/20 hover:shadow-blue-500/15'

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <GridLayout
          tracks={tracks}
          className="h-full p-2 sm:p-3 [&_.lk-participant-metadata]:hidden [&_.lk-participant-tile]:overflow-hidden [&_.lk-participant-tile]:rounded-[1.4rem] [&_.lk-participant-tile]:border [&_.lk-participant-tile]:border-blue-500/15 [&_.lk-participant-tile]:bg-zinc-950 [&_.lk-participant-tile]:shadow-xl"
        >
          <ParticipantTile />
        </GridLayout>

        <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex justify-end">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-blue-400/25 bg-black/75 p-3 shadow-2xl shadow-blue-950/30 backdrop-blur-md">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
              <Hand className="h-3.5 w-3.5 text-blue-300" />
              Mãos levantadas
            </div>
            {hands.length === 0 ? (
              <p className="text-sm text-zinc-400">Ninguém levantou a mão.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {hands.map((item) => (
                  <span key={item.userId} className="rounded-full border border-blue-300/35 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-50">
                    ✋ {item.displayName || 'Participante'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <RoomAudioRenderer />

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-blue-500/15 bg-blue-950/15 px-3 py-3 shadow-[0_-18px_40px_rgba(30,64,175,0.12)] backdrop-blur">
        <InviteActions compact />

        <button type="button" onClick={onToggleHand} className={handButtonClass}>
          <Hand className="h-4 w-4 shrink-0" />
          <span>{handRaised ? 'Baixar mão' : 'Levantar mão'}</span>
        </button>

        <TrackToggle source={Track.Source.Microphone} showIcon={false} className={controlClass} onChange={setMicrophoneEnabled}>
          <Mic className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{microphoneEnabled ? 'Desativar áudio' : 'Ativar áudio'}</span>
        </TrackToggle>

        <TrackToggle source={Track.Source.Camera} showIcon={false} className={controlClass} onChange={setCameraEnabled}>
          <Video className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}</span>
        </TrackToggle>

        <TrackToggle source={Track.Source.ScreenShare} showIcon={false} className={controlClass} onChange={setScreenShareEnabled}>
          <MonitorUp className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}</span>
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
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [participantName, setParticipantName] = useState('')
  const [roomData, setRoomData] = useState<Extract<RoomResponse, { ok: true }>['room'] | null>(null)
  const [membership, setMembership] = useState<Extract<RoomResponse, { ok: true }>['membership']>(null)
  const [pendingRequests, setPendingRequests] = useState<Extract<RequestsResponse, { ok: true }>['requests']>([])
  const [hands, setHands] = useState<Extract<HandsResponse, { ok: true }>['hands']>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [joinState, setJoinState] = useState<JoinState>('idle')
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const isModerator = membership?.status === 'approved' && (membership.role === 'owner' || membership.role === 'admin')
  const isApproved = membership?.status === 'approved'
  const expired = roomData?.status === 'expired' || roomData?.status === 'ended' || secondsLeft === 0
  const inCall = joinState === 'connected' && Boolean(accessToken && serverUrl)
  const normalizedParticipantName = normalizeDisplayName(participantName)
  const participantNameIsValid = isValidDisplayName(participantName)

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return null
    return { Authorization: `Bearer ${session.access_token}` }
  }, [])

  const loadRoom = useCallback(async () => {
    const headers = await authHeaders()

    if (!headers) {
      setLoading(false)
      setRoomData(null)
      setMembership(null)
      return
    }

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}`, { headers })
    const data = (await response.json()) as RoomResponse

    setLoading(false)

    if (!response.ok || !data.ok) {
      setError(data.ok ? 'Não foi possível carregar a sala.' : data.error)
      setRoomData(null)
      return
    }

    setError(null)
    setRoomData(data.room)
    setMembership(data.membership)
    if (data.membership?.displayName && isValidDisplayName(data.membership.displayName)) {
      setParticipantName(normalizeDisplayName(data.membership.displayName))
    }
  }, [authHeaders, roomName])

  const loadRequests = useCallback(async () => {
    if (!isModerator) return
    const headers = await authHeaders()
    if (!headers) return

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}/requests`, { headers })
    const data = (await response.json()) as RequestsResponse
    if (response.ok && data.ok) setPendingRequests(data.requests)
  }, [authHeaders, isModerator, roomName])

  const loadHands = useCallback(async () => {
    if (!inCall) return
    const headers = await authHeaders()
    if (!headers) return

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}/hands`, { headers })
    const data = (await response.json()) as HandsResponse
    if (response.ok && data.ok) setHands(data.hands)
  }, [authHeaders, inCall, roomName])

  useEffect(() => {
    setParticipantName(`Convidado-${Math.floor(1000 + Math.random() * 9000)}`)
    void loadRoom()
  }, [loadRoom])

  useEffect(() => {
    let active = true

    async function loadSuggestedDisplayName() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active || !user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      const profileData = profile as {
        username?: string | null
        display_name?: string | null
      } | null
      const metadata = user.user_metadata as { full_name?: string; name?: string; username?: string } | null
      const emailName = typeof user.email === 'string' ? user.email.split('@')[0] : ''
      const suggestedName =
        metadata?.full_name ||
        metadata?.name ||
        profileData?.display_name ||
        metadata?.username ||
        profileData?.username ||
        emailName

      if (isValidDisplayName(suggestedName || '')) {
        setParticipantName((current) =>
          current && !current.startsWith('Convidado-')
            ? current
            : normalizeDisplayName(suggestedName || ''),
        )
      }
    }

    void loadSuggestedDisplayName()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!roomData?.expiresAt) return

    function updateRemaining() {
      const remaining = Math.max(0, Math.floor((Date.parse(roomData!.expiresAt) - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) setJoinState((current) => (current === 'connected' ? current : 'idle'))
    }

    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [roomData])

  useEffect(() => {
    if (membership?.status !== 'pending' && !isModerator) return
    const timer = window.setInterval(() => void loadRoom(), 5000)
    return () => window.clearInterval(timer)
  }, [isModerator, loadRoom, membership?.status])

  useEffect(() => {
    if (!isModerator) return
    void loadRequests()
    const timer = window.setInterval(() => void loadRequests(), 5000)
    return () => window.clearInterval(timer)
  }, [isModerator, loadRequests])

  useEffect(() => {
    if (!inCall) {
      setHands([])
      return
    }
    void loadHands()
    const timer = window.setInterval(() => void loadHands(), 5000)
    return () => window.clearInterval(timer)
  }, [inCall, loadHands])

  const canJoin = useMemo(() => {
    return roomName.trim().length > 0 && participantNameIsValid && isApproved && !expired
  }, [expired, isApproved, participantNameIsValid, roomName])

  async function requestAccess() {
    if (!participantNameIsValid) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }

    setRequesting(true)
    setError(null)
    const headers = await authHeaders()

    if (!headers) {
      setRequesting(false)
      return
    }

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}/request-access`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: normalizedParticipantName }),
    })
    const data = (await response.json()) as { ok: boolean; status?: string; displayName?: string; error?: string }

    setRequesting(false)

    if (!response.ok || !data.ok) {
      setError(data.error || 'Não foi possível pedir entrada.')
      return
    }

    if (data.displayName) setParticipantName(data.displayName)
    await loadRoom()
  }

  async function moderate(memberId: string, action: 'approve' | 'reject') {
    const headers = await authHeaders()
    if (!headers) return

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}/requests/${memberId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })

    if (response.ok) {
      await loadRequests()
    }
  }

  async function toggleHand() {
    const headers = await authHeaders()
    if (!headers || !membership || !inCall) return

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}/hand`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: !membership.handRaised }),
    })
    const data = (await response.json()) as { ok: boolean; handRaised?: boolean }

    if (response.ok && data.ok) {
      setMembership({ ...membership, handRaised: Boolean(data.handRaised) })
      await loadHands()
    }
  }

  async function handleJoin() {
    if (!participantNameIsValid) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }

    if (!canJoin) {
      setError(expired ? 'O tempo gratuito desta sala acabou.' : 'Você ainda não tem autorização para entrar nesta sala.')
      return
    }

    setJoinState('loading')
    setError(null)
    setAccessToken(null)
    setServerUrl(null)

    const headers = await authHeaders()
    if (!headers) {
      setJoinState('error')
      setError('Entre na sua conta para continuar.')
      return
    }

    try {
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomName, participantName: normalizedParticipantName }),
      })
      const data = (await response.json()) as TokenResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? 'Erro ao entrar na sala.' : data.error)
      }

      setAccessToken(data.token)
      setServerUrl(data.url)
      setJoinState('connected')
    } catch (joinError) {
      setJoinState('error')
      setError(joinError instanceof Error ? joinError.message : 'Erro ao entrar na sala.')
    }
  }

  if (inCall && accessToken && serverUrl) {
    return (
      <div className="mx-auto flex h-[calc(100vh-146px)] max-h-[720px] min-h-[460px] w-full max-w-7xl flex-col overflow-hidden rounded-[1.7rem] border border-blue-500/20 bg-black shadow-2xl shadow-blue-950/30 ring-1 ring-blue-400/10 max-sm:h-[calc(100vh-176px)] max-sm:min-h-[520px]">
        <LiveKitRoom
          token={accessToken}
          serverUrl={serverUrl}
          connect
          audio
          video
          data-lk-theme="default"
          className="h-full bg-black"
          onDisconnected={() => {
            setJoinState('idle')
            setAccessToken(null)
            setServerUrl(null)
          }}
          onError={(roomError) => {
            setJoinState('error')
            setError(roomError.message || 'A chamada foi interrompida.')
            setAccessToken(null)
            setServerUrl(null)
          }}
        >
          <PortugueseConference handRaised={Boolean(membership?.handRaised)} hands={hands} onToggleHand={toggleHand} />
        </LiveKitRoom>
      </div>
    )
  }

  const statusContent = (() => {
    if (loading) return { title: 'Carregando sala...', description: 'Verificando autorização e tempo gratuito.', icon: Loader2 }
    if (!roomData && error === 'Sala não encontrada.') return { title: 'Sala não encontrada.', description: 'Confira o link recebido e tente novamente.', icon: X }
    if (!roomData) return { title: 'Entre na sua conta para participar.', description: 'O acesso ao EntreUS Meet exige login.', icon: ShieldCheck }
    if (expired) return { title: 'Esta sala gratuita expirou.', description: 'O tempo gratuito desta sala acabou.', icon: Clock3 }
    if (!membership) return { title: 'Pedir entrada', description: 'O administrador precisa aprovar você antes da chamada.', icon: UserCheck }
    if (membership.status === 'pending') return { title: 'Aguardando aprovação', description: 'Aguardando aprovação do administrador da sala.', icon: Clock3 }
    if (membership.status === 'rejected') return { title: 'Entrada recusada', description: 'Sua entrada foi recusada. Você pode pedir novamente.', icon: UserX }
    return { title: isModerator ? 'Painel do administrador' : 'Pronto para entrar', description: 'Você foi aprovado para participar da chamada.', icon: ShieldCheck }
  })()
  const StatusIcon = statusContent.icon

  return (
    <div className="flex flex-1 items-center">
      <section className="grid w-full overflow-hidden rounded-[1.9rem] border border-blue-500/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,64,175,0.16),rgba(2,6,23,0.96))] shadow-2xl shadow-blue-950/25 ring-1 ring-blue-400/10 lg:grid-cols-[1fr_0.95fr]">
        <div className="p-5 sm:p-8">
          <div className="mb-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
              <StatusIcon className={`h-4 w-4 text-blue-300 ${loading ? 'animate-spin' : ''}`} />
              EntreUS Meet
            </div>
            <h2 className="text-3xl font-black tracking-normal text-white">{statusContent.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">{statusContent.description}</p>
          </div>

          {roomData ? (
            <div className="mb-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-blue-500/20 bg-black/40 px-3 py-1.5 text-blue-100">
                Tempo restante: {secondsLeft === null ? '--:--' : formatSeconds(secondsLeft)}
              </span>
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-100">
                Plano gratuito: {roomData.maxDurationMinutes} minutos por sala.
              </span>
            </div>
          ) : null}

          {!roomData && !loading ? (
            <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500">
              Entrar na conta
            </Link>
          ) : null}

          {roomData && !expired ? (
            <div className="mb-5">
              <label className="block text-sm font-semibold text-blue-100" htmlFor="participant-name">
                Nome na chamada
              </label>
              <input
                id="participant-name"
                value={participantName}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                onChange={(event) => setParticipantName(event.target.value)}
                aria-invalid={!participantNameIsValid}
                className="mt-3 w-full rounded-full border border-blue-500/20 bg-black/55 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 aria-[invalid=true]:border-red-400/70 aria-[invalid=true]:focus:ring-red-500/10"
                placeholder="Seu nome"
              />
              {!participantNameIsValid ? (
                <p className="mt-2 text-sm font-medium text-red-200">{NAME_REQUIRED_MESSAGE}</p>
              ) : null}
            </div>
          ) : null}

          {roomData && !membership && !expired ? (
            <button type="button" onClick={requestAccess} disabled={requesting || !participantNameIsValid} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Pedir entrada
            </button>
          ) : null}

          {roomData && membership?.status === 'rejected' && !expired ? (
            <button type="button" onClick={requestAccess} disabled={requesting || !participantNameIsValid} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Pedir novamente
            </button>
          ) : null}

          {isApproved ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={!canJoin || joinState === 'loading'}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joinState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {joinState === 'loading' ? 'Entrando...' : 'Entrar na sala'}
                </button>
              </div>
            </>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-5">
            <InviteActions />
          </div>

          <p className="mt-5 max-w-xl rounded-2xl border border-blue-500/15 bg-black/25 px-4 py-3 text-xs leading-5 text-blue-100/70">
            VIP em breve: mais tempo, gravação de reunião, tradução simultânea com legendas e recursos avançados de moderação.
          </p>
        </div>

        <aside className="border-t border-blue-500/15 bg-blue-950/10 p-5 lg:border-l lg:border-t-0 sm:p-8">
          {isModerator ? (
            <div className="space-y-5">
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                  <UserCheck className="h-4 w-4 text-blue-300" />
                  Solicitações pendentes
                </h3>
                <div className="space-y-2">
                  {pendingRequests.length === 0 ? (
                    <p className="rounded-2xl border border-blue-500/15 bg-black/30 px-4 py-3 text-sm text-zinc-400">Nenhum pedido pendente.</p>
                  ) : (
                    pendingRequests.map((request) => (
                      <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-blue-500/15 bg-black/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-semibold text-white">{request.displayName || 'Usuário EntreUS'}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => moderate(request.id, 'approve')} className="inline-flex h-9 items-center gap-1 rounded-full bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-500">
                            <Check className="h-3.5 w-3.5" />
                            Aceitar
                          </button>
                          <button type="button" onClick={() => moderate(request.id, 'reject')} className="inline-flex h-9 items-center gap-1 rounded-full border border-red-400/30 bg-red-600/80 px-3 text-xs font-bold text-white transition hover:bg-red-500">
                            <X className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

            </div>
          ) : (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="w-full max-w-sm text-center">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-blue-500/20 bg-black/70 text-blue-300 shadow-lg shadow-blue-500/10">
                  <Video className="h-9 w-9" />
                </div>
                <p className="text-base font-semibold text-zinc-100">Sala Entre<span className="text-blue-400">US</span></p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">A chamada abre aqui depois da aprovação.</p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
