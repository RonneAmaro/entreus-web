import type { Metadata } from 'next'
import {
  COMMUNITY_BADGE_INITIAL_VALIDITY_DAYS,
  COMMUNITY_BADGE_MIN_SCORE,
  COMMUNITY_BADGE_SCORE_RULES,
} from '@/lib/community-badge-rules'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'
import UserBadgeIcon from '../components/UserBadgeIcon'

export const metadata: Metadata = {
  title: 'Selos EntreUS',
  description: 'Informacoes sobre os Selos EntreUS.',
}

const badges = [
  {
    name: 'Selo Comunidade',
    slug: 'community',
    description:
      'Reconhecimento para usuarios participativos que fortalecem a EntreUS com presenca real, conversas saudaveis e engajamento positivo.',
    benefits: [
      `Score minimo sugerido: ${COMMUNITY_BADGE_MIN_SCORE} pontos.`,
      `Validade inicial: ${COMMUNITY_BADGE_INITIAL_VALIDITY_DAYS} dias.`,
      `Posts publicados: +${COMMUNITY_BADGE_SCORE_RULES.postPublished} pontos cada.`,
      `Comentarios feitos: +${COMMUNITY_BADGE_SCORE_RULES.commentMade} pontos cada.`,
      `Curtidas recebidas: +${COMMUNITY_BADGE_SCORE_RULES.likeReceived} ponto cada.`,
      `Comentarios recebidos: +${COMMUNITY_BADGE_SCORE_RULES.commentReceived} pontos cada.`,
      `Reposts recebidos: +${COMMUNITY_BADGE_SCORE_RULES.repostReceived} pontos cada.`,
      `Dias ativos: +${COMMUNITY_BADGE_SCORE_RULES.activeDay} pontos cada.`,
      `Conteudo ocultado/removido: ${COMMUNITY_BADGE_SCORE_RULES.hiddenPostPenalty} pontos, quando o historico de moderacao estiver disponivel.`,
    ],
    note: 'Para manter o selo, o usuario precisa continuar participando da comunidade e respeitando as diretrizes. Conteudos ocultados/removidos podem prejudicar a pontuacao.',
  },
  {
    name: 'Selo VIP',
    slug: 'vip',
    description:
      'Identidade premium para usuarios pagantes, com acesso a beneficios exclusivos conforme o plano ativo.',
    benefits: [
      'Mais tempo no EntreUS Meet, com possibilidade futura de salas de ate 1 hora.',
      'Gravacoes temporarias futuras e recursos avancados da plataforma.',
      'Prioridade em experiencias premium, personalizacao e ferramentas especiais.',
    ],
    note: 'Beneficios, valores e prazos serao apresentados antes da contratacao do plano.',
  },
  {
    name: 'Selo VIP Premium',
    slug: 'vip_premium',
    description:
      'Destaque premium mais forte para apoiadores e usuarios com reconhecimento especial dentro da EntreUS.',
    benefits: [
      'Destaque visual diferenciado no perfil e nas areas sociais.',
      'Reconhecimento por apoio direto a evolucao da plataforma.',
      'Beneficios premium poderao evoluir conforme regras especificas.',
    ],
    note: 'Este selo nao altera regras financeiras por si so; beneficios dependem de configuracao e termos proprios.',
  },
  {
    name: 'Selo Anciao',
    slug: 'elder',
    description:
      'Selo vitalicio e limitado a 100 unidades, pensado para membros fundadores e vozes especiais da comunidade.',
    benefits: [
      'Acesso especial e reconhecimento permanente dentro do EntreUS.',
      'Voz diferenciada em decisoes, votacoes ou consultas internas futuras.',
      'Possivel participacao financeira futura, se houver regras proprias aprovadas.',
    ],
    note: 'Por ser limitado, tera regras especificas de elegibilidade, transferencia e manutencao.',
  },
]

export default function SelosPage() {
  return (
    <InstitutionalPageLayout
      title="Selos EntreUS"
      description="Os Selos EntreUS combinam identidade, reconhecimento e acesso. Eles destacam participacao, beneficios premium e papeis especiais dentro da comunidade."
      notice="Beneficios financeiros e regras avancadas dependerao de regulamentacao interna e documentos proprios da plataforma."
    >
      <div className="space-y-4">
        {badges.map((badge) => (
          <article
            key={badge.name}
            className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/25 ring-1 ring-blue-400/10 backdrop-blur-xl"
          >
            <div className="grid gap-5 p-5 sm:grid-cols-[8.5rem_1fr] sm:items-center">
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[1.5rem] border border-blue-300/20 bg-black/35 p-3 shadow-xl shadow-blue-950/20 ring-1 ring-white/10 sm:mx-0">
                <UserBadgeIcon
                  badge={{ slug: badge.slug, name: badge.name.replace(/^Selo\s+/, '') }}
                  size="profile"
                  className="h-full w-full rounded-[1.25rem]"
                  title={badge.name}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
                  EntreUS Badge
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {badge.name}
                </h2>
                <p className="mt-2 text-sm leading-7 text-zinc-300">
                  {badge.description}
                </p>

                <div className="mt-4 grid gap-2">
                  {badge.benefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-200"
                    >
                      {benefit}
                    </div>
                  ))}
                </div>

                <p className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-3 text-xs font-semibold leading-6 text-blue-100">
                  {badge.note}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </InstitutionalPageLayout>
  )
}
