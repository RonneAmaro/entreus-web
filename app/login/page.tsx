'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
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
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">Entrar</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2">
            Acesse sua conta no EntreUS
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
              E-mail
            </label>
            <input
              type="email"
              placeholder="seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-zinc-700 dark:text-zinc-300">
              Senha
            </label>
            <input
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-medium transition ${
              loading
                ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-not-allowed'
                : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
            }`}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-center text-zinc-700 dark:text-zinc-300">
            {message}
          </p>
        )}

        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ainda não tem conta?
          </p>

          <Link
            href="/signup"
            className="inline-block w-full border border-zinc-300 dark:border-zinc-700 px-4 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </main>
  )
}