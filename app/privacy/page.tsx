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
          body: 'Podemos tratar nome, e-mail, username, avatar, data de nascimento, posts, comentarios, mensagens, midias, interacoes, preferencias e informacoes tecnicas necessarias para manter sua conta e sua experiencia.',
        },
        {
          title: 'Dados de menores e responsaveis',
          body: 'Quando o usuario for menor de 18 anos, podemos tratar informacoes relacionadas a idade e, quando necessario, e-mail do responsavel para fluxo de consentimento parental. Esse consentimento nao libera conteudo 18+.',
        },
        {
          title: 'Documentos e selfie para 18+',
          body: 'Para verificacao 18+, podemos solicitar foto do documento, verso do documento quando aplicavel, selfie e declaracao de responsabilidade. Esses dados sao sensiveis e usados apenas para analise de idade e seguranca da plataforma.',
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
          title: 'Armazenamento privado de documentos',
          body: 'Documentos e selfies de verificacao devem ficar em storage privado. A plataforma nao deve usar URL publica permanente para esses arquivos. O acesso deve ser restrito a equipe/admin autorizados e, quando necessario, por links temporarios.',
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
          body: 'O usuario podera solicitar informacoes, correcao, exclusao ou orientacoes sobre seus dados pelos canais oficiais. Algumas solicitacoes podem depender de verificacao de identidade e certas informacoes podem ser mantidas pelo tempo necessario para seguranca, prevencao de fraude e obrigacoes legais.',
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
