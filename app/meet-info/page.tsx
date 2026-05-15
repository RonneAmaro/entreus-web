import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'EntreUS Meet',
  description: 'Informacoes sobre o EntreUS Meet.',
}

export default function MeetInfoPage() {
  return (
    <InstitutionalPageLayout
      title="EntreUS Meet"
      description="O EntreUS Meet e o ambiente de chamadas da plataforma, pensado para conversas por video e audio com links unicos, controle de entrada e recursos sociais."
      sections={[
        {
          title: 'Salas por link',
          body: 'Cada sala pode ser acessada por um link unico. O dono ou administrador organiza a chamada, acompanha participantes e pode aprovar pedidos de entrada quando o fluxo exigir.',
        },
        {
          title: 'Video e audio',
          body: 'As salas permitem comunicacao por camera e microfone, com foco em encontros da comunidade, conversas privadas, reunioes e experiencias ao vivo dentro do EntreUS.',
        },
        {
          title: 'Tempo gratuito',
          body: 'O uso gratuito tera limite inicial de 20 minutos por sala. No futuro, usuarios VIP poderao ter mais tempo, por exemplo 1 hora, conforme regras do plano.',
        },
        {
          title: 'Recursos futuros',
          body: 'Estao previstos recursos como gravacao temporaria para VIP, traducao simultanea, levantar a mao e controles adicionais para melhorar a organizacao das chamadas.',
        },
        {
          title: 'Boas praticas',
          body: 'Respeite os participantes, evite interrupcoes, nao grave ou compartilhe conteudos sem permissao e denuncie comportamentos abusivos ou inseguros.',
        },
      ]}
    />
  )
}
