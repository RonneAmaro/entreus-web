'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Award, Crown, Gem, ShieldCheck, Sparkles } from 'lucide-react'
import { normalizeBadgeIconSlug, type BadgeIconSlug } from '@/lib/badge-icons'

type BadgeVisualSize = 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large' | 'hero'
type BadgeVisualMode = 'static' | 'animated'

type BadgeVisualProps = {
  slug: BadgeIconSlug | string
  label?: string
  size?: BadgeVisualSize
  mode?: BadgeVisualMode
  animated?: boolean
  className?: string
  decorative?: boolean
}

type BadgeVisualConfig = {
  slug: BadgeIconSlug
  label: string
  imageSrc: string | null
  videoSrc: string | null
  fallbackText: string
  shellClassName: string
  fallbackClassName: string
  fallbackIcon: typeof Award
}

const SIZE_CLASS_NAMES: Record<Exclude<BadgeVisualSize, 'small' | 'medium' | 'large'>, string> = {
  sm: 'h-10 w-10 text-[10px]',
  md: 'h-14 w-14 text-xs',
  lg: 'h-20 w-20 text-sm sm:h-24 sm:w-24',
  hero: 'h-24 w-24 text-base sm:h-32 sm:w-32',
}

const FALLBACK_ICON_CLASS_NAMES: Record<Exclude<BadgeVisualSize, 'small' | 'medium' | 'large'>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-9 w-9',
  hero: 'h-12 w-12',
}

export const BADGE_VISUAL_ASSETS: Record<BadgeIconSlug, BadgeVisualConfig> = {
  elder: {
    slug: 'elder',
    label: 'Ancião',
    imageSrc: '/badges/anciao.png',
    videoSrc: '/badges/anciao.mp4',
    fallbackText: 'AN',
    shellClassName: 'border-amber-200/45 bg-amber-500/10 shadow-amber-950/30 ring-amber-200/25',
    fallbackClassName: 'from-amber-200 via-yellow-300 to-orange-500 text-amber-950',
    fallbackIcon: Crown,
  },
  vip_premium: {
    slug: 'vip_premium',
    label: 'VIP Premium',
    imageSrc: '/badges/vip-premium.png',
    videoSrc: '/badges/vip-premium.mp4',
    fallbackText: 'VP',
    shellClassName: 'border-violet-200/45 bg-violet-500/10 shadow-violet-950/30 ring-violet-200/25',
    fallbackClassName: 'from-blue-200 via-violet-300 to-fuchsia-500 text-blue-950',
    fallbackIcon: Gem,
  },
  vip: {
    slug: 'vip',
    label: 'VIP',
    imageSrc: '/badges/vip-premium.png',
    videoSrc: '/badges/vip-premium.mp4',
    fallbackText: 'VIP',
    shellClassName: 'border-blue-200/45 bg-blue-500/10 shadow-blue-950/30 ring-blue-200/25',
    fallbackClassName: 'from-blue-200 via-indigo-300 to-violet-500 text-blue-950',
    fallbackIcon: Sparkles,
  },
  community: {
    slug: 'community',
    label: 'Comunidade',
    imageSrc: '/badges/comunidade.png',
    videoSrc: '/badges/comunidade.mp4',
    fallbackText: 'CO',
    shellClassName: 'border-cyan-200/45 bg-emerald-500/10 shadow-emerald-950/30 ring-cyan-200/25',
    fallbackClassName: 'from-emerald-200 via-cyan-300 to-teal-500 text-emerald-950',
    fallbackIcon: ShieldCheck,
  },
  unknown: {
    slug: 'unknown',
    label: 'Selo',
    imageSrc: null,
    videoSrc: null,
    fallbackText: 'SE',
    shellClassName: 'border-zinc-200/25 bg-white/10 shadow-black/25 ring-white/10',
    fallbackClassName: 'from-zinc-200 via-zinc-300 to-zinc-500 text-zinc-950',
    fallbackIcon: Award,
  },
}

const SIZE_ALIASES: Record<BadgeVisualSize, Exclude<BadgeVisualSize, 'small' | 'medium' | 'large'>> = {
  sm: 'sm',
  small: 'sm',
  md: 'md',
  medium: 'md',
  lg: 'lg',
  large: 'lg',
  hero: 'hero',
}

const BADGE_VISUAL_ALIASES: Record<string, BadgeIconSlug> = {
  elder: 'elder',
  anciao: 'elder',
  vip: 'vip',
  vip_premium: 'vip_premium',
  'vip-premium': 'vip_premium',
  vippremium: 'vip_premium',
  community: 'community',
  comunidade: 'community',
}

const VIDEO_ENABLED_SIZES = new Set<BadgeVisualSize>(['lg', 'hero'])

function resolveBadgeVisual(slug: string): BadgeVisualConfig {
  const normalizedSlug = normalizeBadgeIconSlug(slug)
  const canonicalSlug = BADGE_VISUAL_ALIASES[normalizedSlug] || 'unknown'

  return BADGE_VISUAL_ASSETS[canonicalSlug]
}

function getVideoType(src: string) {
  return src.endsWith('.webm') ? 'video/webm' : 'video/mp4'
}

export default function BadgeVisual({
  slug,
  label,
  size = 'md',
  mode,
  animated = false,
  className = '',
  decorative = false,
}: BadgeVisualProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const visual = resolveBadgeVisual(slug)
  const accessibleLabel = `Selo ${label || visual.label}`
  const resolvedSize = SIZE_ALIASES[size]
  const resolvedMode = mode || (animated ? 'animated' : 'static')
  const videoSrc = resolvedMode === 'animated' && VIDEO_ENABLED_SIZES.has(resolvedSize) && !videoFailed ? visual.videoSrc : null
  const imageSrc = !videoSrc && !imageFailed ? visual.imageSrc : null
  const FallbackIcon = visual.fallbackIcon

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border shadow-xl ring-1 ${SIZE_CLASS_NAMES[resolvedSize]} ${visual.shellClassName} ${className}`}
      title={accessibleLabel}
      aria-label={decorative ? undefined : accessibleLabel}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {videoSrc ? (
        <video
          className="h-full w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={visual.imageSrc || undefined}
          onError={() => setVideoFailed(true)}
          aria-label={accessibleLabel}
          title={accessibleLabel}
        >
          <source src={videoSrc} type={getVideoType(videoSrc)} />
        </video>
      ) : imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes={resolvedSize === 'hero' ? '128px' : resolvedSize === 'lg' ? '96px' : resolvedSize === 'md' ? '56px' : '40px'}
          className="object-contain"
          onError={() => setImageFailed(true)}
          aria-hidden="true"
        />
      ) : (
        <span className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br font-black ${visual.fallbackClassName}`}>
          <FallbackIcon className={FALLBACK_ICON_CLASS_NAMES[resolvedSize]} aria-hidden="true" />
          <span className="mt-0.5 leading-none">{visual.fallbackText}</span>
        </span>
      )}
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  )
}
