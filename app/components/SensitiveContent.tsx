'use client'

import { useState } from 'react'
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
  const [revealed, setRevealed] = useState(false)

  if (revealed) {
    return <>{children}</>
  }

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-yellow-300/30 bg-zinc-950 text-white shadow-sm ring-1 ring-yellow-200/10">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(250,204,21,0.18),rgba(24,24,27,0.92)_42%,rgba(9,9,11,1))]" />

      <div className="relative flex min-h-[220px] flex-col items-center justify-center px-5 py-8 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
          <ShieldAlert className="h-7 w-7 text-yellow-300" aria-hidden="true" />
        </div>

        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
          {displayLabel}
        </p>

        <h3 className="mt-2 text-lg font-black">Conteudo sensivel</h3>

        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-200">
          Este conteudo pode nao ser adequado para todos os publicos.
        </p>

        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-label="Revelar conteudo sensivel"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-black text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
        >
          Revelar conteudo
        </button>
      </div>
    </div>
  )
}
