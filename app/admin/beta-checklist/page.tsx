'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Flag,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Video,
  Wallet,
} from 'lucide-react'
import { isAdminRole } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type AdminState = 'loading' | 'denied' | 'ready'

type ChecklistSection = {
  title: string
  description: string
  icon: typeof ClipboardCheck
  links: Array<{ label: string; href: string }>
  items: string[]
}

const checklistSections: ChecklistSection[] = [
  {
    title: 'Conta, perfil e convite',
    description: 'Entrada do usuario, perfil publico e funil inicial de criadores.',
    icon: Sparkles,
    links: [
      { label: 'Cadastro', href: '/signup' },
      { label: 'Login', href: '/login' },
      { label: 'Meu perfil', href: '/profile' },
      { label: 'Convite', href: '/convite' },
      { label: 'Criadores', href: '/creators' },
    ],
    items: [
      'Criar conta, entrar, sair e recuperar senha.',
      'Completar perfil com username, avatar, banner, bio e localizacao.',
      'Abrir perfil publico em outra conta.',
      'Validar formulario de interesse de criador.',
    ],
  },
  {
    title: 'Feed, composer e posts',
    description: 'Publicacao, classificacao de conteudo e interacoes sociais.',
    icon: ClipboardCheck,
    links: [
      { label: 'Feed', href: '/feed' },
      { label: 'Salvos', href: '/saved' },
      { label: 'Busca', href: '/search' },
      { label: 'Notificacoes', href: '/notifications' },
    ],
    items: [
      'Criar post texto, imagem, video e link.',
      'Testar comunidades, opcoes avancadas e classificacao segura/18+.',
      'Curtir, comentar, repostar, salvar, denunciar e abrir post individual.',
      'Conferir tema visual, avatar ring, cores de torcida e tiers VIP/Anciao.',
    ],
  },
  {
    title: 'Monetizacao e criadores',
    description: 'ItaCash, posts pagos, gorjetas, carteira e metricas do criador.',
    icon: Wallet,
    links: [
      { label: 'Carteira', href: '/wallet' },
      { label: 'Comprar ItaCash', href: '/buy-itacash' },
      { label: 'ItaCash', href: '/itacash' },
      { label: 'Dashboard', href: '/creator-dashboard' },
      { label: 'VIP Plus', href: '/vip-plus' },
    ],
    items: [
      'Conferir saldo, transacoes e compra manual/Pix em ambiente controlado.',
      'Enviar gorjeta e validar saldo do remetente e do criador.',
      'Criar post pago, ver paywall, desbloquear e testar saldo insuficiente.',
      'Abrir dashboard e validar posts, interacoes, apoios e visualizacoes.',
    ],
  },
  {
    title: 'Seguranca 18+ e admin',
    description: 'Verificacao de idade, bloqueios, reports, moderacao e filas operacionais.',
    icon: ShieldCheck,
    links: [
      { label: 'Verificacao 18+', href: '/age-verification' },
      { label: 'Admin', href: '/admin' },
      { label: 'Reports', href: '/admin/reports' },
      { label: 'Moderacao', href: '/admin/moderation' },
      { label: 'Age admin', href: '/admin/age-verifications' },
      { label: 'Seguranca', href: '/admin/security-check' },
    ],
    items: [
      'Conta menor/nao verificada nao deve ver conteudo adulto.',
      'Adulto verificado ve adulto somente quando a regra permitir.',
      'Denuncia aparece no admin e conteudo ocultado sai da lista publica.',
      'Usuario comum nao pode acessar paginas admin.',
    ],
  },
  {
    title: 'Lab, Meet e mobile',
    description: 'Ferramentas criativas, salas ao vivo e teste em celular/PWA.',
    icon: Video,
    links: [
      { label: 'Lab', href: '/lab' },
      { label: 'Screen Recorder', href: '/lab/screen-recorder' },
      { label: 'Video Editor', href: '/lab/video-editor' },
      { label: 'Meet', href: '/meet' },
      { label: 'Instalar PWA', href: '/instalar' },
    ],
    items: [
      'Gravar tela com microfone, webcam e anotacoes.',
      'Baixar MP4/WebM e converter WebM para MP4.',
      'Importar video no editor e exportar MP4.',
      'Criar sala Meet, entrar com duas contas e testar mobile/PWA.',
    ],
  },
]

const approvalItems = [
  'Nenhum bloqueador aberto antes de convidar criadores.',
  'Fluxos de ItaCash e posts pagos testados com contas controladas.',
  'Fluxos 18+ e admin testados sem documentos ou dados reais.',
  'Bugs registrados com rota, conta, passos, esperado, obtido, prioridade e status.',
]

export default function AdminBetaChecklistPage() {
  const router = useRouter()
  const [adminState, setAdminState] = useState<AdminState>('loading')
  const [adminLabel, setAdminLabel] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function verifyAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        setMessage('Nao foi possivel verificar permissao admin.')
        setAdminState('denied')
        return
      }

      if (!isAdminRole(profileData?.role)) {
        setAdminState('denied')
        return
      }

      setAdminLabel(user.email || user.id)
      setAdminState('ready')
    }

    void verifyAdmin()

    return () => {
      active = false
    }
  }, [router])

  if (adminState === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando checklist...
      </main>
    )
  }

  if (adminState !== 'ready') {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/10 p-6 text-red-100">
          <ShieldAlert className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-sm leading-6">
            Esta area e exclusiva para administradores da plataforma.
          </p>
          {message && (
            <p className="mt-3 rounded-2xl border border-red-200/20 bg-red-500/10 p-3 text-sm">
              {message}
            </p>
          )}
          <Link href="/feed" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">
            Voltar
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-200/80">
              Beta fechado
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Checklist de testes manuais
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
              Roteiro visual para validar a EntreUS com contas controladas antes de chamar criadores fundadores.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-300/20 bg-blue-500/10 p-4 text-blue-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200/70">Admin</p>
            <p className="mt-1 font-black">{adminLabel}</p>
          </div>
        </header>

        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-[2rem] border border-blue-300/20 bg-blue-500/10 p-5 text-blue-50 ring-1 ring-blue-300/10">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-1 h-6 w-6 shrink-0 text-blue-100" />
              <div>
                <h2 className="text-lg font-black">Registro oficial em Markdown</h2>
                <p className="mt-2 text-sm leading-6 text-blue-50/80">
                  Esta pagina nao grava checks no banco. Use o guia completo e o checklist rapido como fonte oficial dos testes.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-white px-3 py-1.5 text-black">
                    docs/beta-closed-manual-test-guide.md
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-black">
                    docs/beta-closed-quick-checklist.md
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-500/10 p-5 text-emerald-50 ring-1 ring-emerald-300/10">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <CheckCircle2 className="h-5 w-5" />
              Criterio de saida
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-emerald-50/85">
              {approvalItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {checklistSections.map((section) => {
            const Icon = section.icon

            return (
              <section
                key={section.title}
                className="rounded-[2rem] border border-white/10 bg-zinc-950/85 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/15">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black">{section.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{section.description}</p>
                    </div>
                  </div>
                  <Flag className="h-5 w-5 shrink-0 text-zinc-500" />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {section.links.map((link) => (
                    <Link
                      key={`${section.title}-${link.href}`}
                      href={link.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-zinc-100 transition hover:border-blue-300/30 hover:bg-blue-500/15 hover:text-blue-50"
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ))}
                </div>

                <ul className="mt-5 space-y-3">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-zinc-200">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-500/70" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </section>
    </main>
  )
}
