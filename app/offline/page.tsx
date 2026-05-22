import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.28),_transparent_32rem),linear-gradient(145deg,_rgba(2,6,23,1),_rgba(8,47,73,0.72),_rgba(2,6,23,1))]" />
      <section className="relative flex w-full max-w-sm flex-col items-center text-center">
        <img
          src="/logo.png"
          alt="EntreUS"
          className="h-24 w-24 rounded-3xl object-cover shadow-2xl shadow-sky-500/25"
        />

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.32em] text-sky-200">
          EntreUS
        </p>
        <h1 className="mt-3 text-3xl font-bold">Você está offline</h1>
        <p className="mt-4 text-base leading-7 text-slate-200">
          Quando a conexão voltar, atualize a página para continuar.
        </p>

        <Link
          href="/feed"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-sky-500 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Voltar ao feed
        </Link>
      </section>
    </main>
  )
}
