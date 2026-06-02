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
  useConnectionState,
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
  Share2,
  ShieldCheck,
  Smile,
  UserCheck,
  Users,
  UserX,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { ConnectionState as LiveKitConnectionState, Track } from 'livekit-client'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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
type JoinIssue = 'auth' | 'not-found' | 'not-approved' | 'expired' | 'network' | 'unknown' | null

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
type MeetAlertSound = 'request' | 'hand' | 'join' | 'leave' | 'ending'

const MAX_DISPLAY_NAME_LENGTH = 60
const MAX_CHAT_MESSAGE_LENGTH = 500
const NAME_REQUIRED_MESSAGE = 'Informe seu nome para entrar na chamada.'
const MEET_DATA_TOPIC = 'entreus.meet'
const QUICK_REACTIONS = ['👍', '👏', '😂', '❤️', '🔥', '🎉']
const MEET_SOUND_PATTERNS: Record<MeetAlertSound, { frequency: number; endFrequency?: number; duration: number; volume: number }> = {
  request: { frequency: 740, endFrequency: 880, duration: 0.16, volume: 0.045 },
  hand: { frequency: 620, endFrequency: 760, duration: 0.13, volume: 0.04 },
  join: { frequency: 520, endFrequency: 660, duration: 0.12, volume: 0.035 },
  leave: { frequency: 430, endFrequency: 360, duration: 0.14, volume: 0.032 },
  ending: { frequency: 880, endFrequency: 660, duration: 0.18, volume: 0.045 },
}

function getFriendlyJoinIssue(message?: string | null): JoinIssue {
  const normalized = (message || '').toLowerCase()

  if (normalized.includes('sala não encontrada') || normalized.includes('sala nÃ£o encontrada')) return 'not-found'
  if (normalized.includes('expirou') || normalized.includes('tempo gratuito') || normalized.includes('encerrada')) return 'expired'
  if (normalized.includes('autoriz') || normalized.includes('aprova')) return 'not-approved'
  if (normalized.includes('conta') || normalized.includes('login') || normalized.includes('sess')) return 'auth'
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('conex')) return 'network'

  return message ? 'unknown' : null
}

function getFriendlyJoinText(issue: JoinIssue) {
  if (issue === 'not-found') {
    return {
      title: 'Não foi possível entrar nesta sala.',
      description: 'O link pode estar inválido ou a sala não existe mais.',
    }
  }

  if (issue === 'not-approved') {
    return {
      title: 'Você ainda não pode entrar nesta sala.',
      description: 'Aguarde a aprovação do organizador ou peça entrada novamente.',
    }
  }

  if (issue === 'expired') {
    return {
      title: 'A sala foi encerrada.',
      description: 'O tempo gratuito desta chamada terminou.',
    }
  }

  if (issue === 'auth') {
    return {
      title: 'Entre na sua conta para continuar.',
      description: 'O acesso ao EntreUS Meet exige login.',
    }
  }

  if (issue === 'network') {
    return {
      title: 'Não foi possível entrar nesta sala.',
      description: 'Confira sua internet e tente novamente.',
    }
  }

  return {
    title: 'Não foi possível entrar nesta sala.',
    description: 'Pode ser um link expirado, permissão ainda não aprovada ou instabilidade de conexão.',
  }
}

function getMediaPermissionMessage(kind?: MediaDeviceKind) {
  if (kind === 'videoinput') {
    return 'Não foi possível acessar sua câmera. Verifique as permissões do navegador e tente novamente.'
  }

  if (kind === 'audioinput') {
    return 'Não foi possível acessar seu microfone. Verifique as permissões do navegador e tente novamente.'
  }

  return 'Não foi possível acessar sua câmera ou microfone. Verifique as permissões do navegador e tente novamente.'
}

function normalizeDisplayName(value: string) {
  return value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
}

function isValidDisplayName(value: string) {
  return normalizeDisplayName(value).length >= 2
}

async function playMeetAlertSound(type: MeetAlertSound) {
  if (typeof window === 'undefined') return

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextClass) return

    const pattern = MEET_SOUND_PATTERNS[type]
    const audioContext = new AudioContextClass()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(pattern.frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(pattern.endFrequency || pattern.frequency, now + pattern.duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(pattern.volume, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + pattern.duration)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    oscillator.start(now)
    oscillator.stop(now + pattern.duration + 0.02)
    oscillator.onended = () => {
      void audioContext.close()
    }
  } catch {
    // Browsers may block audio before user interaction. Visual alerts keep working.
  }
}

function playMeetRequestSound() {
  void playMeetAlertSound('request')
}

function playMeetHandSound() {
  void playMeetAlertSound('hand')
}

function playMeetJoinSound() {
  void playMeetAlertSound('join')
}

function playMeetLeaveSound() {
  void playMeetAlertSound('leave')
}

