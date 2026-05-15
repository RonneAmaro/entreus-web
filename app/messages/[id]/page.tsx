'use client'

import AppSidebar from '../../components/AppSidebar'
import MobileNavigation from '../../components/MobileNavigation'
import UserBadges from '../../components/UserBadges'
import LinkPreview from '../../components/LinkPreview'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Archive,
  ArrowLeft,
  Ban,
  ChevronDown,
  Check,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Send,
  SmilePlus,
  Square,
  Trash2,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type CurrentProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ParticipantRow = {
  id: string
  conversation_id: string
  user_id: string
  last_read_at: string | null
}

type ConversationRow = {
  id: string
  type: string
  direct_key: string | null
  created_by: string
  created_at: string
  updated_at: string
}

type ConversationParticipantRow = {
  conversation_id: string
  user_id: string
  last_read_at: string | null
}

type ConversationPreviewMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  type?: 'text' | 'call'
  call_type?: CallMode | null
  call_status?: CallHistoryStatus | null
  call_duration_seconds?: number | null
  reply_to_message_id?: string | null
  edited_at?: string | null
  deleted_by?: string | null
  created_at: string
  deleted_at: string | null
}

type ConversationItem = {
  id: string
  updated_at: string
  otherUser: ProfileSummary | null
  lastMessage: ConversationPreviewMessage | null
  isUnread: boolean
  archived: boolean
}

type ConversationUserState = {
  conversation_id: string
  user_id: string
  cleared_at: string | null
  archived_at: string | null
  deleted_at: string | null
}

type MessageAttachment = {
  id: string
  message_id: string
  conversation_id: string
  sender_id: string
  storage_path: string
  media_type: 'image' | 'video' | 'audio'
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  position: number
  created_at: string
  signed_url?: string
}

type MessageReaction = {
  id: string
  message_id: string
  conversation_id: string
  user_id: string
  emoji: string
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  type?: 'text' | 'call'
  call_type?: CallMode | null
  call_status?: CallHistoryStatus | null
  call_duration_seconds?: number | null
  reply_to_message_id?: string | null
  edited_at?: string | null
  deleted_by?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  attachments?: MessageAttachment[]
  reactions?: MessageReaction[]
  replyTo?: MessageReplyPreview | null
}

type MessageReplyPreview = {
  id: string
  sender_id: string
  authorName: string
  preview: string
  unavailable?: boolean
}

type SelectedMedia = {
  file: File
  previewUrl: string
  mediaType: 'image' | 'video' | 'audio'
}

type CallMode = 'voice' | 'video'
type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'error'
type CallHistoryStatus = 'missed' | 'declined' | 'ended' | 'canceled'

type IncomingCall = {
  fromUserId: string
  mode: CallMode
  offer: RTCSessionDescriptionInit
}

function getDisplayName(profile: ProfileSummary | CurrentProfile | null) {
  if (!profile) return 'Usuário EntreUS'
  return profile.display_name || profile.username || 'Usuário EntreUS'
}

function getUsername(profile: ProfileSummary | null) {
  if (!profile?.username) return '@usuario'
  return `@${profile.username}`
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U'
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatConversationDate(value: string) {
  const date = new Date(value)
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInHours = diffInMs / (1000 * 60 * 60)

  if (diffInHours < 24) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function getMessagePreview(message: ConversationPreviewMessage | null, currentUserId: string) {
  if (!message) return 'Conversa iniciada.'
  if (message.deleted_at) return 'Mensagem apagada'
  if (message.type === 'call') return getCallHistoryLabel(message)

  const prefix = message.sender_id === currentUserId ? 'Você: ' : ''
  const content = message.content?.trim()

  return `${prefix}${content || 'Mídia enviada'}`
}

function getCallHistoryLabel(message: Pick<MessageRow, 'call_type' | 'call_status'>) {
  if (message.call_status === 'declined') return 'Chamada recusada'
  if (message.call_status === 'canceled') return 'Chamada cancelada'

  const kind = message.call_type === 'video' ? 'vídeo' : 'voz'

  if (message.call_status === 'missed') return `Chamada de ${kind} não atendida`
  if (message.call_status === 'ended') return `Chamada de ${kind} encerrada`

  return 'Evento de chamada'
}

function getMessageReplyPreviewText(message: Pick<MessageRow, 'content' | 'type' | 'deleted_at' | 'attachments'>) {
  if (message.deleted_at) return 'Mensagem apagada'
  if (message.type === 'call') return 'Evento de chamada'

  const content = message.content?.trim()
  if (content) return content.length > 90 ? `${content.slice(0, 90)}...` : content

  if ((message.attachments || []).length > 0) return 'Midia'

  return 'Mensagem'
}

function formatCallDuration(seconds: number | null | undefined) {
  if (!seconds) return ''

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function isImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
}

function isVideo(file: File) {
  return ['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)
}

function isAudio(file: File) {
  return [
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
  ].includes(file.type)
}

function detectMediaType(file: File): 'image' | 'video' | 'audio' | null {
  if (isImage(file)) return 'image'
  if (isVideo(file)) return 'video'
  if (isAudio(file)) return 'audio'
  return null
}

function makeFileNameSafe(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '-')
}

function getAudioMimeType() {
  if (typeof window === 'undefined') return 'audio/webm'

  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus'
    }

    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return 'audio/webm'
    }

    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      return 'audio/ogg;codecs=opus'
    }

    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return 'audio/mp4'
    }
  }

  return 'audio/webm'
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg')) return 'mp3'
  return 'webm'
}

const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

type MessageEmojiCategoryId =
  | 'recent'
  | 'entreus'
  | 'smileys'
  | 'gestos'
  | 'coracoes'
  | 'festa'
  | 'simbolos'

type MessageEmojiItem = {
  emoji: string
  label: string
  keywords: string[]
}

type MessageEmojiCategory = {
  id: MessageEmojiCategoryId
  title: string
  icon: string
  description: string
  emojis: MessageEmojiItem[]
}

function createMessageEmoji(
  emoji: string,
  label: string,
  keywords: string[] = [],
): MessageEmojiItem {
  return {
    emoji,
    label,
    keywords,
  }
}

const MESSAGE_EMOJI_CATEGORIES: MessageEmojiCategory[] = [
  {
    id: 'recent',
    title: 'Recentes',
    icon: '🕘',
    description: 'Seus últimos emojis usados',
    emojis: [],
  },
  {
    id: 'entreus',
    title: 'EntreUS',
    icon: '💙',
    description: 'Emojis com a vibe da nossa plataforma',
    emojis: [
      createMessageEmoji('😍', 'Apaixonado', ['amor', 'lindo', 'gostei']),
      createMessageEmoji('😏', 'Olhar provocante', ['charme', 'malicia', 'flertar']),
      createMessageEmoji('🔥', 'Fogo', ['quente', 'top', 'destaque']),
      createMessageEmoji('😂', 'Rindo muito', ['risada', 'engracado']),
      createMessageEmoji('🤣', 'Gargalhada', ['risada', 'engracado']),
      createMessageEmoji('❤️', 'Coração vermelho', ['amor', 'curtir']),
      createMessageEmoji('💙', 'Coração EntreUS', ['entreus', 'azul', 'amor']),
      createMessageEmoji('👀', 'De olho', ['olhar', 'curioso']),
      createMessageEmoji('✨', 'Brilho', ['especial', 'premium']),
      createMessageEmoji('🫶', 'Carinho', ['amor', 'apoio']),
      createMessageEmoji('😎', 'Estiloso', ['cool', 'top']),
      createMessageEmoji('🥳', 'Comemoração', ['festa', 'parabens']),
      createMessageEmoji('💯', 'Cem por cento', ['perfeito', 'top']),
      createMessageEmoji('😜', 'Brincalhão', ['zoeira', 'divertido']),
    ],
  },
  {
    id: 'smileys',
    title: 'Smileys',
    icon: '😀',
    description: 'Expressões e sentimentos',
    emojis: [
      createMessageEmoji('😀', 'Feliz', ['sorriso']),
      createMessageEmoji('😃', 'Muito feliz', ['sorriso']),
      createMessageEmoji('😄', 'Sorrindo', ['alegre']),
      createMessageEmoji('😁', 'Sorriso aberto', ['alegre']),
      createMessageEmoji('😆', 'Rindo', ['risada']),
      createMessageEmoji('😊', 'Sorriso fofo', ['feliz']),
      createMessageEmoji('😉', 'Piscadinha', ['flertar']),
      createMessageEmoji('😌', 'Aliviado', ['calmo']),
      createMessageEmoji('😋', 'Gostoso', ['comida', 'sabor']),
      createMessageEmoji('😜', 'Língua', ['brincadeira']),
      createMessageEmoji('🤪', 'Doidinho', ['zoeira']),
      createMessageEmoji('🤗', 'Abraço', ['carinho']),
      createMessageEmoji('🤭', 'Segurando riso', ['vergonha']),
      createMessageEmoji('🤔', 'Pensando', ['duvida']),
      createMessageEmoji('🫢', 'Surpreso tímido', ['surpresa']),
      createMessageEmoji('😮', 'Surpreso', ['uau']),
      createMessageEmoji('😳', 'Envergonhado', ['vergonha']),
      createMessageEmoji('🥺', 'Fofo', ['pedido']),
      createMessageEmoji('😢', 'Triste', ['choro']),
      createMessageEmoji('😭', 'Chorando', ['triste']),
      createMessageEmoji('😡', 'Bravo', ['raiva']),
      createMessageEmoji('😱', 'Assustado', ['medo']),
      createMessageEmoji('😴', 'Sono', ['dormir']),
    ],
  },
  {
    id: 'gestos',
    title: 'Gestos',
    icon: '👍',
    description: 'Mãos, força e interação',
    emojis: [
      createMessageEmoji('👍', 'Curtir', ['like', 'positivo']),
      createMessageEmoji('👎', 'Não curtir', ['deslike', 'negativo']),
      createMessageEmoji('👏', 'Palmas', ['aplauso']),
      createMessageEmoji('🙌', 'Celebração', ['vitoria']),
      createMessageEmoji('🙏', 'Gratidão', ['obrigado', 'amem']),
      createMessageEmoji('💪', 'Força', ['forte']),
      createMessageEmoji('🤝', 'Acordo', ['parceria']),
      createMessageEmoji('👊', 'Toque', ['forca']),
      createMessageEmoji('🤌', 'Perfeito', ['italiano']),
      createMessageEmoji('🤞', 'Torcendo', ['sorte']),
      createMessageEmoji('✌️', 'Paz', ['vitoria']),
      createMessageEmoji('🤙', 'Chama', ['aloha']),
      createMessageEmoji('👋', 'Tchau', ['oi']),
      createMessageEmoji('☝️', 'Atenção', ['cima']),
      createMessageEmoji('👉', 'Direita', ['apontar']),
      createMessageEmoji('👈', 'Esquerda', ['apontar']),
      createMessageEmoji('👀', 'Olhando', ['olhar']),
    ],
  },
  {
    id: 'coracoes',
    title: 'Corações',
    icon: '❤️',
    description: 'Amor, carinho e conexão',
    emojis: [
      createMessageEmoji('❤️', 'Coração vermelho', ['amor']),
      createMessageEmoji('🧡', 'Coração laranja', ['amor']),
      createMessageEmoji('💛', 'Coração amarelo', ['amor']),
      createMessageEmoji('💚', 'Coração verde', ['amor']),
      createMessageEmoji('💙', 'Coração azul', ['entreus']),
      createMessageEmoji('💜', 'Coração roxo', ['amor']),
      createMessageEmoji('🖤', 'Coração preto', ['amor']),
      createMessageEmoji('🤍', 'Coração branco', ['amor']),
      createMessageEmoji('🤎', 'Coração marrom', ['amor']),
      createMessageEmoji('💔', 'Coração partido', ['triste']),
      createMessageEmoji('❣️', 'Exclamação coração', ['amor']),
      createMessageEmoji('💕', 'Dois corações', ['amor']),
      createMessageEmoji('💞', 'Corações girando', ['amor']),
      createMessageEmoji('💓', 'Coração batendo', ['amor']),
      createMessageEmoji('💗', 'Coração crescendo', ['amor']),
      createMessageEmoji('💖', 'Coração brilhando', ['amor']),
      createMessageEmoji('💘', 'Flechado', ['paixao']),
    ],
  },
  {
    id: 'festa',
    title: 'Festa',
    icon: '🎉',
    description: 'Comemoração, brilho e destaque',
    emojis: [
      createMessageEmoji('🎉', 'Confete', ['festa']),
      createMessageEmoji('🥳', 'Festa', ['parabens']),
      createMessageEmoji('🎊', 'Celebração', ['festa']),
      createMessageEmoji('✨', 'Brilho', ['especial']),
      createMessageEmoji('⭐', 'Estrela', ['favorito']),
      createMessageEmoji('🌟', 'Estrela brilhante', ['destaque']),
      createMessageEmoji('💫', 'Tontura brilhante', ['magico']),
      createMessageEmoji('🔥', 'Fogo', ['quente']),
      createMessageEmoji('🎁', 'Presente', ['gift']),
      createMessageEmoji('🎈', 'Balão', ['festa']),
      createMessageEmoji('🏆', 'Troféu', ['vitoria']),
      createMessageEmoji('🥇', 'Medalha', ['primeiro']),
      createMessageEmoji('🚀', 'Foguete', ['crescimento']),
      createMessageEmoji('💎', 'Diamante', ['premium']),
    ],
  },
  {
    id: 'simbolos',
    title: 'Símbolos',
    icon: '✅',
    description: 'Ações rápidas e marcações',
    emojis: [
      createMessageEmoji('✅', 'Confirmado', ['ok', 'feito']),
      createMessageEmoji('☑️', 'Marcado', ['check']),
      createMessageEmoji('❌', 'Erro', ['nao']),
      createMessageEmoji('⚠️', 'Atenção', ['alerta']),
      createMessageEmoji('📌', 'Fixar', ['pin']),
      createMessageEmoji('📢', 'Aviso', ['anuncio']),
      createMessageEmoji('🔒', 'Privado', ['seguro']),
      createMessageEmoji('🔓', 'Aberto', ['liberado']),
      createMessageEmoji('💬', 'Mensagem', ['chat']),
      createMessageEmoji('📷', 'Foto', ['camera']),
      createMessageEmoji('🎥', 'Vídeo', ['video']),
      createMessageEmoji('🎧', 'Áudio', ['som']),
      createMessageEmoji('🎤', 'Microfone', ['voz']),
      createMessageEmoji('📎', 'Anexo', ['arquivo']),
      createMessageEmoji('🔗', 'Link', ['url']),
    ],
  },
]

