'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import {
  ArrowRight,
  Link2,
  MessageCircle,
  Shield,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'

const meetHighlights = [
  {
    title: 'Vídeo e áudio em tempo real',
    description: 'Converse com presença, voz e câmera em uma sala fluida.',
    icon: Video,
  },
  {
    title: 'Salas privadas por link',
    description: 'Compartilhe o endereço da sala com quem você quiser chamar.',
    icon: Shield,
  },
  {
    title: 'Ideal para conversas e encontros',
    description: 'Um espaço direto para aproximar conexões da plataforma.',
    icon: Users,
  },
  {
    title: 'Integração futura com o chat',
    description: 'A base está pronta para evoluir junto das mensagens.',
    icon: MessageCircle,
  },
]

function sanitizeRoomName(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'entreus-meet'
}

export default function MeetPage() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(`/meet/${sanitizeRoomName(roomName)}`)
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col justify-center">
        <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl ring-1 ring-white/5 sm:p-8 lg:p-10">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">
              <Sparkles className="h-4 w-4 text-blue-400" />
              Sala EntreUS
            </div>

            <h1 className="max-w-2xl text-4xl font-black tracking-normal sm:text-5xl lg:text-6xl">
              EntreUS Meet
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Chamadas de vídeo e áudio para conversar em tempo real.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/meet/entreus-meet"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                Entrar na sala
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href="#sala-personalizada"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-zinc-800"
              >
                Criar sala
                <Link2 className="h-4 w-4" />
              </a>
            </div>

            <form
              id="sala-personalizada"
              onSubmit={handleSubmit}
              className="mt-8 rounded-[1.5rem] border border-zinc-800 bg-black p-4 sm:p-5"
            >
              <label htmlFor="room-name" className="block text-sm font-bold text-white">
                Criar ou entrar em uma sala
              </label>
              <p className="mt-1 text-sm text-zinc-500">
                Digite um nome simples para criar ou acessar uma sala.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  id="room-name"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  maxLength={80}
                  placeholder="Ex: reuniao-entreus"
                  className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />

                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
                >
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>

          <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {meetHighlights.map((item) => {
              const Icon = item.icon

              return (
                <article
                  key={item.title}
                  className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/90 p-5 shadow-xl ring-1 ring-white/5"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-blue-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-white">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {item.description}
                  </p>
                </article>
              )
            })}
          </aside>
        </div>
      </section>
    </main>
  )
}
