'use client'

import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setMessage('Erro ao entrar: ' + error.message)
      setLoading(false)
      return
    }

    router.push('/feed')
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">Entrar</h1>

          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Acesse sua conta no EntreUS
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
              E-mail
            </label>

            <input
              type="email"
              placeholder="seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
              Senha
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 pr-12 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-xl py-3 font-medium transition ${
              loading
                ? 'cursor-not-allowed bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                : 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
            }`}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {message}
          </p>
        )}

        <div className="mt-6 space-y-3 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ainda não tem conta?
          </p>

          <Link
            href="/signup"
            className="inline-block w-full rounded-xl border border-zinc-300 px-4 py-3 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </main>
  )
}