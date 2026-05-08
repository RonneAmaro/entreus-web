'use client'

import AppSidebar from '../../components/AppSidebar'
import MobileNavigation from '../../components/MobileNavigation'
import UserBadges from '../../components/UserBadges'
import LinkPreview from '../../components/LinkPreview'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  Check,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  SmilePlus,
  Square,
  Trash2,
  Video,
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
  created_at: string
  deleted_at: string | null
}

type ConversationItem = {
  id: string
  updated_at: string
  otherUser: ProfileSummary | null
  lastMessage: ConversationPreviewMessage | null
  isUnread: boolean
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
  created_at: string
  updated_at: string
  deleted_at: string | null
  attachments?: MessageAttachment[]
  reactions?: MessageReaction[]
}

type SelectedMedia = {
  file: File
  previewUrl: string
  mediaType: 'image' | 'video' | 'audio'
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

  const prefix = message.sender_id === currentUserId ? 'Você: ' : ''
  const content = message.content?.trim()

  return `${prefix}${content || 'Mídia enviada'}`
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
  if (!message.updated_at || message.deleted_at) return false

  const createdAt = new Date(message.created_at).getTime()
  const updatedAt = new Date(message.updated_at).getTime()

  return Math.abs(updatedAt - createdAt) > 3000
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<number | null>(null)

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
  const [newMessage, setNewMessage] = useState('')
  const [openMessageEmojiPicker, setOpenMessageEmojiPicker] = useState(false)
  const [messageEmojiSearch, setMessageEmojiSearch] = useState('')
  const [activeMessageEmojiCategory, setActiveMessageEmojiCategory] =
    useState<MessageEmojiCategoryId>('entreus')
  const [recentMessageEmojis, setRecentMessageEmojis] = useState<string[]>([])
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([])
  const [openReactionMessageId, setOpenReactionMessageId] = useState<string | null>(null)
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [savingMessageEdit, setSavingMessageEdit] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

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

  useEffect(() => {
    setMounted(true)

    return () => {
      stopRecordingTracks()

      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

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

              return [...current, { ...receivedMessage, attachments: [] }]
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

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(attachmentsChannel)
      supabase.removeChannel(reactionsChannel)
    }
  }, [conversationId, userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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
      .select('id, conversation_id, sender_id, content, created_at, deleted_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(300)

    if (messagesError) {
      setMessage('Erro ao carregar últimas mensagens: ' + messagesError.message)
      return
    }

    const lastMessageByConversation: Record<string, ConversationPreviewMessage> = {}

    for (const item of (messagesData || []) as ConversationPreviewMessage[]) {
      if (!lastMessageByConversation[item.conversation_id]) {
        lastMessageByConversation[item.conversation_id] = item
      }
    }

    const items: ConversationItem[] = ((conversationsData || []) as ConversationRow[]).map(
      (conversation) => {
        const conversationParticipants = participantRows.filter(
          (participant) => participant.conversation_id === conversation.id
        )

        const otherParticipant = conversationParticipants.find(
          (participant) => participant.user_id !== currentUserId
        )

        const lastMessage = lastMessageByConversation[conversation.id] || null
        const myParticipant = myParticipantByConversation[conversation.id]
        const lastReadAt = myParticipant?.last_read_at
          ? new Date(myParticipant.last_read_at).getTime()
          : 0

        const isUnread = !!(
          lastMessage &&
          !lastMessage.deleted_at &&
          lastMessage.sender_id !== currentUserId &&
          new Date(lastMessage.created_at).getTime() > lastReadAt
        )

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: otherParticipant ? profilesById[otherParticipant.user_id] || null : null,
          lastMessage,
          isUnread,
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
    }

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
      .select('id, conversation_id, sender_id, content, created_at, updated_at, deleted_at')
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

    const visibleMessages = loadedMessages.filter(
      (item) => !hiddenMessageIds.has(item.id)
    )

    const visibleMessageIds = visibleMessages.map((item) => item.id)

    const [attachmentMap, reactionMap] = await Promise.all([
      loadAttachmentsForMessages(visibleMessageIds),
      loadReactionsForMessages(visibleMessageIds),
    ])

    setMessages(
      visibleMessages.map((item) => ({
        ...item,
        attachments: attachmentMap[item.id] || [],
        reactions: reactionMap[item.id] || [],
      }))
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
    if (!userId || item.sender_id !== userId || item.deleted_at) return

    if (!item.content?.trim()) {
      setMessage('Esta mensagem não tem texto para editar.')
      return
    }

    setEditingMessageId(item.id)
    setEditingMessageContent(item.content)
    setOpenMessageMenuId(null)
    setOpenReactionMessageId(null)
    setMessage('')
  }

  function handleCancelEditMessage() {
    setEditingMessageId(null)
    setEditingMessageContent('')
    setSavingMessageEdit(false)
  }

  async function handleSaveEditedMessage(messageId: string) {
    if (!userId || !conversationId) return

    const content = editingMessageContent.trim()

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
    setSavingMessageEdit(false)
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

    if (attachmentsToDelete.length > 0) {
      const storagePaths = attachmentsToDelete
        .map((attachment) => attachment.storage_path)
        .filter(Boolean)

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('message-media')
          .remove(storagePaths)

        if (storageError) {
          console.error('Erro ao remover mídias da mensagem:', storageError.message)
        }
      }

      const { error: attachmentsError } = await supabase
        .from('message_attachments')
        .delete()
        .eq('message_id', messageId)
        .eq('sender_id', userId)

      if (attachmentsError) {
        console.error('Erro ao apagar anexos da mensagem:', attachmentsError.message)
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
        content: content || null,
      })
      .select('id, conversation_id, sender_id, content, created_at, updated_at, deleted_at')
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

      <section className="fixed bottom-16 left-0 right-0 top-14 z-10 flex flex-col overflow-hidden px-3 py-2 sm:px-6 lg:static lg:ml-[270px] lg:h-screen lg:w-[calc(100vw-270px)] lg:max-w-none lg:flex-row lg:px-0 lg:py-0">

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
                    className={`flex items-center gap-3 border-b border-zinc-100 px-4 py-4 transition dark:border-zinc-900 ${
                      active
                        ? 'bg-zinc-100 dark:bg-zinc-900'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-950'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {otherUser?.avatar_url ? (
                        <img
                          src={otherUser.avatar_url}
                          alt={name}
                          className="h-14 w-14 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-lg font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {getInitial(name)}
                        </div>
                      )}

                      {conversation.isUnread && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 dark:border-black" />
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

                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {preview}
                      </p>
                    </div>

                    <div className="shrink-0 text-right text-xs text-zinc-500">
                      {formatConversationDate(
                        conversation.lastMessage?.created_at || conversation.updated_at
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
                const isEditingThisMessage = editingMessageId === item.id
                const isDeletingThisMessage = deletingMessageId === item.id

                return (
                  <div
                    key={item.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-[1.35rem] px-4 py-2.5 text-sm shadow-sm transition sm:max-w-[430px] ${
                        isMine
                          ? 'rounded-br-md bg-blue-600 text-white shadow-blue-600/10 dark:bg-blue-500 dark:text-white'
                          : 'rounded-bl-md bg-zinc-100 text-zinc-900 shadow-none dark:bg-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {attachments.length > 0 && (
                        <div className="mb-3 grid grid-cols-1 gap-2">
                          {attachments.map((attachment) => {
                            if (!attachment.signed_url) {
                              return (
                                <div
                                  key={attachment.id}
                                  className="rounded-2xl border border-zinc-300/30 p-3 text-xs opacity-70"
                                >
                                  Carregando mídia...
                                </div>
                              )
                            }

                            if (attachment.media_type === 'image') {
                              return (
                                <div
                                  key={attachment.id}
                                  className="group relative max-w-[340px] overflow-hidden rounded-2xl sm:max-w-[380px]"
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
                                      className="max-h-[220px] w-full object-contain sm:max-h-[280px]"
                                    />
                                  </a>

                                  {isMine && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(item.id, attachment)}
                                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-100 shadow-lg transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
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
                                  className="group relative max-w-[340px] overflow-hidden rounded-2xl sm:max-w-[380px]"
                                >
                                  <video
                                    src={attachment.signed_url}
                                    controls
                                    className="max-h-[220px] w-full rounded-2xl bg-black object-contain sm:max-h-[280px]"
                                  />

                                  {isMine && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(item.id, attachment)}
                                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-100 shadow-lg transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
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
                                className={`group relative rounded-2xl border px-3 py-3 ${
                                  isMine
                                    ? 'border-white/15 bg-white/10 dark:border-black/10 dark:bg-black/10'
                                    : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
                                }`}
                              >
                                <audio
                                  src={attachment.signed_url}
                                  controls
                                  className="w-full min-w-[220px] max-w-[340px]"
                                />

                                {isMine && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAttachment(item.id, attachment)}
                                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-100 shadow-lg transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
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
                        <p className="whitespace-pre-wrap break-words opacity-70">
                          Mensagem apagada.
                        </p>
                      ) : isEditingThisMessage ? (
                        <div className="space-y-3">
                          <textarea
                            value={editingMessageContent}
                            onChange={(event) => setEditingMessageContent(event.target.value)}
                            className={`min-h-24 w-full resize-none rounded-2xl border px-3 py-2 text-sm outline-none ${
                              isMine
                                ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50 dark:border-black/20 dark:bg-black/10 dark:text-black dark:placeholder:text-black/50 dark:focus:border-black/40'
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
                                  ? 'border-white/20 text-white/80 hover:bg-white/10 dark:border-black/20 dark:text-black/70 dark:hover:bg-black/10'
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
                              className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                          <p className="whitespace-pre-wrap break-words">
                            {item.content}
                          </p>

                          <div
                            className={`mt-3 overflow-hidden rounded-2xl ${
                              isMine ? 'bg-white/10 dark:bg-black/10' : ''
                            }`}
                          >
                            <LinkPreview content={item.content} />
                          </div>
                        </>
                      ) : null}

                      <div
                        className={`relative mt-2 flex items-center gap-2 ${
                          isMine ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <p
                          className={`text-[11px] ${
                            isMine
                              ? 'text-white/70 dark:text-black/60'
                              : 'text-zinc-500'
                          }`}
                        >
                          {formatMessageTime(item.created_at)}
                          {messageIsEdited && !item.deleted_at && (
                            <span> · editada</span>
                          )}
                        </p>

                        {!item.deleted_at && !isEditingThisMessage && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMessageMenuId(null)
                              setOpenReactionMessageId((current) =>
                                current === item.id ? null : item.id
                              )
                            }}
                            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                              isMine
                                ? 'text-white/70 hover:bg-white/10 hover:text-white dark:text-black/60 dark:hover:bg-black/10 dark:hover:text-black'
                                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white'
                            }`}
                            aria-label="Reagir à mensagem"
                            title="Reagir"
                          >
                            <SmilePlus className="h-4 w-4" />
                          </button>
                        )}

                        {!item.deleted_at && !isEditingThisMessage && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenReactionMessageId(null)
                              setOpenMessageMenuId((current) =>
                                current === item.id ? null : item.id
                              )
                            }}
                            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                              isMine
                                ? 'text-white/70 hover:bg-white/10 hover:text-white dark:text-black/60 dark:hover:bg-black/10 dark:hover:text-black'
                                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white'
                            }`}
                            aria-label="Opções da mensagem"
                            title="Opções"
                          >
                            {isDeletingThisMessage ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {openMessageMenuId === item.id && !item.deleted_at && !isEditingThisMessage && (
                          <div
                            className={`absolute bottom-8 z-40 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-white ${
                              isMine ? 'right-0' : 'left-0'
                            }`}
                          >
                            {isMine && item.content?.trim() && (
                              <button
                                type="button"
                                onClick={() => handleStartEditMessage(item)}
                                className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                <Pencil className="h-4 w-4" />
                                Editar mensagem
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleHideMessageForMe(item.id)}
                              className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <Trash2 className="h-4 w-4" />
                              Apagar só para mim
                            </button>

                            {isMine && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMessageForEveryone(item.id)}
                                disabled={isDeletingThisMessage}
                                className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
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
                            className={`absolute bottom-8 z-30 flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1.5 text-lg shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ${
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
                                  className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
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
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                              aria-label="Mais emojis"
                              title="Mais emojis em breve"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {reactionGroups.length > 0 && (
                        <div
                          className={`mt-2 flex flex-wrap gap-1 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {reactionGroups.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              type="button"
                              onClick={() => handleToggleReaction(item.id, reaction.emoji)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition ${
                                reaction.reactedByMe
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
                                  : isMine
                                    ? 'border-white/15 bg-white/10 text-white dark:border-black/10 dark:bg-black/10 dark:text-black'
                                    : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
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
