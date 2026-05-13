'use client'

import { supabase } from '@/lib/supabase'
import {
  DisconnectButton,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useDataChannel,
  useParticipants,
  useTracks,
} from '@livekit/components-react'
import '@livekit/components-styles'
import {
  Check,
  Clock3,
  Copy,
  Hand,
  LayoutGrid,
  Link2,
  Loader2,
  Maximize,
  MessageSquare,
  Mic,
  MoreHorizontal,
  MonitorUp,
  PhoneOff,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smile,
  UserCheck,
  Users,
  UserX,
  Video,
  X,
} from 'lucide-react'
import { Track } from 'livekit-client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
type SidePanel = 'chat' | 'participants' | null

type MeetDataMessage =
  | {
      type: 'chat'
      id: string
      text: string
      senderName: string
      sentAt: number
    }
  | {
      type: 'reaction'
      id: string
      emoji: string
      senderName: string
      sentAt: number
    }

type ChatMessage = Extract<MeetDataMessage, { type: 'chat' }>
type ReactionMessage = Extract<MeetDataMessage, { type: 'reaction' }>

const MAX_DISPLAY_NAME_LENGTH = 60
const MAX_CHAT_MESSAGE_LENGTH = 500
const NAME_REQUIRED_MESSAGE = 'Informe seu nome para entrar na chamada.'
const MEET_DATA_TOPIC = 'entreus.meet'
const QUICK_REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉']

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

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function parseMeetDataMessage(payload: Uint8Array): MeetDataMessage | null {
  try {
    const decoded = new TextDecoder().decode(payload)
    const data = JSON.parse(decoded) as Partial<MeetDataMessage>

    if (data.type === 'chat' && typeof data.text === 'string') {
      return {
        type: 'chat',
        id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
        text: data.text.slice(0, MAX_CHAT_MESSAGE_LENGTH),
        senderName: typeof data.senderName === 'string' && data.senderName.trim() ? data.senderName : 'Participante',
        sentAt: typeof data.sentAt === 'number' ? data.sentAt : Date.now(),
      }
    }

    if (data.type === 'reaction' && typeof data.emoji === 'string') {
      return {
        type: 'reaction',
        id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
        emoji: data.emoji,
        senderName: typeof data.senderName === 'string' && data.senderName.trim() ? data.senderName : 'Participante',
        sentAt: typeof data.sentAt === 'number' ? data.sentAt : Date.now(),
      }
    }
  } catch {
    return null
  }

  return null
}

function encodeMeetDataMessage(message: MeetDataMessage) {
  return new TextEncoder().encode(JSON.stringify(message))
}

