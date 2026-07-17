'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BarChart3, Coins, FileText, LayoutDashboard, MessageCircle, Settings, UserRound } from 'lucide-react'

export type CreatorStudioSection = 'overview' | 'content' | 'interactions' | 'insights' | 'earnings' | 'profile' | 'settings'
const items = [
  ['overview', 'Visão geral', LayoutDashboard], ['content', 'Conteúdo', FileText],
  ['interactions', 'Interações', MessageCircle], ['insights', 'Métricas', BarChart3],
  ['earnings', 'Ganhos', Coins], ['profile', 'Perfil', UserRound], ['settings', 'Configurações', Settings],
] as const

export default function CreatorStudioShell({ active, onChange, children }: { active: CreatorStudioSection; onChange: (section: CreatorStudioSection) => void; children: ReactNode }) {
  return <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-white">
    <a href="#creator-studio-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">Pular para o conteúdo</a>
    <header className="border-b border-zinc-200/70 bg-white/90 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">EntreUS</p><h1 className="text-xl font-black">Creator Studio</h1></div><div className="flex gap-2"><Link href="/feed?compose=text" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-blue-500">Criar publicação</Link><Link href="/feed" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-bold dark:border-zinc-700">Voltar ao Feed</Link></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-5 px-3 py-5 md:grid-cols-[14rem_minmax(0,1fr)] md:px-5">
      <nav aria-label="Seções do Creator Studio" className="overflow-x-auto md:overflow-visible"><div className="flex min-w-max gap-2 md:sticky md:top-5 md:min-w-0 md:flex-col">{items.map(([id, label, Icon]) => <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => onChange(id)} className="flex min-h-11 items-center gap-2 rounded-2xl px-3 text-left text-sm font-bold transition hover:bg-zinc-200/70 focus-visible:outline-2 focus-visible:outline-blue-500 aria-[current=page]:bg-blue-600 aria-[current=page]:text-white dark:hover:bg-zinc-800"><Icon className="h-4 w-4" />{label}</button>)}</div></nav>
      <main id="creator-studio-content" tabIndex={-1} className="min-w-0">{children}</main>
    </div>
  </div>
}
