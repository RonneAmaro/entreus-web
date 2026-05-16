'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquareText,
  Send,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type FeedbackType = 'bug' | 'feedback' | 'idea' | 'content' | 'safety' | 'other'
type FeedbackUrgency = 'low' | 'normal' | 'high' | 'urgent'

const typeOptions: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'idea', label: 'Ideia' },
  { value: 'content', label: 'Conteudo' },
  { value: 'safety', label: 'Seguranca' },
  { value: 'other', label: 'Outro' },
]

const urgencyOptions: { value: FeedbackUrgency; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>('bug')
  const [urgency, setUrgency] = useState<FeedbackUrgency>('normal')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setPageUrl(window.location.href)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()

    if (!trimmedTitle || !trimmedDescription) {
      setSuccess(false)
      setMessage('Preencha titulo e descricao para enviar.')
      return
    }

    setSubmitting(true)
    setMessage('')
    setSuccess(false)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('internal_feedback_reports')
      .insert({
        user_id: user?.id || null,
        type,
        urgency,
        title: trimmedTitle,
        description: trimmedDescription,
        page_url: pageUrl.trim() || null,
        screenshot_url: screenshotUrl.trim() || null,
        metadata: {
          userAgent:
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
          source: 'feedback_page',
        },
      })

    setSubmitting(false)

    if (error) {
      setMessage('Nao foi possivel enviar agora: ' + error.message)
      return
    }

    setSuccess(true)
    setMessage('Relato enviado para a equipe EntreUS. Obrigado por ajudar a melhorar a plataforma.')
    setTitle('')
    setDescription('')
    setScreenshotUrl('')
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(28rem,1fr)] lg:px-8">
        <aside className="flex flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/30 lg:my-6">
          <div>
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>

            <p className="mt-10 text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Suporte interno
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Reportar bug ou enviar feedback
            </h1>
            <p className="mt-5 text-base leading-7 text-zinc-300">
              Conte o que aconteceu, onde aconteceu e qual impacto teve. Esse canal registra relatos em uma tabela interna para triagem.
            </p>
          </div>

          <div className="mt-8 grid gap-3">
            <div className="rounded-2xl border border-blue-300/15 bg-blue-500/10 p-4">
              <Bug className="h-5 w-5 text-blue-200" />
              <p className="mt-3 text-sm font-bold text-blue-50">Bugs visuais, erros e fluxos quebrados.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <ClipboardList className="h-5 w-5 text-zinc-300" />
              <p className="mt-3 text-sm font-bold text-zinc-200">Ideias e melhorias para produto.</p>
            </div>
            <div className="rounded-2xl border border-amber-300/15 bg-amber-500/10 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-200" />
              <p className="mt-3 text-sm font-bold text-amber-50">Problemas urgentes de seguranca ou acesso.</p>
            </div>
          </div>
        </aside>

        <section className="flex items-center py-6">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 backdrop-blur-xl sm:p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-zinc-100">Tipo</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as FeedbackType)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-300"
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-zinc-100">Urgencia</span>
                <select
                  value={urgency}
                  onChange={(event) => setUrgency(event.target.value as FeedbackUrgency)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-blue-300"
                >
                  {urgencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-black text-zinc-100">Titulo</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder="Ex.: Badge de mensagens nao atualiza"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-black text-zinc-100">Descricao</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={7}
                placeholder="Descreva o que voce fez, o que esperava e o que aconteceu."
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
              />
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-zinc-100">Pagina onde aconteceu</span>
                <input
                  type="text"
                  value={pageUrl}
                  onChange={(event) => setPageUrl(event.target.value)}
                  placeholder="/messages ou URL completa"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-zinc-100">Print opcional</span>
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(event) => setScreenshotUrl(event.target.value)}
                  placeholder="URL de imagem, se ja existir"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-300"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-300">
              Upload direto de print ficou preparado visualmente por URL. O upload de arquivo pode entrar depois usando a estrategia de storage que o projeto escolher, sem misturar com R2 neste pacote.
            </div>

            {message && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  success
                    ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                    : 'border-amber-300/20 bg-amber-500/10 text-amber-100'
                }`}
              >
                {success ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{message}</span>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/help"
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 hover:text-white"
              >
                Abrir Central de Ajuda
              </Link>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-xl shadow-blue-950/20 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar relato
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  )
}