function playMeetEndingSound() {
  void playMeetAlertSound('ending')
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
  mediaPermissionMessage,
  participantName,
  pendingRequests,
  roomName,
  secondsLeft,
  soundAlertsEnabled,
  onModerateRequest,
  onRetryMediaPermissions,
  onToggleSoundAlerts,
  onToggleHand,
}: {
  handRaised: boolean
  hands: Extract<HandsResponse, { ok: true }>['hands']
  isModerator: boolean
  mediaPermissionMessage: string | null
  participantName: string
  pendingRequests: Extract<RequestsResponse, { ok: true }>['requests']
  roomName: string
  secondsLeft: number | null
  soundAlertsEnabled: boolean
  onModerateRequest: (memberId: string, action: 'approve' | 'reject') => Promise<void>
  onRetryMediaPermissions: () => Promise<void>
  onToggleSoundAlerts: () => void
  onToggleHand: () => void
}) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  const connectionState = useConnectionState()
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
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null)
  const [timeWarningMinimized, setTimeWarningMinimized] = useState(false)
  const reactionMenuRef = useRef<HTMLDivElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const seenHandsRef = useRef<Set<string>>(new Set())
  const handsInitializedRef = useRef(false)
  const seenParticipantsRef = useRef<Set<string>>(new Set())
  const participantsInitializedRef = useRef(false)
  const timeWarningPlayedRef = useRef(false)
  const localDisplayName = normalizeDisplayName(participantName) || 'Participante'
  const showTimeWarning = typeof secondsLeft === 'number' && secondsLeft > 0 && secondsLeft <= 60
  const pendingRequestCount = isModerator ? pendingRequests.length : 0

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
    if (!showTimeWarning) {
      timeWarningPlayedRef.current = false
      setTimeWarningMinimized(false)
      return
    }

    if (timeWarningPlayedRef.current) return

    timeWarningPlayedRef.current = true
    if (soundAlertsEnabled) playMeetEndingSound()
  }, [showTimeWarning, soundAlertsEnabled])

  useEffect(() => {
    if (connectionState === LiveKitConnectionState.Reconnecting || connectionState === LiveKitConnectionState.SignalReconnecting) {
      setConnectionNotice('Tentando reconectar...')
      return
    }

    if (connectionNotice !== 'Tentando reconectar...') return

    if (connectionState === LiveKitConnectionState.Connected) {
      setConnectionNotice('Conexão restabelecida')
      const timer = window.setTimeout(() => setConnectionNotice(null), 2600)
      return () => window.clearTimeout(timer)
    }
  }, [connectionNotice, connectionState])

  useEffect(() => {
    function handleDocumentPointerDown(event: MouseEvent) {
      const target = event.target as Node

      if (showReactions && reactionMenuRef.current && !reactionMenuRef.current.contains(target)) {
        setShowReactions(false)
      }

      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)
    return () => document.removeEventListener('mousedown', handleDocumentPointerDown)
  }, [showMoreMenu, showReactions])

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
      handsInitializedRef.current = true
      setHandNotice(null)
      return
    }

    const previous = seenHandsRef.current
    const next = new Set(hands.map((item) => item.userId))
    const newHand = hands.find((item) => !previous.has(item.userId))
    const shouldNotify = handsInitializedRef.current && Boolean(newHand)

    seenHandsRef.current = next
    handsInitializedRef.current = true

    if (!newHand || !shouldNotify) return

    setHandNotice(`✋ ${newHand.displayName || 'Participante'} levantou a mão`)
    if (isModerator && soundAlertsEnabled) playMeetHandSound()
    const timer = window.setTimeout(() => setHandNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [hands, isModerator, soundAlertsEnabled])

  useEffect(() => {
    const previous = seenParticipantsRef.current
    const next = new Set(participants.map((participant) => participant.identity).filter(Boolean))

    if (!participantsInitializedRef.current) {
      seenParticipantsRef.current = next
      participantsInitializedRef.current = true
      return
    }

    const joined = [...next].some((participantId) => !previous.has(participantId))
    const left = [...previous].some((participantId) => !next.has(participantId))

    seenParticipantsRef.current = next

    if (joined) {
      if (soundAlertsEnabled) playMeetJoinSound()
      return
    }

    if (left && soundAlertsEnabled) playMeetLeaveSound()
  }, [participants, soundAlertsEnabled])

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
    setShowMoreMenu(false)
    await send(encodeMeetDataMessage(reaction), { reliable: false, topic: MEET_DATA_TOPIC })
  }

  const openPanel = (panel: Exclude<SidePanel, null>) => {
    setSidePanel((current) => (current === panel ? null : panel))
    setShowReactions(false)
    setShowMoreMenu(false)
  }

  const iconButtonClass =
    'relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/5 bg-white/[0.07] text-blue-50 shadow-sm shadow-black/20 ring-1 ring-blue-200/5 transition hover:bg-blue-500/20 hover:ring-blue-200/20 focus:outline-none focus:ring-2 focus:ring-blue-300/35 data-[lk-enabled=false]:bg-black/25 data-[lk-enabled=false]:text-zinc-500 sm:h-11 sm:w-11'
  const activeIconButtonClass =
    'relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-500/25 text-blue-50 shadow-sm shadow-blue-950/25 ring-1 ring-blue-200/20 transition hover:bg-blue-500/35 focus:outline-none focus:ring-2 focus:ring-blue-300/35 sm:h-11 sm:w-11'
  const handButtonClass = handRaised
    ? 'relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/20 text-amber-50 shadow-sm shadow-amber-950/20 ring-1 ring-amber-200/20 transition hover:bg-amber-300/30 focus:outline-none focus:ring-2 focus:ring-amber-300/35 sm:h-11 sm:w-11'
    : iconButtonClass
  const secondaryDesktopControlClass = 'max-sm:hidden'
  const sheetActionClass =
    'flex min-h-16 w-full items-center gap-3 rounded-2xl border border-blue-300/10 bg-white/[0.055] px-3 py-3 text-left text-sm font-semibold text-zinc-100 shadow-sm shadow-black/15 transition hover:border-blue-200/25 hover:bg-blue-500/15 focus:outline-none focus:ring-2 focus:ring-blue-300/30'
  const sheetDangerActionClass =
    'flex min-h-16 w-full items-center gap-3 rounded-2xl border border-red-300/15 bg-red-500/15 px-3 py-3 text-left text-sm font-semibold text-red-50 shadow-sm shadow-black/15 transition hover:border-red-200/35 hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-300/30'
  const sheetIconClass = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-100 ring-1 ring-blue-200/10'
  const visibleParticipants = participants.map((participant) => ({
    id: participant.identity,
    name: participant.name || (participant.isLocal ? localDisplayName : 'Participante'),
    isLocal: participant.isLocal,
  }))
  const onlyLocalParticipant = visibleParticipants.length === 1

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#0b1d3b_0%,#020617_42%,#000_100%)] text-white">
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-400/10 bg-black/45 px-3 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-300/25 bg-white/5 shadow-lg shadow-blue-950/30 ring-1 ring-white/10">
            <Image
              src="/logo-icon.png"
              alt=""
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-normal">
              Entre<span className="text-blue-400">US</span> Meet
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
              <span className="truncate">Sala {roomName}</span>
              <span className="hidden h-1 w-1 rounded-full bg-blue-300/50 sm:inline-flex" />
              <span className="shrink-0 text-blue-100/80">
                Tempo restante: {secondsLeft === null ? '--:--' : formatSeconds(secondsLeft)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyRoomLink}
            aria-label="Copiar link da sala"
            className="group relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-blue-400/20 bg-zinc-950/70 text-blue-50 shadow-lg shadow-black/20 transition hover:border-blue-300/50 hover:bg-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-400/35"
          >
            <Copy className="h-4 w-4" />
            <span className="pointer-events-none absolute right-0 top-12 z-50 whitespace-nowrap rounded-full border border-blue-300/20 bg-black/90 px-3 py-1.5 text-xs font-semibold text-blue-50 opacity-0 shadow-xl shadow-black/40 backdrop-blur-xl transition group-hover:opacity-100 group-focus-visible:opacity-100">
              {inviteFeedback === 'copied' ? 'Link copiado' : 'Copiar link da sala'}
            </span>
          </button>
          <button
            type="button"
            onClick={shareRoom}
            aria-label="Compartilhar sala"
            className="group relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-blue-400/20 bg-zinc-950/70 text-blue-50 shadow-lg shadow-black/20 transition hover:border-blue-300/50 hover:bg-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-400/35"
          >
            <Share2 className="h-4 w-4" />
            <span className="pointer-events-none absolute right-0 top-12 z-50 whitespace-nowrap rounded-full border border-blue-300/20 bg-black/90 px-3 py-1.5 text-xs font-semibold text-blue-50 opacity-0 shadow-xl shadow-black/40 backdrop-blur-xl transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Compartilhar sala
            </span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`relative min-w-0 flex-1 transition-[padding] duration-300 ${sidePanel ? 'lg:pr-0' : ''}`}>
          <GridLayout
            tracks={tracks}
            className={`entreus-meet-grid h-full p-2 pb-[calc(7.25rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-28 [&_.lk-participant-metadata]:hidden [&_.lk-participant-name]:rounded-full [&_.lk-participant-name]:bg-black/55 [&_.lk-participant-name]:px-3 [&_.lk-participant-name]:py-1 [&_.lk-participant-tile]:overflow-hidden [&_.lk-participant-tile]:rounded-2xl [&_.lk-participant-tile]:border [&_.lk-participant-tile]:border-blue-400/15 [&_.lk-participant-tile]:bg-zinc-950 [&_.lk-participant-tile]:shadow-2xl ${compactLayout ? '[&_.lk-grid-layout]:gap-2' : ''}`}
          >
            <ParticipantTile />
          </GridLayout>

          <style jsx global>{`
            .entreus-meet-grid .lk-grid-layout {
              align-content: center;
              gap: 0.75rem;
            }

            .entreus-meet-grid .lk-participant-tile {
              min-height: 14rem;
            }

            @media (max-width: 640px) {
              .entreus-meet-grid .lk-grid-layout {
                align-content: center;
                gap: 0.625rem;
              }

              .entreus-meet-grid .lk-participant-tile {
                min-height: min(42vh, 20rem);
              }

              .entreus-meet-grid .lk-grid-layout:has(.lk-participant-tile:only-child) .lk-participant-tile {
                min-height: min(58vh, 28rem);
              }

              .entreus-meet-grid .lk-grid-layout:has(.lk-participant-tile:nth-child(2):last-child) .lk-participant-tile {
                min-height: min(36vh, 17rem);
              }

              .entreus-meet-grid .lk-grid-layout:has(.lk-participant-tile:nth-child(3):last-child) .lk-participant-tile,
              .entreus-meet-grid .lk-grid-layout:has(.lk-participant-tile:nth-child(n + 4)) .lk-participant-tile {
                min-height: 11.5rem;
              }
            }
          `}</style>

          <RoomAudioRenderer />

          {connectionState === LiveKitConnectionState.Connecting ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl border border-blue-300/20 bg-black/82 p-5 text-center shadow-2xl shadow-black/45 ring-1 ring-blue-200/10">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/15 text-blue-100 ring-1 ring-blue-200/15">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
                <p className="mt-4 text-lg font-black text-white">Conectando ao EntreUS Meet...</p>
                <p className="mt-2 text-sm leading-5 text-zinc-300">
                  Se demorar, confira sua internet ou recarregue a página.
                </p>
              </div>
            </div>
          ) : null}

          {onlyLocalParticipant ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center sm:bottom-24">
              <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-blue-300/15 bg-black/60 p-4 text-center shadow-2xl shadow-black/35 ring-1 ring-blue-100/10 backdrop-blur-2xl">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-blue-200/20 bg-white/[0.08]">
                  <Image src="/logo-icon.png" alt="" width={48} height={48} className="h-full w-full object-contain" />
                </div>
                <p className="text-base font-black text-white">Só você está aqui</p>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-zinc-300">
                  Compartilhe o link da sala para convidar alguém.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={copyRoomLink}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/15 px-4 py-2 text-sm font-bold text-blue-50 transition hover:bg-blue-500/25"
                  >
                    <Copy className="h-4 w-4" />
                    {inviteFeedback === 'copied' ? 'Copiado' : 'Copiar link'}
                  </button>
                  <button
                    type="button"
                    onClick={shareRoom}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-white/[0.07] px-4 py-2 text-sm font-bold text-blue-50 transition hover:bg-blue-500/15"
                  >
                    <Share2 className="h-4 w-4" />
                    Compartilhar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showTimeWarning && secondsLeft !== null ? (
            timeWarningMinimized ? (
              <button
                type="button"
                onClick={() => setTimeWarningMinimized(false)}
                className="absolute right-3 top-4 z-30 rounded-full border border-amber-300/35 bg-black/75 px-4 py-2 text-xs font-bold text-amber-50 shadow-2xl shadow-black/35 backdrop-blur-xl transition hover:border-amber-200/60 hover:bg-amber-400/10 sm:right-5 sm:top-5"
              >
                Sala termina em {secondsLeft}s
              </button>
            ) : (
              <div className="absolute left-1/2 top-16 z-30 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-3xl border border-blue-300/25 bg-[linear-gradient(145deg,rgba(2,6,23,0.94),rgba(30,64,175,0.34),rgba(0,0,0,0.94))] p-5 text-center shadow-2xl shadow-blue-950/45 ring-1 ring-blue-300/10 backdrop-blur-2xl sm:top-20">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/35 bg-amber-300/10 text-amber-100 shadow-lg shadow-amber-950/20">
                  <Clock3 className="h-6 w-6" />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100/70">Tempo final</p>
                <h2 className="mt-2 text-xl font-black text-white">
                  Sua sala gratuita termina em {secondsLeft} segundos
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  A sala esta acabando e sera encerrada quando o tempo chegar a zero. Os controles continuam livres.
                </p>
                <button
                  type="button"
                  onClick={() => setTimeWarningMinimized(true)}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full border border-blue-300/30 bg-blue-500/15 px-4 py-2 text-sm font-bold text-blue-50 transition hover:border-blue-200/60 hover:bg-blue-500/25"
                >
                  Minimizar aviso
                </button>
              </div>
            )
          ) : null}

          {handNotice ? (
            <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 rounded-full border border-amber-300/40 bg-black/75 px-4 py-2 text-sm font-semibold text-amber-50 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {handNotice}
            </div>
          ) : null}

          {connectionNotice ? (
            <div className="pointer-events-none absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-blue-300/30 bg-black/78 px-4 py-2 text-sm font-semibold text-blue-50 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {connectionNotice === 'Tentando reconectar...' ? <WifiOff className="h-4 w-4 text-amber-200" /> : <Wifi className="h-4 w-4 text-blue-200" />}
              {connectionNotice}
            </div>
          ) : null}

          {mediaPermissionMessage ? (
            <div className="absolute left-1/2 top-16 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl border border-amber-300/30 bg-black/82 p-4 text-center shadow-2xl shadow-black/45 ring-1 ring-amber-100/10 backdrop-blur-2xl sm:top-20">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-300/12 text-amber-100 ring-1 ring-amber-200/20">
                <Video className="h-5 w-5" />
              </div>
              <p className="text-sm font-black text-white">Permissão necessária</p>
              <p className="mt-1 text-sm leading-5 text-zinc-300">{mediaPermissionMessage}</p>
              <button
                type="button"
                onClick={() => void onRetryMediaPermissions()}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {pendingRequestCount > 0 ? (
            <button
              type="button"
              onClick={() => openPanel('participants')}
              className="absolute left-1/2 top-5 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-black/82 px-4 py-2 text-sm font-bold text-amber-50 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:border-amber-200/70 hover:bg-amber-400/10"
            >
              <UserCheck className="h-4 w-4" />
              Nova solicitação para entrar na sala
              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-black text-black">{pendingRequestCount}</span>
            </button>
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

          <div className={`absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] ${sidePanel === 'chat' ? 'max-lg:hidden' : ''}`}>
            <div className="relative flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/60 p-1.5 shadow-xl shadow-black/35 ring-1 ring-blue-200/10 backdrop-blur-2xl sm:gap-1">
              <TrackToggle source={Track.Source.Microphone} showIcon={false} className={iconButtonClass} onChange={setMicrophoneEnabled} aria-label={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'} title={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'}>
                <Mic className="h-5 w-5" />
              </TrackToggle>
              <TrackToggle source={Track.Source.Camera} showIcon={false} className={iconButtonClass} onChange={setCameraEnabled} aria-label={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'} title={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}>
                <Video className="h-5 w-5" />
              </TrackToggle>
              <TrackToggle source={Track.Source.ScreenShare} showIcon={false} className={`${secondaryDesktopControlClass} ${iconButtonClass}`} onChange={setScreenShareEnabled} aria-label={screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'} title={screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}>
                <MonitorUp className="h-5 w-5" />
              </TrackToggle>

              <button type="button" onClick={() => openPanel('chat')} className={sidePanel === 'chat' ? activeIconButtonClass : iconButtonClass} aria-label="Bate-papo" title="Bate-papo">
                <MessageSquare className="h-5 w-5" />
                {chatUnread ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blue-300 ring-2 ring-black" /> : null}
              </button>
              <button type="button" onClick={() => openPanel('participants')} className={sidePanel === 'participants' ? activeIconButtonClass : iconButtonClass} aria-label={pendingRequestCount > 0 ? `${pendingRequestCount} solicitações pendentes` : 'Participantes'} title="Participantes">
                <Users className="h-5 w-5" />
                <span className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1 text-[10px] font-bold text-white ${pendingRequestCount > 0 ? 'bg-amber-400 text-black' : 'bg-blue-500'}`}>
                  {pendingRequestCount > 0 ? pendingRequestCount : visibleParticipants.length}
                </span>
              </button>

              <div ref={reactionMenuRef} className={`relative ${secondaryDesktopControlClass}`}>
                <button type="button" onClick={() => setShowReactions((current) => !current)} className={showReactions ? activeIconButtonClass : iconButtonClass} aria-label="Reações" title="Reações">
                  <Smile className="h-5 w-5" />
                </button>
                {showReactions ? (
                  <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-blue-400/20 bg-black/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    {QUICK_REACTIONS.map((reaction) => (
                      <button key={reaction} type="button" onClick={() => void sendReaction(reaction)} className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-blue-500/20" aria-label={`Enviar reação ${reaction}`} title={`Enviar reação ${reaction}`}>
                        {reaction}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button type="button" onClick={onToggleHand} className={`${secondaryDesktopControlClass} ${handButtonClass}`} aria-label={handRaised ? 'Baixar mão' : 'Levantar mão'} title={handRaised ? 'Baixar mão' : 'Levantar mão'}>
                <Hand className="h-5 w-5" />
              </button>

              <div ref={moreMenuRef} className="relative">
                <button type="button" onClick={() => setShowMoreMenu((current) => !current)} className={showMoreMenu ? activeIconButtonClass : iconButtonClass} aria-label="Mais opções" title="Mais opções">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {showMoreMenu ? (
                  <>
                    <button
                      type="button"
                      aria-label="Fechar menu"
                      onClick={() => setShowMoreMenu(false)}
                      className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm sm:hidden"
                    />
                    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-[2rem] border border-blue-200/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(2,6,23,0.98))] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm shadow-2xl shadow-black/60 ring-1 ring-blue-200/10 backdrop-blur-2xl sm:absolute sm:bottom-14 sm:right-0 sm:inset-x-auto sm:max-h-[min(76vh,620px)] sm:w-[22rem] sm:rounded-3xl sm:p-3">
                      <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-blue-100/25 sm:hidden" />

                      <div className="mb-4 flex items-start justify-between gap-3 px-1 sm:mb-3">
                        <div>
                          <p className="text-base font-black text-white">Mais opções</p>
                          <p className="mt-1 text-xs text-zinc-400">Sala {roomName} · {secondsLeft === null ? '--:--' : formatSeconds(secondsLeft)}</p>
                        </div>
                        <button type="button" onClick={() => setShowMoreMenu(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-200 transition hover:bg-blue-500/15" aria-label="Fechar menu" title="Fechar menu">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mb-3 rounded-3xl border border-blue-300/10 bg-black/25 p-3">
                        <p className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.14em] text-blue-100/55">Reações</p>
                        <div className="grid grid-cols-6 gap-1.5">
                          {QUICK_REACTIONS.map((reaction) => (
                            <button key={reaction} type="button" onClick={() => void sendReaction(reaction)} className="flex aspect-square items-center justify-center rounded-2xl bg-white/[0.06] text-2xl transition hover:bg-blue-500/15 focus:outline-none focus:ring-2 focus:ring-blue-300/30" aria-label={`Enviar reação ${reaction}`} title={`Enviar reação ${reaction}`}>
                              {reaction}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { onToggleHand(); setShowMoreMenu(false) }} className={handRaised ? `${sheetActionClass} border-amber-300/25 bg-amber-300/15 text-amber-50` : sheetActionClass} aria-label={handRaised ? 'Baixar mão' : 'Levantar mão'} title={handRaised ? 'Baixar mão' : 'Levantar mão'}>
                          <span className={handRaised ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-amber-50 ring-1 ring-amber-200/20' : sheetIconClass}>
                            <Hand className="h-5 w-5" />
                          </span>
                          <span>{handRaised ? 'Baixar mão' : 'Levantar mão'}</span>
                        </button>

                        <TrackToggle source={Track.Source.ScreenShare} showIcon={false} className={sheetActionClass} onChange={(enabled) => { setScreenShareEnabled(enabled); setShowMoreMenu(false) }} aria-label={screenShareEnabled ? 'Parar apresentação' : 'Apresentar'} title={screenShareEnabled ? 'Parar apresentação' : 'Apresentar'}>
                          <span className={sheetIconClass}>
                            <MonitorUp className="h-5 w-5" />
                          </span>
                          <span>{screenShareEnabled ? 'Parar apresentação' : 'Apresentar'}</span>
                        </TrackToggle>

                        <button type="button" onClick={() => openPanel('chat')} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <MessageSquare className="h-5 w-5" />
                          </span>
                          <span>Chat</span>
                        </button>

                        <button type="button" onClick={() => openPanel('participants')} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <Users className="h-5 w-5" />
                          </span>
                          <span>Participantes</span>
                        </button>

                        <button type="button" onClick={() => void copyRoomLink().then(() => setShowMoreMenu(false))} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <Copy className="h-5 w-5" />
                          </span>
                          <span>{inviteFeedback === 'copied' ? 'Link copiado' : 'Copiar link'}</span>
                        </button>

                        <button type="button" onClick={() => void shareRoom().then(() => setShowMoreMenu(false))} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <Share2 className="h-5 w-5" />
                          </span>
                          <span>Compartilhar</span>
                        </button>

                        <button type="button" onClick={() => { onToggleSoundAlerts(); setShowMoreMenu(false) }} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            {soundAlertsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                          </span>
                          <span>{soundAlertsEnabled ? 'Sons ligados' : 'Sons desligados'}</span>
                        </button>

                        <button type="button" onClick={() => setCompactLayout((current) => !current)} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <LayoutGrid className="h-5 w-5" />
                          </span>
                          <span>Layout</span>
                        </button>

                        <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <Maximize className="h-5 w-5" />
                          </span>
                          <span>Tela cheia</span>
                        </button>

                        <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-blue-300/10 bg-white/[0.04] px-3 py-3 text-left text-sm text-zinc-300">
                          <span className={sheetIconClass}>
                            <Clock3 className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-zinc-100">Informações</span>
                            <span className="block truncate text-xs text-zinc-500">Sala {roomName}</span>
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <DisconnectButton className={sheetDangerActionClass} title="Sair da sala">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-100 ring-1 ring-red-200/15">
                            <PhoneOff className="h-5 w-5" />
                          </span>
                          <span>Sair da sala</span>
                        </DisconnectButton>
                        <button type="button" onClick={() => setShowMoreMenu(false)} className={sheetActionClass}>
                          <span className={sheetIconClass}>
                            <X className="h-5 w-5" />
                          </span>
                          <span>Fechar</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <DisconnectButton className="inline-flex h-10 w-11 shrink-0 items-center justify-center rounded-full border border-red-400/35 bg-red-600/90 text-white shadow-md shadow-red-950/25 transition hover:border-red-300/60 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300/30 sm:h-11 sm:w-12" title="Sair">
                <PhoneOff className="h-5 w-5" />
              </DisconnectButton>
            </div>
          </div>
        </main>

        {sidePanel ? (
          <aside className="z-40 flex w-full max-w-sm shrink-0 flex-col border-l border-blue-400/15 bg-black/82 shadow-2xl shadow-black/40 backdrop-blur-2xl max-lg:absolute max-lg:bottom-0 max-lg:right-0 max-lg:top-0 max-lg:max-w-full sm:max-w-md lg:relative">
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
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-5">
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
                  className="border-t border-blue-400/10 p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
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
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                {isModerator ? (
                  <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-amber-50">Solicitações pendentes</h3>
                        <p className="mt-1 text-xs text-amber-100/65">
                          {pendingRequestCount === 0
                            ? 'Nenhum pedido aguardando.'
                            : `${pendingRequestCount} pedido${pendingRequestCount === 1 ? '' : 's'} aguardando aprovação.`}
                        </p>
                      </div>
                      {pendingRequestCount > 0 ? (
                        <span className="rounded-full bg-amber-300 px-2 py-1 text-xs font-black text-black">{pendingRequestCount}</span>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {pendingRequests.length === 0 ? (
                        <p className="rounded-xl border border-amber-200/10 bg-black/25 px-3 py-2 text-sm text-zinc-400">
                          Nenhuma solicitação pendente.
                        </p>
                      ) : (
                        pendingRequests.map((request) => (
                          <div key={request.id} className="rounded-xl border border-amber-200/15 bg-black/35 p-3">
                            <p className="truncate text-sm font-bold text-white">{request.displayName || 'Usuário EntreUS'}</p>
                            <div className="mt-3 flex gap-2">
                              <button type="button" onClick={() => void onModerateRequest(request.id, 'approve')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-blue-600 px-3 text-sm font-bold text-white transition hover:bg-blue-500 sm:min-h-9 sm:text-xs">
                                <Check className="h-3.5 w-3.5" />
                                Aceitar
                              </button>
                              <button type="button" onClick={() => void onModerateRequest(request.id, 'reject')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-red-400/30 bg-red-600/80 px-3 text-sm font-bold text-white transition hover:bg-red-500 sm:min-h-9 sm:text-xs">
                                <X className="h-3.5 w-3.5" />
                                Recusar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                ) : null}

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

function MeetStatusCard({
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
  children,
}: {
  title: string
  description: string
  icon: typeof Loader2
  primaryAction?: {
    label: string
    onClick?: () => void
    href?: string
  }
  secondaryAction?: {
    label: string
    href: string
  }
  children?: ReactNode
}) {
  const iconClass = Icon === Loader2 ? 'h-8 w-8 animate-spin' : 'h-8 w-8'

  return (
    <div className="fixed inset-0 z-[60] flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.26),transparent_34%),linear-gradient(145deg,#020617_0%,#050b16_48%,#000_100%)] px-4 py-8 text-white">
      <section className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-blue-300/20 bg-[linear-gradient(145deg,rgba(2,6,23,0.88),rgba(15,23,42,0.74),rgba(0,0,0,0.84))] p-6 text-center shadow-2xl shadow-blue-950/35 ring-1 ring-blue-200/10 backdrop-blur-2xl sm:p-8">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/50 to-transparent" />
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-blue-300/20 bg-blue-500/10 text-blue-100 shadow-xl shadow-blue-950/30">
          <Icon className={iconClass} />
        </div>
        <h2 className="mx-auto mt-5 max-w-md text-2xl font-black tracking-normal text-white sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-300">
          {description}
        </p>
        {children}
        {(primaryAction || secondaryAction) ? (
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {primaryAction ? (
              primaryAction.href ? (
                <Link href={primaryAction.href} className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500">
                  {primaryAction.label}
                </Link>
              ) : (
                <button type="button" onClick={primaryAction.onClick} className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500">
                  {primaryAction.label}
                </button>
              )
            ) : null}
            {secondaryAction ? (
              <Link href={secondaryAction.href} className="inline-flex min-h-12 items-center justify-center rounded-full border border-blue-300/25 bg-white/[0.06] px-5 py-3 text-sm font-bold text-blue-50 transition hover:bg-blue-500/15">
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
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
  const [joinIssue, setJoinIssue] = useState<JoinIssue>(null)
  const [mediaPermissionMessage, setMediaPermissionMessage] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true)
  const seenRequestIdsRef = useRef<Set<string>>(new Set())
  const requestsInitializedRef = useRef(false)
  const requestsLoadedRef = useRef(false)

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
      setJoinIssue('auth')
      return
    }

    const response = await fetch(`/api/meet/rooms/${encodeURIComponent(roomName)}`, { headers })
    const data = (await response.json()) as RoomResponse

    setLoading(false)

    if (!response.ok || !data.ok) {
      const nextIssue = data.ok ? 'unknown' : getFriendlyJoinIssue(data.error)
      setJoinIssue(nextIssue)
      setError(getFriendlyJoinText(nextIssue).description)
      setRoomData(null)
      return
    }

    setError(null)
    setJoinIssue(null)
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
    if (response.ok && data.ok) {
      requestsLoadedRef.current = true
      setPendingRequests(data.requests)
    }
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
    if (!isModerator) {
      seenRequestIdsRef.current = new Set()
      requestsInitializedRef.current = false
      requestsLoadedRef.current = false
      return
    }

    if (!requestsLoadedRef.current) return

    const previous = seenRequestIdsRef.current
    const next = new Set(pendingRequests.map((request) => request.id))
    const hasNewRequest = pendingRequests.some((request) => !previous.has(request.id))

    seenRequestIdsRef.current = next

    if (!requestsInitializedRef.current) {
      requestsInitializedRef.current = true
      return
    }

    if (hasNewRequest && soundAlertsEnabled) playMeetRequestSound()
  }, [isModerator, pendingRequests, soundAlertsEnabled])

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
      const nextIssue = getFriendlyJoinIssue(data.error || 'network')
      setJoinIssue(nextIssue)
      setError(
        nextIssue === 'network'
          ? 'Não foi possível enviar seu pedido agora. Confira sua conexão e tente novamente.'
          : getFriendlyJoinText(nextIssue).description,
      )
      return
    }

    setJoinIssue(null)
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

  async function retryMediaPermissions() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaPermissionMessage('Seu navegador não liberou câmera ou microfone. Verifique as permissões e tente novamente.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      stream.getTracks().forEach((track) => track.stop())
      setMediaPermissionMessage(null)
    } catch {
      setMediaPermissionMessage(getMediaPermissionMessage())
    }
  }

  async function handleJoin() {
    if (!participantNameIsValid) {
      setError(NAME_REQUIRED_MESSAGE)
      setJoinIssue(null)
      return
    }

    if (!canJoin) {
      const nextIssue: JoinIssue = expired ? 'expired' : 'not-approved'
      setJoinIssue(nextIssue)
      setError(getFriendlyJoinText(nextIssue).description)
      return
    }

    setJoinState('loading')
    setError(null)
    setJoinIssue(null)
    setMediaPermissionMessage(null)
    setAccessToken(null)
    setServerUrl(null)

    const headers = await authHeaders()
    if (!headers) {
      setJoinState('error')
      setJoinIssue('auth')
      setError(getFriendlyJoinText('auth').description)
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
        const nextIssue = data.ok ? 'unknown' : getFriendlyJoinIssue(data.error)
        setJoinIssue(nextIssue)
        setError(getFriendlyJoinText(nextIssue).description)
        setJoinState('error')
        return
      }

      setAccessToken(data.token)
      setServerUrl(data.url)
      setJoinState('connected')
    } catch (joinError) {
      console.error('Meet join failed', joinError)
      setJoinState('error')
      setJoinIssue('network')
      setError(getFriendlyJoinText('network').description)
    }
  }

  if (joinState === 'loading') {
    return (
      <MeetStatusCard
        title="Conectando ao EntreUS Meet..."
        description="Estamos preparando sua entrada na sala. Se demorar, confira sua internet ou recarregue a página."
        icon={Loader2}
      />
    )
  }

  if (joinState === 'error') {
    const friendly = getFriendlyJoinText(joinIssue || getFriendlyJoinIssue(error) || 'unknown')

    return (
      <MeetStatusCard
        title={friendly.title}
        description={friendly.description}
        icon={WifiOff}
        primaryAction={{ label: 'Tentar novamente', onClick: handleJoin }}
        secondaryAction={{ label: 'Voltar para o Meet', href: '/meet' }}
      />
    )
  }

  if (!loading && !roomData && joinIssue) {
    const friendly = getFriendlyJoinText(joinIssue)

    return (
      <MeetStatusCard
        title={friendly.title}
        description={friendly.description}
        icon={joinIssue === 'auth' ? ShieldCheck : WifiOff}
        primaryAction={{ label: joinIssue === 'auth' ? 'Entrar na conta' : 'Tentar novamente', onClick: joinIssue === 'auth' ? undefined : () => void loadRoom(), href: joinIssue === 'auth' ? '/login' : undefined }}
        secondaryAction={{ label: 'Voltar para o Meet', href: '/meet' }}
      />
    )
  }

  if (roomData && expired) {
    return (
      <MeetStatusCard
        title="A sala foi encerrada."
        description="O tempo gratuito desta chamada terminou."
        icon={Clock3}
        primaryAction={{ label: 'Criar nova sala', href: '/meet' }}
        secondaryAction={{ label: 'Voltar ao Meet', href: '/meet' }}
      />
    )
  }

  if (roomData && membership?.status === 'rejected') {
    return (
      <MeetStatusCard
        title="Sua entrada não foi aprovada pelo organizador."
        description="Você pode voltar ao Meet ou pedir entrada novamente se ainda precisar participar."
        icon={UserX}
        primaryAction={{ label: 'Pedir novamente', onClick: requestAccess }}
        secondaryAction={{ label: 'Voltar para o Meet', href: '/meet' }}
      >
        {requesting ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando pedido...
          </div>
        ) : null}
      </MeetStatusCard>
    )
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
          onConnected={() => {
            setJoinIssue(null)
            setError(null)
          }}
          onDisconnected={() => {
            setJoinState('idle')
            setAccessToken(null)
            setServerUrl(null)
          }}
          onError={(roomError) => {
            console.error('Meet room error', roomError)
            setJoinState('error')
            setJoinIssue('network')
            setError(getFriendlyJoinText('network').description)
            setAccessToken(null)
            setServerUrl(null)
          }}
          onMediaDeviceFailure={(_failure, kind) => {
            setMediaPermissionMessage(getMediaPermissionMessage(kind))
          }}
        >
          <PortugueseConference
            handRaised={Boolean(membership?.handRaised)}
            hands={hands}
            isModerator={Boolean(isModerator)}
            mediaPermissionMessage={mediaPermissionMessage}
            participantName={normalizedParticipantName}
            pendingRequests={pendingRequests}
            roomName={roomName}
            secondsLeft={secondsLeft}
            soundAlertsEnabled={soundAlertsEnabled}
            onModerateRequest={moderate}
            onRetryMediaPermissions={retryMediaPermissions}
            onToggleSoundAlerts={() => setSoundAlertsEnabled((current) => !current)}
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

  if (roomData && membership?.status === 'pending' && !expired) {
    return (
      <div className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.26),transparent_34%),linear-gradient(145deg,#020617_0%,#050b16_48%,#000_100%)] text-white">
        <header className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-400/10 bg-black/35 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-300/25 bg-white/5 shadow-lg shadow-blue-950/30 ring-1 ring-white/10">
              <Image
                src="/logo-icon.png"
                alt=""
                width={40}
                height={40}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-normal">
                Entre<span className="text-blue-400">US</span> Meet
              </p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                <span className="truncate">Sala {roomName}</span>
                <span className="hidden h-1 w-1 rounded-full bg-blue-300/50 sm:inline-flex" />
                <span className="shrink-0 text-blue-100/80">
                  Tempo restante: {secondsLeft === null ? '--:--' : formatSeconds(secondsLeft)}
                </span>
              </div>
            </div>
          </div>

          <InviteActions compact />
        </header>

        <main className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/50 to-transparent" />
          <section className="relative w-full max-w-4xl overflow-hidden rounded-[2.2rem] border border-blue-400/20 bg-[linear-gradient(145deg,rgba(2,6,23,0.78),rgba(15,23,42,0.62),rgba(0,0,0,0.76))] p-6 text-center shadow-2xl shadow-blue-950/35 ring-1 ring-blue-300/10 backdrop-blur-2xl sm:p-10">
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/50 to-transparent" />

            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-blue-300/25 bg-blue-500/10 shadow-2xl shadow-blue-950/30">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-blue-200/25 bg-black/50 text-blue-100">
                <UserCheck className="h-9 w-9" />
              </div>
            </div>

            <div className="mt-7 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-100/65">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-300 shadow-lg shadow-blue-300/40" />
              Sala de espera
            </div>

            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-normal text-white sm:text-5xl">
              Aguarde ate que um organizador aprove sua entrada
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-zinc-300 sm:text-base">
              Seu pedido ja esta com o organizador. Assim que for aprovado, esta tela libera a entrada na chamada automaticamente.
            </p>

            <div className="mx-auto mt-8 flex w-full max-w-md items-center gap-3 rounded-full border border-blue-400/15 bg-black/35 p-2 text-left shadow-xl shadow-black/20">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-200">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Pedido em analise</p>
                <p className="truncate text-xs text-zinc-400">Mantenha esta sala aberta enquanto aguarda.</p>
              </div>
            </div>

            <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-400/15 bg-black/35 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100/55">Seu nome</p>
                <p className="mt-2 truncate text-sm font-bold text-white">{normalizedParticipantName || 'Participante'}</p>
              </div>
              <div className="rounded-2xl border border-blue-400/15 bg-blue-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100/55">Tempo da sala</p>
                <p className="mt-2 text-sm font-bold text-white">{secondsLeft === null ? '--:--' : formatSeconds(secondsLeft)}</p>
              </div>
            </div>

            {error ? (
              <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <p className="mx-auto mt-6 max-w-lg text-xs leading-5 text-blue-100/60">
              Preview de camera antes da aprovacao fica para uma proxima etapa, para evitar pedir permissao do dispositivo antes da entrada na sala.
            </p>
          </section>
        </main>
      </div>
    )
  }

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
                  disabled={!canJoin}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Video className="h-4 w-4" />
                  Entrar na sala
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
                <p className="mb-3 rounded-2xl border border-blue-500/15 bg-black/25 px-4 py-3 text-xs leading-5 text-blue-100/70">
                  Alertas sonoros discretos podem tocar apos sua primeira interacao com a sala.
                </p>
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
