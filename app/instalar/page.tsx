import type { Metadata } from 'next'
import Image from 'next/image'
import {
  CheckCircle2,
  ExternalLink,
  Home,
  MonitorSmartphone,
  Share2,
  Smartphone,
} from 'lucide-react'
import PWAInstallButton from '../components/PWAInstallButton'

export const metadata: Metadata = {
  title: 'Instalar EntreUS',
  description: 'Instale a EntreUS no celular e acesse direto da tela inicial.',
}

const benefits = [
  {
    title: 'Acesso rapido',
    text: 'Abra a EntreUS direto da tela inicial, sem procurar pelo navegador.',
    icon: Home,
  },
  {
    title: 'Cara de app',
    text: 'Use em tela cheia, com uma experiencia mais limpa no celular.',
    icon: Smartphone,
  },
  {
    title: 'Sempre web',
    text: 'A mesma conta, os mesmos recursos e atualizacoes sem loja de app.',
    icon: MonitorSmartphone,
  },
]

const androidSteps = [
  'Abra a EntreUS no Chrome.',
  'Toque no menu do navegador.',
  'Escolha Instalar app ou Adicionar a tela inicial.',
]

const iphoneSteps = [
  'Abra a EntreUS no Safari.',
  'Toque em Compartilhar.',
  'Escolha Adicionar a Tela de Inicio.',
]

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-5 space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400 text-sm font-black text-black">
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
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_0.82fr] lg:px-10">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <Image
              src="/favicon-entreus.png"
              alt="EntreUS"
              width={56}
              height={56}
              className="h-12 w-12 rounded-2xl bg-sky-400/10 object-contain ring-1 ring-sky-300/20"
              priority
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200">
                EntreUS
              </p>
              <p className="mt-1 text-sm text-slate-300">So Entre Nos</p>
            </div>
          </div>

          <div className="mt-12 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-950/40 px-4 py-2 text-sm font-semibold text-sky-100">
              <CheckCircle2 className="h-4 w-4 text-sky-300" />
              Instalacao rapida
            </div>

            <h1 className="mt-7 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Use a EntreUS como app no celular
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-200">
              Instale pela tela inicial para abrir feed, perfil, mensagens e
              notificacoes internas com menos passos.
            </p>

            <div className="mt-8 flex justify-start">
              <PWAInstallButton />
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {benefits.map((benefit) => {
              const Icon = benefit.icon

              return (
                <article
                  key={benefit.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <Icon className="h-5 w-5 text-sky-300" />
                  <h2 className="mt-4 text-sm font-black text-white">
                    {benefit.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {benefit.text}
                  </p>
                </article>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 pb-8 lg:pb-0">
          <div className="mx-auto flex w-full max-w-sm justify-center">
            <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-[2rem] border border-white/15 bg-[#050505] p-3 shadow-2xl shadow-sky-950/30">
              <div className="absolute left-1/2 top-3 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black shadow-lg" />
              <div className="relative h-full overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                <Image
                  src="/pwa/entreus-home-preview.png"
                  alt="Tela inicial da EntreUS"
                  fill
                  sizes="280px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-sky-300/15 bg-[#071a38] p-5">
              <div className="flex items-center gap-3">
                <ExternalLink className="h-5 w-5 text-sky-200" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
                    Android
                  </p>
                  <h2 className="text-xl font-black">Chrome</h2>
                </div>
              </div>
              <StepList steps={androidSteps} />
            </article>

            <article className="rounded-2xl border border-sky-300/15 bg-[#071a38] p-5">
              <div className="flex items-center gap-3">
                <Share2 className="h-5 w-5 text-sky-200" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
                    iPhone
                  </p>
                  <h2 className="text-xl font-black">Safari</h2>
                </div>
              </div>
              <StepList steps={iphoneSteps} />
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