const MESSAGE_EMOJI_INDEX = Array.from(
  new Map(
    MESSAGE_EMOJI_CATEGORIES
      .filter((category) => category.id !== 'recent')
      .flatMap((category) => category.emojis)
      .map((item) => [item.emoji, item]),
  ).values(),
)

const MESSAGE_EMOJI_LOOKUP = new Map(
  MESSAGE_EMOJI_INDEX.map((item) => [item.emoji, item]),
)

const MESSAGE_EMOJIS = MESSAGE_EMOJI_INDEX.map((item) => item.emoji)

const MESSAGE_QUICK_EMOJIS = ['❤️', '😂', '🔥', '😍', '👀', '✨', '😏', '💙']

function normalizeMessageEmojiText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getMessageEmojiItem(emoji: string): MessageEmojiItem {
  return (
    MESSAGE_EMOJI_LOOKUP.get(emoji) || {
      emoji,
      label: emoji,
      keywords: [],
    }
  )
}

function getMessageEmojiCategory(categoryId: MessageEmojiCategoryId) {
  return (
    MESSAGE_EMOJI_CATEGORIES.find((category) => category.id === categoryId) ||
    MESSAGE_EMOJI_CATEGORIES[1]
  )
}

function getVisibleMessageEmojis(
  categoryId: MessageEmojiCategoryId,
  search: string,
  recentEmojis: string[],
) {
  const query = normalizeMessageEmojiText(search)

  if (query) {
    return MESSAGE_EMOJI_INDEX.filter((item) => {
      const searchable = normalizeMessageEmojiText(
        [item.emoji, item.label, ...item.keywords].join(' '),
      )

      return searchable.includes(query)
    })
  }

  if (categoryId === 'recent') {
    return recentEmojis.map((emoji) => getMessageEmojiItem(emoji))
  }

  return getMessageEmojiCategory(categoryId).emojis
}

function groupMessageReactions(reactions: MessageReaction[], currentUserId: string) {
  const grouped: Record<string, { emoji: string; count: number; reactedByMe: boolean }> = {}

  for (const reaction of reactions) {
    if (!grouped[reaction.emoji]) {
      grouped[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        reactedByMe: false,
      }
    }

    grouped[reaction.emoji].count += 1

    if (reaction.user_id === currentUserId) {
      grouped[reaction.emoji].reactedByMe = true
    }
  }

  return Object.values(grouped)
}

