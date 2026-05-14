'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Phone, PhoneOff, Video, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type IncomingGlobalCall = {
  conversationId: string
  callerId: string
  callerName: string
  callerAvatarUrl?: string | null
  callType: 'audio' | 'video'
  offer?: RTCSessionDescriptionInit
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U'
}

export default function GlobalCallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userId, setUserId] = useState('')
  const [incomingCall, setIncomingCall] = useState<IncomingGlobalCall | null>(null)

  useEffect(() => {
    let active = true

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (active) {
        setUserId(user?.id || '')
      }
    }

    loadUser()

    const authChannel = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || '')
    })

    return () => {
      active = false
      authChannel.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`user-call-${userId}`)
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        if (!payload?.conversationId || payload?.callerId === userId) return
        if (pathname === `/messages/${payload.conversationId}`) return

        setIncomingCall(payload as IncomingGlobalCall)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pathname, userId])

  function acceptCall() {
    if (!incomingCall) return

    if (incomingCall.offer) {
      sessionStorage.setItem(
        `entreus:incoming-call:${incomingCall.conversationId}`,
        JSON.stringify({
          fromUserId: incomingCall.callerId,
          mode: incomingCall.callType === 'video' ? 'video' : 'voice',
          offer: incomingCall.offer,
        })
      )
    }

    const type = incomingCall.callType === 'video' ? 'video' : 'audio'
    const conversationId = incomingCall.conversationId

    setIncomingCall(null)
    router.push(`/messages/${conversationId}?call=accept&type=${type}`)
  }

  function rejectCall() {
    if (!incomingCall || !userId) {
      setIncomingCall(null)
      return
    }

    const channel = supabase.channel(`chat-call-${incomingCall.conversationId}`)

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return

      channel.send({
        type: 'broadcast',
        event: 'call-rejected',
        payload: {
          fromUserId: userId,
        },
      })

      window.setTimeout(() => {
        supabase.removeChannel(channel)
      }, 500)
    })

    setIncomingCall(null)
  }

  return (
    <>
      {children}

      {incomingCall && (
        <div className="fixed bottom-20 left-3 right-3 z-[10000] sm:bottom-6 sm:left-auto sm:right-6 sm:w-96">
          <div className="overflow-hidden rounded-[1.5rem] border border-blue-400/25 bg-zinc-950/95 text-white shadow-2xl shadow-blue-950/30 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="flex items-start gap-3 p-4">
              {incomingCall.callerAvatarUrl ? (
                <img
                  src={incomingCall.callerAvatarUrl}
                  alt={incomingCall.callerName}
                  className="h-12 w-12 rounded-full border border-blue-400/30 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/30 bg-blue-950/50 text-sm font-black text-blue-100">
                  {getInitial(incomingCall.callerName)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {incomingCall.callType === 'video' ? 'Chamada de vídeo' : 'Chamada de voz'}
                    </p>
                    <p className="mt-1 truncate text-sm text-blue-100/75">
                      de {incomingCall.callerName}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIncomingCall(null)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    aria-label="Fechar aviso"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={acceptCall}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-500"
                  >
                    {incomingCall.callType === 'video' ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                    Aceitar
                  </button>

                  <button
                    type="button"
                    onClick={rejectCall}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-500"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Recusar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
