'use client'

import { useState } from 'react'
import { Eye, ShieldAlert } from 'lucide-react'

type SensitiveContentProps = {
  children: React.ReactNode
  label?: string
}

export default function SensitiveContent({
  children,
  label = 'Conteúdo 18+',
}: SensitiveContentProps) {
  const [revealed, setRevealed] = useState(false)

  if (revealed) {
    return <>{children}</>
  }

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
      <div className="pointer-events-none select-none blur-xl brightness-50">
        {children}
      </div>

      <div className="absolute inset-0 flex min-h-[220px] flex-col items-center justify-center bg-black/80 px-5 py-8 text-center text-white">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <ShieldAlert className="h-7 w-7 text-yellow-300" />
        </div>

        <h3 className="text-lg font-bold">{label}</h3>

        <p className="mt-2 max-w-sm text-sm text-zinc-300">
          Esta publicação pode conter conteúdo sensível ou adulto. Toque para visualizar apenas se desejar continuar.
        </p>

        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        >
          <Eye className="h-4 w-4" />
          Mostrar conteúdo
        </button>
      </div>
    </div>
  )
}