function isMessageEdited(message: MessageRow) {
  if (message.edited_at && !message.deleted_at) return true
  if (!message.updated_at || message.deleted_at) return false

  const createdAt = new Date(message.created_at).getTime()
  const updatedAt = new Date(message.updated_at).getTime()

  return Math.abs(updatedAt - createdAt) > 3000
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { theme, setTheme } = useTheme()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localCallStreamRef = useRef<MediaStream | null>(null)
  const remoteCallStreamRef = useRef<MediaStream | null>(null)
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const callChannelReadyRef = useRef(false)
  const queuedCallSignalsRef = useRef<{ event: string; payload: Record<string, unknown> }[]>([])
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const remoteDescriptionReadyRef = useRef(false)
  const autoAcceptStoredCallRef = useRef(false)
  const callConnectedRef = useRef(false)
  const callConnectedAtRef = useRef<number | null>(null)
  const callNoAnswerTimerRef = useRef<number | null>(null)
  const callHistoryEventRecordedRef = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const conversationMenuButtonRef = useRef<HTMLButtonElement | null>(null)

  const conversationId = typeof params.id === 'string' ? params.id : ''

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [otherProfile, setOtherProfile] = useState<ProfileSummary | null>(null)
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [openMessageEmojiPicker, setOpenMessageEmojiPicker] = useState(false)
  const [messageEmojiSearch, setMessageEmojiSearch] = useState('')
  const [activeMessageEmojiCategory, setActiveMessageEmojiCategory] =
    useState<MessageEmojiCategoryId>('entreus')
  const [recentMessageEmojis, setRecentMessageEmojis] = useState<string[]>([])
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([])
  const [openReactionMessageId, setOpenReactionMessageId] = useState<string | null>(null)
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null)
  const [messageMenuPosition, setMessageMenuPosition] = useState({ left: 0, top: 0 })
  const [openConversationMenu, setOpenConversationMenu] = useState(false)
  const [conversationMenuPosition, setConversationMenuPosition] = useState({ left: 0, top: 0 })
  const [conversationState, setConversationState] = useState<ConversationUserState | null>(null)
  const [conversationActionLoading, setConversationActionLoading] = useState(false)
  const [blockedForConversation, setBlockedForConversation] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [replyingToMessage, setReplyingToMessage] = useState<MessageRow | null>(null)
  const [savingMessageEdit, setSavingMessageEdit] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [callMode, setCallMode] = useState<CallMode>('voice')
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [callModalOpen, setCallModalOpen] = useState(false)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [callError, setCallError] = useState('')
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null)
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [remoteAudioBlocked, setRemoteAudioBlocked] = useState(false)
  const [callChannelReady, setCallChannelReady] = useState(false)

  const otherUserId = useMemo(() => {
    return participants.find((participant) => participant.user_id !== userId)?.user_id || ''
  }, [participants, userId])

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [conversations])

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) return sortedConversations

    return sortedConversations.filter((conversation) => {
      const name = getDisplayName(conversation.otherUser).toLowerCase()
      const username = getUsername(conversation.otherUser).toLowerCase()
      const preview = getMessagePreview(conversation.lastMessage, userId).toLowerCase()

      return name.includes(query) || username.includes(query) || preview.includes(query)
    })
  }, [searchQuery, sortedConversations, userId])

  function updateConversationMenuPosition() {
    if (typeof window === 'undefined') return

    const button = conversationMenuButtonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = 256
    const estimatedMenuHeight = 260
    const viewportPadding = 8

    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    )

    const preferredTop = rect.bottom + viewportPadding
    const top =
      preferredTop + estimatedMenuHeight > window.innerHeight
        ? Math.max(viewportPadding, rect.top - estimatedMenuHeight - viewportPadding)
        : preferredTop

    setConversationMenuPosition({ left, top })
  }

  function updateMessageMenuPosition(button: HTMLButtonElement) {
    if (typeof window === 'undefined') return

    const rect = button.getBoundingClientRect()
    const menuWidth = 256
    const estimatedMenuHeight = 250
    const viewportPadding = 8

    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    )

    const preferredTop = rect.bottom + viewportPadding
    const top =
      preferredTop + estimatedMenuHeight > window.innerHeight
        ? Math.max(viewportPadding, rect.top - estimatedMenuHeight - viewportPadding)
        : preferredTop

    setMessageMenuPosition({ left, top })
  }

  useEffect(() => {
    setMounted(true)

    return () => {
      stopRecordingTracks()
      endCall(false)

      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!openConversationMenu) return

    updateConversationMenuPosition()

    function handleViewportChange() {
      updateConversationMenuPosition()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenConversationMenu(false)
      }
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openConversationMenu])

  useEffect(() => {
    if (!openMessageMenuId) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMessageMenuId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMessageMenuId])

  useEffect(() => {
    async function loadPage() {
      if (!conversationId) {
        setMessage('Conversa inválida.')
        setLoading(false)
        return
      }

      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setCurrentProfile(profileData as CurrentProfile)
      }

      await Promise.all([
        loadUnreadNotificationsCount(user.id),
        loadConversationList(user.id),
        loadConversation(user.id),
      ])

      setLoading(false)
    }

    loadPage()
  }, [conversationId, router])

  useEffect(() => {
    if (!userId) return

    let refreshTimer: number | null = null

    function scheduleConversationListRefresh() {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }

      refreshTimer = window.setTimeout(() => {
        loadConversationList(userId)
        loadUnreadNotificationsCount(userId)
      }, 250)
    }

    const conversationListMessagesChannel = supabase
      .channel(`conversation-list-messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          scheduleConversationListRefresh()
        }
      )
      .subscribe()

    const conversationListParticipantsChannel = supabase
      .channel(`conversation-list-participants-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleConversationListRefresh()
        }
      )
      .subscribe()

    const conversationListStateChannel = supabase
      .channel(`conversation-list-state-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_user_state',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleConversationListRefresh()
        }
      )
      .subscribe()

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }

      supabase.removeChannel(conversationListMessagesChannel)
      supabase.removeChannel(conversationListParticipantsChannel)
      supabase.removeChannel(conversationListStateChannel)
    }
  }, [userId])

  useEffect(() => {
    if (!conversationId || !userId) return

    const messagesChannel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const receivedMessage = payload.new as MessageRow

            setMessages((current) => {
              const exists = current.some((item) => item.id === receivedMessage.id)
              if (exists) return current

              const replyTo = receivedMessage.reply_to_message_id
                ? current.find((item) => item.id === receivedMessage.reply_to_message_id)
                : null

              return [
                ...current,
                {
                  ...receivedMessage,
                  attachments: [],
                  replyTo: receivedMessage.reply_to_message_id
                    ? replyTo
                      ? {
                          id: replyTo.id,
                          sender_id: replyTo.sender_id,
                          authorName: replyTo.sender_id === userId ? 'Voce' : otherName,
                          preview: getMessageReplyPreviewText(replyTo),
                        }
                      : {
                          id: receivedMessage.reply_to_message_id,
                          sender_id: '',
                          authorName: 'Mensagem',
                          preview: 'Mensagem original indisponivel',
                          unavailable: true,
                        }
                    : null,
                },
              ]
            })

            markConversationAsRead(userId)
            loadConversationList(userId)
          }

          if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as MessageRow

            setMessages((current) =>
              current.map((item) =>
                item.id === updatedMessage.id
                  ? {
                      ...item,
                      ...updatedMessage,
                      attachments: item.attachments || [],
                    }
                  : item
              )
            )
          }
        }
      )
      .subscribe()

    const attachmentsChannel = supabase
      .channel(`message-attachments-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_attachments',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const attachment = payload.new as MessageAttachment
            const attachmentWithUrl = await attachSignedUrl(attachment)

            setMessages((current) =>
              current.map((item) => {
                if (item.id !== attachmentWithUrl.message_id) return item

                const currentAttachments = item.attachments || []
                const exists = currentAttachments.some(
                  (media) => media.id === attachmentWithUrl.id
                )

                if (exists) return item

                return {
                  ...item,
                  attachments: [...currentAttachments, attachmentWithUrl].sort(
                    (a, b) => a.position - b.position
                  ),
                }
              })
            )
          }

          if (payload.eventType === 'DELETE') {
            const deletedAttachment = payload.old as MessageAttachment

            setMessages((current) =>
              current.map((item) => ({
                ...item,
                attachments: (item.attachments || []).filter(
                  (media) => media.id !== deletedAttachment.id
                ),
              }))
            )
          }
        }
      )
      .subscribe()

    const reactionsChannel = supabase
      .channel(`message-reactions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const reaction = payload.new as MessageReaction

            setMessages((current) =>
              current.map((item) => {
                if (item.id !== reaction.message_id) return item

                const currentReactions = item.reactions || []
                const exists = currentReactions.some(
                  (currentReaction) => currentReaction.id === reaction.id
                )

                if (exists) return item

                return {
                  ...item,
                  reactions: [...currentReactions, reaction],
                }
              })
            )
          }

          if (payload.eventType === 'UPDATE') {
            const updatedReaction = payload.new as MessageReaction

            setMessages((current) =>
              current.map((item) => {
                if (item.id !== updatedReaction.message_id) return item

                const currentReactions = item.reactions || []
                const exists = currentReactions.some(
                  (reaction) => reaction.id === updatedReaction.id
                )

                return {
                  ...item,
                  reactions: exists
                    ? currentReactions.map((reaction) =>
                        reaction.id === updatedReaction.id ? updatedReaction : reaction
                      )
                    : [...currentReactions, updatedReaction],
                }
              })
            )
          }

          if (payload.eventType === 'DELETE') {
            const deletedReaction = payload.old as MessageReaction

            setMessages((current) =>
              current.map((item) => ({
                ...item,
                reactions: (item.reactions || []).filter(
                  (reaction) => reaction.id !== deletedReaction.id
                ),
              }))
            )
          }
        }
      )
      .subscribe()

    const conversationStateChannel = supabase
      .channel(`conversation-user-state-${conversationId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_user_state',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadMessagesWithAttachments(userId)
          loadConversationList(userId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(attachmentsChannel)
      supabase.removeChannel(reactionsChannel)
      supabase.removeChannel(conversationStateChannel)
    }
  }, [conversationId, userId])

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior,
        block: 'end',
      })
    })
  }

  function handleJumpToReply(messageId: string | null | undefined) {
    if (!messageId) {
      setMessage('Mensagem original nÃ£o estÃ¡ disponÃ­vel.')
      return
    }

    const target = messageRefs.current[messageId]

    if (!target) {
      setMessage('Mensagem original nÃ£o estÃ¡ disponÃ­vel.')
      return
    }

    setMessage('')
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)

    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current))
    }, 2600)
  }

  useEffect(() => {
    scrollToBottom('auto')

    const firstTimer = window.setTimeout(() => {
      scrollToBottom('auto')
    }, 150)

    const secondTimer = window.setTimeout(() => {
      scrollToBottom('smooth')
    }, 600)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [conversationId, messages.length])

  useEffect(() => {
    if (selectedMedia.length > 0) {
      scrollToBottom('smooth')
    }
  }, [selectedMedia.length])

  useEffect(() => {
    attachLocalMediaStream(localCallStream)
  }, [localCallStream])

  useEffect(() => {
    attachRemoteMediaStream(remoteCallStream)
  }, [remoteCallStream])

  useEffect(() => {
    if (
      autoAcceptStoredCallRef.current &&
      incomingCall &&
      userId &&
      callChannelReadyRef.current
    ) {
      autoAcceptStoredCallRef.current = false
      acceptCall()
    }
  }, [callChannelReady, incomingCall, userId])

  useEffect(() => {
    if (!conversationId || typeof window === 'undefined') return
    if (searchParams.get('call') !== 'accept') return

    const storedCall = sessionStorage.getItem(`entreus:incoming-call:${conversationId}`)
    if (!storedCall) return

    try {
      const parsedCall = JSON.parse(storedCall) as IncomingCall
      setIncomingCall(parsedCall)
      setCallMode(parsedCall.mode)
      setCallStatus('ringing')
      setCallModalOpen(true)
      setCallError('')
      autoAcceptStoredCallRef.current = true
      sessionStorage.removeItem(`entreus:incoming-call:${conversationId}`)
    } catch {
      sessionStorage.removeItem(`entreus:incoming-call:${conversationId}`)
    }
  }, [conversationId, searchParams])

  useEffect(() => {
    if (!conversationId || !userId) return

    const callChannel = supabase
      .channel(`chat-call-${conversationId}`)
      .on('broadcast', { event: 'call-offer' }, ({ payload }) => {
        if (payload?.fromUserId === userId) return

        pendingIceCandidatesRef.current = []
        remoteDescriptionReadyRef.current = false
        setIncomingCall({
          fromUserId: payload.fromUserId,
          mode: payload.mode,
          offer: payload.offer,
        })
        setCallMode(payload.mode)
        setCallStatus('ringing')
        setCallModalOpen(true)
        setCallError('')
      })
      .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
        if (payload?.fromUserId === userId) return

        try {
          if (peerConnectionRef.current && payload?.answer) {
            logCallDebug('call: received answer')
            await peerConnectionRef.current.setRemoteDescription(payload.answer)
            remoteDescriptionReadyRef.current = true
            await flushPendingIceCandidates()
            clearCallNoAnswerTimer()
            setCallStatus('connecting')
          }
        } catch {
          setCallStatus('error')
          setCallError('Não foi possível conectar a chamada.')
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload?.fromUserId === userId) return

        try {
          if (!payload?.candidate) return

          logCallDebug('call: received ice candidate')

          if (!peerConnectionRef.current || !remoteDescriptionReadyRef.current) {
            pendingIceCandidatesRef.current.push(payload.candidate)
            return
          }

          await peerConnectionRef.current.addIceCandidate(payload.candidate)
        } catch {
          // ICE candidates can arrive while the peer is closing. Ignore safely.
        }
      })
      .on('broadcast', { event: 'call-ended' }, ({ payload }) => {
        if (payload?.fromUserId === userId) return
        endCall(false)
      })
      .on('broadcast', { event: 'call-rejected' }, ({ payload }) => {
        if (payload?.fromUserId === userId) return
        setCallStatus('ended')
        setCallError('Chamada recusada.')
        window.setTimeout(() => endCall(false), 1200)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          callChannelReadyRef.current = true
          setCallChannelReady(true)
          flushQueuedCallSignals()
        }
      })

    callChannelRef.current = callChannel

    return () => {
      callChannelRef.current = null
      callChannelReadyRef.current = false
      setCallChannelReady(false)
      queuedCallSignalsRef.current = []
      supabase.removeChannel(callChannel)
    }
  }, [conversationId, userId])

  async function loadUnreadNotificationsCount(currentUserId: string) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('read', false)

    if (error) {
      setMessage('Erro ao carregar notificações: ' + error.message)
      return
    }

    setUnreadNotificationsCount(count || 0)
  }

  async function loadConversationList(currentUserId: string) {
    const { data: myParticipants, error: myParticipantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .eq('user_id', currentUserId)

    if (myParticipantsError) {
      setMessage('Erro ao carregar conversas: ' + myParticipantsError.message)
      return
    }

    const myParticipantRows = (myParticipants || []) as ConversationParticipantRow[]
    const conversationIds = myParticipantRows.map((item) => item.conversation_id)

    if (conversationIds.length === 0) {
      setConversations([])
      return
    }

    const myParticipantByConversation = myParticipantRows.reduce(
      (acc, participant) => {
        acc[participant.conversation_id] = participant
        return acc
      },
      {} as Record<string, ConversationParticipantRow>
    )

    const { data: conversationStatesData, error: conversationStatesError } = await supabase
      .from('conversation_user_state')
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .eq('user_id', currentUserId)
      .in('conversation_id', conversationIds)

    if (conversationStatesError) {
      setMessage('Erro ao carregar estado das conversas: ' + conversationStatesError.message)
      return
    }

    const stateByConversation = ((conversationStatesData || []) as ConversationUserState[]).reduce(
      (acc, item) => {
        acc[item.conversation_id] = item
        return acc
      },
      {} as Record<string, ConversationUserState>
    )

    const { data: conversationsData, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, type, direct_key, created_by, created_at, updated_at')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })

    if (conversationsError) {
      setMessage('Erro ao carregar conversas: ' + conversationsError.message)
      return
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', conversationIds)

    if (participantsError) {
      setMessage('Erro ao carregar participantes: ' + participantsError.message)
      return
    }

    const participantRows = (participantsData || []) as ConversationParticipantRow[]

    const otherUserIds = Array.from(
      new Set(
        participantRows
          .map((item) => item.user_id)
          .filter((participantUserId) => participantUserId !== currentUserId)
      )
    )

    let profilesById: Record<string, ProfileSummary> = {}

    if (otherUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', otherUserIds)

      if (profilesError) {
        setMessage('Erro ao carregar perfis: ' + profilesError.message)
        return
      }

      profilesById = ((profilesData || []) as ProfileSummary[]).reduce(
        (acc, profile) => {
          acc[profile.id] = profile
          return acc
        },
        {} as Record<string, ProfileSummary>
      )
    }

    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, call_type, call_status, call_duration_seconds, reply_to_message_id, edited_at, deleted_by, created_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300)

    if (messagesError) {
      setMessage('Erro ao carregar últimas mensagens: ' + messagesError.message)
      return
    }

    const lastMessageByConversation: Record<string, ConversationPreviewMessage> = {}

    for (const item of (messagesData || []) as ConversationPreviewMessage[]) {
      const currentState = stateByConversation[item.conversation_id]
      const clearedAt = currentState?.cleared_at
        ? new Date(currentState.cleared_at).getTime()
        : 0
      const deletedAt = currentState?.deleted_at
        ? new Date(currentState.deleted_at).getTime()
        : 0
      const hiddenBefore = Math.max(clearedAt, deletedAt)

      if (hiddenBefore && new Date(item.created_at).getTime() <= hiddenBefore) {
        continue
      }

      if (!lastMessageByConversation[item.conversation_id]) {
        lastMessageByConversation[item.conversation_id] = item
      }
    }

    const items: ConversationItem[] = ((conversationsData || []) as ConversationRow[]).flatMap(
      (conversation) => {
        const conversationParticipants = participantRows.filter(
          (participant) => participant.conversation_id === conversation.id
        )

        const otherParticipant = conversationParticipants.find(
          (participant) => participant.user_id !== currentUserId
        )

        const lastMessage = lastMessageByConversation[conversation.id] || null
        const myParticipant = myParticipantByConversation[conversation.id]
        const currentState = stateByConversation[conversation.id]
        const deletedAt = currentState?.deleted_at
          ? new Date(currentState.deleted_at).getTime()
          : 0
        const lastMessageAt = lastMessage?.created_at
          ? new Date(lastMessage.created_at).getTime()
          : 0
        const reactivatedAfterDelete = !!(deletedAt && lastMessageAt > deletedAt)

        if (deletedAt && !reactivatedAfterDelete) {
          return []
        }

        const archived = !!currentState?.archived_at && !reactivatedAfterDelete
        const lastReadAt = myParticipant?.last_read_at
          ? new Date(myParticipant.last_read_at).getTime()
          : 0
        const clearedAt = currentState?.cleared_at
          ? new Date(currentState.cleared_at).getTime()
          : 0

        const isUnread = !!(
          lastMessage &&
          !lastMessage.deleted_at &&
          lastMessage.sender_id !== currentUserId &&
          new Date(lastMessage.created_at).getTime() > clearedAt &&
          new Date(lastMessage.created_at).getTime() > lastReadAt
        )

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: otherParticipant ? profilesById[otherParticipant.user_id] || null : null,
          lastMessage,
          isUnread,
          archived,
        }
      }
    )

    setConversations(items)
  }

  async function loadConversation(currentUserId: string) {
    setMessage('')

    const { data: membership, error: membershipError } = await supabase
      .from('conversation_participants')
      .select('id, conversation_id, user_id, last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (membershipError) {
      setMessage('Erro ao verificar conversa: ' + membershipError.message)
      return
    }

    if (!membership) {
      setMessage('Você não participa desta conversa.')
      return
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('id, conversation_id, user_id, last_read_at')
      .eq('conversation_id', conversationId)

    if (participantsError) {
      setMessage('Erro ao carregar participantes: ' + participantsError.message)
      return
    }

    const participantRows = (participantsData || []) as ParticipantRow[]
    setParticipants(participantRows)

    const participantUserIds = participantRows.map((participant) => participant.user_id)

    if (participantUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', participantUserIds)

      if (profilesError) {
        setMessage('Erro ao carregar perfil da conversa: ' + profilesError.message)
        return
      }

      const profiles = (profilesData || []) as ProfileSummary[]
      const other = profiles.find((profile) => profile.id !== currentUserId) || null
      setOtherProfile(other)

      if (other?.id) {
        const blocked = await hasBlockBetweenUsers(currentUserId, other.id)
        setBlockedForConversation(blocked)
      }
    }

    const { data: stateData, error: stateError } = await supabase
      .from('conversation_user_state')
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (stateError) {
      setMessage('Erro ao carregar preferÃªncias da conversa: ' + stateError.message)
      return
    }

    setConversationState((stateData as ConversationUserState | null) || null)

    await loadMessagesWithAttachments(currentUserId)
    await markConversationAsRead(currentUserId)
  }

  async function attachSignedUrl(attachment: MessageAttachment) {
    const { data, error } = await supabase.storage
      .from('message-media')
      .createSignedUrl(attachment.storage_path, 60 * 60)

    if (error) {
      console.error('Erro ao gerar URL privada da mídia:', error.message)
      return attachment
    }

    return {
      ...attachment,
      signed_url: data.signedUrl,
    }
  }

  async function loadAttachmentsForMessages(messageIds: string[]) {
    if (messageIds.length === 0) return {}

    const { data, error } = await supabase
      .from('message_attachments')
      .select(
        'id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, created_at'
      )
      .in('message_id', messageIds)
      .order('position', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar mídias da conversa: ' + error.message)
      return {}
    }

    const attachmentsWithUrls = await Promise.all(
      ((data || []) as MessageAttachment[]).map((attachment) =>
        attachSignedUrl(attachment)
      )
    )

    return attachmentsWithUrls.reduce(
      (acc, attachment) => {
        if (!acc[attachment.message_id]) acc[attachment.message_id] = []
        acc[attachment.message_id].push(attachment)
        return acc
      },
      {} as Record<string, MessageAttachment[]>
    )
  }

  async function loadReactionsForMessages(messageIds: string[]) {
    if (messageIds.length === 0) return {}

    const { data, error } = await supabase
      .from('message_reactions')
      .select('id, message_id, conversation_id, user_id, emoji, created_at, updated_at')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar reações da conversa: ' + error.message)
      return {}
    }

    return ((data || []) as MessageReaction[]).reduce(
      (acc, reaction) => {
        if (!acc[reaction.message_id]) acc[reaction.message_id] = []
        acc[reaction.message_id].push(reaction)
        return acc
      },
      {} as Record<string, MessageReaction[]>
    )
  }

  async function loadMessagesWithAttachments(currentUserId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, call_type, call_status, call_duration_seconds, reply_to_message_id, edited_at, deleted_by, created_at, updated_at, deleted_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage('Erro ao carregar mensagens: ' + error.message)
      return
    }

    const loadedMessages = (data || []) as MessageRow[]

    const { data: hiddenData, error: hiddenError } = await supabase
      .from('message_hidden_for_users')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)

    if (hiddenError) {
      setMessage('Erro ao carregar mensagens ocultas: ' + hiddenError.message)
      return
    }

    const hiddenMessageIds = new Set(
      ((hiddenData || []) as { message_id: string }[]).map((item) => item.message_id)
    )

    const { data: stateData, error: stateError } = await supabase
      .from('conversation_user_state')
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (stateError) {
      setMessage('Erro ao carregar preferÃªncias da conversa: ' + stateError.message)
      return
    }

    const currentState = (stateData as ConversationUserState | null) || null
    const clearedAt = currentState?.cleared_at
      ? new Date(currentState.cleared_at).getTime()
      : 0
    const deletedAt = currentState?.deleted_at
      ? new Date(currentState.deleted_at).getTime()
      : 0
    const hiddenBefore = Math.max(clearedAt, deletedAt)

    setConversationState(currentState)

    const visibleMessages = loadedMessages.filter(
      (item) => !hiddenMessageIds.has(item.id) && new Date(item.created_at).getTime() > hiddenBefore
    )

    const visibleMessageIds = visibleMessages.map((item) => item.id)

    const [attachmentMap, reactionMap] = await Promise.all([
      loadAttachmentsForMessages(visibleMessageIds),
      loadReactionsForMessages(visibleMessageIds),
    ])

    const messagesWithAttachments = visibleMessages.map((item) => ({
      ...item,
      attachments: attachmentMap[item.id] || [],
      reactions: reactionMap[item.id] || [],
    }))

    const messagesById = messagesWithAttachments.reduce(
      (acc, item) => {
        acc[item.id] = item
        return acc
      },
      {} as Record<string, MessageRow>
    )

    setMessages(
      messagesWithAttachments.map((item) => {
        const replyTo = item.reply_to_message_id
          ? messagesById[item.reply_to_message_id]
          : null

        return {
          ...item,
          replyTo: item.reply_to_message_id
            ? replyTo
              ? {
                  id: replyTo.id,
                  sender_id: replyTo.sender_id,
                  authorName: replyTo.sender_id === currentUserId ? 'Voce' : otherName,
                  preview: getMessageReplyPreviewText(replyTo),
                }
              : {
                  id: item.reply_to_message_id,
                  sender_id: '',
                  authorName: 'Mensagem',
                  preview: 'Mensagem original indisponivel',
                  unavailable: true,
                }
            : null,
        }
      })
    )
  }

  async function markConversationAsRead(currentUserId: string) {
    await supabase
      .from('conversation_participants')
      .update({
        last_read_at: new Date().toISOString(),
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId)
  }

  async function hasBlockBetweenUsers(currentUserId: string, targetUserId: string) {
    if (!targetUserId) return false

    const { data: blockedByMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', targetUserId)
      .maybeSingle()

    const { data: blockedMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', targetUserId)
      .eq('blocked_id', currentUserId)
      .maybeSingle()

    return !!blockedByMe || !!blockedMe
  }

  async function handleClearConversationForMe() {
    if (!userId || !conversationId || conversationActionLoading) return

    const confirmed = window.confirm(
      'Limpar esta conversa somente para vocÃª? As mensagens antigas continuarÃ£o visÃ­veis para a outra pessoa.'
    )

    if (!confirmed) return

    const clearedAt = new Date().toISOString()

    setConversationActionLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('conversation_user_state')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          cleared_at: clearedAt,
          deleted_at: null,
          updated_at: clearedAt,
        },
        {
          onConflict: 'conversation_id,user_id',
        }
      )
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .single()

    if (error) {
      setMessage('Erro ao limpar conversa para vocÃª: ' + error.message)
      setConversationActionLoading(false)
      return
    }

    setConversationState(data as ConversationUserState)
    setMessages((current) =>
      current.filter((item) => new Date(item.created_at).getTime() > new Date(clearedAt).getTime())
    )
    setOpenConversationMenu(false)
    setConversationActionLoading(false)
    setMessage('Conversa limpa somente para vocÃª.')
    await loadConversationList(userId)
  }

  async function handleToggleArchiveConversationForMe() {
    if (!userId || !conversationId || conversationActionLoading) return

    const confirmed = window.confirm(
      'Ocultar esta conversa da sua lista principal? VocÃª ainda poderÃ¡ voltar a ela se abrir o link da conversa.'
    )

    if (!confirmed) return

    const archivedAt = new Date().toISOString()

    setConversationActionLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('conversation_user_state')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          archived_at: archivedAt,
          updated_at: archivedAt,
        },
        {
          onConflict: 'conversation_id,user_id',
        }
      )
      .select('conversation_id, user_id, cleared_at, archived_at')
      .single()

    if (error) {
      setMessage('Erro ao ocultar conversa: ' + error.message)
      setConversationActionLoading(false)
      return
    }

    setConversationState(data as ConversationUserState)
    setOpenConversationMenu(false)
    setConversationActionLoading(false)
    setMessage('Conversa ocultada da sua lista principal.')
    await loadConversationList(userId)
    router.push('/messages')
  }

  async function handleArchiveActionForMe() {
    if (!userId || !conversationId || conversationActionLoading) return

    const archived = !!conversationState?.archived_at
    const confirmed = window.confirm(
      archived
        ? 'Desarquivar esta conversa e voltar para Recentes?'
        : 'Arquivar esta conversa? Ela ficara disponivel na aba Arquivadas.'
    )

    if (!confirmed) return

    const now = new Date().toISOString()

    setConversationActionLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('conversation_user_state')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          archived_at: archived ? null : now,
          deleted_at: null,
          updated_at: now,
        },
        {
          onConflict: 'conversation_id,user_id',
        }
      )
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .single()

    if (error) {
      setMessage(archived ? 'Erro ao desarquivar conversa: ' + error.message : 'Erro ao arquivar conversa: ' + error.message)
      setConversationActionLoading(false)
      return
    }

    setConversationState(data as ConversationUserState)
    setOpenConversationMenu(false)
    setConversationActionLoading(false)
    setMessage(archived ? 'Conversa desarquivada.' : 'Conversa arquivada.')
    await loadConversationList(userId)
  }

  async function handleDeleteConversationForMe() {
    if (!userId || !conversationId || conversationActionLoading) return

    const confirmed = window.confirm('Excluir esta conversa apenas para voce?')

    if (!confirmed) return

    const deletedAt = new Date().toISOString()

    setConversationActionLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('conversation_user_state')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          cleared_at: deletedAt,
          archived_at: null,
          deleted_at: deletedAt,
          updated_at: deletedAt,
        },
        {
          onConflict: 'conversation_id,user_id',
        }
      )
      .select('conversation_id, user_id, cleared_at, archived_at, deleted_at')
      .single()

    if (error) {
      setMessage('Erro ao excluir conversa para voce: ' + error.message)
      setConversationActionLoading(false)
      return
    }

    setConversationState(data as ConversationUserState)
    setMessages([])
    setOpenConversationMenu(false)
    setConversationActionLoading(false)
    setMessage('Conversa excluida apenas para voce.')
    await loadConversationList(userId)
    router.push('/messages')
  }

  async function handleBlockUser() {
    if (!userId || !otherUserId || conversationActionLoading) return

    const confirmed = window.confirm(
      `Bloquear ${otherName}? VocÃªs nÃ£o poderÃ£o trocar mensagens enquanto o bloqueio existir.`
    )

    if (!confirmed) return

    setConversationActionLoading(true)
    setMessage('')

    const { error } = await supabase
      .from('blocks')
      .upsert(
        {
          blocker_id: userId,
          blocked_id: otherUserId,
        },
        {
          onConflict: 'blocker_id,blocked_id',
        }
      )

    if (error) {
      setMessage('Erro ao bloquear usuÃ¡rio: ' + error.message)
      setConversationActionLoading(false)
      return
    }

    setBlockedForConversation(true)
    setOpenConversationMenu(false)
    setConversationActionLoading(false)
    setMessage('UsuÃ¡rio bloqueado. O envio de mensagens e novas chamadas foram bloqueados.')
  }

  function handleSelectMedia(files: FileList | null) {
    if (!files) return

    const selectedFiles = Array.from(files)
    const maxFiles = 3
    const currentCount = selectedMedia.length

    if (currentCount + selectedFiles.length > maxFiles) {
      setMessage(`Você pode enviar no máximo ${maxFiles} mídias por mensagem.`)
      return
    }

    const validFiles: SelectedMedia[] = []

    for (const file of selectedFiles) {
      const mediaType = detectMediaType(file)

      if (!mediaType) {
        setMessage(
          'Envie imagens JPG, PNG, WEBP, GIF, vídeos MP4/WEBM/OGG ou áudios WEBM/OGG/MP3/MP4/WAV.'
        )
        return
      }

      const maxSize = 50 * 1024 * 1024

      if (file.size > maxSize) {
        setMessage('Cada mídia deve ter no máximo 50MB.')
        return
      }

      validFiles.push({
        file,
        mediaType,
        previewUrl: URL.createObjectURL(file),
      })
    }

    setMessage('')
    setSelectedMedia((current) => [...current, ...validFiles])

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function removeSelectedMedia(indexToRemove: number) {
    setSelectedMedia((current) => {
      const item = current[indexToRemove]
      if (item) URL.revokeObjectURL(item.previewUrl)

      return current.filter((_, index) => index !== indexToRemove)
    })
  }

  function stopRecordingTracks() {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
    }
  }

  async function handleStartAudioRecording() {
    if (recordingAudio || sending || uploadingMedia) return

    if (selectedMedia.length >= 3) {
      setMessage('Você pode enviar no máximo 3 mídias por mensagem.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Seu navegador não permite gravação de áudio.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setMessage('Seu navegador não suporta gravação de áudio.')
      return
    }

    try {
      setMessage('')
      recordingChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream

      const mimeType = getAudioMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || mimeType
        const blob = new Blob(recordingChunksRef.current, { type: finalMimeType })
        const extension = getAudioFileExtension(finalMimeType)
        const file = new File([blob], `audio-${Date.now()}.${extension}`, {
          type: finalMimeType.split(';')[0],
        })

        setSelectedMedia((current) => [
          ...current,
          {
            file,
            mediaType: 'audio',
            previewUrl: URL.createObjectURL(blob),
          },
        ])

        recordingChunksRef.current = []
        stopRecordingTracks()
      }

      mediaRecorderRef.current = recorder
      recorder.start()

      setRecordingAudio(true)
      setRecordingSeconds(0)

      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current)
      }

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1)
      }, 1000)
    } catch {
      stopRecordingTracks()
      setRecordingAudio(false)
      setRecordingSeconds(0)

      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      setMessage('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  function handleStopAudioRecording() {
    if (!recordingAudio) return

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    setRecordingAudio(false)

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!userId || !conversationId) return

    const targetMessage = messages.find((item) => item.id === messageId)

    if (!targetMessage || targetMessage.deleted_at) return

    const currentReactions = targetMessage.reactions || []
    const myReaction = currentReactions.find((reaction) => reaction.user_id === userId)

    setOpenReactionMessageId(null)
    setMessage('')

    if (myReaction?.emoji === emoji) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)

      if (error) {
        setMessage('Erro ao remover reação: ' + error.message)
        return
      }

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                reactions: (item.reactions || []).filter(
                  (reaction) => reaction.user_id !== userId
                ),
              }
            : item
        )
      )

      return
    }

    const { data, error } = await supabase
      .from('message_reactions')
      .upsert(
        {
          message_id: messageId,
          conversation_id: conversationId,
          user_id: userId,
          emoji,
        },
        {
          onConflict: 'message_id,user_id',
        }
      )
      .select('id, message_id, conversation_id, user_id, emoji, created_at, updated_at')
      .single()

    if (error || !data) {
      setMessage('Erro ao reagir à mensagem: ' + (error?.message || 'tente novamente.'))
      return
    }

    const savedReaction = data as MessageReaction

    setMessages((current) =>
      current.map((item) => {
        if (item.id !== messageId) return item

        const otherReactions = (item.reactions || []).filter(
          (reaction) => reaction.user_id !== userId
        )

        return {
          ...item,
          reactions: [...otherReactions, savedReaction],
        }
      })
    )
  }

  function handleStartEditMessage(item: MessageRow) {
    if (!userId || item.sender_id !== userId || item.deleted_at || item.type === 'call') return

    if (!item.content?.trim()) {
      setMessage('Esta mensagem não tem texto para editar.')
      return
    }

    setEditingMessageId(item.id)
    setEditingMessageContent(item.content)
    setNewMessage(item.content)
    setReplyingToMessage(null)
    setOpenMessageMenuId(null)
    setOpenReactionMessageId(null)
    setMessage('')
  }

  function handleCancelEditMessage() {
    setEditingMessageId(null)
    setEditingMessageContent('')
    setNewMessage('')
    setSavingMessageEdit(false)
  }

  async function handleSaveEditedMessage(messageId: string, nextContent?: string) {
    if (!userId || !conversationId) return

    const content = (nextContent ?? editingMessageContent).trim()

    if (!content) {
      setMessage('A mensagem não pode ficar vazia. Para remover, use “apagar para todos”.')
      return
    }

    const targetMessage = messages.find((item) => item.id === messageId)

    if (!targetMessage || targetMessage.sender_id !== userId || targetMessage.deleted_at) {
      setMessage('Você não pode editar esta mensagem.')
      return
    }

    setSavingMessageEdit(true)
    setMessage('')

    const updatedAt = new Date().toISOString()

    const { error } = await supabase
      .from('messages')
      .update({
        content,
        edited_at: updatedAt,
        updated_at: updatedAt,
      })
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('sender_id', userId)
      .is('deleted_at', null)

    if (error) {
      setMessage('Erro ao editar mensagem: ' + error.message)
      setSavingMessageEdit(false)
      return
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              content,
              edited_at: updatedAt,
              updated_at: updatedAt,
            }
          : item
      )
    )

    await supabase
      .from('conversations')
      .update({
        updated_at: updatedAt,
      })
      .eq('id', conversationId)

    await loadConversationList(userId)

    setEditingMessageId(null)
    setEditingMessageContent('')
    setNewMessage('')
    setSavingMessageEdit(false)
  }

  function handleStartReplyMessage(item: MessageRow) {
    if (item.deleted_at) return

    setReplyingToMessage(item)
    setEditingMessageId(null)
    setEditingMessageContent('')
    setOpenMessageMenuId(null)
    setOpenReactionMessageId(null)
    setMessage('')
  }

  function handleCancelReplyMessage() {
    setReplyingToMessage(null)
  }

  async function handleHideMessageForMe(messageId: string) {
    if (!userId || !conversationId) return

    const targetMessage = messages.find((item) => item.id === messageId)

    if (!targetMessage) {
      setMessage('Mensagem não encontrada.')
      return
    }

    const confirmHide = window.confirm('Apagar esta mensagem só para você?')

    if (!confirmHide) return

    setOpenMessageMenuId(null)
    setOpenReactionMessageId(null)
    setMessage('')

    const { error } = await supabase
      .from('message_hidden_for_users')
      .upsert(
        {
          message_id: messageId,
          conversation_id: conversationId,
          user_id: userId,
        },
        {
          onConflict: 'message_id,user_id',
        }
      )

    if (error) {
      setMessage('Erro ao apagar só para mim: ' + error.message)
      return
    }

    setMessages((current) => current.filter((item) => item.id !== messageId))

    if (editingMessageId === messageId) {
      handleCancelEditMessage()
    }
  }

  async function handleDeleteMessageForEveryone(messageId: string) {
    if (!userId || !conversationId) return

    const targetMessage = messages.find((item) => item.id === messageId)

    if (!targetMessage || targetMessage.sender_id !== userId || targetMessage.deleted_at) {
      setMessage('Você não pode apagar esta mensagem.')
      return
    }

    const confirmDelete = window.confirm('Apagar esta mensagem para todos?')

    if (!confirmDelete) return

    setDeletingMessageId(messageId)
    setOpenMessageMenuId(null)
    setOpenReactionMessageId(null)
    setMessage('')

    const deletedAt = new Date().toISOString()
    const attachmentsToDelete = targetMessage.attachments || []

    if (false && attachmentsToDelete.length > 0) {
      const storagePaths = attachmentsToDelete
        .map((attachment) => attachment.storage_path)
        .filter(Boolean)

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('message-media')
          .remove(storagePaths)

        if (storageError) {
          console.error('Erro ao remover mídias da mensagem:', storageError)
        }
      }

      const { error: attachmentsError } = await supabase
        .from('message_attachments')
        .delete()
        .eq('message_id', messageId)
        .eq('sender_id', userId)

      if (attachmentsError) {
        console.error('Erro ao apagar anexos da mensagem:', attachmentsError)
      }
    }

    const { error: reactionsError } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)

    if (reactionsError) {
      console.error('Erro ao apagar reações da mensagem:', reactionsError.message)
    }

    const { error } = await supabase
      .from('messages')
      .update({
        content: null,
        deleted_at: deletedAt,
        deleted_by: userId,
        updated_at: deletedAt,
      })
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('sender_id', userId)

    if (error) {
      setMessage('Erro ao apagar mensagem: ' + error.message)
      setDeletingMessageId(null)
      return
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              content: null,
              deleted_at: deletedAt,
              deleted_by: userId,
              updated_at: deletedAt,
              attachments: [],
              reactions: [],
            }
          : item
      )
    )

    await supabase
      .from('conversations')
      .update({
        updated_at: deletedAt,
      })
      .eq('id', conversationId)

    await loadConversationList(userId)

    if (editingMessageId === messageId) {
      handleCancelEditMessage()
    }

    setDeletingMessageId(null)
  }

  async function handleDeleteAttachment(
    messageId: string,
    attachment: MessageAttachment
  ) {
    if (!userId || attachment.sender_id !== userId) return

    const confirmDelete = window.confirm('Deseja apagar esta mídia da conversa?')

    if (!confirmDelete) return

    setMessage('')

    const { error: storageError } = await supabase.storage
      .from('message-media')
      .remove([attachment.storage_path])

    if (storageError) {
      console.error('Erro ao remover arquivo do storage:', storageError.message)
    }

    const { error: deleteError } = await supabase
      .from('message_attachments')
      .delete()
      .eq('id', attachment.id)
      .eq('sender_id', userId)

    if (deleteError) {
      setMessage('Erro ao apagar mídia: ' + deleteError.message)
      return
    }

    const targetMessage = messages.find((item) => item.id === messageId)
    const remainingAttachments =
      targetMessage?.attachments?.filter((media) => media.id !== attachment.id) || []

    setMessages((current) =>
      current.map((item) => {
        if (item.id !== messageId) return item

        return {
          ...item,
          attachments: (item.attachments || []).filter(
            (media) => media.id !== attachment.id
          ),
        }
      })
    )

    if (!targetMessage?.content && remainingAttachments.length === 0) {
      const { error: messageError } = await supabase
        .from('messages')
        .update({
          deleted_at: new Date().toISOString(),
          content: null,
        })
        .eq('id', messageId)
        .eq('sender_id', userId)

      if (messageError) {
        console.error('Erro ao marcar mensagem como apagada:', messageError.message)
        return
      }

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                deleted_at: new Date().toISOString(),
                content: null,
                attachments: [],
              }
            : item
        )
      )
    }
  }

  async function uploadMessageMedia(messageId: string, files: SelectedMedia[]) {
    const attachmentsToInsert: Omit<MessageAttachment, 'id' | 'created_at'>[] = []

    for (let index = 0; index < files.length; index++) {
      const item = files[index]
      const fileExt = item.file.name.split('.').pop()?.toLowerCase() || 'file'
      const safeName = makeFileNameSafe(item.file.name)
      const storagePath = `${conversationId}/${userId}/message-${messageId}-${index}-${Date.now()}.${fileExt}`

      setUploadingMedia(true)

      const { error: uploadError } = await supabase.storage
        .from('message-media')
        .upload(storagePath, item.file, {
          cacheControl: '3600',
          upsert: false,
          contentType: item.file.type,
        })

      if (uploadError) {
        setUploadingMedia(false)
        throw new Error('Erro ao enviar mídia: ' + uploadError.message)
      }

      attachmentsToInsert.push({
        message_id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        storage_path: storagePath,
        media_type: item.mediaType,
        file_name: safeName,
        file_size: item.file.size,
        mime_type: item.file.type,
        position: index,
      })
    }

    if (attachmentsToInsert.length === 0) {
      setUploadingMedia(false)
      return []
    }

    const { data, error } = await supabase
      .from('message_attachments')
      .insert(attachmentsToInsert)
      .select(
        'id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, created_at'
      )

    setUploadingMedia(false)

    if (error) {
      throw new Error('Erro ao salvar anexos da mensagem: ' + error.message)
    }

    return Promise.all(
      ((data || []) as MessageAttachment[]).map((attachment) =>
        attachSignedUrl(attachment)
      )
    )
  }

  async function handleSendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const content = newMessage.trim()
    const hasMedia = selectedMedia.length > 0

    if ((!content && !hasMedia) || !userId || !conversationId || recordingAudio) return

    if (editingMessageId) {
      await handleSaveEditedMessage(editingMessageId, content)
      return
    }

    const blocked = await hasBlockBetweenUsers(userId, otherUserId)

    if (blocked) {
      setMessage('Não é possível enviar mensagem enquanto houver bloqueio entre vocês.')
      return
    }

    setSending(true)
    setMessage('')

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        type: 'text',
        content: content || null,
        reply_to_message_id: replyingToMessage?.id || null,
      })
      .select('id, conversation_id, sender_id, content, type, call_type, call_status, call_duration_seconds, reply_to_message_id, edited_at, deleted_by, created_at, updated_at, deleted_at')
      .single()

    if (error || !data) {
      setMessage('Erro ao enviar mensagem: ' + (error?.message || 'tente novamente.'))
      setSending(false)
      return
    }

    let uploadedAttachments: MessageAttachment[] = []

    try {
      uploadedAttachments = await uploadMessageMedia(data.id, selectedMedia)
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : 'Erro ao enviar mídia.')
      setSending(false)
      return
    }

    setMessages((current) => {
      const exists = current.some((item) => item.id === data.id)

      if (exists) {
        return current.map((item) =>
          item.id === data.id
            ? {
                ...item,
                attachments: uploadedAttachments,
              }
            : item
        )
      }

      return [
        ...current,
        {
          ...(data as MessageRow),
          attachments: uploadedAttachments,
          replyTo: replyingToMessage
            ? {
                id: replyingToMessage.id,
                sender_id: replyingToMessage.sender_id,
                authorName: replyingToMessage.sender_id === userId ? 'Voce' : otherName,
                preview: getMessageReplyPreviewText(replyingToMessage),
              }
            : null,
        },
      ]
    })

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    await markConversationAsRead(userId)
    await loadConversationList(userId)

    for (const item of selectedMedia) {
      URL.revokeObjectURL(item.previewUrl)
    }

    setNewMessage('')
    setReplyingToMessage(null)
    setOpenMessageEmojiPicker(false)
    setSelectedMedia([])
    setSending(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePostClick() {
    router.push('/feed')
  }

  function handleInsertMessageEmoji(emoji: string) {
    setNewMessage((current) => `${current}${emoji}`)
    setRecentMessageEmojis((current) => {
      return [emoji, ...current.filter((item) => item !== emoji)].slice(0, 24)
    })
    setMessageEmojiSearch('')
  }

  function sendCallSignal(event: string, payload: Record<string, unknown>) {
    if (!callChannelRef.current || !callChannelReadyRef.current) {
      queuedCallSignalsRef.current.push({ event, payload })
      return
    }

    callChannelRef.current.send({
      type: 'broadcast',
      event,
      payload: {
        ...payload,
        fromUserId: userId,
      },
    })
  }

  function flushQueuedCallSignals() {
    const queuedSignals = [...queuedCallSignalsRef.current]
    queuedCallSignalsRef.current = []

    queuedSignals.forEach((signal) => {
      sendCallSignal(signal.event, signal.payload)
    })
  }

  async function flushPendingIceCandidates() {
    if (!peerConnectionRef.current || !remoteDescriptionReadyRef.current) return

    const candidates = [...pendingIceCandidatesRef.current]
    pendingIceCandidatesRef.current = []

    for (const candidate of candidates) {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate)
      } catch {
        // Candidate can become stale after reconnection/close. Ignore safely.
      }
    }
  }

  function logCallDebug(message: string, details?: unknown) {
    if (process.env.NODE_ENV !== 'development') return

    if (details === undefined) {
      console.log(message)
      return
    }

    console.log(message, details)
  }

  function clearCallNoAnswerTimer() {
    if (!callNoAnswerTimerRef.current) return

    window.clearTimeout(callNoAnswerTimerRef.current)
    callNoAnswerTimerRef.current = null
  }

  function markCallConnected() {
    clearCallNoAnswerTimer()

    if (!callConnectedRef.current) {
      callConnectedAtRef.current = Date.now()
    }

    callConnectedRef.current = true
    setCallStatus('connected')
  }

  function getCurrentCallDurationSeconds() {
    if (!callConnectedAtRef.current) return null

    return Math.max(0, Math.round((Date.now() - callConnectedAtRef.current) / 1000))
  }

  async function recordCallHistoryEvent(
    status: CallHistoryStatus,
    mode: CallMode,
    durationSeconds: number | null = null
  ) {
    if (!userId || !conversationId || callHistoryEventRecordedRef.current) return

    callHistoryEventRecordedRef.current = true

    const content = getCallHistoryLabel({
      call_type: mode,
      call_status: status,
    })

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
        type: 'call',
        call_type: mode,
        call_status: status,
        call_duration_seconds: durationSeconds,
      })
      .select('id, conversation_id, sender_id, content, type, call_type, call_status, call_duration_seconds, reply_to_message_id, edited_at, deleted_by, created_at, updated_at, deleted_at')
      .single()

    if (error || !data) {
      callHistoryEventRecordedRef.current = false
      console.error('Erro ao registrar evento de chamada:', error?.message || 'sem retorno')
      return
    }

    setMessages((current) => {
      const exists = current.some((item) => item.id === data.id)
      if (exists) return current

      return [
        ...current,
        {
          ...(data as MessageRow),
          attachments: [],
          reactions: [],
        },
      ]
    })

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    await loadConversationList(userId)
  }

  function scheduleNoAnswerCallEvent(mode: CallMode) {
    clearCallNoAnswerTimer()

    callNoAnswerTimerRef.current = window.setTimeout(() => {
      if (callConnectedRef.current || callHistoryEventRecordedRef.current) return

      void recordCallHistoryEvent('missed', mode)
      sendCallSignal('call-ended', {
        reason: 'missed',
      })
      endCall(false)
    }, 45000)
  }

  function attachRemoteMediaStream(stream: MediaStream | null = remoteCallStreamRef.current) {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream
      remoteAudioRef.current.muted = false
      remoteAudioRef.current.volume = 1

      if (!stream) {
        setRemoteAudioBlocked(false)
        return
      }

      remoteAudioRef.current.play().then(() => {
        setRemoteAudioBlocked(false)
      }).catch(() => {
        setRemoteAudioBlocked(true)
      })
    }
  }

  function attachLocalMediaStream(stream: MediaStream | null = localCallStreamRef.current) {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
  }

  async function playRemoteAudio() {
    if (!remoteAudioRef.current) return

    try {
      remoteAudioRef.current.muted = false
      remoteAudioRef.current.volume = 1
      await remoteAudioRef.current.play()
      setRemoteAudioBlocked(false)
    } catch {
      setRemoteAudioBlocked(true)
    }
  }

  function sendGlobalIncomingCall(mode: CallMode, offer: RTCSessionDescriptionInit) {
    if (!otherUserId || !userId) return

    const channel = supabase.channel(`user-call-${otherUserId}`)

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return

      channel.send({
        type: 'broadcast',
        event: 'incoming-call',
        payload: {
          conversationId,
          callerId: userId,
          callerName: getDisplayName(currentProfile),
          callerAvatarUrl: currentProfile?.avatar_url || null,
          callType: mode === 'video' ? 'video' : 'audio',
          offer,
        },
      })

      window.setTimeout(() => {
        supabase.removeChannel(channel)
      }, 800)
    })
  }

  function createPeerConnection() {
    logCallDebug('call: creating peer connection')

    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    remoteCallStreamRef.current = null
    setRemoteCallStream(null)

    remoteDescriptionReadyRef.current = false

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal('ice-candidate', {
          candidate: event.candidate.toJSON(),
        })
      }
    }

    peerConnection.ontrack = (event) => {
      logCallDebug('call: received remote track', event.track.kind)

      const remoteStream = remoteCallStreamRef.current || new MediaStream()
      const alreadyAdded = remoteStream
        .getTracks()
        .some((track) => track.id === event.track.id)

      if (!alreadyAdded) {
        remoteStream.addTrack(event.track)
      }

      remoteCallStreamRef.current = remoteStream
      setRemoteCallStream(remoteStream)
      attachRemoteMediaStream(remoteStream)
      markCallConnected()
    }

    peerConnection.onconnectionstatechange = () => {
      logCallDebug('call: connection state', peerConnection.connectionState)

      if (peerConnection.connectionState === 'connected') {
        markCallConnected()
      }

      if (
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'disconnected'
      ) {
        setCallStatus('ended')
      }
    }

    peerConnection.oniceconnectionstatechange = () => {
      logCallDebug('call: ice connection state', peerConnection.iceConnectionState)
    }

    peerConnectionRef.current = peerConnection
    return peerConnection
  }

  function addLocalTracksToPeerConnection(peerConnection: RTCPeerConnection, stream: MediaStream, mode: CallMode) {
    stream.getTracks().forEach((track) => {
      const alreadyAdded = peerConnection
        .getSenders()
        .some((sender) => sender.track?.id === track.id)

      if (alreadyAdded) return

      logCallDebug('call: local track added', track.kind)
      peerConnection.addTrack(track, stream)
    })

    const hasAudioSender = peerConnection
      .getSenders()
      .some((sender) => sender.track?.kind === 'audio')

    const hasAudioTransceiver = peerConnection
      .getTransceivers()
      .some((transceiver) => {
        return (
          transceiver.sender.track?.kind === 'audio' ||
          transceiver.receiver.track.kind === 'audio'
        )
      })

    if (mode === 'voice' && !hasAudioSender && !hasAudioTransceiver) {
      logCallDebug('call: adding audio transceiver')
      peerConnection.addTransceiver('audio', { direction: 'sendrecv' })
    }
  }

  function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
    if (peerConnection.iceGatheringState === 'complete') {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        peerConnection.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange)
        resolve()
      }, 1800)

      function handleIceGatheringStateChange() {
        if (peerConnection.iceGatheringState !== 'complete') return

        window.clearTimeout(timeout)
        peerConnection.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange)
        resolve()
      }

      peerConnection.addEventListener('icegatheringstatechange', handleIceGatheringStateChange)
    })
  }

  async function getCallStream(mode: CallMode) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video' ? true : false,
      })

      const audioTracks = stream.getAudioTracks()
      logCallDebug('call: local audio tracks', audioTracks.length)

      if (audioTracks.length === 0 || audioTracks.every((track) => track.readyState !== 'live')) {
        stream.getTracks().forEach((track) => track.stop())
        setCallStatus('error')
        setCallError('Não foi possível acessar o microfone.')
        return null
      }

      localCallStreamRef.current = stream
      setLocalCallStream(stream)
      setMicEnabled(true)
      setCameraEnabled(mode === 'video')

      return stream
    } catch {
      setCallStatus('error')
      setCallError(
        mode === 'voice'
          ? 'Não foi possível acessar o microfone.'
          : 'Permita acesso ao microfone/câmera para iniciar a chamada.'
      )
      return null
    }
  }

  async function startCall(mode: CallMode) {
    if (!userId || !conversationId) return

    const blocked = await hasBlockBetweenUsers(userId, otherUserId)

    if (blocked) {
      setBlockedForConversation(true)
      setMessage('NÃ£o Ã© possÃ­vel iniciar chamada enquanto houver bloqueio entre vocÃªs.')
      return
    }

    setCallMode(mode)
    setCallStatus('calling')
    setCallModalOpen(true)
    setIncomingCall(null)
    setCallError('')
    pendingIceCandidatesRef.current = []
    callConnectedRef.current = false
    callConnectedAtRef.current = null
    callHistoryEventRecordedRef.current = false
    clearCallNoAnswerTimer()

    const stream = await getCallStream(mode)
    if (!stream) return

    const peerConnection = createPeerConnection()
    addLocalTracksToPeerConnection(peerConnection, stream, mode)

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    await waitForIceGatheringComplete(peerConnection)

    const localOffer = peerConnection.localDescription || offer

    sendCallSignal('call-offer', {
      mode,
      offer: localOffer,
    })

    sendGlobalIncomingCall(mode, localOffer)
    scheduleNoAnswerCallEvent(mode)
  }

  async function acceptCall() {
    if (!incomingCall) return

    setCallMode(incomingCall.mode)
    setCallStatus('connecting')
    setCallError('')
    callConnectedRef.current = false
    callConnectedAtRef.current = null
    callHistoryEventRecordedRef.current = false
    clearCallNoAnswerTimer()

    const stream = await getCallStream(incomingCall.mode)
    if (!stream) return

    const peerConnection = createPeerConnection()
    addLocalTracksToPeerConnection(peerConnection, stream, incomingCall.mode)

    await peerConnection.setRemoteDescription(incomingCall.offer)
    remoteDescriptionReadyRef.current = true
    await flushPendingIceCandidates()
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)
    await waitForIceGatheringComplete(peerConnection)

    const localAnswer = peerConnection.localDescription || answer

    sendCallSignal('call-answer', {
      answer: localAnswer,
    })

    setIncomingCall(null)
    setCallStatus('connecting')
    playRemoteAudio()
  }

  function rejectCall() {
    const mode = incomingCall?.mode || callMode

    void recordCallHistoryEvent('declined', mode)
    sendCallSignal('call-rejected', {})
    endCall(false)
  }

  function toggleMicrophone() {
    const audioTrack = localCallStreamRef.current?.getAudioTracks()[0]
    if (!audioTrack) return

    audioTrack.enabled = !audioTrack.enabled
    setMicEnabled(audioTrack.enabled)
  }

  function toggleCamera() {
    const videoTrack = localCallStreamRef.current?.getVideoTracks()[0]
    if (!videoTrack) return

    videoTrack.enabled = !videoTrack.enabled
    setCameraEnabled(videoTrack.enabled)
  }

  function endCall(notifyPeer: boolean = true) {
    const wasConnected = callConnectedRef.current || callStatus === 'connected'
    const durationSeconds = wasConnected ? getCurrentCallDurationSeconds() : null
    const shouldRecord =
      notifyPeer &&
      !callHistoryEventRecordedRef.current &&
      (callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected')

    if (shouldRecord) {
      void recordCallHistoryEvent(
        wasConnected ? 'ended' : 'canceled',
        callMode,
        durationSeconds
      )
    }

    if (notifyPeer && userId) {
      sendCallSignal('call-ended', {
        reason: wasConnected ? 'ended' : 'canceled',
      })
    }

    clearCallNoAnswerTimer()

    localCallStreamRef.current?.getTracks().forEach((track) => track.stop())
    remoteCallStreamRef.current?.getTracks().forEach((track) => track.stop())
    peerConnectionRef.current?.close()

    localCallStreamRef.current = null
    remoteCallStreamRef.current = null
    peerConnectionRef.current = null
    pendingIceCandidatesRef.current = []
    remoteDescriptionReadyRef.current = false
    callConnectedRef.current = false
    callConnectedAtRef.current = null

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`entreus:incoming-call:${conversationId}`)
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    setLocalCallStream(null)
    setRemoteCallStream(null)
    setIncomingCall(null)
    setCallModalOpen(false)
    setCallStatus('idle')
    setCallError('')
    setMicEnabled(true)
    setCameraEnabled(true)
    setRemoteAudioBlocked(false)
  }

  const otherName = getDisplayName(otherProfile)

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
        <div className="flex items-center gap-3 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Carregando conversa...</span>
        </div>
      </main>
    )
  }

  const conversationMenuPortal =
    mounted && openConversationMenu && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[9998] cursor-default bg-transparent"
              aria-label="Fechar opcoes da conversa"
              onClick={() => setOpenConversationMenu(false)}
            />

            <div
              className="fixed z-[9999] w-64 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 p-1.5 text-sm text-zinc-100 shadow-2xl shadow-black/30 ring-1 ring-white/10"
              style={{
                left: conversationMenuPosition.left,
                top: conversationMenuPosition.top,
              }}
            >
              <button
                type="button"
                onClick={handleClearConversationForMe}
                disabled={conversationActionLoading}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Limpar mensagens para mim
              </button>

              <button
                type="button"
                onClick={handleArchiveActionForMe}
                disabled={conversationActionLoading}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                {conversationState?.archived_at ? 'Desarquivar conversa' : 'Arquivar conversa'}
              </button>

              <button
                type="button"
                onClick={handleDeleteConversationForMe}
                disabled={conversationActionLoading}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Excluir conversa para mim
              </button>

              <button
                type="button"
                onClick={handleBlockUser}
                disabled={conversationActionLoading || blockedForConversation}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />
                Bloquear usuario
              </button>

              <div className="my-1 h-px bg-white/10" />

              <button
                type="button"
                onClick={() => setOpenConversationMenu(false)}
                className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </>,
          document.body
        )
      : null

  const activeMessageMenuItem = openMessageMenuId
    ? messages.find((item) => item.id === openMessageMenuId) || null
    : null

  const messageMenuPortal =
    mounted && activeMessageMenuItem && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[9998] cursor-default bg-transparent"
              aria-label="Fechar opcoes da mensagem"
              onClick={() => setOpenMessageMenuId(null)}
            />

            <div
              className="fixed z-[9999] w-64 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 p-1.5 text-sm text-zinc-100 shadow-2xl shadow-black/30 ring-1 ring-white/10"
              style={{
                left: messageMenuPosition.left,
                top: messageMenuPosition.top,
              }}
            >
              <button
                type="button"
                onClick={() => handleStartReplyMessage(activeMessageMenuItem)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition hover:bg-white/10"
              >
                Responder
              </button>

              {activeMessageMenuItem.sender_id === userId && activeMessageMenuItem.content?.trim() && activeMessageMenuItem.type !== 'call' && (
                <button
                  type="button"
                  onClick={() => handleStartEditMessage(activeMessageMenuItem)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition hover:bg-white/10"
                >
                  <Pencil className="h-4 w-4" />
                  Editar mensagem
                </button>
              )}

              <button
                type="button"
                onClick={() => handleHideMessageForMe(activeMessageMenuItem.id)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" />
                Excluir mensagem para mim
              </button>

              {activeMessageMenuItem.sender_id === userId && (
                <button
                  type="button"
                  onClick={() => handleDeleteMessageForEveryone(activeMessageMenuItem.id)}
                  disabled={deletingMessageId === activeMessageMenuItem.id}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingMessageId === activeMessageMenuItem.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir mensagem para todos
                </button>
              )}

              <div className="my-1 h-px bg-white/10" />

              <button
                type="button"
                onClick={() => setOpenMessageMenuId(null)}
                className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </>,
          document.body
        )
      : null

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-black transition-colors dark:bg-black dark:text-white">
      <AppSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
      />

      <MobileNavigation
        email={email}
        displayName={getDisplayName(currentProfile)}
        avatarUrl={currentProfile?.avatar_url || null}
        unreadNotificationsCount={unreadNotificationsCount}
        mounted={mounted}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onPostClick={handlePostClick}
      />

      {conversationMenuPortal}
      {messageMenuPortal}

      {callModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-3 py-6 backdrop-blur-sm">
          <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-blue-400/25 bg-zinc-950 text-white shadow-2xl shadow-blue-950/30 ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {otherProfile?.avatar_url ? (
                  <img
                    src={otherProfile.avatar_url}
                    alt={otherName}
                    className="h-11 w-11 rounded-full border border-blue-400/30 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-400/30 bg-blue-950/60 text-sm font-black text-blue-100">
                    {getInitial(otherName)}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate font-black">{otherName}</p>
                  <p className="text-xs text-blue-200">
                    {callStatus === 'calling'
                      ? 'Chamando...'
                      : callStatus === 'ringing'
                        ? 'Chamada recebida'
                        : callStatus === 'connecting'
                          ? 'Conectando...'
                          : callStatus === 'connected'
                            ? 'Chamada conectada'
                            : callStatus === 'error'
                              ? 'Erro na chamada'
                              : 'Chamada 1:1'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (incomingCall && callStatus === 'ringing') {
                    rejectCall()
                    return
                  }

                  endCall()
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Fechar chamada"
                title="Fechar chamada"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <audio
                ref={(node) => {
                  remoteAudioRef.current = node
                  if (node) node.srcObject = remoteCallStreamRef.current
                }}
                autoPlay
                playsInline
                controls={false}
                className="hidden"
              />

              {callError ? (
                <div className="rounded-[1.5rem] border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">
                  {callError}
                </div>
              ) : callMode === 'video' ? (
                <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
                  {remoteCallStream ? (
                    <video
                      ref={(node) => {
                        remoteVideoRef.current = node
                        if (node) node.srcObject = remoteCallStreamRef.current
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="max-h-[56dvh] min-h-64 w-full bg-black object-contain"
                    />
                  ) : (
                    <div className="flex min-h-64 items-center justify-center text-sm text-zinc-400">
                      Aguardando vídeo remoto...
                    </div>
                  )}

                  {localCallStream && (
                    <video
                      ref={(node) => {
                        localVideoRef.current = node
                        if (node) node.srcObject = localCallStreamRef.current
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="absolute bottom-3 right-3 h-28 w-20 rounded-2xl border border-white/20 bg-black object-cover shadow-2xl sm:h-36 sm:w-28"
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.5rem] border border-white/10 bg-blue-950/20 text-center">
                  <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-blue-500/20 text-blue-100 ring-1 ring-blue-300/30">
                    <Phone className="h-10 w-10" />
                  </div>
                  <p className="text-lg font-black">{otherName}</p>
                  <p className="mt-1 text-sm text-blue-100/70">Chamada de voz privada</p>
                </div>
              )}

              {remoteAudioBlocked && (
                <div className="mt-4 rounded-[1.5rem] border border-blue-300/25 bg-blue-500/10 p-4 text-center">
                  <p className="text-sm leading-6 text-blue-100">
                    Seu navegador bloqueou a reprodução automática do áudio remoto.
                  </p>
                  <button
                    type="button"
                    onClick={playRemoteAudio}
                    className="mt-3 inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-blue-500"
                  >
                    Ativar áudio
                  </button>
                </div>
              )}

              {incomingCall && callStatus === 'ringing' && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={acceptCall}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-500"
                  >
                    <Phone className="h-4 w-4" />
                    Aceitar
                  </button>

                  <button
                    type="button"
                    onClick={rejectCall}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-500"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Recusar
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 py-4">
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                  micEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
                }`}
                aria-label="Ativar ou desativar microfone"
                title="Ativar/desativar microfone"
              >
                {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              {callMode === 'video' && (
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                    cameraEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
                  }`}
                  aria-label="Ativar ou desativar câmera"
                  title="Ativar/desativar câmera"
                >
                  {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              )}

              <button
                type="button"
                onClick={() => endCall()}
                className="flex h-12 min-w-12 items-center justify-center rounded-full bg-red-600 px-5 text-white transition hover:bg-red-500"
                aria-label="Encerrar chamada"
                title="Encerrar"
              >
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="fixed bottom-16 left-0 right-0 top-14 z-10 flex flex-col overflow-hidden px-3 py-2 sm:px-6 lg:static lg:mx-auto lg:h-screen lg:w-full lg:max-w-[1280px] lg:flex-row lg:px-0 lg:py-0 lg:pl-[270px]">

        <aside className="hidden min-h-0 w-[390px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black lg:flex">
          <div className="shrink-0 border-b border-zinc-200 px-5 py-5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
                  Bate-papo
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Suas conversas privadas
                </p>
              </div>

              <Link
                href="/search"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-3 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <Search className="h-5 w-5 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar conversas"
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white"
              />
            </div>
          </div>

          {filteredConversations.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <Inbox className="h-7 w-7" />
                </div>

                <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                  Nenhuma conversa
                </h3>

                <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                  Use o botão de nova conversa para buscar pessoas.
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredConversations.map((conversation) => {
                const otherUser = conversation.otherUser
                const name = getDisplayName(otherUser)
                const preview = getMessagePreview(conversation.lastMessage, userId)
                const active = conversation.id === conversationId

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${conversation.id}`}
                    className={`mx-3 my-1 flex items-center gap-3 rounded-[1.6rem] border px-3 py-3.5 transition ${
                      active
                        ? 'border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
                        : conversation.isUnread
                          ? 'border-blue-500/20 bg-blue-50/70 hover:bg-blue-50 dark:border-blue-500/20 dark:bg-blue-950/20 dark:hover:bg-blue-950/30'
                          : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {otherUser?.avatar_url ? (
                        <img
                          src={otherUser.avatar_url}
                          alt={name}
                          className="h-12 w-12 rounded-full border border-zinc-300 object-cover shadow-sm dark:border-zinc-700"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-base font-bold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {getInitial(name)}
                        </div>
                      )}

                      {conversation.isUnread && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-sm shadow-blue-500/40 dark:border-black" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {otherUser?.id && (
                          <UserBadges userId={otherUser.id} size="sm" max={1} />
                        )}

                        <p className={`truncate font-bold ${
                          conversation.isUnread
                            ? 'text-zinc-950 dark:text-white'
                            : 'text-zinc-800 dark:text-zinc-100'
                        }`}>
                          {name}
                        </p>
                      </div>

                      <p
                        className={`mt-1 truncate text-sm ${
                          conversation.isUnread
                            ? 'font-semibold text-zinc-800 dark:text-zinc-100'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {preview}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-zinc-500">
                      <span>
                        {formatConversationDate(
                          conversation.lastMessage?.created_at || conversation.updated_at
                        )}
                      </span>

                      {conversation.isUnread && (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-blue-600/30">
                          Nova
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </aside>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800/70 dark:bg-black lg:rounded-none lg:border-0 lg:shadow-none">
          <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/90 sm:px-5 lg:px-6">
            <Link
              href="/messages"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:scale-105 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label="Voltar para mensagens"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {otherProfile?.avatar_url ? (
              <img
                src={otherProfile.avatar_url}
                alt={otherName}
                className="h-12 w-12 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {getInitial(otherName)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {otherProfile?.id && (
                  <UserBadges userId={otherProfile.id} size="sm" max={1} />
                )}

                <h1 className="truncate text-base font-bold text-zinc-950 dark:text-white sm:text-lg">
                  {otherName}
                </h1>
              </div>

              <p className="truncate text-sm text-zinc-500">
                {getUsername(otherProfile)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => startCall('voice')}
                disabled={blockedForConversation}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-blue-50 hover:text-blue-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                aria-label="Iniciar chamada de voz"
                title="Iniciar chamada de voz"
              >
                <Phone className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => startCall('video')}
                disabled={blockedForConversation}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-blue-50 hover:text-blue-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                aria-label="Iniciar chamada de vídeo"
                title="Iniciar chamada de vídeo"
              >
                <Video className="h-5 w-5" />
              </button>

              <div className="relative">
                <button
                  ref={conversationMenuButtonRef}
                  type="button"
                  onClick={() => {
                    updateConversationMenuPosition()
                    setOpenConversationMenu((current) => !current)
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                    openConversationMenu
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                  aria-label="Opcoes da conversa"
                  title="Opcoes da conversa"
                  aria-expanded={openConversationMenu}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>
            </div>

            {otherProfile?.username && (
              <Link
                href={`/u/${otherProfile.username}`}
                className="hidden rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:inline-flex"
              >
                Ver perfil
              </Link>
            )}
          </div>

          {message && (
            <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </div>
          )}

          <div className="min-h-0 flex flex-1 flex-col gap-2.5 overflow-y-auto bg-white p-3 dark:bg-black sm:p-5">
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-center">
                <div>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-zinc-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
                    <Send className="h-6 w-6" />
                  </div>

                  <h2 className="font-bold text-zinc-950 dark:text-white">
                    Início da conversa
                  </h2>

                  <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                    Envie a primeira mensagem para começar a conversa.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((item) => {
                const isMine = item.sender_id === userId
                const attachments = item.attachments || []
                const reactions = item.reactions || []
                const reactionGroups = groupMessageReactions(reactions, userId)
                const messageIsEdited = isMessageEdited(item)
                const isEditingThisMessage = false
                const isDeletingThisMessage = deletingMessageId === item.id
                const hasText = !!item.content?.trim()
                const hasMedia = attachments.length > 0
                const isMediaFocused = hasMedia && !hasText && !item.deleted_at && !isEditingThisMessage
                const isCallEvent = item.type === 'call'
                const isHighlighted = highlightedMessageId === item.id

                if (isCallEvent) {
                  const callLabel = getCallHistoryLabel(item)
                  const duration = formatCallDuration(item.call_duration_seconds)
                  const CallIcon = item.call_type === 'video' ? Video : Phone

                  return (
                    <div
                      key={item.id}
                      ref={(node) => {
                        messageRefs.current[item.id] = node
                      }}
                      data-message-id={item.id}
                      className="flex w-full justify-center py-1.5"
                    >
                      <div
                        className={`inline-flex max-w-[92%] items-center gap-2 rounded-full border px-3.5 py-2 text-xs text-zinc-200 shadow-lg backdrop-blur-xl transition-all duration-500 ${
                          isHighlighted
                            ? 'border-blue-300 bg-blue-950/80 shadow-blue-500/40 ring-2 ring-blue-400/70'
                            : 'border-blue-400/20 bg-zinc-950/80 shadow-blue-950/10 ring-1 ring-white/10 dark:bg-blue-950/20'
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
                          <CallIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-bold">{callLabel}</span>
                        {duration && (
                          <span className="text-zinc-400">· {duration}</span>
                        )}
                        <span className="text-zinc-500">· {formatMessageTime(item.created_at)}</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={item.id}
                    ref={(node) => {
                      messageRefs.current[item.id] = node
                    }}
                    data-message-id={item.id}
                    className={`group flex w-full items-end gap-2 scroll-mt-24 transition-all duration-500 ${
                      isMine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`relative flex max-w-[88%] flex-col sm:max-w-[460px] ${
                        isMine ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`relative overflow-visible rounded-[1.45rem] text-sm transition-all duration-500 ${
                          isMediaFocused ? 'p-1.5' : 'px-4 py-2.5'
                        } ${
                          isHighlighted
                            ? 'border border-blue-300/80 shadow-xl shadow-blue-500/30 ring-2 ring-blue-400/70'
                            : ''
                        } ${
                          isMine
                            ? 'rounded-br-md bg-blue-600 text-white shadow-sm shadow-blue-600/10 dark:bg-blue-500 dark:text-white'
                            : 'rounded-bl-md bg-zinc-100 text-zinc-900 shadow-none dark:bg-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        {item.replyTo && (
                          <button
                            type="button"
                            onClick={() => handleJumpToReply(item.reply_to_message_id)}
                            className={`mb-2 block w-full rounded-2xl border-l-4 border-blue-300/80 px-3 py-2 text-left text-xs transition hover:scale-[1.01] hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300/70 ${
                              isMine
                                ? 'bg-white/10 text-white/85 dark:bg-black/10'
                                : 'bg-blue-500/10 text-zinc-700 dark:bg-blue-950/30 dark:text-zinc-200'
                            }`}
                          >
                            <p className="font-black text-blue-200 dark:text-blue-200">
                              {item.replyTo.authorName}
                            </p>
                            <p className="mt-0.5 line-clamp-2 break-words opacity-80">
                              {item.replyTo.preview}
                            </p>
                          </button>
                        )}

                        {attachments.length > 0 && (
                          <div className={`${hasText || isEditingThisMessage ? 'mb-3' : ''} grid grid-cols-1 gap-2`}>
                            {attachments.map((attachment) => {
                              if (!attachment.signed_url) {
                                return (
                                  <div
                                    key={attachment.id}
                                    className={`flex min-h-24 min-w-[220px] items-center justify-center rounded-[1.35rem] px-4 py-5 text-xs opacity-80 ${
                                      isMine
                                        ? 'bg-white/10 text-white/80 dark:bg-black/10'
                                        : 'bg-white text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400'
                                    }`}
                                  >
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Carregando mídia...
                                  </div>
                                )
                              }

                              if (attachment.media_type === 'image') {
                                return (
                                  <div
                                    key={attachment.id}
                                    className="group/media relative max-w-[340px] overflow-hidden rounded-[1.35rem] bg-black/5 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10 sm:max-w-[390px]"
                                  >
                                    <a
                                      href={attachment.signed_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={attachment.signed_url}
                                        alt={attachment.file_name || 'Imagem enviada'}
                                        className="max-h-[260px] w-full object-contain sm:max-h-[340px]"
                                      />
                                    </a>

                                    {isMine && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAttachment(item.id, attachment)}
                                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-red-600 sm:opacity-0 sm:group-hover/media:opacity-100"
                                        aria-label="Apagar mídia"
                                        title="Apagar mídia"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                )
                              }

                              if (attachment.media_type === 'video') {
                                return (
                                  <div
                                    key={attachment.id}
                                    className="group/media relative max-w-[340px] overflow-hidden rounded-[1.35rem] bg-black shadow-sm ring-1 ring-black/5 dark:ring-white/10 sm:max-w-[390px]"
                                  >
                                    <video
                                      src={attachment.signed_url}
                                      controls
                                      className="max-h-[260px] w-full bg-black object-contain sm:max-h-[340px]"
                                    />

                                    {isMine && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAttachment(item.id, attachment)}
                                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-red-600 sm:opacity-0 sm:group-hover/media:opacity-100"
                                        aria-label="Apagar mídia"
                                        title="Apagar mídia"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                )
                              }

                              return (
                                <div
                                  key={attachment.id}
                                  className={`group/media relative flex min-w-[250px] max-w-[360px] items-center gap-3 rounded-[1.35rem] px-3 py-3 ring-1 ${
                                    isMine
                                      ? 'bg-white/10 ring-white/15 dark:bg-black/10 dark:ring-black/10'
                                      : 'bg-white ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800'
                                  }`}
                                >
                                  <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                                      isMine
                                        ? 'bg-white/15 text-white dark:bg-black/10'
                                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
                                    }`}
                                  >
                                    <Mic className="h-5 w-5" />
                                  </div>

                                  <audio
                                    src={attachment.signed_url}
                                    controls
                                    className="min-w-0 flex-1"
                                  />

                                  {isMine && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(item.id, attachment)}
                                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-red-600 sm:opacity-0 sm:group-hover/media:opacity-100"
                                      aria-label="Apagar áudio"
                                      title="Apagar áudio"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {item.deleted_at ? (
                          <p className="whitespace-pre-wrap break-words text-sm italic opacity-70">
                            Mensagem apagada.
                          </p>
                        ) : isEditingThisMessage ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingMessageContent}
                              onChange={(event) => setEditingMessageContent(event.target.value)}
                              className={`min-h-24 w-full resize-none rounded-2xl border px-3 py-2 text-sm outline-none transition ${
                                isMine
                                  ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50 dark:border-black/20 dark:bg-black/10 dark:text-white dark:placeholder:text-white/50 dark:focus:border-white/40'
                                  : 'border-zinc-300 bg-white text-zinc-900 focus:border-zinc-500 dark:border-zinc-700 dark:bg-black dark:text-white'
                              }`}
                            />

                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleCancelEditMessage}
                                disabled={savingMessageEdit}
                                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-60 ${
                                  isMine
                                    ? 'border-white/20 text-white/80 hover:bg-white/10 dark:border-white/20 dark:text-white/80 dark:hover:bg-white/10'
                                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                                }`}
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancelar
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSaveEditedMessage(item.id)}
                                disabled={savingMessageEdit || !editingMessageContent.trim()}
                                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-blue-600 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-blue-600"
                              >
                                {savingMessageEdit ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : item.content ? (
                          <>
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {item.content}
                            </p>

                            <div
                              className={`mt-3 overflow-hidden rounded-2xl ${
                                isMine
                                  ? 'bg-white/10 dark:bg-black/10'
                                  : 'bg-white dark:bg-zinc-950'
                              }`}
                            >
                              <LinkPreview content={item.content} />
                            </div>
                          </>
                        ) : null}

                        <div
                          className={`relative mt-2 flex items-center gap-1.5 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <p
                            className={`text-[10px] leading-none ${
                              isMine ? 'text-white/70' : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {formatMessageTime(item.created_at)}
                            {messageIsEdited && !item.deleted_at && (
                              <span> · editada</span>
                            )}
                          </p>

                          {!item.deleted_at && !isEditingThisMessage && (
                            <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMessageMenuId(null)
                                  setOpenReactionMessageId((current) =>
                                    current === item.id ? null : item.id
                                  )
                                }}
                                className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-105 ${
                                  isMine
                                    ? 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                                    : 'bg-white/70 text-zinc-500 hover:bg-white hover:text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
                                }`}
                                aria-label="Reagir à mensagem"
                                title="Reagir"
                              >
                                <SmilePlus className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={(event) => {
                                  updateMessageMenuPosition(event.currentTarget)
                                  setOpenReactionMessageId(null)
                                  setOpenMessageMenuId((current) =>
                                    current === item.id ? null : item.id
                                  )
                                }}
                                className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-105 ${
                                  isMine
                                    ? 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                                    : 'bg-white/70 text-zinc-500 hover:bg-white hover:text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
                                }`}
                                aria-label="Opções da mensagem"
                                title="Opções"
                              >
                                {isDeletingThisMessage ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          )}

                          {false && openMessageMenuId === item.id && !item.deleted_at && !isEditingThisMessage && (
                            <div
                              className={`absolute bottom-9 z-40 w-60 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-1 text-sm text-zinc-900 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-950/95 dark:text-white ${
                                isMine ? 'right-0' : 'left-0'
                              }`}
                            >
                              {isMine && item.content?.trim() && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMessage(item)}
                                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-semibold transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar mensagem
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleHideMessageForMe(item.id)}
                                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-semibold transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                <Trash2 className="h-4 w-4" />
                                Apagar só para mim
                              </button>

                              {isMine && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessageForEveryone(item.id)}
                                  disabled={isDeletingThisMessage}
                                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                                >
                                  {isDeletingThisMessage ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                  Apagar para todos
                                </button>
                              )}
                            </div>
                          )}

                          {openReactionMessageId === item.id && !item.deleted_at && !isEditingThisMessage && (
                            <div
                              className={`absolute bottom-9 z-30 flex items-center gap-1 rounded-full border border-zinc-200/80 bg-white/95 p-1.5 text-lg shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-950/95 ${
                                isMine ? 'right-0' : 'left-0'
                              }`}
                            >
                              {QUICK_REACTION_EMOJIS.map((emoji) => {
                                const reactedByMe = reactions.some(
                                  (reaction) => reaction.user_id === userId && reaction.emoji === emoji
                                )

                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleToggleReaction(item.id, emoji)}
                                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:-translate-y-0.5 hover:scale-110 hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800 ${
                                      reactedByMe
                                        ? 'bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-950/50 dark:ring-blue-700'
                                        : ''
                                    }`}
                                    aria-label={`Reagir com ${emoji}`}
                                    title={`Reagir com ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                )
                              })}

                              <button
                                type="button"
                                onClick={() => {
                                  setMessage('Galeria completa de emojis em breve.')
                                  setOpenReactionMessageId(null)
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:scale-105 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                                aria-label="Mais emojis"
                                title="Mais emojis em breve"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {reactionGroups.length > 0 && (
                        <div
                          className={`mt-1.5 flex flex-wrap gap-1 ${
                            isMine ? 'justify-end pr-1' : 'justify-start pl-1'
                          }`}
                        >
                          {reactionGroups.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              type="button"
                              onClick={() => handleToggleReaction(item.id, reaction.emoji)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
                                reaction.reactedByMe
                                  ? 'bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-700'
                                  : 'bg-white text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700'
                              }`}
                              aria-label={`Reação ${reaction.emoji}`}
                              title="Clique para trocar ou remover sua reação"
                            >
                              <span>{reaction.emoji}</span>
                              {reaction.count > 1 && <span>{reaction.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {selectedMedia.length > 0 && (
            <div className="shrink-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {selectedMedia.map((item, index) => (
                  <div
                    key={`${item.previewUrl}-${index}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {item.mediaType === 'image' ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
                      />
                    ) : item.mediaType === 'video' ? (
                      <div className="relative h-full w-full">
                        <video
                          src={item.previewUrl}
                          className="h-full w-full object-cover"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                          <Video className="h-6 w-6" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-200 px-2 text-center text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        <Mic className="h-5 w-5" />
                        <span className="text-[10px] font-semibold">Áudio</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeSelectedMedia(index)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                      aria-label="Remover mídia"
                      title="Remover"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {selectedMedia.some((item) => item.mediaType === 'audio') && (
                <div className="mt-3 space-y-2">
                  {selectedMedia.map((item, index) => {
                    if (item.mediaType !== 'audio') return null

                    return (
                      <audio
                        key={`${item.previewUrl}-audio-${index}`}
                        src={item.previewUrl}
                        controls
                        className="w-full"
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {recordingAudio && (
            <div className="mx-3 mb-2 shrink-0 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm dark:bg-red-950/40 dark:text-red-300 sm:mx-4">
              Gravando áudio... {formatRecordingTime(recordingSeconds)}
            </div>
          )}

          {(replyingToMessage || editingMessageId) && (
            <div className="shrink-0 border-t border-zinc-200/70 bg-white/95 px-3 py-2 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/95 sm:px-4">
              <div className="flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-50/80 px-3 py-2 text-sm dark:bg-blue-950/20">
                <div className="min-w-0 flex-1 border-l-4 border-blue-500/70 pl-3">
                  <p className="font-black text-blue-700 dark:text-blue-200">
                    {editingMessageId ? 'Editando mensagem' : `Respondendo ${replyingToMessage?.sender_id === userId ? 'voce' : otherName}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-300">
                    {editingMessageId
                      ? messages.find((item) => item.id === editingMessageId)?.content || 'Mensagem'
                      : replyingToMessage
                        ? getMessageReplyPreviewText(replyingToMessage)
                        : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={editingMessageId ? handleCancelEditMessage : handleCancelReplyMessage}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                  aria-label="Cancelar"
                  title="Cancelar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSendMessage}
            className="relative flex shrink-0 items-center gap-1.5 border-t border-zinc-200/70 bg-white/95 px-2 py-2 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-black/95 sm:gap-2 sm:px-4 sm:py-3"
          >
            {openMessageEmojiPicker && (
              <div className="absolute bottom-full left-2 right-2 z-50 mb-2 max-h-[72vh] overflow-hidden rounded-[2rem] border border-zinc-200/80 bg-white/95 shadow-2xl shadow-black/15 backdrop-blur-2xl dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:left-4 sm:right-auto sm:w-[420px]">
                <div className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-zinc-950 dark:text-white">
                        Emojis
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        Rápidos, categorias e busca em um só lugar.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOpenMessageEmojiPicker(false)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:scale-105 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-white"
                      aria-label="Fechar emojis"
                      title="Fechar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <label className="mt-3 flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2.5 text-sm transition focus-within:ring-2 focus-within:ring-blue-500/20 dark:bg-zinc-900">
                    <span className="text-base" aria-hidden="true">
                      🔎
                    </span>
                    <input
                      type="text"
                      value={messageEmojiSearch}
                      onChange={(event) => setMessageEmojiSearch(event.target.value)}
                      placeholder="Buscar emoji..."
                      className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white"
                    />
                  </label>

                  <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                    {MESSAGE_EMOJI_CATEGORIES.map((category) => {
                      const active = activeMessageEmojiCategory === category.id
                      const disabled =
                        category.id === 'recent' && recentMessageEmojis.length === 0

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => {
                            setActiveMessageEmojiCategory(category.id)
                            setMessageEmojiSearch('')
                          }}
                          disabled={disabled}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition ${
                            active
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 dark:bg-blue-500'
                              : 'bg-zinc-100 text-zinc-700 hover:scale-105 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                          } disabled:cursor-not-allowed disabled:opacity-35`}
                          aria-label={category.title}
                          title={category.description}
                        >
                          {category.icon}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="max-h-[360px] overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
                  <div className="mb-3 flex items-center gap-1.5 overflow-x-auto rounded-full bg-zinc-100 p-1.5 dark:bg-zinc-900">
                    {MESSAGE_QUICK_EMOJIS.map((emoji) => {
                      const item = getMessageEmojiItem(emoji)

                      return (
                        <button
                          key={`quick-${emoji}`}
                          type="button"
                          onClick={() => handleInsertMessageEmoji(emoji)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm transition hover:scale-110 active:scale-95 dark:bg-zinc-950"
                          aria-label={`Inserir emoji ${item.label}`}
                          title={item.label}
                        >
                          {emoji}
                        </button>
                      )
                    })}
                  </div>

                  {(() => {
                    const visibleEmojis = getVisibleMessageEmojis(
                      activeMessageEmojiCategory,
                      messageEmojiSearch,
                      recentMessageEmojis,
                    )
                    const activeCategory = getMessageEmojiCategory(activeMessageEmojiCategory)

                    if (visibleEmojis.length === 0) {
                      return (
                        <div className="rounded-[1.7rem] bg-zinc-100 p-6 text-center dark:bg-zinc-900">
                          <p className="text-3xl">🫣</p>
                          <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">
                            Nenhum emoji encontrado
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Tente buscar por amor, fogo, risada, festa ou coração.
                          </p>
                        </div>
                      )
                    }

                    return (
                      <>
                        <div className="mb-2 flex items-center justify-between gap-3 px-1">
                          <div>
                            <p className="text-sm font-black text-zinc-950 dark:text-white">
                              {messageEmojiSearch.trim()
                                ? 'Resultado da busca'
                                : activeCategory.title}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {messageEmojiSearch.trim()
                                ? `${visibleEmojis.length} opção(ões)`
                                : activeCategory.description}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-8 gap-1 sm:grid-cols-9">
                          {visibleEmojis.map((item) => (
                            <button
                              key={`${activeMessageEmojiCategory}-${item.emoji}`}
                              type="button"
                              onClick={() => handleInsertMessageEmoji(item.emoji)}
                              className="group relative flex h-10 w-10 items-center justify-center rounded-full text-2xl transition hover:scale-110 hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-900"
                              aria-label={`Inserir emoji ${item.label}`}
                              title={item.label}
                            >
                              <span className="transition group-hover:drop-shadow-md">
                                {item.emoji}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/x-wav"
              onChange={(event) => handleSelectMedia(event.target.files)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || uploadingMedia || recordingAudio}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 transition hover:scale-105 hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-45 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white sm:h-11 sm:w-11"
              aria-label="Anexar mídia"
              title="Anexar foto, vídeo ou áudio"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setOpenMessageEmojiPicker((current) => !current)}
              disabled={sending || uploadingMedia || recordingAudio}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11 ${
                openMessageEmojiPicker
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 dark:bg-blue-500'
                  : 'text-zinc-600 hover:scale-105 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-45`}
              aria-label="Abrir emojis"
              title="Emojis"
            >
              <SmilePlus className="h-5 w-5" />
            </button>

            <input
              type="text"
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder={recordingAudio ? 'Gravando áudio...' : 'Escreva uma mensagem...'}
              disabled={recordingAudio}
              className="min-w-0 flex-1 rounded-full border-0 bg-zinc-100 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:bg-zinc-100 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900 dark:text-white dark:focus:bg-zinc-900 sm:text-base"
            />

            <button
              type="button"
              onClick={recordingAudio ? handleStopAudioRecording : handleStartAudioRecording}
              disabled={sending || uploadingMedia}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11 ${
                recordingAudio
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700'
                  : 'text-zinc-600 hover:scale-105 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-45`}
              aria-label={recordingAudio ? 'Parar gravação' : 'Gravar áudio'}
              title={recordingAudio ? 'Parar gravação' : 'Gravar áudio'}
            >
              {recordingAudio ? (
                <Square className="h-5 w-5 fill-current" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            <button
              type="submit"
              disabled={
                sending ||
                uploadingMedia ||
                recordingAudio ||
                (!newMessage.trim() && selectedMedia.length === 0)
              }
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold transition sm:h-11 sm:w-11 ${
                sending ||
                uploadingMedia ||
                recordingAudio ||
                (!newMessage.trim() && selectedMedia.length === 0)
                  ? 'cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600'
                  : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
              }`}
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              {sending || uploadingMedia ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
