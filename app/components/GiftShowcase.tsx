'use client'

import { useState } from 'react'
import {
  Coffee,
  Crown,
  Flower2,
  Gem,
  Gift,
  Heart,
  Rocket,
  Send,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

export type GiftShowcaseItem = {
  id: string
  message: string | null
  price_paid_itacash: number
  created_at: string
  sender: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
  gift: {
    name: string
    slug: string
    description: string | null
    media_url: string | null
    media_type: string | null
  } | null
}

type GiftShowcaseProps = {
  title?: string
  gifts: GiftShowcaseItem[]
  canGift?: boolean
  onGiftClick?: () => void
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function initials(text: string) {
  return text
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

function GiftMedia({ item }: { item: GiftShowcaseItem }) {
  const gift = item.gift
  const GiftIcon = gift?.slug ? giftIconBySlug[gift.slug] : Gift
  const [mediaFailed, setMediaFailed] = useState(false)

  if (gift?.media_url && gift.media_type === 'video' && !mediaFailed) {
    return (
      <video
        src={gift.media_url}
        poster={getGiftPoster(gift.media_url)}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setMediaFailed(true)}
        className="h-28 w-full rounded-2xl bg-black object-cover"
      />
    )
  }

  if (gift?.media_url && !mediaFailed) {
    return (
      <img
        src={gift.media_url}
        alt={gift.name}
        onError={() => setMediaFailed(true)}
        className="h-28 w-full rounded-2xl object-cover"
      />
    )
  }

  return (
    <div className="flex h-28 w-full items-center justify-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 via-zinc-950 to-black text-blue-100">
      {GiftIcon ? (
        <GiftIcon className="h-10 w-10 stroke-[1.8]" />
      ) : (
        <span className="text-2xl font-black">{initials(gift?.name || 'Gift')}</span>
      )}
    </div>
  )
}

function SenderBadge({ item }: { item: GiftShowcaseItem }) {
  const senderName = item.sender?.display_name || item.sender?.username || 'Usuario'

  return (
    <div className="mt-4 flex items-center gap-2">
      {item.sender?.avatar_url ? (
        <img
          src={item.sender.avatar_url}
          alt={senderName}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-xs font-black text-blue-100">
          {senderName.charAt(0).toUpperCase()}
        </span>
      )}

      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-zinc-300">Enviado por</p>
        <p className="truncate text-sm font-black text-white">
          {item.sender?.username ? `@${item.sender.username}` : senderName}
        </p>
      </div>
    </div>
  )
}

export default function GiftShowcase({
  title = 'Presentes recebidos',
  gifts,
  canGift = false,
  onGiftClick,
}: GiftShowcaseProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-blue-400/20 bg-zinc-950 p-4 text-white shadow-2xl shadow-blue-950/10 ring-1 ring-white/10 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
            Vitrine
          </p>
          <h2 className="mt-1 text-2xl font-black">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Presentes publicos destacam o carinho da comunidade e incentivam novas demonstracoes de apoio.
          </p>
        </div>

        {canGift && (
          <button
            type="button"
            onClick={onGiftClick}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Send className="h-4 w-4" />
            Presentear
          </button>
        )}
      </div>

      {gifts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-black/35 p-6 text-center">
          <Gift className="mx-auto h-9 w-9 text-blue-200" />
          <p className="mt-3 font-black">Este perfil ainda nao recebeu presentes publicos.</p>
          {canGift && (
            <button
              type="button"
              onClick={onGiftClick}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-blue-300/30 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-100 transition hover:bg-blue-500/20"
            >
              <Send className="h-4 w-4" />
              Enviar um presente
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gifts.map((item) => (
            <article
              key={item.id}
              className="group rounded-3xl border border-white/10 bg-black/35 p-4 transition hover:-translate-y-1 hover:border-blue-300/30 hover:bg-blue-950/20"
            >
              <GiftMedia item={item} />

              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black">
                    {item.gift?.name || 'Presente EntreUS'}
                  </h3>
                  {item.gift?.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">
                      {item.gift.description}
                    </p>
                  )}
                </div>

                <span className="shrink-0 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-black text-blue-100">
                  {item.price_paid_itacash} ItaCash
                </span>
              </div>

              {item.message && (
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-zinc-200">
                  {item.message}
                </p>
              )}

              <SenderBadge item={item} />

              <p className="mt-3 text-xs font-semibold text-zinc-500">
                {formatDate(item.created_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