function renderMessageText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)

  return parts.map((part, index) => {
    if (!part) return null

    if (/^https?:\/\//.test(part)) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-blue-300 underline decoration-blue-300/50 underline-offset-2 hover:text-blue-200">
          {part}
        </a>
      )
    }

    return <span key={`${part}-${index}`}>{part}</span>
  })
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
  isModerator,
  participantName,
  roomName,
  onToggleHand,
}: {
  handRaised: boolean
  hands: Extract<HandsResponse, { ok: true }>['hands']
  isModerator: boolean
  participantName: string
  roomName: string
  onToggleHand: () => void
}) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const participants = useParticipants()
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [screenShareEnabled, setScreenShareEnabled] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanel>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatUnread, setChatUnread] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [floatingReactions, setFloatingReactions] = useState<ReactionMessage[]>([])
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [compactLayout, setCompactLayout] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback>('idle')
  const [handNotice, setHandNotice] = useState<string | null>(null)
  const seenHandsRef = useRef<Set<string>>(new Set())
  const localDisplayName = normalizeDisplayName(participantName) || 'Participante'

  const { send } = useDataChannel(MEET_DATA_TOPIC, (message) => {
    const data = parseMeetDataMessage(message.payload)
    if (!data) return

    if (data.type === 'chat') {
      setChatMessages((current) => [...current, data].slice(-80))
      if (sidePanel !== 'chat') setChatUnread(true)
      return
    }

    setFloatingReactions((current) => [...current, data].slice(-8))
  })

  useEffect(() => {
    if (sidePanel === 'chat') setChatUnread(false)
  }, [sidePanel])

  useEffect(() => {
    if (floatingReactions.length === 0) return

    const timer = window.setTimeout(() => {
      setFloatingReactions((current) => current.slice(1))
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [floatingReactions])

  useEffect(() => {
    if (hands.length === 0) {
      seenHandsRef.current = new Set()
      setHandNotice(null)
      return
    }

    const previous = seenHandsRef.current
    const next = new Set(hands.map((item) => item.userId))
    const newHand = hands.find((item) => !previous.has(item.userId))

    seenHandsRef.current = next

    if (!newHand || previous.size === 0) return

    setHandNotice(`✋ ${newHand.displayName || 'Participante'} levantou a mão`)
    const timer = window.setTimeout(() => setHandNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [hands])

  async function copyRoomLink() {
    if (typeof window === 'undefined') return

    await navigator.clipboard.writeText(window.location.href)
    setInviteFeedback('copied')
    window.setTimeout(() => setInviteFeedback('idle'), 2400)
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

  async function sendChatMessage() {
    const text = chatDraft.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH)
    if (!text) return

    const message: ChatMessage = {
      type: 'chat',
      id: crypto.randomUUID(),
      text,
      senderName: localDisplayName,
      sentAt: Date.now(),
    }

    setChatMessages((current) => [...current, message].slice(-80))
    setChatDraft('')
    await send(encodeMeetDataMessage(message), { reliable: true, topic: MEET_DATA_TOPIC })
  }

  async function sendReaction(emoji: string) {
    const reaction: ReactionMessage = {
      type: 'reaction',
      id: crypto.randomUUID(),
      emoji,
      senderName: localDisplayName,
      sentAt: Date.now(),
    }

    setFloatingReactions((current) => [...current, reaction].slice(-8))
    setShowReactions(false)
    await send(encodeMeetDataMessage(reaction), { reliable: false, topic: MEET_DATA_TOPIC })
  }

  const openPanel = (panel: Exclude<SidePanel, null>) => {
    setSidePanel((current) => (current === panel ? null : panel))
    setShowMoreMenu(false)
  }

  const iconButtonClass =
    'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-zinc-950/90 text-blue-50 shadow-lg shadow-black/25 transition hover:border-blue-300/50 hover:bg-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-400/35 data-[lk-enabled=false]:border-zinc-700 data-[lk-enabled=false]:bg-zinc-950 data-[lk-enabled=false]:text-zinc-500 sm:h-12 sm:w-12'
  const activeIconButtonClass =
    'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-300/50 bg-blue-600/25 text-blue-50 shadow-lg shadow-blue-950/30 transition hover:bg-blue-600/35 focus:outline-none focus:ring-2 focus:ring-blue-400/35 sm:h-12 sm:w-12'
  const handButtonClass = handRaised
    ? 'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/55 bg-amber-300/20 text-amber-50 shadow-lg shadow-amber-950/20 transition hover:bg-amber-300/30 focus:outline-none focus:ring-2 focus:ring-amber-300/30 sm:h-12 sm:w-12'
    : iconButtonClass
  const visibleParticipants = participants.map((participant) => ({
    id: participant.identity,
    name: participant.name || (participant.isLocal ? localDisplayName : 'Participante'),
    isLocal: participant.isLocal,
  }))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#0b1d3b_0%,#020617_42%,#000_100%)] text-white">
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-400/10 bg-black/45 px-3 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-sm font-black shadow-lg shadow-blue-950/30">
            US
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-normal">
              Entre<span className="text-blue-400">US</span> Meet
            </p>
            <p className="truncate text-xs text-zinc-400">Sala {roomName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={copyRoomLink} className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-blue-400/20 bg-zinc-950/70 px-3 text-xs font-semibold text-blue-50 transition hover:border-blue-300/50 hover:bg-blue-600/20">
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{inviteFeedback === 'copied' ? 'Copiado' : 'Copiar link'}</span>
          </button>
          <button type="button" onClick={shareRoom} className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-blue-400/20 bg-zinc-950/70 px-3 text-xs font-semibold text-blue-50 transition hover:border-blue-300/50 hover:bg-blue-600/20">
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`relative min-w-0 flex-1 transition-[padding] duration-300 ${sidePanel ? 'lg:pr-0' : ''}`}>
          <GridLayout
            tracks={tracks}
            className={`h-full p-2 pb-28 sm:p-4 sm:pb-28 [&_.lk-participant-metadata]:hidden [&_.lk-participant-tile]:overflow-hidden [&_.lk-participant-tile]:rounded-2xl [&_.lk-participant-tile]:border [&_.lk-participant-tile]:border-blue-400/15 [&_.lk-participant-tile]:bg-zinc-950 [&_.lk-participant-tile]:shadow-2xl ${compactLayout ? '[&_.lk-grid-layout]:gap-2' : ''}`}
          >
            <ParticipantTile />
          </GridLayout>

          <RoomAudioRenderer />

          {handNotice ? (
            <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 rounded-full border border-amber-300/40 bg-black/75 px-4 py-2 text-sm font-semibold text-amber-50 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {handNotice}
            </div>
          ) : null}

          {hands.length > 0 ? (
            <div className="absolute left-3 top-4 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 sm:left-5 sm:top-5">
              {hands.map((item) => (
                <span key={item.userId} className="rounded-full border border-amber-300/35 bg-black/70 px-3 py-1.5 text-xs font-semibold text-amber-50 shadow-lg shadow-black/30 backdrop-blur-xl">
                  ✋ {item.displayName || 'Participante'}
                </span>
              ))}
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
            <div className="relative h-28 w-full max-w-3xl">
              {floatingReactions.map((reaction, index) => (
                <div
                  key={reaction.id}
                  className="absolute animate-bounce rounded-full border border-blue-300/20 bg-black/60 px-3 py-2 text-3xl shadow-2xl shadow-black/35 backdrop-blur-xl"
                  style={{ left: `${18 + ((index * 13) % 62)}%`, top: `${(index % 3) * 18}px` }}
                  title={`${reaction.senderName} reagiu`}
                >
                  {reaction.emoji}
                </div>
              ))}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
            <div className="relative flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-blue-400/20 bg-black/80 p-2 shadow-2xl shadow-black/45 backdrop-blur-2xl sm:gap-2">
              <TrackToggle source={Track.Source.Microphone} showIcon={false} className={iconButtonClass} onChange={setMicrophoneEnabled} title={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'}>
                <Mic className="h-5 w-5" />
              </TrackToggle>
              <TrackToggle source={Track.Source.Camera} showIcon={false} className={iconButtonClass} onChange={setCameraEnabled} title={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}>
                <Video className="h-5 w-5" />
              </TrackToggle>
              <TrackToggle source={Track.Source.ScreenShare} showIcon={false} className={iconButtonClass} onChange={setScreenShareEnabled} title={screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}>
                <MonitorUp className="h-5 w-5" />
              </TrackToggle>

              <button type="button" onClick={() => openPanel('chat')} className={sidePanel === 'chat' ? activeIconButtonClass : iconButtonClass} title="Bate-papo">
                <MessageSquare className="h-5 w-5" />
                {chatUnread ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blue-300 ring-2 ring-black" /> : null}
              </button>
              <button type="button" onClick={() => openPanel('participants')} className={sidePanel === 'participants' ? activeIconButtonClass : iconButtonClass} title="Participantes">
                <Users className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">{visibleParticipants.length}</span>
              </button>

              <div className="relative">
                <button type="button" onClick={() => setShowReactions((current) => !current)} className={showReactions ? activeIconButtonClass : iconButtonClass} title="Reações">
                  <Smile className="h-5 w-5" />
                </button>
                {showReactions ? (
                  <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-blue-400/20 bg-black/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    {QUICK_REACTIONS.map((reaction) => (
                      <button key={reaction} type="button" onClick={() => void sendReaction(reaction)} className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-blue-500/20">
                        {reaction}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button type="button" onClick={onToggleHand} className={handButtonClass} title={handRaised ? 'Baixar mão' : 'Levantar mão'}>
                <Hand className="h-5 w-5" />
              </button>

              <div className="relative">
                <button type="button" onClick={() => setShowMoreMenu((current) => !current)} className={showMoreMenu ? activeIconButtonClass : iconButtonClass} title="Mais opções">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {showMoreMenu ? (
                  <div className="absolute bottom-14 right-0 w-64 overflow-hidden rounded-2xl border border-blue-400/20 bg-black/90 p-2 text-sm shadow-2xl shadow-black/45 backdrop-blur-xl">
                    <button type="button" onClick={copyRoomLink} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <Copy className="h-4 w-4 text-blue-300" />
                      Copiar link da sala
                    </button>
                    <button type="button" onClick={shareRoom} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <Share2 className="h-4 w-4 text-blue-300" />
                      Compartilhar sala
                    </button>
                    <button type="button" onClick={() => openPanel('participants')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <Users className="h-4 w-4 text-blue-300" />
                      Ver participantes
                    </button>
                    <button type="button" onClick={() => openPanel('chat')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <MessageSquare className="h-4 w-4 text-blue-300" />
                      Abrir chat
                    </button>
                    <button type="button" onClick={() => setCompactLayout((current) => !current)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <LayoutGrid className="h-4 w-4 text-blue-300" />
                      Alternar layout
                    </button>
                    <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-100 transition hover:bg-blue-500/15">
                      <Maximize className="h-4 w-4 text-blue-300" />
                      Tela cheia
                    </button>
                    <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2 text-left text-zinc-500">
                      <Settings className="h-4 w-4" />
                      Configurações em breve
                    </button>
                  </div>
                ) : null}
              </div>

              <DisconnectButton className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-full border border-red-400/35 bg-red-600/90 text-white shadow-lg shadow-red-950/25 transition hover:border-red-300/60 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300/30 sm:h-12 sm:w-14" title="Sair">
                <PhoneOff className="h-5 w-5" />
              </DisconnectButton>
            </div>
          </div>
        </main>

        {sidePanel ? (
          <aside className="z-20 flex w-full max-w-sm shrink-0 flex-col border-l border-blue-400/15 bg-black/82 shadow-2xl shadow-black/40 backdrop-blur-2xl max-lg:absolute max-lg:bottom-0 max-lg:right-0 max-lg:top-0 max-lg:max-w-full sm:max-w-md lg:relative">
            <div className="flex items-start justify-between gap-3 border-b border-blue-400/10 p-4">
              <div>
                <h2 className="text-base font-black text-white">
                  {sidePanel === 'chat' ? 'Chat da reunião' : 'Participantes'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-zinc-400">
                  {sidePanel === 'chat'
                    ? 'Converse com os participantes e compartilhe links.'
                    : `${visibleParticipants.length} pessoa${visibleParticipants.length === 1 ? '' : 's'} conectada${visibleParticipants.length === 1 ? '' : 's'}.`}
                </p>
              </div>
              <button type="button" onClick={() => setSidePanel(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-400/15 bg-zinc-950 text-zinc-200 transition hover:bg-blue-500/15" title="Fechar painel">
                <X className="h-4 w-4" />
              </button>
            </div>

            {sidePanel === 'chat' ? (
              <>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {chatMessages.length === 0 ? (
                    <div className="rounded-2xl border border-blue-400/15 bg-blue-500/10 p-4 text-sm leading-6 text-zinc-300">
                      Nenhuma mensagem ainda. O chat usa o canal de dados da chamada e não fica salvo no banco.
                    </div>
                  ) : (
                    chatMessages.map((message) => (
                      <div key={message.id} className="rounded-2xl border border-blue-400/10 bg-zinc-950/75 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-blue-100">{message.senderName}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{formatTime(message.sentAt)}</span>
                        </div>
                        <p className="break-words text-sm leading-6 text-zinc-200">{renderMessageText(message.text)}</p>
                      </div>
                    ))
                  )}
                </div>
                <form
                  className="border-t border-blue-400/10 p-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void sendChatMessage()
                  }}
                >
                  <div className="flex items-end gap-2 rounded-2xl border border-blue-400/20 bg-zinc-950/80 p-2 focus-within:border-blue-300/50">
                    <textarea
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value.slice(0, MAX_CHAT_MESSAGE_LENGTH))}
                      rows={2}
                      className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-zinc-600"
                      placeholder="Escreva uma mensagem"
                    />
                    <button type="submit" disabled={!chatDraft.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-right text-xs text-zinc-500">{chatDraft.length}/{MAX_CHAT_MESSAGE_LENGTH}</p>
                </form>
              </>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {visibleParticipants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-400/10 bg-zinc-950/75 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-black text-blue-100">
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{participant.name}</p>
                        <p className="text-xs text-zinc-500">{participant.isLocal ? (isModerator ? 'Você · dono/admin' : 'Você') : 'Participante'}</p>
                      </div>
                    </div>
                    {participant.isLocal && isModerator ? (
                      <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-100">
                        Admin
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </aside>
        ) : null}
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
      <div className="fixed inset-0 z-50 flex bg-black">
        <LiveKitRoom
          token={accessToken}
          serverUrl={serverUrl}
          connect
          audio
          video
          data-lk-theme="default"
          className="h-full w-full bg-black"
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
          <PortugueseConference
            handRaised={Boolean(membership?.handRaised)}
            hands={hands}
            isModerator={Boolean(isModerator)}
            participantName={normalizedParticipantName}
            roomName={roomName}
            onToggleHand={toggleHand}
          />
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
