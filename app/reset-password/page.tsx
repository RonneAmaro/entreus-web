'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { getPasswordResetValidationMessage } from '@/lib/auth/password-reset'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '../components/LanguageProvider'

export default function ResetPasswordPage() {
  const { t } = useLanguage()
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [checkingRecovery, setCheckingRecovery] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let active = true
    const isRecoveryLink = new URLSearchParams(window.location.search).get('flow') === 'recovery'

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) return

      setHasRecoverySession(Boolean(session) && isRecoveryLink)
      setCheckingRecovery(false)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== 'PASSWORD_RECOVERY') return

      setHasRecoverySession(Boolean(session))
      setCheckingRecovery(false)
    })

    void checkRecoverySession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const validationMessage = getPasswordResetValidationMessage(newPassword, confirmation)
    if (validationMessage) {
      setMessage(validationMessage)
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      console.error('Erro ao atualizar senha:', error.message)
      setMessage(t('auth.reset.updateError'))
      setSaving(false)
      return
    }

    await supabase.auth.signOut({ scope: 'local' })
    setNewPassword('')
    setConfirmation('')
    setCompleted(true)
    setSaving(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-zinc-950 dark:bg-black dark:text-white">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">
          <Image src="/logo-icon.png" alt="EntreUS" width={36} height={36} className="h-9 w-9 rounded-full object-contain" priority />
          <span className="font-black tracking-tight">EntreUS</span>
        </Link>

        <h1 className="text-3xl font-black">{t('auth.reset.title')}</h1>

        {checkingRecovery ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{t('auth.reset.checking')}</p>
        ) : completed ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              {t('auth.reset.success')}
            </p>
            <Link
              href="/login"
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-zinc-950"
            >
              {t('auth.reset.backToLogin')}
            </Link>
          </div>
        ) : !hasRecoverySession ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {t('auth.reset.invalidLink')}
            </p>
            <Link
              href="/forgot-password"
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-zinc-950"
            >
              {t('auth.reset.requestNewLink')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('auth.reset.passwordHint')}</p>

            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('auth.reset.newPassword')}</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('auth.reset.confirmPassword')}</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-zinc-950"
            >
              {saving ? t('auth.reset.saving') : t('auth.reset.submit')}
            </button>

            {message && <p role="alert" aria-live="polite" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{message}</p>}
          </form>
        )}
      </section>
    </main>
  )
}
