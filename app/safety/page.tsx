import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Seguranca e Denuncias',
  description: 'Orientacoes de seguranca, denuncia e moderacao do EntreUS.',
}

export default function SafetyPage() {
  return (
    <InstitutionalPageLayout
      title="Seguranca e Denuncias"
      description="O EntreUS busca construir uma comunidade segura, com ferramentas de denuncia, bloqueio e moderacao para reduzir abuso e proteger usuarios."
      sections={[
        {
          title: 'Como denunciar',
          body: 'Quando disponivel no conteudo, use as opcoes de denuncia em usuarios, posts, comentarios e mensagens. Descreva o problema com clareza para ajudar a analise da moderacao.',
        },
        {
          title: 'Como bloquear',
          body: 'O bloqueio ajuda a limitar interacoes indesejadas com outro usuario. Use-o quando nao quiser receber contato, ver conteudos ou manter interacao com determinado perfil.',
        },
        {
          title: 'Condutas proibidas',
          body: 'Nao permitimos ameacas, assedio, discurso de odio, exploracao, exposicao de dados privados, golpes, spam, impersonificacao, conteudo ilegal, exposicao sem consentimento ou incentivo a violencia.',
        },
        {
          title: 'Conteudo 18+',
          body: 'Conteudo 18+ fica bloqueado para quem nao tem verificacao aprovada. Menores de 18 anos nao podem acessar conteudo 18+, mesmo com autorizacao de responsavel.',
        },
        {
          title: 'Consentimento parental',
          body: 'O responsavel pode autorizar o uso geral da plataforma por um menor quando solicitado. Essa autorizacao nao libera recursos 18+ e nao substitui verificacao de idade.',
        },
        {
          title: 'Verificacao 18+',
          body: 'A verificacao 18+ passa por analise manual. A plataforma pode solicitar documento e selfie, sempre com cuidado por se tratar de dados sensiveis. Esses arquivos nao devem ser compartilhados publicamente.',
        },
        {
          title: 'Moderacao',
          body: 'A equipe podera analisar denuncias, remover conteudos, limitar alcance, restringir recursos, suspender contas ou tomar outras medidas proporcionais ao risco e a gravidade.',
        },
        {
          title: 'Abuso, spam e golpes',
          body: 'Perfis usados para fraude, phishing, promessas enganosas, links maliciosos, publicidade abusiva ou manipulacao de interacoes podem ser removidos da plataforma.',
        },
        {
          title: 'Denuncias sensiveis',
          body: 'Denuncie abuso, fraude, conteudo ilegal, exposicao sem consentimento, suspeita de exploracao ou qualquer publicacao que coloque pessoas em risco. As denuncias serao analisadas pela moderacao.',
        },
        {
          title: 'Boas praticas',
          body: 'Proteja sua senha, desconfie de ofertas irreais, evite enviar documentos ou codigos para desconhecidos e denuncie comportamentos suspeitos rapidamente.',
        },
      ]}
    />
  )
}
