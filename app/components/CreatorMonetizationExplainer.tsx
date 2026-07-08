import { BarChart3, Gift, LockKeyhole, Percent, ShieldCheck, type LucideIcon } from 'lucide-react'

type MonetizationCard = {
  title: string
  description: string
  icon: LucideIcon
  note: string
}

const monetizationCards: MonetizationCard[] = [
  {
    title: 'Gorjetas',
    description: 'Seu publico apoia voce com ItaCash em posts, perfis e momentos importantes.',
    icon: Gift,
    note: 'Apoio direto',
  },
  {
    title: 'Posts pagos',
    description: 'Voce publica conteudo exclusivo e define o valor em ItaCash para desbloqueio.',
    icon: LockKeyhole,
    note: 'Conteudo premium',
  },
  {
    title: 'Divisao 85/15',
    description: 'Voce recebe 85% do valor. A plataforma retem 15% para manter e evoluir o servico.',
    icon: Percent,
    note: 'Regra clara',
  },
  {
    title: 'Dashboard',
    description: 'Acompanhe apoios, posts pagos, metricas e desempenho no painel do criador.',
    icon: BarChart3,
    note: 'Em evolucao',
  },
  {
    title: 'Seguranca',
    description: 'Conteudo sensivel e 18+ tem protecao especifica, verificacao e moderacao.',
    icon: ShieldCheck,
    note: 'Protegido',
  },
]

export default function CreatorMonetizationExplainer() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {monetizationCards.map((card) => {
        const Icon = card.icon

        return (
          <article key={card.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/15 text-blue-100 ring-1 ring-blue-200/20">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
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
  )
}
