'use client'

import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Link2,
  Loader2,
  LockKeyhole,
  Shield,
  Sparkles,
  Timer,
  Video,
} from 'lucide-react'

type CreateRoomResponse =
  | {
      ok: true
      roomName: string
      roomUrl: string
      expiresAt: string
      maxDurationMinutes: number
    }
  | {
      ok: false
      error: string
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

function extractRoomName(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    const segments = url.pathname.split('/').filter(Boolean)
    return segments.at(-1) || ''
  } catch {
    return trimmed.replace(/^\/?meet\//, '')
  }
}

export default function MeetPage() {
  const router = useRouter()
  const [roomInput, setRoomInput] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setIsAuthenticated(Boolean(data.session))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session))
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function createRoom() {
    setCreating(true)
    setMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setIsAuthenticated(false)
      setCreating(false)
      return
    }

    try {
      const response = await fetch('/api/meet/rooms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const data = (await response.json()) as CreateRoomResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? 'Não foi possível criar a sala.' : data.error)
      }

      router.push(`/meet/${data.roomName}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a sala.')
      setCreating(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const roomName = extractRoomName(roomInput)

    if (!roomName) {
      setMessage('Cole um link ou digite o código de uma sala.')
      return
    }

    router.push(`/meet/${encodeURIComponent(roomName)}`)
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
                Salas privadas com link exclusivo, aprovação de entrada e limite gratuito de 20 minutos.
              </p>
            </div>

            {isAuthenticated === false ? (
              <div className="max-w-2xl rounded-[1.7rem] border border-blue-500/20 bg-blue-950/15 p-5 shadow-xl shadow-blue-950/20 ring-1 ring-blue-400/10">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/15 text-blue-200">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold">Entre na sua conta para criar ou participar de uma sala.</h2>
                <Link
                  href="/login"
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
                >
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={creating || isAuthenticated === null}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {creating ? 'Criando sala...' : 'Criar sala'}
                </button>

                <a
                  href="#entrar-sala"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-blue-500/30 bg-black/35 px-6 py-3 text-sm font-bold text-blue-100 transition hover:border-blue-400 hover:bg-blue-500/15"
                >
                  Entrar por link
                  <Link2 className="h-4 w-4" />
                </a>
              </div>
            )}

            <form
              id="entrar-sala"
              onSubmit={handleSubmit}
              className="max-w-2xl rounded-[1.7rem] border border-blue-500/20 bg-blue-950/15 p-5 shadow-xl shadow-blue-950/20 ring-1 ring-blue-400/10"
            >
              <label htmlFor="room-name" className="block text-sm font-bold text-white">
                Cole um link ou digite o código de uma sala.
              </label>
              <p className="mt-1 text-sm text-blue-100/60">
                Depois de criar uma sala, copie o link para convidar outras pessoas.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  id="room-name"
                  value={roomInput}
                  onChange={(event) => setRoomInput(event.target.value)}
                  maxLength={180}
                  placeholder="sala-k8f3d2 ou https://entreus.vercel.app/meet/sala-k8f3d2"
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

              {message ? (
                <p className="mt-4 rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {message}
                </p>
              ) : null}
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
              <article className="rounded-2xl border border-blue-500/15 bg-blue-950/15 p-4 ring-1 ring-blue-400/10">
                <Timer className="mb-3 h-7 w-7 text-blue-300" />
                <h2 className="text-sm font-bold text-white">Plano gratuito</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Salas de até 20 minutos.</p>
              </article>
              <article className="rounded-2xl border border-blue-500/15 bg-blue-950/15 p-4 ring-1 ring-blue-400/10">
                <Crown className="mb-3 h-7 w-7 text-blue-300" />
                <h2 className="text-sm font-bold text-white">VIP em breve</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Mais tempo, gravação e recursos avançados.</p>
              </article>
              <article className="rounded-2xl border border-blue-500/15 bg-blue-950/15 p-4 ring-1 ring-blue-400/10">
                <Shield className="mb-3 h-7 w-7 text-blue-300" />
                <h2 className="text-sm font-bold text-white">Aprovação de entrada</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-400">O dono aceita ou recusa novos participantes.</p>
              </article>
              <article className="rounded-2xl border border-blue-500/15 bg-blue-950/15 p-4 ring-1 ring-blue-400/10">
                <Video className="mb-3 h-7 w-7 text-blue-300" />
                <h2 className="text-sm font-bold text-white">Sala única</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Cada criação gera um link exclusivo.</p>
              </article>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
