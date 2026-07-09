import type { ComposerSummaryItem } from '@/lib/post-composer-ux'

type ComposerPublishSummaryProps = {
  items: ComposerSummaryItem[]
}

export default function ComposerPublishSummary({ items }: ComposerPublishSummaryProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/70">
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate font-bold text-zinc-500 dark:text-zinc-400">{item.label}</dt>
            <dd className="mt-0.5 truncate font-black text-zinc-900 dark:text-zinc-100">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
