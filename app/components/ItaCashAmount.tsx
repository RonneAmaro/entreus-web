'use client'

import { useState } from 'react'
import {
  formatItaCashAmount,
  getItaCashAmountLabel,
  getItaCashIconConfig,
} from '@/lib/itacash-display'

type ItaCashAmountSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type ItaCashAmountProps = {
  amount: number | string | null | undefined
  size?: ItaCashAmountSize
  showLabel?: boolean
  className?: string
  valueClassName?: string
  iconClassName?: string
  title?: string
}

const SIZE_CLASS_NAMES: Record<ItaCashAmountSize, string> = {
  xs: 'gap-1 text-xs',
  sm: 'gap-1.5 text-sm',
  md: 'gap-2 text-base',
  lg: 'gap-2 text-xl',
  xl: 'gap-2.5 text-3xl',
}

const ICON_SIZE_CLASS_NAMES: Record<ItaCashAmountSize, string> = {
  xs: 'h-3.5 w-3.5 text-[9px]',
  sm: 'h-4 w-4 text-[10px]',
  md: 'h-5 w-5 text-xs',
  lg: 'h-6 w-6 text-sm',
  xl: 'h-8 w-8 text-base',
}

export default function ItaCashAmount({
  amount,
  size = 'sm',
  showLabel = true,
  className = '',
  valueClassName = '',
  iconClassName = '',
  title,
}: ItaCashAmountProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const iconConfig = getItaCashIconConfig(!imageFailed)
  const amountText = formatItaCashAmount(amount)
  const accessibleLabel = title || getItaCashAmountLabel(amount)

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap align-middle font-black leading-none ${SIZE_CLASS_NAMES[size]} ${className}`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {iconConfig.imageSrc ? (
        <img
          src={iconConfig.imageSrc}
          alt={iconConfig.label}
          title={iconConfig.label}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className={`${ICON_SIZE_CLASS_NAMES[size]} shrink-0 object-contain ${iconClassName}`}
        />
      ) : (
        <span
          className={`${ICON_SIZE_CLASS_NAMES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-cyan-500 text-[0.62em] font-black text-white ring-1 ring-cyan-200/50 ${iconClassName}`}
          role="img"
          aria-label={iconConfig.label}
          title={iconConfig.label}
        >
          {iconConfig.fallbackText}
        </span>
      )}

      <span className={valueClassName}>{amountText}</span>
      {showLabel && <span className="font-semibold opacity-75">ItaCash</span>}
    </span>
  )
}
