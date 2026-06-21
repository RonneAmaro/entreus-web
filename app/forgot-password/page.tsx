'use client'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback` })
    setMessage('Se este e-mail estiver cadastrado, enviaremos um link de recuperação.')
  }
  return <main className="flex min-h-screen items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border p-6"><h1 className="text-2xl font-bold">Recuperar senha</h1><input className="w-full rounded border p-3" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seuemail@email.com" /><button className="w-full rounded bg-black p-3 text-white" type="submit">Enviar link</button>{message && <p className="text-sm">{message}</p>}<Link className="block text-sm underline" href="/login">Voltar para entrar</Link></form></main>
}
