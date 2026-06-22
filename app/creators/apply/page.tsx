'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useState } from 'react'

export default function CreatorApplyPage() {
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'success' | 'error' | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    setLoading(true)
    setMessage('')
    setMessageKind(null)

    try {
      const response = await fetch('/api/creator-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          category: formData.get('category'),
          message: formData.get('message'),
          acknowledged: formData.get('acknowledged') === 'on',
        }),
      })
      const payload = await response.json().catch(() => null)
      const responseMessage = typeof payload?.message === 'string' ? payload.message : ''

      if (!response.ok) {
        setMessage(responseMessage || 'Não foi possível enviar seu interesse agora. Tente novamente em instantes.')
        setMessageKind('error')
        return
      }

      setMessage(responseMessage || 'Seu interesse foi enviado. Obrigado por querer construir a EntreUS com a gente.')
      setMessageKind('success')
      form.reset()
    } catch {
      setMessage('Não foi possível enviar seu interesse agora. Verifique sua conexão e tente novamente.')
      setMessageKind('error')
    } finally {
      setLoading(false)
    }
  }

  const fieldClassName = 'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-400'

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <Link href="/" className="inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">
          <Image src="/logo-icon.png" alt="EntreUS" width={36} height={36} className="h-9 w-9 rounded-full object-contain" priority />
          <span className="font-black tracking-tight">EntreUS</span>
        </Link>

        <section className="mt-6 rounded-3xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl shadow-black/25 ring-1 ring-blue-400/10 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Programa de criadores</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Interesse no Programa Criadores Fundadores</h1>
          <p className="mt-3 leading-7 text-zinc-300">Não garante aprovação, pagamento, renda ou monetização imediata.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="creator-name" className="mb-2 block text-sm font-medium text-zinc-200">Nome</label>
              <input id="creator-name" name="name" required placeholder="Seu nome" autoComplete="name" className={fieldClassName} />
            </div>

            <div>
              <label htmlFor="creator-email" className="mb-2 block text-sm font-medium text-zinc-200">E-mail</label>
              <input id="creator-email" name="email" required type="email" placeholder="seuemail@email.com" autoComplete="email" className={fieldClassName} />
            </div>

            <div>
              <label htmlFor="creator-category" className="mb-2 block text-sm font-medium text-zinc-200">Categoria principal</label>
              <select id="creator-category" name="category" required defaultValue="" className={fieldClassName}>
                <option value="" disabled className="bg-white text-zinc-950">Selecione uma categoria</option>
                <option value="Vídeos" className="bg-white text-zinc-950">Vídeos</option>
                <option value="Lives" className="bg-white text-zinc-950">Lives</option>
                <option value="Educação" className="bg-white text-zinc-950">Educação</option>
                <option value="Humor" className="bg-white text-zinc-950">Humor</option>
                <option value="Conteúdo adulto verificado" className="bg-white text-zinc-950">Conteúdo adulto verificado</option>
                <option value="Outro" className="bg-white text-zinc-950">Outro</option>
              </select>
            </div>

            <div>
              <label htmlFor="creator-message" className="mb-2 block text-sm font-medium text-zinc-200">Mensagem curta</label>
              <textarea id="creator-message" name="message" required maxLength={1200} placeholder="Conte um pouco sobre seu conteúdo e o que espera criar." className={`${fieldClassName} min-h-32 resize-y`} />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200">
              <input name="acknowledged" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-blue-500" />
              <span>Entendo que não há garantia de pagamento, renda, aprovação ou monetização imediata.</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-500 px-5 py-3 font-bold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Enviando interesse...' : 'Enviar interesse'}
            </button>

            {message && (
              <p
                role={messageKind === 'error' ? 'alert' : 'status'}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  messageKind === 'error'
                    ? 'border-red-400/30 bg-red-500/10 text-red-100'
                    : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                }`}
              >
                {message}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  )
}
