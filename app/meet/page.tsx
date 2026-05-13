'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  MessageCircle,
  Shield,
  Users,
  Video,
} from 'lucide-react'

const meetHighlights = [
  {
    title: 'Video e audio em tempo real',
    description: 'Converse com presenca, voz e camera em uma sala fluida.',
    icon: Video,
  },
  {
    title: 'Salas privadas por link',
    description: 'Compartilhe o endereco da sala com quem voce quiser chamar.',
    icon: Shield,
  },
  {
    title: 'Ideal para conversas e encontros',
    description: 'Um espaco direto para aproximar conexoes da plataforma.',
    icon: Users,
  },
  {
    title: 'Integracao futura com o chat',
    description: 'A base esta pronta para evoluir junto das mensagens.',
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

function EntreUSWordmark({ suffix }: { suffix?: string }) {
  return (
    <span className="inline-flex items-baseline tracking-normal">
      <span className="text-white">Entre</span>
      <span className="text-blue-400">US</span>
      {suffix ? <span className="ml-2 text-blue-100">{suffix}</span> : null}
    </span>
  )
}

export default function MeetPage() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(`/meet/${sanitizeRoomName(roomName)}`)
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/feed"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-100 shadow-lg shadow-blue-500/10 transition hover:border-blue-400 hover:bg-blue-500/20 hover:shadow-blue-500/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao <EntreUSWordmark />
          </Link>

          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="EntreUS"
              width={140}
              height={60}
              priority
              className="h-auto w-28 object-contain sm:w-32"
            />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="overflow-hidden rounded-[2rem] border border-blue-500/20 bg-zinc-950 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-400/10">
            <div className="relative aspect-[16/8.6] min-h-[260px] overflow-hidden sm:min-h-[360px]">
              <Image
                src="/entreus-meet-banner.png"
                alt="EntreUS Meet"
                fill
                priority
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />

              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-blue-100 shadow-lg shadow-blue-500/10">
                  <Video className="h-4 w-4" />
                  Sala <EntreUSWordmark />
                </div>

                <h1 className="max-w-3xl text-4xl font-black tracking-normal sm:text-5xl lg:text-6xl">
                  <EntreUSWordmark suffix="Meet" />
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg">
                  Chamadas de video e audio para conversar em tempo real.
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-blue-500/20 bg-blue-950/20 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-400/10 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/meet/entreus-meet"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 hover:shadow-blue-500/30"
                >
                  Entrar na sala
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <a
                  href="#sala-personalizada"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-black/50 px-6 py-3 text-sm font-bold text-blue-100 transition hover:border-blue-400 hover:bg-blue-500/15"
                >
                  Criar sala
                  <Link2 className="h-4 w-4" />
                </a>
              </div>

              <form id="sala-personalizada" onSubmit={handleSubmit} className="mt-6">
                <label htmlFor="room-name" className="block text-sm font-bold text-white">
                  Criar ou entrar em uma sala
                </label>
                <p className="mt-1 text-sm text-blue-100/60">
                  Digite um nome simples para criar ou acessar uma sala.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="room-name"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    maxLength={80}
                    placeholder="Ex: reuniao-entreus"
                    className="min-w-0 flex-1 rounded-full border border-blue-500/20 bg-black/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  />

                  <button
                    type="submit"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-blue-100"
                  >
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {meetHighlights.map((item) => {
                const Icon = item.icon

                return (
                  <article
                    key={item.title}
                    className="rounded-[1.35rem] border border-blue-500/15 bg-zinc-950/80 p-4 ring-1 ring-blue-400/10 transition hover:border-blue-400/30 hover:bg-blue-950/20"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-sm font-bold text-white">{item.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      {item.description}
                    </p>
                  </article>
                )
              })}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
