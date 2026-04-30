'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

function validatePassword(password: string) {
  if (password.length < 8) {
    return 'A senha precisa ter pelo menos 8 caracteres.'
  }

  if (!/[A-Za-zÀ-ÿ]/.test(password)) {
    return 'A senha precisa ter pelo menos uma letra.'
  }

  if (!/\d/.test(password)) {
    return 'A senha precisa ter pelo menos um número.'
  }

  return ''
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    const passwordError = validatePassword(password)

    if (passwordError) {
      setMessage(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setMessage('As senhas não conferem.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setMessage('Erro ao criar conta: ' + error.message)
      return
    }

    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setMessage('Conta criada com sucesso! Agora você já pode entrar.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl sm:p-8">
        <h1 className="mb-2 text-center text-3xl font-bold">Criar conta</h1>

        <p className="mb-6 text-center text-zinc-400">
          Entre para o EntreUS
        </p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              E-mail
            </label>

            <input
              type="email"
              placeholder="seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none transition focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              Senha
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Crie uma senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 outline-none transition focus:border-zinc-500"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Use pelo menos 8 caracteres, com letras e números.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              Confirmar senha
            </label>

            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Digite a senha novamente"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 outline-none transition focus:border-zinc-500"
                required
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                aria-label={
                  showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'
                }
              >
                {showConfirmPassword ? (
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
            className="w-full rounded-xl bg-white py-3 font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 rounded-xl border px-4 py-3 text-center text-sm ${
              message.includes('sucesso')
                ? 'border-green-800 bg-green-950/40 text-green-300'
                : 'border-red-800 bg-red-950/40 text-red-300'
            }`}
          >
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-zinc-400">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}