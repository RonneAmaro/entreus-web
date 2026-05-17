'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Gift,
  Loader2,
  Search,
  Send,
  Sparkles,
  X,
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

type ProfileResult = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

const giftEmojiBySlug: Record<string, string> = {
  'rosa-digital': '🌹',
  'cafe-virtual': '☕',
  'coracao-entreus': '💙',
  aplausos: '👏',
  'foguete-de-apoio': '🚀',
  'trofeu-destaque': '🏆',
  'diamante-premium': '💎',
  'coroa-elite': '👑',
}

export default function GiftsPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [gifts, setGifts] = useState<DigitalGift[]>([])
  const [selectedGift, setSelectedGift] = useState<DigitalGift | null>(null)
  const [username, setUsername] = useState('')
  const [giftMessage, setGiftMessage] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [receiver, setReceiver] = useState<ProfileResult | null>(null)
  const [searchingUser, setSearchingUser] = useState(false)

  useEffect(() => {
    loadGifts()
  }, [])

  const groupedGifts = useMemo(() => {
    return gifts.reduce(
      (acc, gift) => {
        if (!acc[gift.category]) acc[gift.category] = []
        acc[gift.category].push(gift)
        return acc
      },
      {} as Record<string, DigitalGift[]>
    )
  }, [gifts])

  async function loadGifts() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('digital_gifts')
      .select('id, name, slug, description, price_itacash, media_url, media_type, category, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('price_itacash', { ascending: true })

    if (error) {
      setMessage('Nao foi possivel carregar presentes: ' + error.message)
      setGifts([])
      setLoading(false)
      return
    }

    setGifts((data || []) as DigitalGift[])
    setLoading(false)
  }

  function openGiftModal(gift: DigitalGift) {
    setSelectedGift(gift)
    setUsername('')
    setGiftMessage('')
    setVisibility('public')
    setReceiver(null)
    setMessage('')
    setSuccessMessage('')
  }

  async function findReceiver() {
    const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase()

    if (!normalizedUsername) {
      setMessage('Digite um username para buscar.')
      return
    }

    setSearchingUser(true)
    setMessage('')
    setReceiver(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('username', normalizedUsername)
      .maybeSingle()

    setSearchingUser(false)

    if (error || !data) {
      setMessage('Usuario nao encontrado.')
      return
    }

    setReceiver(data as ProfileResult)
  }

  async function sendGift() {
    if (!selectedGift) return

    if (!receiver) {
      await findReceiver()
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccessMessage('')

    const { error } = await supabase.rpc('send_digital_gift', {
      p_receiver_id: receiver.id,
      p_gift_id: selectedGift.id,
      p_message: giftMessage.trim() || null,
      p_visibility: visibility,
    })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel enviar presente: ' + error.message)
      return
    }

    setSuccessMessage(`Presente enviado para @${receiver.username}.`)
    setSelectedGift(null)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <Link
            href="/wallet"
            className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            Carteira
          </Link>
        </header>

        <div className="py-10">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
            Presentes digitais
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
            Envie reconhecimento com ItaCash.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
            Escolha um presente, encontre um usuario e envie. Neste MVP, 100% do valor e creditado ao destinatario.
          </p>
        </div>

        {(message || successMessage) && (
          <div className={`mb-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            successMessage
              ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
          }`}>
            {successMessage ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Gift className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{successMessage || message}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-white/10 bg-zinc-950 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando presentes...
          </div>
        ) : gifts.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center">
            <div>
              <Sparkles className="mx-auto h-10 w-10 text-blue-200" />
              <h2 className="mt-4 text-xl font-black">Nenhum presente ativo ainda.</h2>
            </div>
          </div>
        ) : (
          <div className="space-y-8 pb-10">
            {Object.entries(groupedGifts).map(([category, categoryGifts]) => (
              <section key={category}>
                <h2 className="mb-4 text-lg font-black capitalize text-white">{category}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {categoryGifts.map((gift) => (
                    <article key={gift.id} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-blue-300/25">
                      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/15 text-4xl ring-1 ring-blue-300/20">
                        {gift.media_url ? (
                          <img src={gift.media_url} alt={gift.name} className="h-full w-full rounded-3xl object-cover" />
                        ) : (
                          giftEmojiBySlug[gift.slug] || '🎁'
                        )}
                      </div>
                      <h3 className="mt-4 text-xl font-black">{gift.name}</h3>
                      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">
                        {gift.description || 'Presente digital EntreUS.'}
                      </p>
                      <p className="mt-4 text-2xl font-black text-blue-200">
                        {gift.price_itacash} ItaCash
                      </p>
                      <button
                        type="button"
                        onClick={() => openGiftModal(gift)}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50"
                      >
                        <Send className="h-4 w-4" />
                        Enviar presente
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedGift && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Fechar modal"
              onClick={() => setSelectedGift(null)}
            />

            <div className="relative z-10 w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-300">Enviar presente</p>
                  <h2 className="mt-2 text-2xl font-black">{selectedGift.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{selectedGift.price_itacash} ItaCash</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGift(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-black">Username do destinatario</span>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value)
                      setReceiver(null)
                    }}
                    placeholder="@usuario"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                  />
                  <button
                    type="button"
                    onClick={findReceiver}
                    disabled={searchingUser}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black transition hover:bg-blue-50 disabled:opacity-60"
                    aria-label="Buscar usuario"
                  >
                    {searchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {receiver && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-blue-300/20 bg-blue-500/10 p-3">
                  {receiver.avatar_url ? (
                    <img src={receiver.avatar_url} alt={receiver.username || 'Usuario'} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-black text-blue-100">
                      {(receiver.display_name || receiver.username || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-black">{receiver.display_name || receiver.username}</p>
                    <p className="truncate text-sm text-blue-100/70">@{receiver.username}</p>
                  </div>
                </div>
              )}

              <label className="mt-4 block">
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
                disabled={submitting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirmar envio
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
