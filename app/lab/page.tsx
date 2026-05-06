import Link from 'next/link'
import { ImageIcon, QrCode, Scissors, Wand2 } from 'lucide-react'

export default function LabPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-black dark:text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
            EntreUS Lab
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Laboratório de ferramentas criativas
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Ferramentas simples para escola, design, impressão e criação de materiais.
            Começamos com o gerador de pôster em várias folhas A4, aceitando imagem e PDF.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/lab/poster"
            className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Scissors className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              Pôster em folhas
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Transforme imagem ou PDF em um arquivo PDF dividido em várias folhas para imprimir e montar.
            </p>

            <span className="mt-5 inline-flex text-sm font-bold text-blue-600 group-hover:underline dark:text-blue-400">
              Abrir ferramenta
            </span>
          </Link>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <ImageIcon className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              Redimensionar imagem
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Em breve: ajustar tamanho, qualidade e proporção de imagens.
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <QrCode className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              QR Code escolar
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Em breve: gerar QR Codes para murais, atividades e comunicados.
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <Wand2 className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              Cartazes rápidos
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Em breve: modelos prontos para avisos, eventos e projetos.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
