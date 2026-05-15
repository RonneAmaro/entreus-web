import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'ItaCash',
  description: 'Informacoes sobre o ItaCash no EntreUS.',
}

export default function ItaCashPage() {
  return (
    <InstitutionalPageLayout
      title="ItaCash"
      description="ItaCash sera o credito interno do EntreUS, criado para apoiar recompensas, presentes digitais e recursos pagos dentro da propria plataforma."
      notice="ItaCash nao e moeda oficial, nao e investimento financeiro e sera usada apenas dentro da plataforma EntreUS conforme regras proprias."
      sections={[
        {
          title: 'Carteira ItaCash',
          body: 'A plataforma podera oferecer uma carteira interna para acompanhar saldo, historico e uso de ItaCash em servicos, beneficios e experiencias digitais.',
        },
        {
          title: 'Presentes digitais',
          body: 'ItaCash podera ser usada para enviar presentes digitais, apoiar criadores, destacar interacoes e participar de recursos sociais pagos.',
        },
        {
          title: 'Recompensas',
          body: 'Conquistas como Selo Comunidade, participacao positiva e campanhas internas poderao gerar recompensas em ItaCash conforme criterios futuros.',
        },
        {
          title: 'Compra futura',
          body: 'A compra de ItaCash podera ser disponibilizada no futuro, com valores, limites, reembolso, validade e regras de consumo informados antes da aquisicao.',
        },
        {
          title: 'Uso interno',
          body: 'O credito sera usado em servicos e recursos pagos do EntreUS. Regras especificas definirao onde, como e quando o ItaCash podera ser utilizado.',
        },
      ]}
    />
  )
}
