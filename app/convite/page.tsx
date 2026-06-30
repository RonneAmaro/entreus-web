import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  BadgeCheck,
  Coins,
  Gift,
  HeartHandshake,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  WalletCards,
} from 'lucide-react'
import BadgeVisual from '../components/BadgeVisual'
import ItaCashAmount from '../components/ItaCashAmount'

export const metadata: Metadata = {
  title: 'Convite EntreUS',
  description: 'Conheça a EntreUS: comunidades, ItaCash, selos, presentes digitais e Meet.',
}

const featureCards = [
  {
    title: 'Feed e comunidades',
    description: 'Publique, converse, descubra perfis e acompanhe comunidades com interesses reais.',
    icon: MessageCircle,
    accent: 'text-blue-200 bg-blue-500/15 ring-blue-300/20',
  },
  {
    title: 'ItaCash',
    description: 'A moeda interna que movimenta presentes, gorjetas, posts pagos e experiências dentro da plataforma.',
    icon: Coins,
    accent: 'text-cyan-100 bg-cyan-500/15 ring-cyan-300/20',
  },
  {
    title: 'Selos',
    description: 'Destaques visuais para participação, conquistas, VIP Premium, Ancião e comunidade.',
    icon: BadgeCheck,
    accent: 'text-yellow-100 bg-yellow-400/15 ring-yellow-200/25',
  },
  {
    title: 'Presentes digitais',
    description: 'Uma forma leve de reconhecer criadores, amigos e momentos especiais.',
    icon: Gift,
    accent: 'text-pink-100 bg-pink-500/15 ring-pink-300/20',
  },
  {
    title: 'EntreUS Meet',
    description: 'Salas para encontros, aulas, comunidades, criadores e conversas ao vivo.',
    icon: Video,
    accent: 'text-emerald-100 bg-emerald-500/15 ring-emerald-300/20',
  },
  {
    title: 'Criadores e monetização',
    description: 'Recursos para criar, vender experiências, acompanhar resultados e crescer com a comunidade.',
    icon: WalletCards,
    accent: 'text-violet-100 bg-violet-500/15 ring-violet-300/20',
  },
]

const inviteNavCards = [
  {
    title: 'Comunidades',
    subtitle: 'Encontre sua tribo',
    href: '#comunidades',
    icon: Users,
    active: true,
    imageSrc: null,
    accent: 'border-blue-200/30 bg-blue-500/15 text-blue-100 shadow-blue-950/25',
    iconAccent: 'bg-blue-400/20 text-blue-100 ring-blue-200/25',
  },
  {
    title: 'ItaCash',
    subtitle: 'Moeda da plataforma',
    href: '#itacash',
    icon: Coins,
    active: false,
    imageSrc: '/itacash.png',
    accent: 'border-cyan-200/20 bg-cyan-500/10 text-cyan-100 shadow-cyan-950/20',
    iconAccent: 'bg-cyan-400/15 text-cyan-100 ring-cyan-200/25',
  },
  {
    title: 'Selos',
    subtitle: 'Destaque e conquistas',
    href: '#selos',
    icon: BadgeCheck,
    active: false,
    imageSrc: null,
    accent: 'border-amber-200/20 bg-amber-500/10 text-amber-100 shadow-amber-950/20',
    iconAccent: 'bg-amber-400/15 text-amber-100 ring-amber-200/25',
  },
  {
    title: 'Meet',
    subtitle: 'Salas ao vivo',
    href: '#meet',
    icon: Video,
    active: false,
    imageSrc: null,
    accent: 'border-emerald-200/20 bg-emerald-500/10 text-emerald-100 shadow-emerald-950/20',
    iconAccent: 'bg-emerald-400/15 text-emerald-100 ring-emerald-200/25',
  },
]

const badgeShowcaseCards = [
  {
    title: 'Ancião',
    slug: 'elder',
    description: 'Histórico, presença e reconhecimento especial para quem ajuda a construir a comunidade.',
    cardClassName: 'border-amber-200/25 bg-amber-500/10 shadow-amber-950/25 hover:border-amber-200/45',
    titleClassName: 'text-amber-100',
  },
  {
    title: 'VIP Premium',
    slug: 'vip',
    description: 'Destaque visual e sensação premium nos espaços sociais da EntreUS.',
    cardClassName: 'border-violet-200/25 bg-blue-500/10 shadow-violet-950/25 hover:border-violet-200/45',
    titleClassName: 'text-blue-100',
  },
  {
    title: 'Comunidade',
    slug: 'community',
    description: 'Participação, conquistas e pertencimento dentro das redes e grupos.',
    cardClassName: 'border-cyan-200/25 bg-emerald-500/10 shadow-emerald-950/25 hover:border-cyan-200/45',
    titleClassName: 'text-emerald-100',
  },
]

