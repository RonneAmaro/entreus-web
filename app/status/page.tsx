import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  Database,
  HelpCircle,
  Home,
  LockKeyhole,
  MessageCircle,
  RefreshCcw,
  Server,
  UploadCloud,
  Video,
} from 'lucide-react'

export const metadata: Metadata = {
  title: {
    absolute: 'Status da EntreUS | EntreUS',
  },
  description:
    'Consulte avisos temporarios sobre estabilidade, manutencao e recursos da plataforma EntreUS.',
}

const affectedResources = [
  {
    title: 'Login e cadastro',
    icon: LockKeyhole,
  },
  {
    title: 'Feed e publicacoes',
    icon: Bell,
  },
  {
    title: 'Upload de midias',
    icon: UploadCloud,
  },
  {
    title: 'Mensagens e notificacoes',
    icon: MessageCircle,
  },
  {
    title: 'Salas Meet',
    icon: Video,
  },
  {
    title: 'Recursos de IA',
    icon: BrainCircuit,
  },
]

const userActions = [
  'Tentar novamente em alguns minutos.',
  'Verificar sua conexao antes de reenviar.',
  'Evitar reenviar varias vezes o mesmo upload.',
  'Salvar o texto antes de sair da pagina.',
  'Acompanhar avisos oficiais da EntreUS.',
]

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
              E
            </span>
            EntreUS
          </Link>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-100">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Aviso temporario
          </div>
        </header>

        <div className="grid flex-1 gap-8 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center">
          <section>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Estabilidade e manutencao
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Status da EntreUS
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Acompanhe avisos temporarios sobre estabilidade, manutencao e
              recursos da plataforma.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-blue-50"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Voltar para o inicio
              </Link>

              <Link
                href="/help"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:bg-white/10"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                Ir para ajuda
              </Link>
            </div>
          </section>

          <section className="grid gap-4">
            <article className="rounded-3xl border border-blue-300/20 bg-white/[0.04] p-5 shadow-2xl shadow-black/25 ring-1 ring-white/5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
                  <Server className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-white">
                    Estado da plataforma
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    Se algum recurso da EntreUS estiver instavel, pode ser uma
                    manutencao temporaria ou limite externo de servicos como
                    autenticacao, banco de dados ou armazenamento.
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5 shadow-xl shadow-black/20">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/20">
                  <Database className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-white">
                    Aviso importante
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-amber-50/85">
                    A EntreUS esta em desenvolvimento continuo. Em alguns
                    momentos, melhorias tecnicas podem causar instabilidade
                    temporaria.
                  </p>
                </div>
              </div>
            </article>
          </section>
        </div>

        <section className="border-t border-white/10 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-300">
                O que pode ser afetado
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Recursos que podem oscilar durante instabilidades
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {affectedResources.map((resource) => {
              const Icon = resource.icon

              return (
                <article
                  key={resource.title}
                  className="rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-lg shadow-black/20 transition hover:border-blue-300/30 hover:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-sm font-black text-white">
                      {resource.title}
                    </h3>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="pb-10">
          <article className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-200/20">
                    <RefreshCcw className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="text-xl font-black text-white">
                    O que o usuario pode fazer
                  </h2>
                </div>
                <p className="mt-3 text-sm leading-7 text-emerald-50/85">
                  Em periodos de instabilidade, pequenas acoes ajudam a evitar
                  perda de conteudo e tentativas repetidas.
                </p>
              </div>

              <ul className="grid flex-1 gap-2 text-sm leading-6 text-emerald-50/90">
                {userActions.map((action) => (
                  <li key={action} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-200" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </section>
      </section>
    </main>
  )
}
