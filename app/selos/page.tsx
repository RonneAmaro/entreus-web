import type { Metadata } from 'next'
import Image from 'next/image'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Selos EntreUS',
  description: 'Informações sobre os Selos EntreUS.',
}

const badges = [
  {
    name: 'Selo Comunidade',
    image: '/badges/comunidade.png',
    description:
      'Reconhecimento para usuários participativos que ajudam a manter a comunidade viva, útil e acolhedora.',
    benefits: [
      'Critérios futuros por posts, curtidas, comentários e engajamento positivo.',
      'Possível recompensa em ItaCash por conquistas e campanhas internas.',
      'Destaque visual no perfil e em áreas sociais da plataforma.',
    ],
    note: 'Os critérios serão ajustados para valorizar participação real, não spam ou comportamento artificial.',
  },
  {
    name: 'Selo VIP',
    image: '/badges/vip-premium.png',
    description:
      'Identidade premium para usuários pagantes, com acesso a benefícios exclusivos conforme o plano ativo.',
    benefits: [
      'Mais tempo no EntreUS Meet, com possibilidade futura de salas de até 1 hora.',
      'Gravações temporárias futuras e recursos avançados da plataforma.',
      'Prioridade em experiências premium, personalização e ferramentas especiais.',
    ],
    note: 'Benefícios, valores e prazos serão apresentados antes da contratação do plano.',
  },
  {
    name: 'Selo Ancião',
    image: '/badges/anciao.png',
    description:
      'Selo vitalício e limitado a 100 unidades, pensado para membros fundadores e vozes especiais da comunidade.',
    benefits: [
      'Acesso especial e reconhecimento permanente dentro do EntreUS.',
      'Voz diferenciada em decisões, votações ou consultas internas futuras.',
      'Possível participação financeira futura, se houver regras próprias aprovadas.',
    ],
    note: 'Por ser limitado, terá regras específicas de elegibilidade, transferência e manutenção.',
  },
]

export default function SelosPage() {
  return (
    <InstitutionalPageLayout
      title="Selos EntreUS"
      description="Os Selos EntreUS combinam identidade, reconhecimento e acesso. Eles destacam participação, benefícios premium e papéis especiais dentro da comunidade."
      notice="Benefícios financeiros e regras avançadas dependerão de regulamentação interna e documentos próprios da plataforma."
    >
      <div className="space-y-4">
        {badges.map((badge) => (
          <article
            key={badge.name}
            className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/25 ring-1 ring-blue-400/10 backdrop-blur-xl"
          >
            <div className="grid gap-5 p-5 sm:grid-cols-[8.5rem_1fr] sm:items-center">
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[1.5rem] border border-blue-300/20 bg-black/35 p-3 shadow-xl shadow-blue-950/20 ring-1 ring-white/10 sm:mx-0">
                <Image
                  src={badge.image}
                  alt={badge.name}
                  width={128}
                  height={128}
                  className="h-full w-full object-contain"
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