const badgesLoopVideoExpectedPath = '/videos/selos-entreus-loop.mp4'
const badgesLoopVideoSrc: string | null = null

const videoBlocks = [
  {
    title: 'Conheça a EntreUS',
    description: 'Uma visão rápida da rede e do clima da plataforma.',
    src: '/intro.mp4',
    poster: '/logo.png',
  },
  {
    title: 'Como funciona o ItaCash',
    description: 'Um vídeo explicativo será adicionado aqui.',
  },
  {
    title: 'Selos e comunidades',
    description: 'Conquistas visuais, status e participação dentro da EntreUS.',
    src: '/selos-entreus.mp4',
    poster: '/logo-icon.png',
  },
  {
    title: 'EntreUS Meet',
    description: 'Chamadas, comunidades, aulas e encontros em tempo real.',
  },
]

function PrimaryActions({ center = false }: { center?: boolean }) {
  return (
    <div className={`flex w-full flex-col gap-3 sm:w-auto sm:flex-row ${center ? 'justify-center' : ''}`}>
      <Link
        href="/signup"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-lg shadow-black/20 transition hover:bg-blue-50"
      >
        Criar minha conta
      </Link>
      <Link
        href="/login"
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/[0.06] px-6 py-3 text-sm font-black text-white transition hover:border-white/45 hover:bg-white/[0.12]"
      >
        Já tenho conta
      </Link>
    </div>
  )
}

