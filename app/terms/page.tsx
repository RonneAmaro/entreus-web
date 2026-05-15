import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de Uso da plataforma EntreUS.',
}

export default function TermsPage() {
  return (
    <InstitutionalPageLayout
      title="Termos de Uso"
      description="Estes termos apresentam as regras iniciais para uso do EntreUS, uma rede social criada para conexao, expressao, comunidade e recursos digitais em evolucao."
      sections={[
        {
          title: 'Cadastro e conta',
          body: 'Ao criar uma conta, o usuario deve informar dados verdadeiros, proteger suas credenciais e responder pelas atividades feitas em seu perfil. Contas falsas, automatizadas ou usadas para abuso podem ser limitadas ou removidas.',
        },
        {
          title: 'Conduta dos usuarios',
          body: 'Esperamos respeito, boa-fe e responsabilidade. Nao sao permitidos assedio, ameacas, discurso de odio, golpes, spam, exposicao indevida de terceiros ou qualquer uso que prejudique a comunidade.',
        },
        {
          title: 'Publicacoes e midias',
          body: 'Posts, comentarios, imagens, videos, links e GIFs devem respeitar direitos de terceiros e as regras da plataforma. Conteudos ilegais, enganosos, abusivos ou que violem privacidade podem ser moderados.',
        },
        {
          title: 'Mensagens privadas',
          body: 'O bate-papo existe para conversas diretas entre usuarios. Mensagens ofensivas, insistentes, fraudulentas ou usadas para importunacao podem gerar denuncia, bloqueio e medidas de moderacao.',
        },
        {
          title: 'EntreUS Meet',
          body: 'O Meet permite salas de audio e video por link, com dono ou administrador da sala. Os participantes devem manter respeito nas chamadas e seguir as orientacoes de seguranca e convivencia.',
        },
        {
          title: 'Gravacoes temporarias',
          body: 'Recursos futuros poderao permitir gravacoes temporarias, especialmente para usuarios VIP. Quando disponiveis, terao regras proprias de aviso, acesso, prazo e exclusao.',
        },
        {
          title: 'Selos EntreUS',
          body: 'Selos como Comunidade, VIP e Anciao poderao reconhecer participacao, assinatura ou acesso especial. Beneficios, criterios e limites poderao evoluir conforme documentos especificos.',
        },
        {
          title: 'ItaCash e presentes',
          body: 'ItaCash sera um credito interno futuro do EntreUS, pensado para recursos pagos, recompensas e presentes digitais. Nao e moeda oficial nem investimento financeiro.',
        },
        {
          title: 'Plano VIP',
          body: 'O VIP podera oferecer beneficios premium, como mais tempo no Meet, recursos exclusivos e gravacoes temporarias futuras. Valores, prazos e vantagens serao informados antes da contratacao.',
        },
        {
          title: 'Denuncias e moderacao',
          body: 'Usuarios poderao denunciar perfis, posts, comentarios e mensagens. O EntreUS podera analisar conteudos, aplicar restricoes, remover publicacoes ou suspender contas conforme a gravidade.',
        },
        {
          title: 'Privacidade e dados',
          body: 'O tratamento de dados segue a Politica de Privacidade. Usamos dados para login, perfil, feed, mensagens, seguranca, Meet, selos, ItaCash e melhorias da plataforma.',
        },
        {
          title: 'Alteracoes e contato',
          body: 'Estes termos podem ser atualizados para refletir novos recursos, regras legais ou mudancas da plataforma. Duvidas e solicitacoes devem ser enviadas pelos canais oficiais do EntreUS quando disponibilizados.',
        },
      ]}
    />
  )
}
