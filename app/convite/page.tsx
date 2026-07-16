import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Coins,
  Crown,
  Gift,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import BadgeVisual from '../components/BadgeVisual'
import ItaCashAmount from '../components/ItaCashAmount'
import EntreUSWordmark from '../components/EntreUSWordmark'

export const metadata: Metadata = {
  title: 'EntreUS para Criadores',
  description: 'Convite para criadores fundadores da EntreUS: comunidades, ItaCash, gorjetas, posts pagos, selos e dashboard.',
}

type InfoCard = {
  title: string
  description: string
  icon: LucideIcon
  note?: string
}

type BadgeCard = {
  title: string
  description: string
  note: string
  icon?: LucideIcon
  slug?: string
}

const creatorRevenueCards: InfoCard[] = [
  {
    title: 'Gorjetas com ItaCash',
    description: 'Seguidores podem enviar apoio em ItaCash para reconhecer posts, perfis e momentos importantes.',
    icon: Gift,
    note: 'Disponivel',
  },
  {
    title: 'Posts pagos',
    description: 'Criadores podem publicar conteudos desbloqueaveis por ItaCash, mantendo as protecoes de conteudo e idade.',
    icon: LockKeyhole,
    note: 'Disponivel',
  },
  {
    title: 'Dashboard do criador',
    description: 'Acompanhe posts, comunidades, sinais de engajamento, gorjetas e recebimentos ja registrados.',
    icon: BarChart3,
    note: 'Em evolucao',
  },
  {
    title: 'Assinaturas futuras',
    description: 'Uma camada de recorrencia para criadores esta em preparacao e sera comunicada quando estiver pronta.',
    icon: WalletCards,
    note: 'Em preparacao',
  },
]

const itacashPoints = [
  'ItaCash e o credito interno usado dentro da EntreUS.',
  'Usuarios usam ItaCash para apoiar criadores, enviar gorjetas e desbloquear posts pagos.',
  'Criadores acompanham recebimentos no dashboard e na carteira quando os registros estiverem disponiveis.',
  'Na fase inicial, solicitacoes de saque e repasse passam por fluxo manual e revisao administrativa.',
]

const badgeCards: BadgeCard[] = [
  {
    title: 'Criador fundador',
    description: 'Identidade para a primeira leva de criadores. O selo visual dedicado fica em preparacao quando ainda nao estiver aplicado.',
    icon: Sparkles,
    note: 'Programa fundador',
  },
  {
    title: 'Selo Comunidade',
    description: 'Destaque para participacao e pertencimento em comunidades da EntreUS.',
    slug: 'community',
    note: 'Destaque social',
  },
  {
    title: 'VIP e VIP Premium',
    description: 'Beneficios visuais e limites maiores em recursos selecionados, quando aplicavel ao plano.',
    slug: 'vip',
    note: 'Diferenciacao',
  },
  {
    title: 'Anciao',
    description: 'Reconhecimento especial para presenca, historico e contribuicao na comunidade.',
    slug: 'elder',
    note: 'Credibilidade',
  },
]

const safetyCards: InfoCard[] = [
  {
    title: 'Comunidades por nicho',
    description: 'Criadores publicam nos espacos certos: geral, esportes, geopolitica, militar e areas futuras.',
    icon: Users,
  },
  {
    title: 'Conteudo adulto separado',
    description: 'Conteudo 18+ fica isolado, classificado e protegido por verificacao de idade.',
    icon: ShieldCheck,
  },
  {
    title: 'Moderacao e denuncias',
    description: 'A plataforma preserva regras de seguranca, revisao e reportes para reduzir abuso.',
    icon: CheckCircle2,
  },
]

function ActionLink({
  href,
  children,
  icon: Icon,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  icon: LucideIcon
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const className =
    variant === 'primary'
      ? 'bg-white text-black shadow-lg shadow-black/20 hover:bg-blue-50'
      : variant === 'secondary'
        ? 'border border-white/20 bg-white/[0.08] text-white hover:border-white/45 hover:bg-white/[0.14]'
        : 'border border-blue-200/25 bg-blue-500/10 text-blue-100 hover:border-blue-200/50 hover:bg-blue-500/15'

  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition ${className}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  )
}

function SectionHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-200">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-zinc-300">{children}</p>
    </div>
  )
}

