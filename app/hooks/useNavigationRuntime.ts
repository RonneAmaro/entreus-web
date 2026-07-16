'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isAdminRole } from '@/lib/admin'

type Participant = { conversation_id: string; last_read_at: string | null }
type Message = { conversation_id: string; sender_id: string; created_at: string; read_at: string | null; deleted_at: string | null }

export function useNavigationRuntime(enabled: boolean, suppliedUnreadMessages?: number) {
  const [userId, setUserId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [internalUnreadMessages, setInternalUnreadMessages] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      setUserId(user.id)

      const profile = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (!cancelled) setIsAdmin(!profile.error && isAdminRole(profile.data?.role))
      if (typeof suppliedUnreadMessages === 'number') return

      const participantsResult = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id)
      if (cancelled || participantsResult.error) return
      const participants = (participantsResult.data || []) as Participant[]
      const conversationIds = participants.map((item) => item.conversation_id)
      if (!conversationIds.length) {
        setInternalUnreadMessages(0)
        return
      }

      const messagesResult = await supabase
        .from('messages')
        .select('conversation_id, sender_id, created_at, read_at, deleted_at')
        .in('conversation_id', conversationIds)
        .is('read_at', null)
        .is('deleted_at', null)
        .neq('sender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(300)
      if (cancelled || messagesResult.error) return

      const lastRead = new Map(participants.map((item) => [item.conversation_id, item.last_read_at ? new Date(item.last_read_at).getTime() : 0]))
      const count = ((messagesResult.data || []) as Message[]).filter((message) =>
        !message.deleted_at && !message.read_at && message.sender_id !== user.id &&
        new Date(message.created_at).getTime() > (lastRead.get(message.conversation_id) || 0)
      ).length
      setInternalUnreadMessages(count)
    }

    void load()
    const interval = window.setInterval(load, 30_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [enabled, suppliedUnreadMessages])

  return {
    userId,
    isAdmin,
    unreadMessages: suppliedUnreadMessages ?? internalUnreadMessages,
  }
}
