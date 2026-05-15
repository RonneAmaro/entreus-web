import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Fale Conosco / Ajuda',
  description: 'Informacoes de contato e ajuda do EntreUS.',
}

export default function ContactPage() {
  return (
    <InstitutionalPageLayout
      title="Fale Conosco / Ajuda"
      description="Esta pagina organiza os tipos de atendimento previstos para o EntreUS. Por enquanto, ela funciona como uma orientacao informativa, sem formulario real."
      notice="Em breve disponibilizaremos um canal oficial de atendimento."
      sections={[
        {
          title: 'Suporte tecnico',
          body: 'Para problemas de acesso, falhas no feed, mensagens, uploads, Meet ou comportamento inesperado da plataforma.',
        },
        {
          title: 'Denuncias',
          body: 'Para relatar abuso, assedio, golpes, spam, perfis falsos, conteudos indevidos ou situacoes que coloquem usuarios em risco.',
        },
        {
          title: 'Duvidas sobre conta',
          body: 'Para orientacoes sobre cadastro, login, perfil, username, privacidade, bloqueios, recuperacao de acesso e configuracoes.',
        },
        {
          title: 'VIP e ItaCash',
          body: 'Para duvidas futuras sobre plano VIP, beneficios premium, creditos ItaCash, presentes digitais, pagamentos e regras de uso.',
        },
        {
          title: 'Parcerias',
          body: 'Para propostas institucionais, criadores, marcas, projetos culturais, tecnologia, comunidade e iniciativas alinhadas ao EntreUS.',
        },
      ]}
    />
  )
}
