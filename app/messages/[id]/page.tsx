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
    Loader2,
    Paperclip,
    Send,
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

type MessageAttachment = {
    id: string
    message_id: string
    conversation_id: string
    sender_id: string
    storage_path: string
    media_type: 'image' | 'video'
    file_name: string | null
    file_size: number | null
    mime_type: string | null
    position: number
    created_at: string
    signed_url?: string
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
}

type SelectedMedia = {
    file: File
    previewUrl: string
    mediaType: 'image' | 'video'
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

function isImage(file: File) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
}

function isVideo(file: File) {
    return ['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)
}

function detectMediaType(file: File): 'image' | 'video' | null {
    if (isImage(file)) return 'image'
    if (isVideo(file)) return 'video'
    return null
}

function makeFileNameSafe(name: string) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9._-]/g, '-')
}

export default function ConversationPage() {
    const params = useParams()
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const conversationId = typeof params.id === 'string' ? params.id : ''

    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [uploadingMedia, setUploadingMedia] = useState(false)
    const [message, setMessage] = useState('')

    const [userId, setUserId] = useState('')
    const [email, setEmail] = useState('')
    const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
    const [otherProfile, setOtherProfile] = useState<ProfileSummary | null>(null)
    const [participants, setParticipants] = useState<ParticipantRow[]>([])
    const [messages, setMessages] = useState<MessageRow[]>([])
    const [newMessage, setNewMessage] = useState('')
    const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([])
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

    const otherUserId = useMemo(() => {
        return participants.find((participant) => participant.user_id !== userId)?.user_id || ''
    }, [participants, userId])

    useEffect(() => {
        setMounted(true)
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

        return () => {
            supabase.removeChannel(messagesChannel)
            supabase.removeChannel(attachmentsChannel)
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

        await loadMessagesWithAttachments()
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

    async function loadMessagesWithAttachments() {
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
        const attachmentMap = await loadAttachmentsForMessages(
            loadedMessages.map((item) => item.id)
        )

        setMessages(
            loadedMessages.map((item) => ({
                ...item,
                attachments: attachmentMap[item.id] || [],
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
                setMessage('Envie apenas imagens JPG, PNG, WEBP, GIF ou vídeos MP4, WEBM, OGG.')
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

        if ((!content && !hasMedia) || !userId || !conversationId) return

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

        for (const item of selectedMedia) {
            URL.revokeObjectURL(item.previewUrl)
        }

        setNewMessage('')
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

            <section className="flex min-h-screen w-full max-w-4xl flex-col overflow-x-hidden px-4 py-20 pb-24 sm:px-6 lg:ml-[calc(270px+((100vw-270px-56rem)/2))] lg:py-8">
                <div className="mb-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:px-5">
                        <Link
                            href="/messages"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-900"
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
                                className="hidden rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 sm:inline-flex"
                            >
                                Ver perfil
                            </Link>
                        )}
                    </div>

                    {message && (
                        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                            {message}
                        </div>
                    )}

                    <div className="flex min-h-[55vh] flex-col gap-3 bg-zinc-50 p-4 dark:bg-zinc-950 sm:p-5">
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

                                return (
                                    <div
                                        key={item.id}
                                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm shadow-sm sm:max-w-[430px] ${isMine
                                                ? 'rounded-br-md bg-black text-white dark:bg-white dark:text-black'
                                                : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
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
                                                    <video
                                                        key={attachment.id}
                                                        src={attachment.signed_url}
                                                        controls
                                                        className="max-h-[360px] w-full rounded-2xl bg-black"
                                                    />
                                                    )
                                                    })}
                                                </div>
                                            )}

                                            {item.deleted_at ? (
                                                <p className="whitespace-pre-wrap break-words opacity-70">
                                                    Mensagem apagada.
                                                </p>
                                            ) : item.content ? (
                                                <>
                                                    <p className="whitespace-pre-wrap break-words">
                                                        {item.content}
                                                    </p>

                                                    <div
                                                        className={`mt-3 overflow-hidden rounded-2xl ${isMine ? 'bg-white/10 dark:bg-black/10' : ''
                                                            }`}
                                                    >
                                                        <LinkPreview content={item.content} />
                                                    </div>
                                                </>
                                            ) : null}

                                            <p
                                                className={`mt-2 text-[11px] ${isMine
                                                    ? 'text-white/70 dark:text-black/60'
                                                    : 'text-zinc-500'
                                                    }`}
                                            >
                                                {formatMessageTime(item.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {selectedMedia.length > 0 && (
                        <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
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
                                        ) : (
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
                        </div>
                    )}

                    <form
                        onSubmit={handleSendMessage}
                        className="flex gap-3 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg"
                            onChange={(event) => handleSelectMedia(event.target.files)}
                            className="hidden"
                        />

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={sending || uploadingMedia}
                            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-300 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            aria-label="Anexar mídia"
                            title="Anexar foto ou vídeo"
                        >
                            <Paperclip className="h-5 w-5" />
                        </button>

                        <input
                            type="text"
                            value={newMessage}
                            onChange={(event) => setNewMessage(event.target.value)}
                            placeholder="Escreva uma mensagem..."
                            className="min-w-0 flex-1 rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 sm:text-base"
                        />

                        <button
                            type="submit"
                            disabled={sending || uploadingMedia || (!newMessage.trim() && selectedMedia.length === 0)}
                            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-semibold transition ${sending || uploadingMedia || (!newMessage.trim() && selectedMedia.length === 0)
                                ? 'cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                                : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
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