function VideoBlock({
  title,
  description,
  src,
  poster,
}: {
  title: string
  description: string
  src?: string
  poster?: string
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] shadow-xl shadow-black/20">
      <div className="relative aspect-video bg-zinc-950">
        {src ? (
          <video
            className="h-full w-full object-cover"
            controls
            preload="metadata"
            poster={poster}
          >
            <source src={src} type="video/mp4" />
          </video>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 px-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-blue-100">
              <Play className="h-5 w-5" />
            </span>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{title}</span>
            <span className="rounded-full border border-blue-200/20 bg-blue-500/10 px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-blue-100">
              Vídeo em breve
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-base font-black text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p>
      </div>
    </article>
  )
}

export default function InvitePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative flex min-h-[92vh] items-center overflow-hidden px-4 py-8 sm:px-6">
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-45"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/logo.png"
          aria-hidden="true"
        >
          <source src="/intro.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/70" aria-hidden="true" />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <header className="mb-16 flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src="/logo-icon.png"
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
                priority
              />
              <span className="text-xl font-black tracking-normal">
                Entre<span className="text-blue-300">US</span>
              </span>
            </Link>

            <Link
              href="/login"
              className="hidden rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/85 transition hover:border-white/45 hover:text-white sm:inline-flex"
            >
              Entrar
            </Link>
          </header>

          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/[0.06] px-4 py-2 text-sm font-bold text-blue-100">
              <Sparkles className="h-4 w-4" />
              Convite público EntreUS
            </div>

            <h1 className="text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl lg:text-7xl">
              Uma comunidade para criar, encontrar e viver experiências digitais com mais presença.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-200 sm:text-xl sm:leading-8">
              Feed, comunidades, ItaCash, selos, presentes digitais, criadores e Meet em uma plataforma social feita para conexões reais.
            </p>

            <div className="mt-8">
              <PrimaryActions />
            </div>
          </div>

          <nav className="mt-14 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Atalhos do convite">
            {inviteNavCards.map((item) => {
              const Icon = item.icon

              return (
                <a
                  key={item.title}
                  href={item.href}
                  aria-current={item.active ? 'true' : undefined}
                  className={`group flex min-h-24 items-center gap-3 rounded-lg border p-3 text-left shadow-xl transition duration-200 hover:-translate-y-1 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200 active:translate-y-0 active:scale-[0.99] ${item.accent}`}
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ring-1 transition group-hover:scale-105 ${item.iconAccent}`}>
                    {item.imageSrc ? (
                      <Image
                        src={item.imageSrc}
                        alt=""
                        width={34}
                        height={34}
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">{item.title}</span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-300">{item.subtitle}</span>
                  </span>
                </a>
              )
            })}
          </nav>
        </div>
      </section>

      <section id="comunidades" className="scroll-mt-6 border-y border-white/10 bg-zinc-950 px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-200">O que você encontra</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
              Uma rede social com ferramentas para participar, apoiar e criar.
            </h2>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${feature.accent}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-black text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{feature.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="itacash" className="scroll-mt-6 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">ItaCash</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
              A moeda interna para viver experiências dentro da EntreUS.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              O ItaCash aparece em presentes digitais, gorjetas, posts pagos e experiências da plataforma. Esta página apenas apresenta o recurso; valores e conversões continuam nos fluxos oficiais da EntreUS.
            </p>
          </div>

          <div className="rounded-lg border border-cyan-200/15 bg-cyan-500/10 p-5 shadow-xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-cyan-100/80">Exemplo visual</p>
                <div className="mt-3">
                  <ItaCashAmount amount={100} size="xl" className="text-cyan-50" />
                </div>
              </div>
              <Coins className="h-16 w-16 text-cyan-100/70" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {['Presentes', 'Gorjetas', 'Posts pagos'].map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-cyan-50">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="selos" className="scroll-mt-6 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-yellow-200">Selos</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
              Reconhecimento visual para quem participa e deixa marca.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Selos ajudam a mostrar destaque, participação e conquistas. Eles aparecem em perfis, posts e superfícies sociais da EntreUS.
            </p>
          </div>

          <div className="grid gap-4">
            <article
              className="overflow-hidden rounded-lg border border-white/10 bg-black/35 shadow-2xl shadow-black/30"
              data-expected-video-src={badgesLoopVideoExpectedPath}
            >
              <div className={`relative bg-gradient-to-br from-zinc-950 via-blue-950/35 to-emerald-950/25 ${badgesLoopVideoSrc ? 'aspect-video' : 'min-h-[23rem] sm:aspect-video sm:min-h-0'}`}>
                {badgesLoopVideoSrc ? (
                  <video
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label="Vídeo dos selos EntreUS"
                    title="Vídeo dos selos EntreUS"
                  >
                    <source src={badgesLoopVideoSrc} type="video/mp4" />
                  </video>
                ) : (
                  <div className="flex h-full flex-col justify-center gap-4 p-4">
                    <div className="grid grid-cols-3 gap-2">
                      {badgeShowcaseCards.map((item) => (
                        <div key={item.title} className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border p-3 ${item.cardClassName}`}>
                          <BadgeVisual slug={item.slug} label={item.title} size="large" mode="static" />
                          <span className={`text-center text-xs font-black ${item.titleClassName}`}>{item.title}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/35 px-4 py-3 text-center">
                      <p className="text-sm font-black text-white">Vídeo 16:9 dos selos em breve</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">
                        Preparado para receber o loop premium dos três selos.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </article>

            {badgeShowcaseCards.map((item) => (
              <article
                key={item.title}
                className={`flex items-center gap-4 rounded-lg border p-4 shadow-xl transition duration-200 hover:-translate-y-0.5 sm:gap-5 ${item.cardClassName}`}
              >
                <BadgeVisual slug={item.slug} label={item.title} size="hero" mode="animated" />
                <div className="min-w-0">
                  <h3 className={`text-lg font-black ${item.titleClassName}`}>{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="meet" className="scroll-mt-6 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">EntreUS Meet</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
              Chamadas e encontros dentro da plataforma.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Meet combina chamadas, chat, participantes e gravação quando disponível. É uma ponte para comunidades, aulas, criadores e encontros ao vivo.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Chat', icon: MessageCircle },
                { label: 'Participantes', icon: Users },
                { label: 'Gravação', icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.045] p-4 text-sm font-bold text-emerald-50">
                    <Icon className="mb-3 h-5 w-5 text-emerald-200" />
                    {item.label}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-emerald-200/15 bg-zinc-950 shadow-xl shadow-black/25">
            <Image
              src="/entreus-meet-banner.png"
              alt="EntreUS Meet"
              width={1200}
              height={630}
              className="h-auto w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-pink-200">Vídeos</p>
              <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
                Demonstrações para campanhas, grupos e novos usuários.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-zinc-400">
              Os blocos sem vídeo real já ficam preparados para receber materiais futuros.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {videoBlocks.map((block) => (
              <VideoBlock key={block.title} {...block} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-blue-100">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-black tracking-normal text-white sm:text-5xl">
            Entre para a EntreUS hoje
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-300">
            Crie sua conta, explore comunidades e descubra novas formas de participar, apoiar e criar.
          </p>
          <div className="mt-8">
            <PrimaryActions center />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-zinc-950 px-4 py-8 text-center text-sm text-zinc-400 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>EntreUS - Só Entre Nós</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/" className="hover:text-white">Início</Link>
            <Link href="/terms" className="hover:text-white">Termos</Link>
            <Link href="/privacy" className="hover:text-white">Privacidade</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
