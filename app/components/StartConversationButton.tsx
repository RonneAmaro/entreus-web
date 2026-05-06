'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type StartConversationButtonProps = {
  targetUserId: string
  disabled?: boolean
  label?: string
  iconOnly?: boolean
  className?: string
}

function createDirectKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':')
}

export default function StartConversationButton({
  targetUserId,
  disabled = false,
  label = 'Mensagem',
  iconOnly = false,
  className = '',
}: StartConversationButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStartConversation() {
    if (loading || disabled || !targetUserId) return

    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoading(false)
      router.push('/login')
      return
    }

    if (user.id === targetUserId) {
      setLoading(false)
      router.push('/messages')
      return
    }

    const { data: blockedByMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetUserId)
      .maybeSingle()

    const { data: blockedMe } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', targetUserId)
      .eq('blocked_id', user.id)
      .maybeSingle()

    if (blockedByMe || blockedMe) {
      setLoading(false)
      alert('Não é possível iniciar conversa enquanto houver bloqueio entre vocês.')
      return
    }

    const directKey = createDirectKey(user.id, targetUserId)

    const { data: existingConversation, error: existingError } = await supabase
      .from('conversations')
      .select('id')
      .eq('direct_key', directKey)
      .maybeSingle()

    if (existingError) {
      setLoading(false)
      alert('Erro ao verificar conversa: ' + existingError.message)
      return
    }

    if (existingConversation?.id) {
      setLoading(false)
      router.push(`/messages/${existingConversation.id}`)
      return
    }

    const { data: newConversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        type: 'direct',
        direct_key: directKey,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (conversationError || !newConversation) {
      const { data: retryConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('direct_key', directKey)
        .maybeSingle()

      if (retryConversation?.id) {
        setLoading(false)
        router.push(`/messages/${retryConversation.id}`)
        return
      }

      setLoading(false)
      alert('Erro ao criar conversa: ' + (conversationError?.message || 'tente novamente.'))
      return
    }

    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert([
        {
          conversation_id: newConversation.id,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        {
          conversation_id: newConversation.id,
          user_id: targetUserId,
          last_read_at: null,
        },
      ])

    if (participantsError) {
      setLoading(false)
      alert('Conversa criada, mas houve erro ao adicionar participantes: ' + participantsError.message)
      return
    }

    setLoading(false)
    router.push(`/messages/${newConversation.id}`)
  }

  return (
    <button
      type="button"
      onClick={handleStartConversation}
      disabled={disabled || loading}
      className={
        className ||
        `inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
          disabled || loading
            ? 'cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600'
            : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950'
        }`
      }
      title={loading ? 'Abrindo conversa...' : label}
      aria-label={loading ? 'Abrindo conversa...' : label}
    >
      <MessageCircle className="h-5 w-5" />
      {!iconOnly && <span>{loading ? 'Abrindo...' : label}</span>}
    </button>
  )
}