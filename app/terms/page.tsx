import type { Metadata } from 'next'
import { getMailtoHref, siteConfig } from '@/lib/site-config'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de Uso da plataforma EntreUS.',
}

export default function TermsPage() {
  return (
    <InstitutionalPageLayout
      title="Termos de Uso"
      description="Estes termos apresentam as regras iniciais para uso do EntreUS, uma rede social criada para conexão, expressão, comunidade e recursos digitais em evolução."
      sections={[
        {
          title: 'Cadastro e conta',
          body: 'Ao criar uma conta, o usuário deve informar dados verdadeiros, incluindo a data de nascimento real, proteger suas credenciais e responder pelas atividades feitas em seu perfil. Informações falsas, especialmente sobre idade, podem gerar o bloqueio de recursos, suspensão ou remoção da conta.',
        },
        {
          title: 'Idade mínima e menores',
          body: 'Usuários menores de 18 anos podem precisar de autorização do responsável para usar recursos gerais da plataforma. A autorização do responsável organiza o uso geral da conta, mas não libera o acesso a conteúdo 18+.',
        },
        {
          title: 'Prova de autorizacao parental',
          body: 'Para proteger menores e evitar autorizacoes indevidas, a EntreUS pode solicitar assinatura digitada e selfie simples do responsavel como prova de autorizacao. Essa selfie nao e publica, fica em acesso restrito e pode ser revisada pela administracao apenas quando necessario para seguranca e comprovacao.',
        },
        {
          title: 'Conduta dos usuários',
          body: 'Esperamos respeito, boa-fé e responsabilidade. Não são permitidos assédio, ameaças, discurso de ódio, golpes, spam, exposição indevida de terceiros ou qualquer uso que prejudique a comunidade.',
        },
        {
          title: 'Publicações e mídias',
          body: 'Posts, comentários, imagens, vídeos, links e GIFs devem respeitar direitos de terceiros e as regras da plataforma. Conteúdos ilegais, enganosos, abusivos, sem consentimento, com exposição indevida de terceiros ou que violem a privacidade podem ser moderados.',
        },
        {
          title: 'Conteúdo 18+',
          body: 'Conteúdo adulto, sensual ou equivalente é tratado como 18+. Esse tipo de conteúdo é restrito a usuários maiores de 18 anos e aprovados em verificação de idade. O EntreUS pode bloquear, recusar, limitar ou remover o acesso a conteúdo 18+ conforme critérios de segurança.',
        },
        {
          title: 'Verificação de idade',
          body: 'Para liberar a visualização de conteúdo 18+, a plataforma pode solicitar documento e selfie para análise manual. O envio de materiais falsos, adulterados ou de terceiros pode gerar recusa, restrição de recursos ou bloqueio da conta.',
        },
        {
          title: 'Conteúdo proibido',
          body: 'É proibido publicar ou compartilhar conteúdo ilegal, exploração, abuso, violência sexual, exposição de terceiros sem consentimento, material envolvendo menores, fraude, ameaças ou qualquer conteúdo que coloque pessoas em risco.',
        },
        {
          title: 'Mensagens privadas',
          body: 'O bate-papo existe para conversas diretas entre usuários. Mensagens ofensivas, insistentes, fraudulentas ou usadas para importunação podem gerar denúncia, bloqueio e medidas de moderação.',
        },
        {
          title: 'EntreUS Meet',
          body: 'O Meet permite salas de áudio e vídeo por link, com dono ou administrador da sala. Os participantes devem manter o respeito nas chamadas e seguir as orientações de segurança e convivência.',
        },
        {
          title: 'Gravações temporárias',
          body: 'Recursos futuros poderão permitir gravações temporárias, especialmente para usuários VIP. Quando disponíveis, terão regras próprias de aviso, acesso, prazo e exclusão.',
        },
        {
          title: 'Selos EntreUS',
          body: 'Selos como Comunidade, VIP e Ancião poderão reconhecer participação, assinatura ou acesso especial. Benefícios, critérios e limites poderão evoluir conforme documentos específicos.',
        },
        {
          title: 'ItaCash e presentes',
          body: 'ItaCash será um crédito interno futuro do EntreUS, pensado para recursos pagos, recompensas e presentes digitais. Não é moeda oficial nem investimento financeiro.',
        },
        {
          title: 'Plano VIP',
          body: 'O VIP poderá oferecer benefícios premium, como mais tempo no Meet, recursos exclusivos e gravações temporárias futuras. Valores, prazos e vantagens serão informados antes da contratação.',
        },
        {
          title: 'Denúncias e moderação',
          body: 'Usuários poderão denunciar perfis, posts, comentários e mensagens. O EntreUS poderá analisar conteúdos, aplicar restrições, remover publicações ou suspender contas conforme a gravidade.',
        },
        {
          title: 'Privacidade e dados',
          body: 'O tratamento de dados segue a Política de Privacidade. Usamos dados para login, perfil, feed, mensagens, segurança, Meet, selos, ItaCash e melhorias da plataforma.',
        },
        {
          title: 'Alterações e contato',
          body: 'Estes termos podem ser atualizados para refletir novos recursos, regras legais ou mudanças da plataforma, incluindo regras de idade, segurança e verificação. Dúvidas e solicitações devem ser enviadas pelos canais oficiais do EntreUS quando disponibilizados.',
        },
        {
          title: 'Canais oficiais',
          body: (
            <>
              Para duvidas sobre estes termos, fale com{' '}
              <a
                href={getMailtoHref(siteConfig.emails.support, 'Termos de Uso EntreUS')}
                className="font-semibold text-blue-300 underline-offset-4 hover:underline"
              >
                {siteConfig.emails.support}
              </a>
              . Para privacidade e dados pessoais, use{' '}
              <a
                href={getMailtoHref(siteConfig.emails.privacy, 'Privacidade EntreUS')}
                className="font-semibold text-blue-300 underline-offset-4 hover:underline"
              >
                {siteConfig.emails.privacy}
              </a>
              .
            </>
          ),
        },
      ]}
    />
  )
}
