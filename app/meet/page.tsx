'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { ArrowRight, Sparkles, Video } from 'lucide-react'

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
    <main className="min-h-screen bg-white px-4 py-6 text-zinc-950 dark:bg-black dark:text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center">
        <div className="mb-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <Video className="h-4 w-4" />
            Sala EntreUS
          </div>

          <h1 className="text-4xl font-black tracking-normal sm:text-5xl">
            EntreUS Meet
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
            Chamadas de video e audio para conversar com pessoas da plataforma.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10 sm:p-8">
            <div className="mb-8 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-white dark:bg-white dark:text-black">
                <Video className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-2xl font-black tracking-normal">
                  Criar ou entrar em uma sala
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Abra uma chamada principal ou escolha um nome simples para uma
                  sala personalizada.
                </p>
              </div>
            </div>

            <Link
              href="/meet/entreus-meet"
              className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition hover:scale-[1.01] hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:w-auto"
            >
              Entrar na sala
              <ArrowRight className="h-4 w-4" />
            </Link>

            <form
              onSubmit={handleSubmit}
              className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black sm:p-5"
            >
              <label
                htmlFor="room-name"
                className="block text-sm font-bold text-zinc-800 dark:text-zinc-100"
              >
                Criar ou entrar em uma sala
              </label>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  id="room-name"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  maxLength={80}
                  placeholder="Ex: reuniao-entreus"
                  className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-blue-500"
                />

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
                >
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>

          <aside className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-5 shadow-sm ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10 sm:p-8">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Sparkles className="h-8 w-8" />
            </div>

            <h2 className="text-xl font-black tracking-normal">
              Chamadas no EntreUS
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Converse por video com pessoas da plataforma em salas simples,
              privadas pelo link e prontas para chamadas ao vivo.
            </p>

            <div className="mt-6 grid gap-3 text-sm">
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-black">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Sala principal
                </span>
                <strong className="mt-1 block font-semibold">
                  /meet/entreus-meet
                </strong>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-black">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Sala personalizada
                </span>
                <strong className="mt-1 block font-semibold">
                  /meet/nome-da-sala
                </strong>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
