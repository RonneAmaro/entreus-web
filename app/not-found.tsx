'use client'

import Link from 'next/link'
import EntreUSWordmark from './components/EntreUSWordmark'
import { useLanguage } from './components/LanguageProvider'

export default function NotFound() {
  const { t } = useLanguage()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
        <EntreUSWordmark />
        <h1 className="mt-6 text-3xl font-black">404</h1>
        <p className="mt-3 text-text-muted">{t('common.unavailable')}</p>
        <Link href="/feed" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-bold text-white">
          {t('settings.back')}
        </Link>
      </section>
    </main>
  )
}

