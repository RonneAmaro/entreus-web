import Link from 'next/link'
import { ArrowLeft, Download, Video } from 'lucide-react'
import VideoEditor from '@/app/components/VideoEditor'

export default function LabVideoEditorPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black px-3 py-5 text-white sm:px-5">
      <section className="mx-auto w-full max-w-7xl">
        <header className="mb-4 flex flex-col gap-4 rounded-[1.5rem] border border-blue-300/20 bg-zinc-950/85 p-4 shadow-2xl shadow-black/30 ring-1 ring-blue-300/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <Link
              href="/lab"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-zinc-100 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Lab
            </Link>

            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-100 ring-1 ring-blue-300/20">
                <Video className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
                  EntreUS Lab
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-4xl">
                  Editor de Video
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
              Edite, exporte em MP4 e baixe seu video sem publicar no feed.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-300/20 bg-blue-500/10 p-4 text-sm font-semibold leading-6 text-blue-100">
            <div className="mb-2 flex items-center gap-2 font-black text-blue-50">
              <Download className="h-4 w-4" />
              Modo download
            </div>
            Renderize no navegador e baixe o arquivo final em MP4. Nenhum post sera criado.
          </div>
        </header>

        <VideoEditor mode="download" />
      </section>
    </main>
  )
}
