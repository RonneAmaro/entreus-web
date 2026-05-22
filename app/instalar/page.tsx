import type { Metadata } from 'next'
import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import PWAInstallButton from '../components/PWAInstallButton'

export const metadata: Metadata = {
  title: 'Instalar EntreUS',
  description: 'Instale a EntreUS no celular e acesse direto da tela inicial.',
}

const androidSteps = [
  'Abra a EntreUS no Chrome',
  'Toque em "Instalar app" ou "Adicionar a tela inicial"',
  'Confirme e abra pelo icone da EntreUS',
]

const iphoneSteps = [
  'Abra a EntreUS no Safari',
  'Toque no botao de compartilhar',
  'Escolha "Adicionar a Tela de Inicio"',
]

function AndroidChromeBadge() {
  return (
    <div className="flex h-14 w-16 shrink-0 items-center justify-center -space-x-2 rounded-2xl bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/20">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-8 w-8 drop-shadow"
        fill="currentColor"
      >
        <path d="M7.4 8.6h9.2l1.1-1.9a.7.7 0 1 0-1.2-.7l-1.1 1.9H8.6L7.5 6a.7.7 0 1 0-1.2.7l1.1 1.9ZM6 10.1v6.1c0 .7.6 1.3 1.3 1.3h.8v2a.9.9 0 0 0 1.8 0v-2h4.2v2a.9.9 0 0 0 1.8 0v-2h.8c.7 0 1.3-.6 1.3-1.3v-6.1H6Zm3 3.1a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm6 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8ZM3.8 10.3a.9.9 0 0 0-.9.9v4a.9.9 0 1 0 1.8 0v-4a.9.9 0 0 0-.9-.9Zm16.4 0a.9.9 0 0 0-.9.9v4a.9.9 0 1 0 1.8 0v-4a.9.9 0 0 0-.9-.9Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 drop-shadow">
        <circle cx="12" cy="12" r="10" fill="#fbbc04" />
        <path d="M12 2a10 10 0 0 1 8.7 5H12a5 5 0 0 0-4.3 2.5L5.2 5.2A10 10 0 0 1 12 2Z" fill="#ea4335" />
        <path d="M20.7 7A10 10 0 0 1 12 22l4.3-7.5A5 5 0 0 0 17 12a5 5 0 0 0-.7-2.5L20.7 7Z" fill="#34a853" />
        <path d="M12 22A10 10 0 0 1 5.2 5.2l4.3 7.5A5 5 0 0 0 12 17h4.3L12 22Z" fill="#4285f4" />
        <circle cx="12" cy="12" r="4.2" fill="#fff" />
        <circle cx="12" cy="12" r="2.8" fill="#4285f4" />
      </svg>
    </div>
  )
}

function AppleSafariBadge() {
  return (
    <div className="flex h-14 w-16 shrink-0 items-center justify-center -space-x-2 rounded-2xl bg-slate-100/15 text-slate-50 ring-1 ring-white/20">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-8 w-8 drop-shadow"
        fill="currentColor"
      >
        <path d="M16.7 12.8c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.7-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.2 1.9-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.5 2.1 1 0 1.4-.7 2.6-.7s1.6.7 2.6.7c1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3 0-.1-2.5-1-2.5-2.9ZM14.7 6.8c.6-.7 1-1.6.9-2.5-.9 0-1.9.6-2.5 1.3-.6.6-1 1.6-.9 2.4.9.1 1.9-.5 2.5-1.2Z" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 drop-shadow">
        <circle cx="12" cy="12" r="10" fill="#0ea5e9" />
        <circle cx="12" cy="12" r="7.5" fill="#e0f2fe" />
        <path d="m13.3 10.7 3.4-3.4-1.9 4.4-4.1 1.6 2.6-2.6Z" fill="#ef4444" />
        <path d="m10.7 13.3-3.4 3.4 1.9-4.4 4.1-1.6-2.6 2.6Z" fill="#0284c7" />
        <circle cx="12" cy="12" r="1.2" fill="#0f172a" />
      </svg>
    </div>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-6 space-y-4">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400 text-sm font-black text-slate-950">
            {index + 1}
          </span>
          <span className="pt-0.5 text-sm leading-6 text-slate-200">{step}</span>
        </li>
      ))}
    </ol>
  )
}

export default function InstallPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.28),_transparent_34rem),linear-gradient(145deg,_#020617,_#082f49_48%,_#020617)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="EntreUS"
            width={132}
            height={60}
            className="h-auto w-28 object-contain"
            priority
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-200">
              EntreUS
            </p>
            <p className="mt-1 text-sm text-slate-300">So Entre Nos</p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_0.82fr] lg:py-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-950/40 px-4 py-2 text-sm font-semibold text-sky-100">
              <CheckCircle2 className="h-4 w-4 text-sky-300" />
              PWA oficial da EntreUS
            </div>

            <h1 className="mt-7 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Instale a EntreUS no seu celular
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-200">
              Acesse a EntreUS como aplicativo, direto da tela inicial.
            </p>

            <div className="mt-8">
              <PWAInstallButton />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm justify-center lg:max-w-none">
            <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-[2.25rem] border border-white/15 bg-slate-950 p-3 shadow-2xl shadow-black/40">
              <div className="absolute left-1/2 top-3 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black/90 shadow-lg" />
              <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-slate-950 ring-1 ring-white/10">
                <Image
                  src="/pwa/entreus-home-preview.png"
                  alt="Tela inicial da EntreUS"
                  fill
                  sizes="280px"
                  className="object-cover"
                  priority
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-black/20" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pb-8 md:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <AndroidChromeBadge />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200">
                  Android + Chrome
                </p>
                <h2 className="mt-1 text-2xl font-black">Android</h2>
              </div>
            </div>
            <StepList steps={androidSteps} />
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <AppleSafariBadge />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">
                  Apple + Safari
                </p>
                <h2 className="mt-1 text-2xl font-black">iPhone</h2>
              </div>
            </div>
            <StepList steps={iphoneSteps} />
          </article>
        </div>
      </section>
    </main>
  )
}
