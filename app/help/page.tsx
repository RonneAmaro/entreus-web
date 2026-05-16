'use client'

import Link from 'next/link'
import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'
import {
  Award,
  Bug,
  ChevronRight,
  Gift,
  HelpCircle,
  MessageCircle,
  Mic,
  MonitorPlay,
  Search,
  Shield,
  Sparkles,
  UserCircle,
} from 'lucide-react'

type HelpCategory = {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  articles: string[]
}

const categories: HelpCategory[] = [
  {
    title: 'Primeiros passos',
    description: 'Crie sua conta, ajuste idioma, tema e entenda os atalhos principais.',
    icon: Sparkles,
    articles: ['Como criar sua conta', 'Como navegar pelo EntreUS', 'Como mudar idioma e tema'],
  },
  {
    title: 'Perfil e conta',
    description: 'Edite nome, foto, bio, privacidade e configuracoes do seu perfil.',
    icon: UserCircle,
    articles: ['Editar perfil', 'Trocar foto e banner', 'Privacidade da conta'],
  },
  {
    title: 'Feed e publicacoes',
    description: 'Publique textos, midias, enquetes, comentarios e respostas.',
    icon: MonitorPlay,
    articles: ['Criar uma publicacao', 'Comentar e responder', 'Salvar publicacoes'],
  },
  {
    title: 'Mensagens privadas',
    description: 'Use conversas 1:1, respostas, edicao, exclusao e status de leitura.',
    icon: MessageCircle,
    articles: ['Enviar mensagens', 'Responder e editar mensagens', 'Entender os checks'],
  },
  {
    title: 'Chamadas de voz e video',
    description: 'Inicie chamadas privadas, aceite convites e revise eventos no chat.',
    icon: Mic,
    articles: ['Comecar chamada privada', 'Permissoes de camera e microfone', 'Historico de chamadas'],
  },
  {
    title: 'EntreUS Meet',
    description: 'Crie salas, gerencie acesso e organize encontros ao vivo.',
    icon: HelpCircle,
    articles: ['Criar uma sala Meet', 'Aprovar participantes', 'Levantar a mao'],
  },
  {
    title: 'Selos EntreUS',
    description: 'Entenda conquistas, reconhecimento e identidade institucional.',
    icon: Award,
    articles: ['O que sao selos', 'Como receber selos', 'Onde os selos aparecem'],
  },
  {
    title: 'ItaCash e presentes',
    description: 'Veja como funcionam creditos, presentes e futuras recompensas.',
    icon: Gift,
    articles: ['O que e ItaCash', 'Enviar presentes', 'Historico de recompensas'],
  },
  {
    title: 'Seguranca e denuncias',
    description: 'Bloqueie usuarios, denuncie problemas e proteja sua experiencia.',
    icon: Shield,
    articles: ['Bloquear usuario', 'Denunciar conteudo', 'Boas praticas de seguranca'],
  },
]

const popularArticles = [
  'Como recuperar o acesso a minha conta?',
  'Por que minha mensagem mostra um ou dois checks?',
  'Como reportar um bug para a equipe EntreUS?',
  'Como personalizar uma conversa privada?',
  'Como criar uma sala no EntreUS Meet?',
]

export default function HelpPage() {
  const [query, setQuery] = useState('')

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return categories

    return categories.filter((category) => {
      const haystack = [
        category.title,
        category.description,
        ...category.articles,
      ].join(' ').toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [query])

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white">
              E
            </span>
            EntreUS
          </Link>

          <Link
            href="/feedback"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-blue-50"
          >
            <Bug className="h-4 w-4" />
            Reportar bug
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-blue-300">
              Central de Ajuda
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Resolva duvidas e encontre guias para usar o EntreUS.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Conteudo inicial fixo na interface, com a estrutura de categorias e artigos pronta para migrar para Supabase.
            </p>

            <label className="mt-8 flex max-w-2xl items-center gap-3 rounded-2xl border border-blue-300/25 bg-white/10 px-4 py-4 shadow-2xl shadow-blue-950/30 ring-1 ring-white/10 transition focus-within:border-blue-200 focus-within:bg-white/15">
              <Search className="h-5 w-5 shrink-0 text-blue-200" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por mensagens, perfil, Meet, seguranca..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-400"
              />
            </label>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30">
            <h2 className="text-lg font-black">Artigos populares</h2>
            <div className="mt-4 space-y-2">
              {popularArticles.map((article) => (
                <button
                  key={article}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  <span>{article}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-blue-200" />
                </button>
              ))}
            </div>
          </aside>
        </div>

        <section className="pb-10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCategories.map((category) => {
              const Icon = category.icon

              return (
                <article
                  key={category.title}
                  className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-zinc-900"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-white">{category.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">{category.description}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {category.articles.map((article) => (
                      <button
                        key={article}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white/[0.03] px-3 py-2.5 text-left text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <span>{article}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </section>
    </main>
  )
}
