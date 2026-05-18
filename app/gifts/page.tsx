'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Coffee,
  Crown,
  Flower2,
  Gift,
  Gem,
  Heart,
  Loader2,
  Rocket,
  Search,
  Send,
  Sparkles,
  Trophy,
  Wallet,
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

type ProfileResult = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
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

function BrandWordmark() {
  return (
    <span className="inline-flex items-center font-black tracking-tight text-white">
      Entre<span className="text-blue-300">US</span>
    </span>
  )
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

function GiftCardVisual({ gift }: { gift: DigitalGift }) {
  const GiftIcon = giftIconBySlug[gift.slug]
  const [mediaFailed, setMediaFailed] = useState(false)

  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 via-zinc-950 to-black text-blue-100 shadow-inner shadow-blue-950/40 ring-1 ring-blue-300/20">
      <div className="pointer-events-none absolute inset-2 rounded-[1.35rem] bg-blue-400/10 blur-xl" />

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
          className="relative h-full w-full rounded-3xl bg-black object-cover"
        />
      ) : gift.media_url && !mediaFailed ? (
        <img
          src={gift.media_url}
          alt={gift.name}
          onError={() => setMediaFailed(true)}
          className="relative h-full w-full rounded-3xl object-cover"
        />
      ) : GiftIcon ? (
        <GiftIcon className="relative h-11 w-11 stroke-[1.8] drop-shadow-[0_8px_24px_rgba(96,165,250,0.35)]" />
      ) : (
        <span className="relative text-2xl font-black tracking-wide">
          {giftInitials(gift.name)}
        </span>
      )}
    </div>
  )
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
  const [receiverResults, setReceiverResults] = useState<ProfileResult[]>([])
  const [searchingUser, setSearchingUser] = useState(false)

  useEffect(() => {
    loadGifts()
  }, [])

  useEffect(() => {
    if (!selectedGift) return

    const normalizedQuery = normalizeProfileQuery(username)

    if (!normalizedQuery) {
      setReceiverResults([])
      setReceiver(null)
      setSearchingUser(false)
      return
    }

    const timer = window.setTimeout(() => {
      findReceivers(normalizedQuery)
    }, 280)

    return () => window.clearTimeout(timer)
  }, [username, selectedGift])

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
    setReceiverResults([])
    setMessage('')
    setSuccessMessage('')
  }

  function normalizeProfileQuery(value: string) {
    return value.trim().replace(/^@/, '').replace(/[%,]/g, '').toLowerCase()
  }

  async function findReceivers(query = normalizeProfileQuery(username)) {
    const normalizedQuery = normalizeProfileQuery(query)

    if (!normalizedQuery) {
      setMessage('Digite parte do nome ou username para buscar.')
      setReceiverResults([])
      return
    }

    setSearchingUser(true)
    setMessage('')
    setReceiver(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${normalizedQuery}%`)
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(8)

    setSearchingUser(false)

    if (error) {
      setMessage('Nao foi possivel buscar usuarios: ' + error.message)
      setReceiverResults([])
      return
    }

    const results = (data || []) as ProfileResult[]
    setReceiverResults(results)

    if (results.length === 0) {
      setMessage('Nenhum usuario encontrado para essa busca.')
    }
  }

  function selectReceiver(profile: ProfileResult) {
    setReceiver(profile)
    setUsername(profile.username ? `@${profile.username}` : profile.display_name || '')
    setReceiverResults([])
    setMessage('')
  }

  async function sendGift() {
    if (!selectedGift) return

    if (!receiver) {
      await findReceivers()
      setMessage('Selecione um usuario da lista antes de confirmar.')
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
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 top-28 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Feed
          </Link>

          <Link
            href="/wallet"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Wallet className="h-4 w-4" />
            Carteira
          </Link>
        </header>

        <section className="relative z-10 grid items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2">
              <img src="/logo-icon.png" alt="EntreUS" className="h-8 w-8 rounded-full object-contain" />
              <span className="text-sm font-black">
                <BrandWordmark /> Gifts
              </span>
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
              Presentes digitais para celebrar pessoas na <BrandWordmark />.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
              Escolha um presente, encontre um usuario e envie reconhecimento usando ItaCash. Neste MVP, 100% do valor vai para quem recebe.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5">
                <p className="text-2xl font-black">{gifts.length}</p>
                <p className="text-sm font-bold text-blue-100/70">presentes ativos</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5">
                <p className="text-2xl font-black">10 = R$ 1</p>
                <p className="text-sm text-zinc-400">referencia ItaCash</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5">
                <p className="text-2xl font-black">100%</p>
                <p className="text-sm text-zinc-400">creditado ao destinatario</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-blue-300/20 bg-zinc-950/80 p-5 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10">
              <img
                src="/itacash.png"
                alt="ItaCash"
                className="mx-auto aspect-square max-h-72 w-full object-contain drop-shadow-[0_22px_50px_rgba(59,130,246,0.28)]"
              />
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/45 p-5">
                <p className="text-sm font-bold text-blue-100/80">Catalogo ItaCash</p>
                <p className="mt-2 text-3xl font-black">Presentes digitais</p>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  Uma camada simples para incentivar reconhecimento sem compra real neste pacote.
                </p>
              </div>
            </div>
          </div>
        </section>

        {(message || successMessage) && (
          <div className={`relative z-10 mb-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            successMessage
              ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
          }`}>
            {successMessage ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Gift className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{successMessage || message}</span>
          </div>
        )}

        {loading ? (
          <div className="relative z-10 flex min-h-72 items-center justify-center rounded-3xl border border-white/10 bg-zinc-950 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando presentes...
          </div>
        ) : gifts.length === 0 ? (
          <div className="relative z-10 flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center">
            <div>
              <Sparkles className="mx-auto h-10 w-10 text-blue-200" />
              <h2 className="mt-4 text-xl font-black">Nenhum presente ativo ainda.</h2>
            </div>
          </div>
        ) : (
          <div className="relative z-10 space-y-10 pb-10">
            {Object.entries(groupedGifts).map(([category, categoryGifts]) => (
              <section key={category}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-300">
                      {categoryLabel(category)}
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-white">Presentes {categoryLabel(category)}</h2>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {categoryGifts.map((gift) => (
                    <article key={gift.id} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-blue-300/30 hover:shadow-blue-500/10">
                      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-500/10 blur-2xl transition group-hover:bg-blue-500/20" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <GiftCardVisual gift={gift} />
                          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-zinc-300">
                            {categoryLabel(gift.category)}
                          </span>
                        </div>

                        <h3 className="mt-5 text-xl font-black">{gift.name}</h3>
                        <p className="mt-2 min-h-16 text-sm leading-6 text-zinc-400">
                          {gift.description || 'Presente digital EntreUS.'}
                        </p>

                        <div className="mt-5 rounded-2xl border border-blue-300/15 bg-blue-500/10 p-4">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200/70">Preco</p>
                          <p className="mt-1 text-3xl font-black text-blue-100">
                            {gift.price_itacash} <span className="text-base text-blue-200/70">ItaCash</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openGiftModal(gift)}
                          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-blue-50"
                        >
                          <Send className="h-4 w-4" />
                          Enviar presente
                        </button>
                      </div>
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

            <div className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-300">Enviar presente</p>
                  <h2 className="mt-2 text-2xl font-black">{selectedGift.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{selectedGift.price_itacash} ItaCash</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGift(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-black">Buscar destinatario</span>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value)
                      setReceiver(null)
                    }}
                    placeholder="Nome ou username"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                  />
                  <button
                    type="button"
                    onClick={() => findReceivers()}
                    disabled={searchingUser}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black transition hover:bg-blue-50 disabled:opacity-60"
                    aria-label="Buscar usuario"
                  >
                    {searchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {receiverResults.length > 0 && (
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/55 p-2 [scrollbar-color:rgba(96,165,250,0.45)_transparent] [scrollbar-width:thin]">
                  {receiverResults.map((profile) => {
                    const profileName = profile.display_name || profile.username || 'Usuario'

                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => selectReceiver(profile)}
                        className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-blue-500/10"
                      >
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profileName} className="h-11 w-11 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-black text-blue-100">
                            {profileName.charAt(0).toUpperCase()}
                          </span>
                        )}

                        <span className="min-w-0">
                          <span className="block truncate font-black text-white">{profileName}</span>
                          <span className="block truncate text-sm text-blue-100/70">
                            {profile.username ? `@${profile.username}` : 'sem username'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

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
