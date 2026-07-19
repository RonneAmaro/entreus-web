import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import InstitutionalPageLayout from '../components/InstitutionalPageLayout'
import { getRequestLocale } from '@/lib/i18n/server'
import { formatCurrency, translate } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'ItaCash',
  description: 'Informações sobre o ItaCash no EntreUS.',
}

export default async function ItaCashPage() {
  const locale = await getRequestLocale()
  const t = translate.bind(null, locale)
  const itacashCards = [
    { title: t('itacash.whatTitle'), body: t('itacash.whatBody') },
    { title: t('itacash.getTitle'), body: t('itacash.getBody') },
    { title: t('itacash.useTitle'), body: t('itacash.useBody') },
    { title: t('itacash.rewardsTitle'), body: t('itacash.rewardsBody') },
  ]
  return (
    <InstitutionalPageLayout
      title="ItaCash"
      description={t('itacash.description')}
      notice={t('itacash.notice')}
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[2rem] border border-blue-300/20 bg-blue-500/10 shadow-2xl shadow-blue-950/20 ring-1 ring-white/10 backdrop-blur-xl">
          <div className="grid gap-5 p-6 sm:grid-cols-[10rem_1fr] sm:items-center">
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-[1.6rem] border border-blue-200/20 bg-black/35 p-4 shadow-2xl shadow-blue-500/10 ring-1 ring-white/10 transition hover:scale-[1.02] sm:mx-0">
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
                {t('itacash.internalCredit')}
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                {t('itacash.economyTitle')}
              </h2>
              <p className="mt-3 text-sm leading-7 text-blue-50/85">
                {t('itacash.economyDescription')}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            [t('itacash.conversion'), t('itacash.conversionValue', { value: formatCurrency(locale, 1, 'BRL') })],
            [t('itacash.supports'), t('itacash.supportsValue')],
            [t('itacash.gifts'), t('itacash.giftsValue')],
          ].map(([title, body]) => (
            <article key={title} className="rounded-[1.5rem] border border-blue-300/15 bg-blue-500/10 p-4 ring-1 ring-blue-400/10 transition hover:-translate-y-0.5 hover:bg-blue-500/15">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200/70">{title}</p>
              <p className="mt-2 text-sm font-bold leading-6 text-blue-50">{body}</p>
            </article>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Link href="/buy-itacash" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5 hover:bg-blue-50 active:scale-95">
            {t('itacash.buy')}
          </Link>
          <Link href="/wallet" className="inline-flex rounded-full border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-50 transition hover:-translate-y-0.5 hover:bg-blue-500/20 active:scale-95">
            {t('itacash.openWallet')}
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          {itacashCards.map((card) => (
            <article
              key={card.title}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20 ring-1 ring-blue-400/10 backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-300/25 hover:bg-blue-500/10"
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
            {t('itacash.futureTitle')}
          </h2>
          <p className="mt-3">
            {t('itacash.futureBody')}
          </p>
        </section>
      </div>
    </InstitutionalPageLayout>
  )
}
