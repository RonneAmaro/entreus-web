import { Sparkles } from 'lucide-react'
import BadgeVisual from './BadgeVisual'

type BadgeExplainerCard = {
  title: string
  description: string
  status: string
  slug?: string
}

const badgeCards: BadgeExplainerCard[] = [
  {
    title: 'VIP',
    description: 'Ajuda a destacar o perfil com vantagens visuais e limites ampliados quando o plano estiver ativo.',
    status: 'Disponivel',
    slug: 'vip',
  },
  {
    title: 'VIP Premium',
    description: 'Camada visual superior para diferenciar criadores e apoiadores com mais presenca no feed e perfil.',
    status: 'Disponivel',
    slug: 'vip_premium',
  },
  {
    title: 'Anciao',
    description: 'Reconhecimento de maior hierarquia visual para presenca, historico e contribuicao na comunidade.',
    status: 'Disponivel',
    slug: 'elder',
  },
  {
    title: 'Selo Comunidade',
    description: 'Reforca pertencimento, confianca e reconhecimento dentro dos nichos da plataforma.',
    status: 'Disponivel',
    slug: 'community',
  },
  {
    title: 'Criador fundador',
    description: 'Identidade planejada para a primeira leva de criadores que ajudarem a moldar a EntreUS.',
    status: 'Em preparacao',
  },
]

export default function CreatorBadgesExplainer() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {badgeCards.map((badge) => (
        <article key={badge.title} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/15">
          <div className="flex min-h-16 items-center justify-between gap-3">
            {badge.slug ? (
              <BadgeVisual slug={badge.slug} label={badge.title} size="md" />
            ) : (
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-amber-500/15 text-amber-100 ring-1 ring-amber-200/20">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
            )}
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-300">
              {badge.status}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-black text-white">{badge.title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{badge.description}</p>
        </article>
      ))}
    </div>
  )
}
