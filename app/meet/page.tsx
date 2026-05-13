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
    <main className="min-h-screen bg-[linear-gradient(145deg,#020617_0%,#07111f_44%,#020617_100%)] px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/feed"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-100 shadow-lg shadow-blue-500/10 transition hover:border-blue-400 hover:bg-blue-500/20 hover:shadow-blue-500/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao <EntreUSWordmark />
          </Link>

          <Image
            src="/logo.png"
            alt="EntreUS"
            width={150}
            height={64}
            priority
            className="h-auto w-28 object-contain sm:w-36"
          />
        </header>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-7">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-blue-100">
                <Video className="h-4 w-4" />
                Sala <EntreUSWordmark />
              </div>

              <h1 className="max-w-3xl text-5xl font-black tracking-normal sm:text-6xl lg:text-7xl">
                <EntreUSWordmark suffix="Meet" />
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                Chamadas de vídeo e áudio para conversar em tempo real.
              </p>
            </div>

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
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-black/35 px-6 py-3 text-sm font-bold text-blue-100 transition hover:border-blue-400 hover:bg-blue-500/15"
              >
                Criar sala
                <Link2 className="h-4 w-4" />
              </a>
            </div>

            <form
              id="sala-personalizada"
              onSubmit={handleSubmit}
              className="max-w-2xl rounded-[1.7rem] border border-blue-500/20 bg-blue-950/15 p-5 shadow-xl shadow-blue-950/20 ring-1 ring-blue-400/10"
            >
              <label htmlFor="room-name" className="block text-sm font-bold text-white">
                Criar ou entrar em uma sala
              </label>
              <p className="mt-1 text-sm text-blue-100/60">
                Digite um nome simples para criar ou acessar uma sala.
              </p>
              <p className="mt-1 text-sm text-blue-100/60">
                Depois de entrar, copie o link da sala para convidar outras pessoas.
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
          </section>

          <section className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-blue-500/25 bg-black shadow-2xl shadow-blue-950/30 ring-1 ring-blue-400/10">
              <Image
                src="/entreus-meet-banner.png"
                alt="EntreUS Meet"
                width={1200}
                height={675}
                priority
                sizes="(min-width: 1024px) 52vw, 100vw"
                className="h-auto w-full object-cover"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {meetHighlights.map((item) => {
                const Icon = item.icon

                return (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-blue-500/15 bg-blue-950/15 p-4 ring-1 ring-blue-400/10 transition hover:border-blue-400/35 hover:bg-blue-900/20 hover:shadow-lg hover:shadow-blue-500/10"
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
          </section>
        </div>
      </section>
    </main>
  )
}
