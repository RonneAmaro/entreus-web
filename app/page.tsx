import Image from 'next/image'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { resolveLocalePreference, translate } from '@/lib/i18n'

export default async function HomePage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const locale = resolveLocalePreference({
    cookieLocale: cookieStore.get('entreus-locale')?.value,
    acceptLanguage: headerStore.get('accept-language'),
    authenticated: false,
  })

  const t = (
    key: Parameters<typeof translate>[1],
    values?: Parameters<typeof translate>[2],
  ) => translate(locale, key, values)

  const pillars = [
    {
      title: t('home.pillars.community.title'),
      description: t('home.pillars.community.description'),
    },
    {
      title: t('home.pillars.creation.title'),
      description: t('home.pillars.creation.description'),
    },
    {
      title: t('home.pillars.monetization.title'),
      description: t('home.pillars.monetization.description'),
    },
  ]

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
      <section className="mx-auto w-full max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30">
          <div className="grid items-center gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <div className="order-2 flex flex-col text-left lg:order-1">
              <div className="inline-flex w-fit items-center rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
                {t('home.badge')}
              </div>

              <div className="mt-5">
                <Image
                  src="/logo.png"
                  alt="EntreUS"
                  width={420}
                  height={180}
                  priority
                  className="h-auto w-auto max-w-[220px] sm:max-w-[300px]"
                />
              </div>

              <h1 className="mt-6 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
                {t('home.title')}
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
                {t('home.description')}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {pillars.map((pillar) => (
                  <div
                    key={pillar.title}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 ring-1 ring-white/5"
                  >
                    <p className="text-sm font-black text-white">{pillar.title}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{pillar.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-black transition hover:opacity-90"
                >
                  {t('home.ctaPrimary')}
                </Link>

                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-700 px-6 text-sm font-bold text-white transition hover:bg-zinc-900"
                >
                  {t('home.ctaSecondary')}
                </Link>

                <Link
                  href="/creators"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 px-6 text-sm font-bold text-blue-100 transition hover:bg-blue-500/20"
                >
                  {t('home.ctaExplore')}
                </Link>
              </div>

              <div className="mt-6 rounded-3xl border border-zinc-800 bg-black/40 p-4 text-sm leading-6 text-zinc-400">
                <p className="font-bold text-zinc-200">{t('home.guidance.title')}</p>
                <p className="mt-2">{t('home.guidance.description')}</p>
              </div>
            </div>

            <div className="order-1 flex justify-center lg:order-2">
              <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-zinc-800 bg-black shadow-2xl">
                <video
                  className="aspect-[4/5] w-full object-cover sm:aspect-[16/10]"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/logo.png"
                >
                  <source src="/intro.mp4" type="video/mp4" />
                  {t('home.videoFallback')}
                </video>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
