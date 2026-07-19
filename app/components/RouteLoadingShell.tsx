'use client'

import { useLanguage } from './LanguageProvider'

type RouteLoadingShellProps = {
  title: string
}

export default function RouteLoadingShell({ title }: RouteLoadingShellProps) {
  const { t } = useLanguage()
  return (
    <main
      aria-busy="true"
      aria-label={t('loading.opening', { title })}
      className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="h-11 w-36 rounded-full bg-surface-muted" />
        <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="h-3 w-28 rounded-full bg-brand/20" />
          <div className="mt-5 h-10 w-full max-w-xl rounded-2xl bg-surface-muted sm:h-12" />
          <div className="mt-4 h-4 w-full max-w-2xl rounded-full bg-surface-muted" />
          <div className="mt-2 h-4 w-4/5 max-w-xl rounded-full bg-surface-muted" />
        </section>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 rounded-3xl border border-border bg-surface p-5 shadow-sm">
              <div className="h-10 w-10 rounded-2xl bg-brand/15" />
              <div className="mt-5 h-4 w-2/3 rounded-full bg-surface-muted" />
              <div className="mt-3 h-3 w-full rounded-full bg-surface-muted" />
            </div>
          ))}
        </div>
        <p role="status" className="mt-6 text-center text-sm font-semibold text-text-muted">
          {t('loading.opening', { title })}
        </p>
      </div>
    </main>
  )
}
