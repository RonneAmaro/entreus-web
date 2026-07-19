'use client'

import { useEffect } from 'react'
import { useLanguage } from './components/LanguageProvider'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useLanguage()
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div role="alert" className="w-full max-w-lg rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black">{t('common.error')}</h1>
        <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-full bg-brand px-5 font-bold text-white">
          {t('common.retry')}
        </button>
      </div>
    </main>
  )
}

