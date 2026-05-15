import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Politica de Privacidade',
  description: 'Politica de Privacidade da plataforma EntreUS.',
}

export default function PrivacyPage() {
  return (
    <InstitutionalPageLayout
      title="Politica de Privacidade"
      description="Esta politica explica, de forma simples, quais dados podem ser tratados pelo EntreUS e por que eles sao necessarios para a experiencia da plataforma."
      sections={[
        {
          title: 'Dados coletados',
          body: 'Podemos tratar nome, e-mail, username, avatar, posts, comentarios, mensagens, midias, interacoes, preferencias e informacoes tecnicas necessarias para manter sua conta e sua experiencia.',
        },
        {
          title: 'Finalidades',
          body: 'Usamos dados para login, perfil, feed, mensagens, Meet, seguranca, prevencao de abuso, selos, ItaCash, suporte, moderacao e melhoria continua dos recursos do EntreUS.',
        },
        {
          title: 'Armazenamento tecnico',
          body: 'A infraestrutura pode usar servicos como Supabase, Cloudflare R2 e Vercel para autenticar usuarios, armazenar dados, hospedar midias e disponibilizar a aplicacao com estabilidade.',
        },
        {
          title: 'Midias e gravacoes',
          body: 'Imagens, videos e outros arquivos enviados podem ser armazenados para exibicao na plataforma. Gravacoes temporarias futuras terao regras de acesso, prazo e exclusao quando forem lancadas.',
        },
        {
          title: 'Compartilhamento limitado',
          body: 'Dados podem ser compartilhados apenas quando necessario para operar a plataforma, cumprir obrigacoes legais, proteger usuarios, investigar abuso ou viabilizar fornecedores tecnicos.',
        },
        {
          title: 'Direitos do usuario',
          body: 'O usuario podera solicitar informacoes, correcao, exclusao ou orientacoes sobre seus dados pelos canais oficiais. Algumas solicitacoes podem depender de verificacao de identidade.',
        },
        {
          title: 'Seguranca',
          body: 'Adotamos medidas tecnicas e organizacionais para reduzir riscos, mas nenhum ambiente digital e totalmente imune. Recomendamos senha forte e cuidado com links, golpes e compartilhamento de dados.',
        },
        {
          title: 'Contato',
          body: 'Duvidas sobre privacidade, dados pessoais ou seguranca poderao ser encaminhadas pelos canais oficiais do EntreUS assim que estiverem disponiveis publicamente.',
        },
      ]}
    />
  )
}
