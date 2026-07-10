import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import CreatorBadgesExplainer from '../components/CreatorBadgesExplainer'
import CreatorMonetizationExplainer from '../components/CreatorMonetizationExplainer'

export const metadata: Metadata = {
  title: 'Criadores Fundadores | EntreUS',
  description: 'Convite para criadores fundadores entrarem cedo no EntreUS, criarem comunidade e monetizarem com ItaCash de forma clara.',
}

const founderBenefits = [
  'Entrar cedo e ter destaque inicial conforme a plataforma crescer.',
  'Participar da construcao com feedback direto de criador real.',
  'Criar comunidade por nicho e aproximar publico fiel.',
  'Monetizar com gorjetas, posts pagos e ItaCash interno.',
  'Acompanhar apoios, posts pagos, metricas e desempenho no dashboard.',
]

const communities = [
  'Esportes',
  'Geopolitica',
  'Militarismo',
  'Tecnologia',
  'Cultura',
  'Entretenimento',
  'Adulto 18+ verificado',
  'Outros nichos',
]

function ActionLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const className =
    variant === 'primary'
      ? 'bg-white text-black shadow-lg shadow-black/20 hover:bg-blue-50'
      : variant === 'secondary'
        ? 'border border-white/20 bg-white/[0.08] text-white hover:border-white/45 hover:bg-white/[0.14]'
        : 'border border-blue-200/25 bg-blue-500/10 text-blue-100 hover:border-blue-200/50 hover:bg-blue-500/15'

  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition ${className}`}>
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

export default function CreatorsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative flex min-h-[88vh] items-center overflow-hidden px-4 py-8 sm:px-6">
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
              <Image src="/logo-icon.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" priority />
              <span className="text-xl font-black tracking-normal">
                Entre<span className="text-blue-300">US</span>
              </span>
            </Link>
            <ActionLink href="/signup" variant="secondary">Criar conta</ActionLink>
          </header>

          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/[0.06] px-4 py-2 text-sm font-bold text-blue-100">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Convite para criadores fundadores
            </div>

            <h1 className="text-4xl font-black leading-tight tracking-normal text-white sm:text-6xl lg:text-7xl">
              Construa sua comunidade desde o inicio
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-200 sm:text-xl sm:leading-8">
              O EntreUS e uma rede social brasileira por comunidades, criada para aproximar criadores e publico com feed, nichos, ItaCash, seguranca e monetizacao honesta.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
              A plataforma esta em fase de crescimento e beta controlado. Alguns recursos podem evoluir conforme feedback dos criadores.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="/creators/apply">
                <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                Quero ser criador fundador
              </ActionLink>
              <ActionLink href="#monetizacao" variant="secondary">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                Conhecer monetizacao com ItaCash
              </ActionLink>
            </div>
          </div>

          <nav className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Atalhos para criadores">
            {[
              ['Por que entrar cedo', '#fundadores'],
              ['Como ganhar', '#monetizacao'],
              ['Selos e status', '#selos'],
              ['Seguranca 18+', '#seguranca'],
            ].map(([label, href]) => (
              <a key={label} href={href} className="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black text-white transition hover:border-blue-200/35 hover:bg-white/[0.1]">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section id="fundadores" className="scroll-mt-6 border-y border-white/10 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <SectionHeader eyebrow="Criador fundador" title="Por que entrar agora">
            A primeira leva de criadores ajuda a definir linguagem, prioridades e formatos da EntreUS. O foco e crescer com comunidade real, nao prometer alcance ou renda garantida.
          </SectionHeader>

          <div className="grid gap-3">
            {founderBenefits.map((benefit) => (
              <div key={benefit} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-zinc-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="monetizacao" className="scroll-mt-6 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeader eyebrow="Monetizacao" title="Como o criador ganha dinheiro">
            Seguidores podem apoiar com ItaCash, e criadores podem vender acesso a posts pagos. O criador recebe receita liquida: 85% do valor. A plataforma retem 15% para manter e evoluir o servico.
          </SectionHeader>

          <div className="mt-8">
            <CreatorMonetizationExplainer />
          </div>

          <div className="mt-8 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-cyan-200/15 bg-cyan-500/10 p-5">
              <h3 className="text-lg font-black text-cyan-50">ItaCash e credito interno</h3>
              <p className="mt-2 text-sm leading-6 text-cyan-50/80">Ele nao e cripto, investimento ou pagamento externo. E usado dentro da EntreUS para apoiar criadores e desbloquear experiencias.</p>
            </div>
            <div className="rounded-lg border border-emerald-200/15 bg-emerald-500/10 p-5">
              <h3 className="text-lg font-black text-emerald-50">Receita liquida, sem promessa exagerada</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-50/80">Nao existe renda garantida. A monetizacao depende do publico, dos conteudos e das regras ativas da plataforma.</p>
            </div>
            <div className="rounded-lg border border-amber-200/15 bg-amber-500/10 p-5">
              <h3 className="text-lg font-black text-amber-50">Saque em preparacao</h3>
              <p className="mt-2 text-sm leading-6 text-amber-50/80">O saque sera tratado por fluxo manual ou administrativo quando disponivel, conforme regras da plataforma.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="selos" className="scroll-mt-6 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <SectionHeader eyebrow="Selos e status" title="Destaque visual, confianca e reconhecimento">
              VIP, VIP Premium, Anciao e Selo Comunidade ajudam a diferenciar perfis, reforcar presenca e preparar beneficios futuros. O selo Criador fundador e apresentado como conceito em preparacao.
            </SectionHeader>
            <ActionLink href="/selos" variant="ghost">Ver selos</ActionLink>
          </div>

          <div className="mt-8">
            <CreatorBadgesExplainer />
          </div>
        </div>
      </section>

      <section id="comunidades" className="bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeader eyebrow="Comunidades" title="Atue por nicho, nao em um feed sem contexto">
            O criador pode se aproximar do publico certo por tema. Conteudo adulto 18+ fica separado e exige verificacao e regras especificas.
          </SectionHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            {communities.map((community) => (
              <div key={community} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-black text-zinc-100">
                <Users className="h-4 w-4 text-blue-200" aria-hidden="true" />
                {community}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="seguranca" className="border-y border-white/10 bg-zinc-950 px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <SectionHeader eyebrow="Seguranca e moderacao" title="Protecao para criadores, publico e menores">
            A EntreUS usa denuncias, moderacao, separacao de conteudo 18+, verificacao de idade e regras para conteudo adulto. O objetivo e permitir comunidade sem misturar tudo no mesmo espaco.
          </SectionHeader>

          <div className="grid gap-3">
            {[
              'Denuncias e revisao de conteudo ajudam a reduzir abuso.',
              'Conteudo adulto fica classificado e restrito a usuarios autorizados.',
              'Menores ficam protegidos dos fluxos 18+.',
              'Posts pagos e midias protegidas seguem regras de acesso e seguranca.',
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-zinc-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-blue-100">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-3xl font-black tracking-normal text-white sm:text-5xl">
            Pronto para testar como criador?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-300">
            Entre na lista, crie sua conta e acompanhe o painel. Recursos podem evoluir conforme feedback dos primeiros criadores.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ActionLink href="/creators/apply">Entrar na lista de criadores</ActionLink>
            <ActionLink href="/signup" variant="secondary">Criar minha conta</ActionLink>
            <ActionLink href="/creator-dashboard" variant="ghost">Bora la: acessar meu painel</ActionLink>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm font-bold text-zinc-400">
            <Link href="/buy-itacash" className="hover:text-white">Conhecer ItaCash</Link>
            <Link href="/terms" className="hover:text-white">Termos</Link>
            <Link href="/safety" className="hover:text-white">Seguranca</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
