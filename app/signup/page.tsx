'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage('Erro ao criar conta: ' + error.message)
      return
    }

    setMessage('Conta criada com sucesso!')
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold mb-2 text-center">Criar conta</h1>
        <p className="text-zinc-400 text-center mb-6">Entre para o EntreUS</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block mb-2 text-sm text-zinc-300">E-mail</label>
            <input
              type="email"
              placeholder="seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block mb-2 text-sm text-zinc-300">Senha</label>
            <input
              type="password"
              placeholder="Crie uma senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-zinc-500"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black rounded-xl py-3 font-medium hover:opacity-90"
          >
            Criar conta
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-center text-zinc-300">{message}</p>
        )}
      </div>
    </main>
  )
}