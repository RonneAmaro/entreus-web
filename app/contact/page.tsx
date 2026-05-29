import type { Metadata } from 'next'
import { getMailtoHref, siteConfig } from '@/lib/site-config'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Fale Conosco / Ajuda',
  description: 'Informacoes de contato e ajuda do EntreUS.',
}

function EmailLink({
  email,
  subject,
}: {
  email: string
  subject: string
}) {
  return (
    <a
      href={getMailtoHref(email, subject)}
      className="font-semibold text-blue-300 underline-offset-4 hover:underline"
    >
      {email}
    </a>
  )
}

export default function ContactPage() {
  return (
    <InstitutionalPageLayout
      title="Fale Conosco / Ajuda"
      description="Use os canais institucionais da EntreUS para direcionar duvidas gerais, suporte de conta, privacidade, seguranca e autorizacao parental."
      notice={
        <>
          Para agilizar o atendimento, informe seu username, e-mail da conta e
          um resumo claro do problema. Nunca envie senhas, codigos de acesso ou
          documentos por e-mail sem orientacao da equipe.
        </>
      }
      sections={[
        {
          title: 'Contato geral',
          body: (
            <>
              Duvidas gerais, parcerias e assuntos institucionais:{' '}
              <EmailLink
                email={siteConfig.emails.contact}
                subject="Contato geral EntreUS"
              />
            </>
          ),
        },
        {
          title: 'Suporte',
          body: (
            <>
              Problemas de conta, login, cadastro, autorizacao parental,
              acesso, perfil e falhas de uso:{' '}
              <EmailLink
                email={siteConfig.emails.support}
                subject="Suporte EntreUS"
              />
            </>
          ),
        },
        {
          title: 'Privacidade e dados',
          body: (
            <>
              Solicitacoes sobre dados pessoais, privacidade, exclusao,
              correcao ou duvidas sobre tratamento de informacoes:{' '}
              <EmailLink
                email={siteConfig.emails.privacy}
                subject="Privacidade EntreUS"
              />
            </>
          ),
        },
        {
          title: 'Seguranca e denuncias',
          body: (
            <>
              Denuncias sensiveis, abuso, golpes, spam, exposicao indevida,
              risco a usuarios ou conteudo proibido:{' '}
              <EmailLink
                email={siteConfig.emails.security}
                subject="Seguranca e denuncia EntreUS"
              />
            </>
          ),
        },
        {
          title: 'Central de Ajuda',
          body: 'A pagina /help continua disponivel para guias rapidos, categorias de ajuda e caminhos de suporte dentro da plataforma.',
        },
      ]}
    />
  )
}
