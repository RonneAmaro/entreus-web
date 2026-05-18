'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Coffee,
  Crown,
  Flower2,
  Gem,
  Gift,
  Heart,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type DigitalGift = {
  id: string
  name: string
  slug: string
  description: string | null
  price_itacash: number
  media_url: string | null
  media_type: string
  category: string
  sort_order: number | null
}

type GiftRecipient = {
  id: string
  name: string
  username?: string | null
  avatarUrl?: string | null
}

type GiftModalProps = {
  open: boolean
  recipient: GiftRecipient | null
  currentUserId?: string | null
  onClose: () => void
  onSent?: () => void
}

const giftIconBySlug: Record<string, LucideIcon> = {
  'rosa-digital': Flower2,
  'cafe-virtual': Coffee,
  'coracao-entreus': Heart,
  aplausos: Sparkles,
  'foguete-de-apoio': Rocket,
  'trofeu-destaque': Trophy,
  'diamante-premium': Gem,
  'coroa-elite': Crown,
}

function categoryLabel(value: string) {
  if (value === 'premium') return 'Premium'
  if (value === 'elite') return 'Elite'
  return 'Standard'
}

function giftInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getGiftPoster(mediaUrl: string | null) {
  if (!mediaUrl) return undefined

  const fileName = mediaUrl.split('/').pop()?.replace(/\.[^.]+$/, '')
  return fileName ? `/gifts/images/${fileName}.png` : undefined
}

function GiftVisual({ gift }: { gift: DigitalGift }) {
  const GiftIcon = giftIconBySlug[gift.slug]
  const [mediaFailed, setMediaFailed] = useState(false)

  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 via-zinc-950 to-black text-blue-100 ring-1 ring-blue-300/20">
      {gift.media_url && gift.media_type === 'video' && !mediaFailed ? (
        <video
          src={gift.media_url}
          poster={getGiftPoster(gift.media_url)}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setMediaFailed(true)}
          className="h-full w-full rounded-2xl bg-black object-cover"
        />
      ) : gift.media_url && !mediaFailed ? (
        <img
          src={gift.media_url}
          alt={gift.name}
          onError={() => setMediaFailed(true)}
          className="h-full w-full rounded-2xl object-cover"
        />
      ) : GiftIcon ? (
        <GiftIcon className="h-8 w-8 stroke-[1.8]" />
      ) : (
        <span className="text-lg font-black">{giftInitials(gift.name)}</span>
      )}
    </div>
  )
}

function getInitial(text: string) {
  return (text || 'U').slice(0, 1).toUpperCase()
}

export default function GiftModal({
  open,
  recipient,
  currentUserId,
  onClose,
  onSent,
}: GiftModalProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [gifts, setGifts] = useState<DigitalGift[]>([])
  const [selectedGiftId, setSelectedGiftId] = useState('')
  const [giftMessage, setGiftMessage] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  useEffect(() => {
    if (!open) return

    setMessage('')
    setSuccessMessage('')
    setGiftMessage('')
    setVisibility('public')
    loadGifts()
  }, [open])

  const selectedGift = useMemo(
    () => gifts.find((gift) => gift.id === selectedGiftId) || null,
    [gifts, selectedGiftId]
  )

  async function loadGifts() {
    setLoading(true)

    const { data, error } = await supabase
      .from('digital_gifts')
      .select('id, name, slug, description, price_itacash, media_url, media_type, category, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('price_itacash', { ascending: true })

    if (error) {
      setMessage('Nao foi possivel carregar presentes.')
      setGifts([])
      setLoading(false)
      return
    }

    const rows = (data || []) as DigitalGift[]
    setGifts(rows)
    setSelectedGiftId((current) => current || rows[0]?.id || '')
    setLoading(false)
  }

  async function sendGift() {
    if (!recipient || !selectedGift) return

    if (!currentUserId) {
      setMessage('Usuario nao logado.')
      return
    }

    if (currentUserId === recipient.id) {
      setMessage('Voce nao pode presentear a si mesmo.')
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccessMessage('')

    const { error } = await supabase.rpc('send_digital_gift', {
      p_receiver_id: recipient.id,
      p_gift_id: selectedGift.id,
      p_message: giftMessage.trim() || null,
      p_visibility: visibility,
    })

    setSubmitting(false)

    if (error) {
      const lowerMessage = error.message.toLowerCase()
      setMessage(lowerMessage.includes('saldo') || lowerMessage.includes('insufficient')
        ? 'Saldo ItaCash insuficiente.'
        : 'Nao foi possivel enviar o presente.')
      return
    }

    setSuccessMessage('Presente enviado com sucesso!')
    onSent?.()

    window.setTimeout(() => {
      onClose()
    }, 900)
  }

  if (!open || !recipient) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 py-6 text-white backdrop-blur-sm">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fechar modal" />

      <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">Presentear</p>
            <h2 className="mt-2 text-2xl font-black">Enviar presente</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4">
          {recipient.avatarUrl ? (
            <img src={recipient.avatarUrl} alt={recipient.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 font-black text-blue-100">
              {getInitial(recipient.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-black">{recipient.name}</p>
            {recipient.username && <p className="truncate text-sm text-blue-100/70">@{recipient.username}</p>}
          </div>
        </div>

        {(message || successMessage) && (
          <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            successMessage
              ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
          }`}>
            {successMessage ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Gift className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{successMessage || message}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-5 flex min-h-56 items-center justify-center rounded-3xl border border-white/10 bg-black/35 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando presentes...
          </div>
        ) : gifts.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-white/15 p-8 text-center text-zinc-400">
            Nenhum presente ativo.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {gifts.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => setSelectedGiftId(gift.id)}
                  className={`flex items-center gap-3 rounded-3xl border p-3 text-left transition ${
                    selectedGiftId === gift.id
                      ? 'border-blue-300/50 bg-blue-500/15 ring-1 ring-blue-300/20'
                      : 'border-white/10 bg-black/30 hover:border-blue-300/25 hover:bg-blue-500/10'
                  }`}
                >
                  <GiftVisual gift={gift} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{gift.name}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-400">{categoryLabel(gift.category)}</span>
                    <span className="mt-2 inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-black text-blue-100">
                      {gift.price_itacash} ItaCash
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-black">Mensagem opcional</span>
              <textarea
                value={giftMessage}
                onChange={(event) => setGiftMessage(event.target.value)}
                rows={3}
                placeholder="Escreva uma mensagem curta..."
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black p-1">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`rounded-xl px-3 py-2 text-sm font-black transition ${visibility === 'public' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
              >
                Publico
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`rounded-xl px-3 py-2 text-sm font-black transition ${visibility === 'private' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
              >
                Privado
              </button>
            </div>

            <button
              type="button"
              onClick={sendGift}
              disabled={submitting || !selectedGift}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar presente
            </button>
          </>
        )}
      </div>
    </div>
  )
}
