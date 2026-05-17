'use client'

import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

type SensitiveContentProps = {
  children: React.ReactNode
  label?: string
}

export default function SensitiveContent({
  children,
  label,
}: SensitiveContentProps) {
  const { t } = useLanguage()
  const displayLabel = label || t('sensitiveContent.label')

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
      <div className="pointer-events-none select-none blur-xl brightness-50">
        {children}
      </div>

      <div className="absolute inset-0 flex min-h-[220px] flex-col items-center justify-center bg-black/80 px-5 py-8 text-center text-white">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <ShieldAlert className="h-7 w-7 text-yellow-300" />
        </div>

        <h3 className="text-lg font-bold">{displayLabel}</h3>

        <p className="mt-2 max-w-sm text-sm text-zinc-300">
          Conteudo 18+. Para visualizar, e necessario confirmar maioridade.
        </p>

        <Link
          href="/profile"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Verificar idade
        </Link>
      </div>
    </div>
  )
}
