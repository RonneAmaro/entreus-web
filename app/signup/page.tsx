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

function calculateAge(birthDateValue: string) {
  if (!birthDateValue) return 0

  const birthDate = new Date(`${birthDateValue}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
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

    if (!acceptedTerms) {
      setMessage('Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar sua conta.')
      return
    }

    if (!birthDate) {
      setMessage('Informe sua data de nascimento para criar a conta.')
      return
    }

    const age = calculateAge(birthDate)
    const isMinor = age < 18

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          birth_date: birthDate,
          is_minor: isMinor,
          parental_consent_status: isMinor ? 'pending' : 'not_required',
          wants_18_plus: false,
          age_verification_status: 'not_started',
        },
      },
    })

    if (!error && data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        birth_date: birthDate,
        is_minor: isMinor,
        parental_consent_status: isMinor ? 'pending' : 'not_required',
        wants_18_plus: false,
        show_sensitive_content: false,
        age_verification_status: 'not_started',
        updated_at: new Date().toISOString(),
      })
    }

    setLoading(false)

    if (error) {
      setMessage('Erro ao criar conta: ' + error.message)
      return
    }

    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setBirthDate('')
    setAcceptedTerms(false)
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

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              Data de nascimento
            </label>

            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none transition focus:border-zinc-500"
              required
            />

            {birthDate && calculateAge(birthDate) < 18 && (
              <p className="mt-2 rounded-xl border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-xs leading-5 text-yellow-200">
                Usuarios menores de 18 anos precisam de autorizacao de responsavel para usar recursos completos da plataforma.
              </p>
            )}
          </div>

          <label className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-300">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 accent-blue-500"
            />

            <span>
              Li e concordo com os{' '}
              <Link href="/terms" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                Termos de Uso
              </Link>{' '}
              e a{' '}
              <Link href="/privacy" className="font-semibold text-blue-300 underline-offset-4 hover:underline">
                Política de Privacidade
              </Link>{' '}
              do EntreUS.
            </span>
          </label>

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
