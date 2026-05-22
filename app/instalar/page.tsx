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
    <div className="grid w-24 shrink-0 gap-1.5 rounded-2xl bg-emerald-400/10 p-2 ring-1 ring-emerald-300/20">
      <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-400/15 px-2 py-1.5 text-[11px] font-black text-emerald-100">
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        Android
      </span>
      <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-white/10 px-2 py-1.5 text-[11px] font-black text-sky-100">
        <span className="h-3 w-3 rounded-full border-2 border-sky-300 bg-red-400 shadow-[inset_5px_0_0_#facc15]" />
        Chrome
      </span>
    </div>
  )
}

function AppleSafariBadge() {
  return (
    <div className="grid w-24 shrink-0 gap-1.5 rounded-2xl bg-slate-100/10 p-2 ring-1 ring-white/20">
      <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-white/10 px-2 py-1.5 text-[11px] font-black text-slate-100">
        <span className="h-3 w-2 rounded-[0.35rem] border border-slate-200" />
        iPhone
      </span>
      <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-400/15 px-2 py-1.5 text-[11px] font-black text-sky-100">
        <span className="relative h-3 w-3 rounded-full border border-sky-200">
          <span className="absolute left-1/2 top-1/2 h-1.5 w-px origin-bottom -translate-x-1/2 -translate-y-full rotate-45 rounded-full bg-red-300" />
        </span>
        Safari
      </span>
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
                  className="object-contain"
                  priority
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-black/15" />
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
