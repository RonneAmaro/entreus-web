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
          body: 'Ao criar uma conta, o usuario deve informar dados verdadeiros, incluindo data de nascimento real, proteger suas credenciais e responder pelas atividades feitas em seu perfil. Informacoes falsas, especialmente sobre idade, podem gerar bloqueio de recursos, suspensao ou remocao da conta.',
        },
        {
          title: 'Idade minima e menores',
          body: 'Usuarios menores de 18 anos podem precisar de autorizacao de responsavel para usar recursos gerais da plataforma. A autorizacao do responsavel organiza o uso geral da conta, mas nao libera acesso a conteudo 18+.',
        },
        {
          title: 'Conduta dos usuarios',
          body: 'Esperamos respeito, boa-fe e responsabilidade. Nao sao permitidos assedio, ameacas, discurso de odio, golpes, spam, exposicao indevida de terceiros ou qualquer uso que prejudique a comunidade.',
        },
        {
          title: 'Publicacoes e midias',
          body: 'Posts, comentarios, imagens, videos, links e GIFs devem respeitar direitos de terceiros e as regras da plataforma. Conteudos ilegais, enganosos, abusivos, sem consentimento, com exposicao indevida de terceiros ou que violem privacidade podem ser moderados.',
        },
        {
          title: 'Conteudo 18+',
          body: 'Conteudo adulto, sensual ou equivalente e tratado como 18+. Esse tipo de conteudo e restrito a usuarios maiores de 18 anos e aprovados em verificacao de idade. O EntreUS pode bloquear, recusar, limitar ou remover acesso a conteudo 18+ conforme criterios de seguranca.',
        },
        {
          title: 'Verificacao de idade',
          body: 'Para liberar visualizacao de conteudo 18+, a plataforma pode solicitar documento e selfie para analise manual. O envio de materiais falsos, adulterados ou de terceiros pode gerar recusa, restricao de recursos ou bloqueio da conta.',
        },
        {
          title: 'Conteudo proibido',
          body: 'E proibido publicar ou compartilhar conteudo ilegal, exploracao, abuso, violencia sexual, exposicao de terceiros sem consentimento, material envolvendo menores, fraude, ameacas ou qualquer conteudo que coloque pessoas em risco.',
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
          body: 'Estes termos podem ser atualizados para refletir novos recursos, regras legais ou mudancas da plataforma, incluindo regras de idade, seguranca e verificacao. Duvidas e solicitacoes devem ser enviadas pelos canais oficiais do EntreUS quando disponibilizados.',
        },
      ]}
    />
  )
}