export default function InvitePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative flex min-h-[86vh] items-center overflow-hidden px-4 py-8 sm:px-6">
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
        <div className="absolute inset-0 bg-black/72" aria-hidden="true" />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <header className="mb-12 flex items-center justify-between gap-4">
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
                <EntreUSWordmark />
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
              Convite para criadores fundadores
            </div>

            <h1 className="text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl lg:text-7xl">
              EntreUS para Criadores
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-200 sm:text-xl sm:leading-8">
              Uma rede social brasileira por comunidades, feita para criadores publicarem, receberem apoio em ItaCash e crescerem com seguranca.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="/creators/apply" icon={HeartHandshake}>
                Quero ser criador fundador
              </ActionLink>
              <ActionLink href="/signup" icon={ArrowRight} variant="secondary">
                Criar minha conta
              </ActionLink>
            </div>
          </div>

          <nav className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Atalhos para criadores">
            {[
              ['Ganhar com ItaCash', '#ganhar'],
              ['Conhecer ItaCash', '#itacash'],
              ['Ver selos', '#selos'],
              ['Seguranca 18+', '#seguranca'],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black text-white transition hover:border-blue-200/35 hover:bg-white/[0.1]"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section id="ganhar" className="scroll-mt-6 border-y border-white/10 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeader eyebrow="Monetizacao" title="Como o criador pode ganhar">
            A EntreUS combina publicacao social, apoio direto e recursos pagos sem prometer renda fixa. O criador decide o que publicar, acompanha sinais no dashboard e usa ItaCash nos fluxos ja existentes.
          </SectionHeader>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {creatorRevenueCards.map((card) => {
              const Icon = card.icon

              return (
                <article key={card.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/15 text-blue-100 ring-1 ring-blue-200/20">
                      <Icon className="h-5 w-5" />
                    </span>
                    {card.note && (
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-300">
                        {card.note}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-black text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{card.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="itacash" className="scroll-mt-6 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <SectionHeader eyebrow="ItaCash" title="Credito interno para apoiar criadores">
              ItaCash nao e cripto, investimento ou moeda externa. Ele e o credito interno usado em experiencias da EntreUS, como gorjetas, posts pagos e presentes digitais.
            </SectionHeader>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="/itacash" icon={Coins} variant="ghost">
                Conhecer ItaCash
              </ActionLink>
              <ActionLink href="/creator-dashboard" icon={BarChart3} variant="secondary">
                Ver dashboard
              </ActionLink>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200/15 bg-cyan-500/10 p-5 shadow-xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-cyan-100/80">Exemplo visual</p>
                <div className="mt-3">
                  <ItaCashAmount amount={100} size="xl" className="text-cyan-50" />
                </div>
              </div>
              <Image
                src="/itacash.png"
                alt=""
                width={78}
                height={78}
                className="h-16 w-16 object-contain"
              />
            </div>

            <ul className="mt-6 grid gap-3">
              {itacashPoints.map((item) => (
                <li key={item} className="flex gap-3 rounded-lg border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-cyan-50">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="selos" className="scroll-mt-6 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <SectionHeader eyebrow="Selos e destaque" title="Credibilidade visual para quem participa">
              Selos ajudam criadores e membros a mostrarem presenca, pertencimento e status. Recursos futuros ficam marcados como em preparacao para manter o convite honesto.
            </SectionHeader>

            <ActionLink href="/selos" icon={BadgeCheck} variant="ghost">
              Ver selos
            </ActionLink>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {badgeCards.map((card) => {
              const Icon = card.icon || Crown

              return (
                <article key={card.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
                  <div className="flex min-h-16 items-center justify-between gap-3">
                    {card.slug ? (
                      <BadgeVisual slug={card.slug} label={card.title} size="hero" mode="animated" />
                    ) : (
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/15 text-amber-100 ring-1 ring-amber-200/20">
                        <Icon className="h-6 w-6" />
                      </span>
                    )}
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-300">
                      {card.note}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-black text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{card.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="seguranca" className="scroll-mt-6 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeader eyebrow="Seguranca e comunidades" title="Crescer sem misturar tudo no mesmo feed">
              A plataforma separa nichos, respeita classificacoes e mantem conteudo adulto fora das areas comuns. O objetivo e dar clareza para criadores e protecao para usuarios.
            </SectionHeader>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="/terms" icon={ShieldCheck} variant="ghost">
                Termos
              </ActionLink>
              <ActionLink href="/privacy" icon={LockKeyhole} variant="secondary">
                Privacidade
              </ActionLink>
            </div>
          </div>

          <div className="grid gap-3">
            {safetyCards.map((card) => {
              const Icon = card.icon

              return (
                <article key={card.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-200/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-black text-white">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{card.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-zinc-950 px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-blue-100">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-black tracking-normal text-white sm:text-5xl">
            A primeira leva de criadores vai ajudar a moldar a EntreUS
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-300">
            Entre, publique com calma, teste os recursos e envie feedback. O programa fundador prioriza aprendizado real antes de promessas grandes demais.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ActionLink href="/creators/apply" icon={HeartHandshake}>
              Quero ser criador fundador
            </ActionLink>
            <ActionLink href="/signup" icon={ArrowRight} variant="secondary">
              Criar minha conta
            </ActionLink>
          </div>
        </div>
      </section>

      <footer className="bg-black px-4 py-8 text-center text-sm text-zinc-400 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>EntreUS - So Entre Nos</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/" className="hover:text-white">Inicio</Link>
            <Link href="/itacash" className="hover:text-white">ItaCash</Link>
            <Link href="/selos" className="hover:text-white">Selos</Link>
            <Link href="/terms" className="hover:text-white">Termos</Link>
            <Link href="/privacy" className="hover:text-white">Privacidade</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
