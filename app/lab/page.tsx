'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ImageIcon, QrCode, Scissors, Wand2 } from 'lucide-react'
import { useLanguage } from '../components/LanguageProvider'

const DONATION_URL = 'https://link.mercadopago.com.br/entreuslab'

export default function LabPage() {
  const { t } = useLanguage()

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-black dark:text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/feed"
            className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {t('labPage.backToFeed')}
          </Link>

          <Link
            href="/lab/poster"
            className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            {t('labPage.openPoster')}
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
                  aria-label={t('labPage.logoAria')}
                >
                  <Image
                    src="/logo.png"
                    alt={t('labPage.logoAlt')}
                    width={180}
                    height={110}
                    className="h-auto w-36 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:w-44"
                    priority
                  />
                </Link>

                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
                  {t('labPage.heroKicker')}
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                  {t('labPage.title')}
                </h1>

                <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  {t('labPage.description')}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <Link
                  href="/lab/poster"
                  className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 dark:bg-white dark:text-black"
                >
                  {t('labPage.openPoster')}
                </Link>

                <a
                  href={DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/60"
                >
                  {t('labPage.donation.title')}
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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Scissors className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              {t('labPage.posterTool.title')}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {t('labPage.posterTool.description')}
            </p>

            <span className="mt-5 inline-flex text-sm font-bold text-blue-600 group-hover:underline dark:text-blue-400">
              {t('labPage.posterTool.action')}
            </span>
          </Link>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <ImageIcon className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              {t('labPage.imageResize.title')}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {t('labPage.imageResize.description')}
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <QrCode className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              {t('labPage.qrCode.title')}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {t('labPage.qrCode.description')}
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
              <Wand2 className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-xl font-black">
              {t('labPage.quickPosters.title')}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {t('labPage.quickPosters.description')}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/20 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-950 dark:text-white">
                Apoie o {t('labPage.heroKicker')}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {t('labPage.donation.description')}
              </p>
            </div>

            <a
              href={DONATION_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-500"
            >
              {t('labPage.donation.action')}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
