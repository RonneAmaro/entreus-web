import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Selos EntreUS',
  description: 'Informacoes sobre os Selos EntreUS.',
}

export default function SelosPage() {
  return (
    <InstitutionalPageLayout
      title="Selos EntreUS"
      description="Os Selos EntreUS sao formas de reconhecimento, acesso e identidade dentro da comunidade, com beneficios que poderao evoluir junto com a plataforma."
      notice="Beneficios financeiros e regras avancadas dependerao de regulamentacao interna e documentos proprios da plataforma."
      sections={[
        {
          title: 'Selo Comunidade',
          body: 'Reconhecimento para usuarios participativos. Criterios futuros poderao considerar posts, curtidas, comentarios, engajamento positivo e contribuicoes para a comunidade. Podera haver recompensa em ItaCash.',
        },
        {
          title: 'Selo VIP',
          body: 'Voltado a usuarios pagantes, com beneficios premium, mais tempo no EntreUS Meet, gravacoes temporarias futuras e recursos exclusivos conforme o plano contratado.',
        },
        {
          title: 'Selo Anciao',
          body: 'Selo especial limitado a 100 unidades, com carater vitalicio, acesso diferenciado, voz especial em decisoes e possivel participacao financeira futura com regras especificas a definir.',
        },
      ]}
    />
  )
}
