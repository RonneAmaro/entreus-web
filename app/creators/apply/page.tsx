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
      const interests = formData.getAll('interests').map((value) => String(value)).filter(Boolean)
      const contact = String(formData.get('contact') || '').trim()
      const messageText = String(formData.get('message') || '').trim()
      const details = [
        contact ? `Contato/WhatsApp: ${contact}` : '',
        interests.length > 0 ? `Interesses: ${interests.join(', ')}` : '',
      ].filter(Boolean)
      const composedMessage = [messageText, details.length > 0 ? `Detalhes do convite:\n${details.join('\n')}` : '']
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 1200)

      const response = await fetch('/api/creator-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          creatorName: formData.get('creatorName'),
          category: formData.get('category'),
          socialLink: formData.get('socialLink'),
          audienceSize: formData.get('audienceSize'),
          message: composedMessage,
          adultInterest: interests.includes('Conteudo 18+'),
          acknowledged: formData.get('acknowledged') === 'on',
        }),
      })
      const payload = await response.json().catch(() => null)
      const responseMessage = typeof payload?.message === 'string' ? payload.message : ''

      if (!response.ok) {
        setMessage(responseMessage || 'Nao foi possivel enviar seu interesse agora. Tente novamente em instantes.')
        setMessageKind('error')
        return
      }

      setMessage(responseMessage || 'Seu interesse foi enviado. Obrigado por querer construir a EntreUS com a gente.')
      setMessageKind('success')
      form.reset()
    } catch {
      setMessage('Nao foi possivel enviar seu interesse agora. Verifique sua conexao e tente novamente.')
      setMessageKind('error')
    } finally {
      setLoading(false)
    }
  }

  const fieldClassName = 'w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-400'
  const optionClassName = 'bg-white text-zinc-950'

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/creators" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">
          <Image src="/logo-icon.png" alt="EntreUS" width={36} height={36} className="h-9 w-9 rounded-full object-contain" priority />
          <span className="font-black tracking-tight">EntreUS</span>
        </Link>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="rounded-lg border border-white/10 bg-blue-500/10 p-6 ring-1 ring-blue-300/15">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Criadores fundadores</p>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Entre na lista de criadores</h1>
            <p className="mt-3 leading-7 text-zinc-300">
              Conte sobre seu nicho, sua audiencia e o que voce quer testar no EntreUS. Este formulario nao pede documento, senha, dados bancarios ou comprovantes.
            </p>
            <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-300">
              <p>O programa esta em beta controlado e nao garante aprovacao, renda, pagamento ou monetizacao imediata.</p>
              <p>Conteudo 18+ segue verificacao e regras proprias no fluxo de seguranca da plataforma.</p>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-lg border border-white/10 bg-zinc-900/80 p-6 shadow-2xl shadow-black/25 ring-1 ring-blue-400/10 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="creator-name" className="mb-2 block text-sm font-medium text-zinc-200">Nome</label>
                <input id="creator-name" name="name" required placeholder="Seu nome" autoComplete="name" className={fieldClassName} />
              </div>

              <div>
                <label htmlFor="creator-email" className="mb-2 block text-sm font-medium text-zinc-200">E-mail</label>
                <input id="creator-email" name="email" required type="email" placeholder="seuemail@email.com" autoComplete="email" className={fieldClassName} />
              </div>

              <div>
                <label htmlFor="creator-contact" className="mb-2 block text-sm font-medium text-zinc-200">WhatsApp ou contato</label>
                <input id="creator-contact" name="contact" placeholder="Opcional" autoComplete="tel" className={fieldClassName} />
              </div>

              <div>
                <label htmlFor="creator-handle" className="mb-2 block text-sm font-medium text-zinc-200">Usuario ou rede principal</label>
                <input id="creator-handle" name="creatorName" placeholder="@seuperfil ou nome do canal" className={fieldClassName} />
              </div>

              <div>
                <label htmlFor="creator-category" className="mb-2 block text-sm font-medium text-zinc-200">Nicho principal</label>
                <select id="creator-category" name="category" required defaultValue="" className={fieldClassName}>
                  <option value="" disabled className={optionClassName}>Selecione um nicho</option>
                  <option value="Esportes" className={optionClassName}>Esportes</option>
                  <option value="Geopolitica" className={optionClassName}>Geopolitica</option>
                  <option value="Militarismo" className={optionClassName}>Militarismo</option>
                  <option value="Tecnologia" className={optionClassName}>Tecnologia</option>
                  <option value="Cultura" className={optionClassName}>Cultura</option>
                  <option value="Entretenimento" className={optionClassName}>Entretenimento</option>
                  <option value="Conteudo adulto 18+ verificado" className={optionClassName}>Conteudo adulto 18+ verificado</option>
                  <option value="Outro" className={optionClassName}>Outro</option>
                </select>
              </div>

              <div>
                <label htmlFor="creator-audience" className="mb-2 block text-sm font-medium text-zinc-200">Tamanho aproximado da audiencia</label>
                <select id="creator-audience" name="audienceSize" defaultValue="" className={fieldClassName}>
                  <option value="" className={optionClassName}>Prefiro conversar depois</option>
                  <option value="Ate 1 mil" className={optionClassName}>Ate 1 mil</option>
                  <option value="1 mil a 10 mil" className={optionClassName}>1 mil a 10 mil</option>
                  <option value="10 mil a 100 mil" className={optionClassName}>10 mil a 100 mil</option>
                  <option value="Mais de 100 mil" className={optionClassName}>Mais de 100 mil</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="creator-link" className="mb-2 block text-sm font-medium text-zinc-200">Link principal</label>
                <input id="creator-link" name="socialLink" type="url" placeholder="https://..." className={fieldClassName} />
              </div>
            </div>

            <fieldset className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
              <legend className="px-1 text-sm font-medium text-zinc-200">Interesses principais</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {['Gorjetas', 'Posts pagos', 'Conteudo 18+', 'Comunidade fechada', 'Lives/Meet', 'Outro'].map((interest) => (
                  <label key={interest} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-zinc-200">
                    <input name="interests" type="checkbox" value={interest} className="h-4 w-4 shrink-0 accent-blue-500" />
                    {interest}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <label htmlFor="creator-message" className="mb-2 block text-sm font-medium text-zinc-200">Mensagem curta</label>
              <textarea id="creator-message" name="message" required maxLength={700} placeholder="Conte um pouco sobre seu conteudo, seu publico e o que espera criar." className={`${fieldClassName} min-h-32 resize-y`} />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200">
              <input name="acknowledged" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-blue-500" />
              <span>Entendo que nao ha garantia de pagamento, renda, aprovacao ou monetizacao imediata.</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-500 px-5 py-3 font-bold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Enviando interesse...' : 'Enviar interesse'}
            </button>

            {message && (
              <p
                role={messageKind === 'error' ? 'alert' : 'status'}
                className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
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
