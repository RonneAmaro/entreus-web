import type { Metadata } from 'next'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'Fale Conosco / Ajuda',
  description: 'Informações de contato e ajuda do EntreUS.',
}

export default function ContactPage() {
  return (
    <InstitutionalPageLayout
      title="Fale Conosco / Ajuda"
      description="Esta página organiza os tipos de atendimento previstos para o EntreUS. Por enquanto, ela funciona como uma orientação informativa, sem formulário real."
      notice="Em breve disponibilizaremos um canal oficial de atendimento."
      sections={[
        {
          title: 'Suporte técnico',
          body: 'Para problemas de acesso, falhas no feed, mensagens, uploads, Meet ou comportamento inesperado da plataforma.',
        },
        {
          title: 'Denúncias',
          body: 'Para relatar abuso, assédio, golpes, spam, perfis falsos, conteúdos indevidos ou situações que coloquem usuários em risco.',
        },
        {
          title: 'Dúvidas sobre conta',
          body: 'Para orientações sobre cadastro, login, perfil, username, privacidade, bloqueios, recuperação de acesso e configurações.',
        },
        {
          title: 'VIP e ItaCash',
          body: 'Para dúvidas futuras sobre plano VIP, benefícios premium, créditos ItaCash, presentes digitais, pagamentos e regras de uso.',
        },
        {
          title: 'Parcerias',
          body: 'Para propostas institucionais, criadores, marcas, projetos culturais, tecnologia, comunidade e iniciativas alinhadas ao EntreUS.',
        },
      ]}
    />
  )
}
