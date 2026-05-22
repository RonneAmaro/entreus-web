import type { Metadata } from 'next'
import Image from 'next/image'
import { CheckCircle2, Home, Plus, Share2, Smartphone } from 'lucide-react'
import PWAInstallButton from '../components/PWAInstallButton'

export const metadata: Metadata = {
  title: 'Instalar EntreUS',
  description: 'Instale a EntreUS no celular e acesse direto da tela inicial.',
}

const androidSteps = [
  'Abra a EntreUS no Chrome',
  'Toque em “Instalar app” ou “Adicionar à tela inicial”',
  'Confirme e abra pelo ícone da EntreUS',
]

const iphoneSteps = [
  'Abra a EntreUS no Safari',
  'Toque no botão de compartilhar',
  'Escolha “Adicionar à Tela de Início”',
]

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
            <p className="mt-1 text-sm text-slate-300">Só Entre Nós</p>
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
              <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
              <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-sky-950 via-slate-950 to-black px-5 py-8">
                <div className="mt-8 flex justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-2xl shadow-sky-500/25">
                    <Image
                      src="/logo.png"
                      alt="EntreUS"
                      width={72}
                      height={72}
                      className="h-14 w-14 object-contain"
                    />
                  </div>
                </div>
                <div className="mt-7 text-center">
                  <p className="text-2xl font-black">EntreUS</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Um toque na tela inicial e você volta para o feed.
                  </p>
                </div>
                <div className="mt-auto grid grid-cols-3 gap-3">
                  {[Home, Share2, Plus].map((Icon, index) => (
                    <div
                      key={index}
                      className="flex aspect-square items-center justify-center rounded-2xl bg-white/10 text-sky-200"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pb-8 md:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20">
                <Smartphone className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200">
                  Chrome
                </p>
                <h2 className="mt-1 text-2xl font-black">Android</h2>
              </div>
            </div>
            <StepList steps={androidSteps} />
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/15 text-slate-100 ring-1 ring-white/20">
                <Share2 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-300">
                  Safari
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
