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
          body: 'Nao permitimos ameacas, assedio, discurso de odio, exploracao, exposicao de dados privados, golpes, spam, impersonificacao, conteudo ilegal ou incentivo a violencia.',
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
          title: 'Boas praticas',
          body: 'Proteja sua senha, desconfie de ofertas irreais, evite enviar documentos ou codigos para desconhecidos e denuncie comportamentos suspeitos rapidamente.',
        },
      ]}
    />
  )
}
