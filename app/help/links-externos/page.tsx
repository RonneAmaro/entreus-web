import type { Metadata } from 'next'
import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  Link2,
  LockKeyhole,
  MessageSquareText,
  MonitorPlay,
  Music2,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Links externos | EntreUS',
  description:
    'Saiba como YouTube, TikTok, X/Twitter, Instagram, Facebook e Vimeo aparecem nos posts da EntreUS.',
}

type PlatformGuide = {
  name: string
  appearance: string
  description: string
  detail: string
  icon: ComponentType<{ className?: string }>
  iconClassName: string
  accentClassName: string
}

const platforms: PlatformGuide[] = [
  {
    name: 'YouTube',
    appearance: 'Player dentro do post',
    description: 'Videos do YouTube aparecem em um player incorporado na EntreUS.',
    detail: 'Funciona melhor com links publicos de videos ou Shorts.',
    icon: Play,
    iconClassName: 'bg-red-500/15 text-red-200 ring-red-300/20',
    accentClassName: 'border-red-300/20 bg-red-500/10 text-red-100',
  },
  {
    name: 'TikTok',
    appearance: 'Embed quando possivel',
    description:
      'Videos publicos podem aparecer incorporados quando o link permite identificar o video com seguranca.',
    detail: 'Se o ID nao for reconhecido, o link vira preview simples.',
    icon: Music2,
    iconClassName: 'bg-cyan-400/15 text-cyan-100 ring-cyan-300/20',
    accentClassName: 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100',
  },
  {
    name: 'X/Twitter',
    appearance: 'Card seguro',
    description:
      'Publicacoes aparecem como um card seguro com botao para abrir o conteudo original no X.',
    detail: 'A EntreUS nao carrega scripts externos da plataforma.',
    icon: MessageSquareText,
    iconClassName: 'bg-white/10 text-white ring-white/15',
    accentClassName: 'border-white/15 bg-white/10 text-zinc-100',
  },
  {
    name: 'Instagram',
    appearance: 'Card seguro',
    description:
      'Posts, Reels, IGTV e Stories aparecem como card seguro dentro do feed.',
    detail: 'Conteudos privados ou expirados podem nao abrir.',
    icon: Camera,
    iconClassName: 'bg-pink-500/15 text-pink-100 ring-pink-300/20',
    accentClassName: 'border-pink-300/20 bg-pink-500/10 text-pink-100',
  },
  {
    name: 'Facebook',
    appearance: 'Card seguro',
    description:
      'Posts, videos, reels e links Watch aparecem como card seguro com botao para abrir no Facebook.',
    detail: 'Nao usamos iframe, SDK, script externo ou API do Facebook.',
    icon: MessageSquareText,
    iconClassName: 'bg-blue-500/15 text-blue-100 ring-blue-300/20',
    accentClassName: 'border-blue-300/20 bg-blue-500/10 text-blue-100',
  },
  {
    name: 'Vimeo',
    appearance: 'Player quando possivel',
    description:
      'Videos com ID valido podem abrir em player dentro da EntreUS.',
    detail: 'Links sem ID numerico valido viram preview comum.',
    icon: MonitorPlay,
    iconClassName: 'bg-sky-500/15 text-sky-100 ring-sky-300/20',
    accentClassName: 'border-sky-300/20 bg-sky-500/10 text-sky-100',
  },
  {
    name: 'Outros links',
    appearance: 'Preview simples',
    description:
      'Links comuns aparecem como um card com dominio, caminho e acesso ao site original.',
    detail: 'Sites externos continuam responsaveis pelo conteudo publicado neles.',
    icon: Link2,
    iconClassName: 'bg-amber-400/15 text-amber-100 ring-amber-300/20',
    accentClassName: 'border-amber-300/20 bg-amber-500/10 text-amber-100',
  },
]

const postingSteps = [
  {
    title: 'Cole o link',
    body: 'Inclua a URL completa no texto do post, junto com sua legenda ou comentario.',
  },
  {
    title: 'Publique normalmente',
    body: 'Voce nao precisa escolher plataforma nem configurar nada antes de publicar.',
  },
  {
    title: 'A EntreUS exibe com seguranca',
    body: 'O feed tenta reconhecer a plataforma e escolhe player, embed, card seguro ou preview simples.',
  },
]

const limitations = [
  'Conteudos privados podem nao abrir para outras pessoas.',
  'Links removidos, expirados ou indisponiveis podem falhar.',
  'Algumas plataformas limitam incorporacao fora do proprio site.',
  'Links curtos podem virar apenas card se nao der para extrair ID com seguranca.',
]

const safetyNotes = [
  'A EntreUS nao baixa nem copia videos externos.',
  'O link continua pertencendo a plataforma original.',
  'Botoes abrem o conteudo original em nova aba.',
  'A EntreUS evita scripts externos quando nao e seguro.',
]

const postingTips = [
  'Use links publicos.',
  'Evite links privados.',
  'Prefira link completo em vez de encurtado.',
  'Confira se o conteudo original ainda esta no ar.',
]

export default function ExternalLinksHelpPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
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
            <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Publicacoes e feed
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Links externos na EntreUS
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Cole links de outras plataformas e transforme seu post em uma
              experiencia mais completa.
            </p>
          </div>

          <aside className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-5 shadow-2xl shadow-blue-950/25 ring-1 ring-white/10">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-400/15 text-blue-100 ring-1 ring-blue-200/20">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">
                  Um link, varios formatos
                </h2>
                <p className="mt-2 text-sm leading-6 text-blue-100/80">
                  Quando possivel, a EntreUS mostra o conteudo no proprio post.
                  Quando nao for seguro ou permitido, o link continua acessivel
                  como card.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section aria-labelledby="como-postar" className="pb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">
                Como postar
              </p>
              <h2 id="como-postar" className="mt-2 text-2xl font-black text-white">
                O processo e simples
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {postingSteps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-black">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-black text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="plataformas" className="py-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500">
              Plataformas suportadas
            </p>
            <h2 id="plataformas" className="mt-2 text-2xl font-black text-white">
              Como cada link aparece no feed
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              A EntreUS escolhe a apresentacao mais segura para cada link:
              player, embed, card seguro ou preview simples.
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {platforms.map((platform) => {
              const Icon = platform.icon

              return (
                <article
                  key={platform.name}
                  className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-zinc-900"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${platform.iconClassName}`}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-black text-white">{platform.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-zinc-300">
                        {platform.appearance}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-6 text-zinc-400">
                    {platform.description}
                  </p>

                  <div
                    className={`mt-4 rounded-2xl border px-3 py-2.5 text-xs font-semibold leading-5 ${platform.accentClassName}`}
                  >
                    {platform.detail}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="grid gap-3 py-8 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/20">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black text-white">Limitacoes</h2>
            </div>

            <div className="mt-5 space-y-3">
              {limitations.map((item) => (
                <p key={item} className="flex gap-3 text-sm leading-6 text-zinc-400">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/20">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black text-white">Seguranca</h2>
            </div>

            <div className="mt-5 space-y-3">
              {safetyNotes.map((item) => (
                <p key={item} className="flex gap-3 text-sm leading-6 text-zinc-400">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </article>
        </section>

        <section className="pb-12 pt-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-300">
                  Dicas
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Para postar melhor
                </h2>
              </div>

              <Link
                href="/feed"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black transition hover:bg-blue-50 sm:w-auto"
              >
                Criar post no feed
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {postingTips.map((tip) => (
                <div
                  key={tip}
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold leading-6 text-zinc-200"
                >
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
