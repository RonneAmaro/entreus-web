import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'

type InstitutionalSection = {
  title: string
  body: ReactNode
}

type InstitutionalPageLayoutProps = {
  title: string
  eyebrow?: string
  description: string
  sections?: InstitutionalSection[]
  notice?: ReactNode
  children?: ReactNode
}

export default function InstitutionalPageLayout({
  title,
  eyebrow = 'Transparência EntreUS',
  description,
  sections = [],
  notice,
  children,
}: InstitutionalPageLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.30),transparent_58%)]" />
      <div className="absolute inset-x-0 bottom-0 h-96 bg-[radial-gradient(circle_at_bottom_right,rgba(30,64,175,0.18),transparent_52%)]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/10 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20 ring-1 ring-blue-400/10 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <Link href="/feed" className="group inline-flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-400/25 bg-black shadow-lg shadow-blue-500/10 ring-1 ring-white/10 transition group-hover:border-blue-300/70">
              <Image
                src="/logo.png"
                alt="Logo EntreUS"
                width={48}
                height={48}
                className="h-full w-full object-contain p-1.5"
                priority
              />
            </div>

            <div>
              <p className="text-2xl font-black tracking-tight">
                Entre<span className="text-blue-400">US</span>
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/75">
                Só Entre Nós
              </p>
            </div>
          </Link>

          <Link
            href="/feed"
            className="inline-flex items-center justify-center rounded-full border border-blue-300/30 bg-blue-500/10 px-5 py-2.5 text-sm font-bold text-blue-100 shadow-sm shadow-blue-950/20 transition hover:border-blue-200/70 hover:bg-blue-500/20"
          >
            Voltar ao feed
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="rounded-[2rem] border border-blue-400/20 bg-zinc-950/80 p-6 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-300">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 text-base leading-8 text-zinc-300">
              {description}
            </p>

            {notice && (
              <div className="mt-6 rounded-3xl border border-blue-300/25 bg-blue-500/10 p-4 text-sm leading-7 text-blue-100">
                {notice}
              </div>
            )}
          </div>

          {children || (
            <div className="grid gap-4 md:grid-cols-2">
              {sections.map((section) => (
                <article
                  key={section.title}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/20 ring-1 ring-white/5 backdrop-blur"
                >
                  <h2 className="text-lg font-black text-white">
                    {section.title}
                  </h2>
                  <div className="mt-3 text-sm leading-7 text-zinc-300">
                    {section.body}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
