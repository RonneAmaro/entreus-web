'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'success' | 'error' | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageKind(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password?flow=recovery`,
      })

      setMessage(
        error
          ? 'Não foi possível solicitar o link agora. Tente novamente em instantes.'
          : 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.',
      )
      setMessageKind(error ? 'error' : 'success')
    } catch {
      setMessage('Não foi possível solicitar o link agora. Tente novamente em instantes.')
      setMessageKind('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-zinc-950 dark:bg-black dark:text-white">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">
          <Image src="/logo-icon.png" alt="EntreUS" width={36} height={36} className="h-9 w-9 rounded-full object-contain" priority />
          <span className="font-black tracking-tight">EntreUS</span>
        </Link>

        <h1 className="text-3xl font-black">Recuperar senha</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Informe seu e-mail para receber um link seguro de redefinição.</p>

        <label htmlFor="recovery-email" className="mt-6 mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">E-mail</label>
        <input
          id="recovery-email"
          className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="seuemail@email.com"
        />

        <button
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200 dark:focus-visible:ring-offset-zinc-950"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Enviando link...' : 'Enviar link de recuperação'}
        </button>

        {message && (
          <p
            role={messageKind === 'error' ? 'alert' : 'status'}
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              messageKind === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
            }`}
          >
            {message}
          </p>
        )}

        <Link className="mt-5 block text-center text-sm font-medium text-zinc-700 underline underline-offset-4 transition hover:text-black dark:text-zinc-300 dark:hover:text-white" href="/login">Voltar para entrar</Link>
      </form>
    </main>
  )
}
