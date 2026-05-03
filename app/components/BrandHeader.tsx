'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

type BrandHeaderProps = {
  subtitle?: string
  description?: string
  backHref?: string
  backLabel?: string
  rightContent?: ReactNode
  compact?: boolean
}

export default function BrandHeader({
  subtitle,
  description,
  backHref,
  backLabel = 'Voltar',
  rightContent,
  compact = false,
}: BrandHeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-transparent pb-4 transition-colors dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}

          <Link href="/feed" className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <Image
                src="/logo-icon.png"
                alt="Ícone EntreUS"
                width={48}
                height={48}
                className="h-full w-full object-contain p-1.5"
                priority
              />
            </div>

            <div className="min-w-0">
              <h1
                className={`truncate font-extrabold tracking-tight text-zinc-950 dark:text-white ${
                  compact ? 'text-2xl' : 'text-3xl'
                }`}
              >
                Entre<span className="text-blue-500">US</span>
              </h1>

              {subtitle && (
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {subtitle}
                </p>
              )}
            </div>
          </Link>
        </div>

        {rightContent && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {rightContent}
          </div>
        )}
      </div>

      {description && (
        <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
    </header>
  )
}