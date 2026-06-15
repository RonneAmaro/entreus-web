import type { Metadata } from 'next'
import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  PenLine,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'IA na EntreUS | EntreUS',
  description:
    'Entenda como usar a IA da EntreUS com seguran\u00e7a para melhorar textos e sugerir legendas antes de publicar.',
}

type InfoSection = {
  title: string
  description: string
  items: string[]
  icon: ComponentType<{ className?: string }>
  iconClassName: string
  checkClassName: string
}

const infoSections: InfoSection[] = [
  {
    title: 'O que ela faz',
    description: 'A IA oferece apoio durante a escrita. Ela pode:',
    items: [
      'Sugerir melhorias de escrita.',
      'Transformar uma ideia base em uma legenda para o post.',
      'Deixar o texto mais claro, natural e organizado.',
      'Ajudar voce a revisar sua ideia antes de publicar.',
    ],
    icon: PenLine,
    iconClassName: 'bg-blue-500/15 text-blue-100 ring-blue-300/20',
    checkClassName: 'text-blue-200',
  },
  {
    title: 'O que ela nao faz',
    description: 'A ferramenta ajuda, mas nao toma decisoes por voce:',
    items: [
      'Nao publica nada sozinha.',
      'Nao substitui a sua revisao.',
      'Nao garante que tudo esteja perfeito.',
      'Nao deve criar conteudo ofensivo, enganoso ou proibido.',
    ],
    icon: CircleAlert,
    iconClassName: 'bg-amber-400/15 text-amber-100 ring-amber-300/20',
    checkClassName: 'text-amber-200',
  },
  {
    title: 'Sua responsabilidade',
    description: 'A decisao final continua sempre com quem publica:',
    items: [
      'Revise todo o texto antes de publicar.',
      'Voce continua responsavel pelo conteudo publicado.',
      'Se a IA mudar o sentido da mensagem, corrija antes de postar.',
    ],
    icon: UserCheck,
    iconClassName: 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/20',
    checkClassName: 'text-emerald-200',
  },
]

const usageSteps = [
  'Escreva uma ideia base.',
  'Escolha "Melhorar com IA" ou "Sugerir legenda".',
  'Leia o resultado com atencao.',
  'Ajuste o texto com o seu jeito.',
  'Publique somente se estiver de acordo.',
]

const limitations = [
  'A IA pode errar.',
  'Pode nao entender um contexto local ou uma expressao especifica.',
  'Pode sugerir frases que nao combinam com a sua intencao.',
  'O servico pode ficar indisponivel temporariamente.',
]

export default function AiHelpPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_48%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.2),transparent_44%)]" />

      <section className="relative mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/help"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Central de Ajuda
          </Link>

          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            Abrir feed
            <ChevronRight className="h-4 w-4" />
          </Link>
        </header>

        <div className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-200">
              Uso responsavel
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              IA na EntreUS
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">
              A IA da EntreUS e uma ferramenta de apoio para melhorar textos,
              organizar ideias, trazer mais clareza e sugerir legendas para os
              seus posts antes da publicacao.
            </p>
          </div>

          <aside className="rounded-3xl border border-violet-300/20 bg-violet-500/10 p-5 shadow-2xl shadow-violet-950/25 ring-1 ring-white/10 backdrop-blur">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-100 ring-1 ring-violet-200/20">
                <BrainCircuit className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">
                  Voce continua no controle
                </h2>
                <p className="mt-2 text-sm leading-6 text-violet-100/80">
                  A IA apenas sugere uma nova versao. Nada e publicado sem a sua
                  acao e voce pode editar o resultado antes de postar.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section aria-labelledby="entenda-a-ia" className="pb-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">
              Antes de usar
            </p>
            <h2 id="entenda-a-ia" className="mt-2 text-2xl font-black text-white">
              Entenda o papel da ferramenta
            </h2>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {infoSections.map((section) => {
              const Icon = section.icon

              return (
                <article
                  key={section.title}
                  className="rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${section.iconClassName}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-xl font-black text-white">{section.title}</h3>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {section.description}
                  </p>

                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <p key={item} className="flex gap-3 text-sm leading-6 text-zinc-300">
                        <CheckCircle2
                          className={`mt-0.5 h-5 w-5 shrink-0 ${section.checkClassName}`}
                        />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="privacidade" className="py-8">
          <div className="overflow-hidden rounded-3xl border border-blue-300/20 bg-gradient-to-br from-blue-500/15 via-zinc-950 to-violet-500/10 p-5 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/15 text-blue-100 ring-1 ring-blue-200/20">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <p className="mt-5 text-sm font-black uppercase tracking-[0.22em] text-blue-200">
                  Privacidade e seguranca
                </p>
                <h2 id="privacidade" className="mt-2 text-2xl font-black text-white">
                  A sugestao acontece em um fluxo protegido
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  'O texto e enviado para a rota segura da EntreUS para processamento.',
                  'A chave Gemini nao aparece no navegador.',
                  'A IA so e chamada quando voce clica no botao.',
                  'Nada e publicado automaticamente.',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold leading-6 text-zinc-200"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="como-usar" className="py-8">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-100 ring-1 ring-violet-300/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">
                Dicas de uso
              </p>
              <h2 id="como-usar" className="mt-1 text-2xl font-black text-white">
                Da ideia ao post, em cinco passos
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {usageSteps.map((step, index) => (
              <article
                key={step}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black text-black">
                  {index + 1}
                </span>
                <p className="mt-4 text-sm font-semibold leading-6 text-zinc-200">{step}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pb-12 pt-8">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <article className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5 shadow-xl shadow-black/20 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/20">
                  <Lightbulb className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-black text-white">Limitacoes importantes</h2>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {limitations.map((item) => (
                  <p key={item} className="flex gap-3 text-sm leading-6 text-zinc-300">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </article>

            <aside className="flex flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 sm:p-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-200">
                  Regra principal
                </p>
                <p className="mt-3 text-lg font-black leading-7 text-white">
                  Leia, ajuste e publique somente quando o texto representar o
                  que voce realmente quer dizer.
                </p>
              </div>

              <Link
                href="/feed"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50"
              >
                Voltar ao feed
                <ChevronRight className="h-4 w-4" />
              </Link>
            </aside>
          </div>
        </section>
      </section>
    </main>
  )
}
