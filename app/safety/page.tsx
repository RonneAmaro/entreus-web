import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Segurança e Denúncias',
  description: 'Orientações de segurança, denúncia e moderação do EntreUS.',
}

export default function SafetyPage() {
  return (
    <InstitutionalPageLayout
      title="Segurança e Denúncias"
      description="O EntreUS busca construir uma comunidade segura, com ferramentas de denúncia, bloqueio e moderação para reduzir o abuso e proteger usuários."
      sections={[
        {
          title: 'Como denunciar',
          body: 'Quando disponível no conteúdo, use as opções de denúncia em usuários, posts, comentários e mensagens. Descreva o problema com clareza para ajudar a análise da moderação.',
        },
        {
          title: 'Como bloquear',
          body: 'O bloqueio ajuda a limitar interações indesejadas com outro usuário. Use-o quando não quiser receber contato, ver conteúdos ou manter interação com determinado perfil.',
        },
        {
          title: 'Condutas proibidas',
          body: 'Não permitimos ameaças, assédio, discurso de ódio, exploração, exposição de dados privados, golpes, spam, personificação, conteúdo ilegal, exposição sem consentimento ou incentivo à violência.',
        },
        {
          title: 'Conteúdo 18+',
          body: 'Conteúdo 18+ fica bloqueado para quem não tem verificação aprovada. Menores de 18 anos não podem acessar conteúdo 18+, mesmo com autorização de responsável.',
        },
        {
          title: 'Consentimento parental',
          body: 'O responsável pode autorizar o uso geral da plataforma por um menor quando solicitado. Essa autorização não libera recursos 18+ e não substitui a verificação de idade.',
        },
        {
          title: 'Verificação 18+',
          body: 'A verificação 18+ passa por análise manual. A plataforma pode solicitar documento e selfie, sempre com cuidado por se tratar de dados sensíveis. Esses arquivos não devem ser compartilhados publicamente.',
        },
        {
          title: 'Moderação',
          body: 'A equipe poderá analisar denúncias, remover conteúdos, limitar alcance, restringir recursos, suspender contas ou tomar outras medidas proporcionais ao risco e à gravidade.',
        },
        {
          title: 'Abuso, spam e golpes',
          body: 'Perfis usados para fraude, phishing, promessas enganosas, links maliciosos, publicidade abusiva ou manipulação de interações podem ser removidos da plataforma.',
        },
        {
          title: 'Denúncias sensíveis',
          body: 'Denuncie abuso, fraude, conteúdo ilegal, exposição sem consentimento, suspeita de exploração ou qualquer publicação que coloque pessoas em risco. As denúncias serão analisadas pela moderação.',
        },
        {
          title: 'Boas práticas',
          body: 'Proteja sua senha, desconfie de ofertas irreais, evite enviar documentos ou códigos para desconhecidos e denuncie comportamentos suspeitos rapidamente.',
        },
      ]}
    />
  )
}
