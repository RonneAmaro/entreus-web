import Image from 'next/image'
import Link from 'next/link'
import { CreditCard, Heart, ImageIcon, Landmark, QrCode, Scissors, Wand2 } from 'lucide-react'

const PIX_DONATION_URL = 'https://nubank.com.br/cobrar/u2kum/69fca421-184d-459c-a125-f760fc56c264'
const MERCADO_PAGO_DONATION_URL = 'https://link.mercadopago.com.br/entreuslab'

export default function LabPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-black dark:text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/feed"
            className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Voltar para o feed
          </Link>


        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative p-6 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_30%)]" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <Link
                  href="/feed"
                  className="inline-flex items-center gap-3"
                  aria-label="Ir para a EntreUS"
                >
                  <Image
                    src="/logo.png"
                    alt="Logo EntreUS"
                    width={180}
                    height={110}
                    className="h-auto w-36 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:w-44"
                    priority
                  />
                </Link>

                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
                  EntreUS Lab
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                  Ferramentas criativas para escola, imagem e PDF
                </h1>

                <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  Um laboratório dentro do ecossistema EntreUS para criar materiais,
                  ampliar imagens, dividir arquivos em folhas e facilitar o trabalho
                  de professores, escolas e criadores.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">


                <a
                  href="#doacao"
                  className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/60"
                >
                  Apoiar o EntreUS Lab
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/lab/poster"
            className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/40 dark:text-blue-300">
              <Scissors className="h-6 w-6 transition duration-300 group-hover:drop-shadow-[0_0_10px_rgba(96,165,250,0.95)]" />
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

          <Link
            href="/lab/resize"
            className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/40 dark:text-blue-300">
              <ImageIcon className="h-6 w-6 transition duration-300 group-hover:drop-shadow-[0_0_10px_rgba(96,165,250,0.95)]" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              Redimensionar imagem
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Ajuste tamanho, proporção, formato e qualidade de imagens para posts, cartazes e redes sociais.
            </p>

            <span className="mt-5 inline-flex text-sm font-bold text-blue-600 group-hover:underline dark:text-blue-400">
              Abrir ferramenta
            </span>
          </Link>

          <Link
            href="/lab/qrcode"
            className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/40 dark:text-blue-300">
              <QrCode className="h-6 w-6 transition duration-300 group-hover:drop-shadow-[0_0_10px_rgba(96,165,250,0.95)]" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              QR Code
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Gere QR Codes para links, Wi-Fi, WhatsApp, textos, e-mails, telefones e comunicados.
            </p>

            <span className="mt-5 inline-flex text-sm font-bold text-blue-600 group-hover:underline dark:text-blue-400">
              Abrir ferramenta
            </span>
          </Link>

          <Link
            href="/lab/cartazes"
            className="group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-600/20 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-500/70"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-blue-500/0 blur-3xl transition duration-300 group-hover:bg-blue-500/25" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-cyan-400/0 blur-3xl transition duration-300 group-hover:bg-cyan-400/20" />

            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm transition duration-300 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-500/50 dark:bg-blue-950/40 dark:text-blue-300">
              <Wand2 className="h-6 w-6 transition duration-300 group-hover:drop-shadow-[0_0_10px_rgba(96,165,250,0.95)]" />
            </div>

            <h2 className="relative mt-5 text-xl font-black">
              Cartazes rápidos
            </h2>

            <p className="relative mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Crie avisos, eventos, comunicados e projetos com modelos prontos para baixar em PNG ou imprimir.
            </p>

            <span className="relative mt-5 inline-flex text-sm font-bold text-blue-600 transition group-hover:translate-x-1 group-hover:text-blue-500 dark:text-blue-400">
              Abrir ferramenta
            </span>
          </Link>
        </div>

        <div id="doacao" className="mt-6 rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm dark:border-green-900/60 dark:bg-green-950/20 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-green-700 dark:text-green-300">
                <Heart className="h-5 w-5" />
                <h2 className="text-2xl font-black text-zinc-950 dark:text-white">
                  Apoie o EntreUS Lab
                </h2>
              </div>

              <p className="max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                O EntreUS Lab nasceu para ajudar professores, escolas e criadores a transformar
                imagens e PDFs em materiais prontos para impressão. Se puder, prefira o Pix Nubank:
                ele ajuda mais porque não desconta taxa do projeto. O Mercado Pago continua disponível
                como alternativa, mas pode cobrar taxa.
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a
                href={PIX_DONATION_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-green-700"
              >
                <Landmark className="h-4 w-4" />
                Pix Nubank — sem taxa
              </a>

              <a
                href={MERCADO_PAGO_DONATION_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-green-300 bg-white px-6 py-3 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
              >
                <CreditCard className="h-4 w-4" />
                Mercado Pago — pode ter taxa
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
