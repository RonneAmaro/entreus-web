import type { Metadata } from 'next'
import Image from 'next/image'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'

export const metadata: Metadata = {
  title: 'ItaCash',
  description: 'Informações sobre o ItaCash no EntreUS.',
}

const itacashCards = [
  {
    title: 'O que é a ItaCash',
    body: 'Um crédito interno futuro do EntreUS para experiências digitais, recompensas, recursos pagos e interações especiais dentro da plataforma.',
  },
  {
    title: 'Como conseguir',
    body: 'Poderá ser obtida por compra futura, campanhas internas, conquistas, participação positiva e recompensas ligadas a selos como o Selo Comunidade.',
  },
  {
    title: 'Como usar',
    body: 'A ItaCash poderá liberar serviços, recursos premium, presentes digitais, destaques e experiências pagas definidas pelas regras internas.',
  },
  {
    title: 'Presentes e recompensas',
    body: 'A economia interna poderá permitir apoio entre usuários, presentes digitais, benefícios por engajamento e ações especiais da comunidade.',
  },
]

export default function ItaCashPage() {
  return (
    <InstitutionalPageLayout
      title="ItaCash"
      description="ItaCash será a camada de crédito interno da EntreUS: uma forma de impulsionar recompensas, presentes digitais e recursos premium sem sair da plataforma."
      notice="ItaCash não é moeda oficial, não é investimento financeiro e será usada apenas dentro da plataforma EntreUS conforme regras próprias."
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[1.9rem] border border-blue-300/20 bg-blue-500/10 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 backdrop-blur-xl">
          <div className="grid gap-5 p-6 sm:grid-cols-[10rem_1fr] sm:items-center">
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-[1.6rem] border border-blue-200/20 bg-black/35 p-4 shadow-2xl shadow-blue-500/10 ring-1 ring-white/10 sm:mx-0">
              <Image
                src="/itacash.png"
                alt="ItaCash"
                width={160}
                height={160}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">
                Crédito interno EntreUS
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                Economia digital para a comunidade
              </h2>
              <p className="mt-3 text-sm leading-7 text-blue-50/85">
                A ItaCash foi pensada para conectar participação, reconhecimento e recursos pagos em uma experiência simples, transparente e interna ao EntreUS.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {itacashCards.map((card) => (
            <article
              key={card.title}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20 ring-1 ring-blue-400/10 backdrop-blur"
            >
              <h2 className="text-lg font-black text-white">
                {card.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-300">
                {card.body}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[1.5rem] border border-blue-300/20 bg-black/25 p-5 text-sm leading-7 text-zinc-300 ring-1 ring-white/10">
          <h2 className="text-lg font-black text-white">
            Observações futuras
          </h2>
          <p className="mt-3">
            A carteira ItaCash, compra de créditos, validade, limites, reembolsos e usos permitidos dependerão de regras próprias, apresentadas antes da ativação pública desses recursos.
          </p>
        </section>
      </div>
    </InstitutionalPageLayout>
  )
}
