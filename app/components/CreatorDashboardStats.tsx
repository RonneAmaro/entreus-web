import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Circle } from 'lucide-react'
import type { CreatorMetric } from '@/lib/creator-dashboard'

type StatCard = {
  label: string
  metric: CreatorMetric
  icon: LucideIcon
  tone: string
  suffix?: string
  unavailableLabel?: string
}

type ChecklistItem = {
  label: string
  complete: boolean
  description?: string
}

function formatMetric(metric: CreatorMetric, suffix = '') {
  if (!metric.available) return 'Em preparação'
  return `${metric.value.toLocaleString('pt-BR')}${suffix}`
}

export function CreatorDashboardStats({ items }: { items: StatCard[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <article key={item.label} className="rounded-[1.75rem] border border-white/10 bg-zinc-950/90 p-5 shadow-xl shadow-black/20 ring-1 ring-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
                <p className="mt-3 truncate text-2xl font-black text-white">
                  {formatMetric(item.metric, item.suffix)}
                </p>
                {!item.metric.available && item.unavailableLabel && (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">{item.unavailableLabel}</p>
                )}
              </div>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function CreatorChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
          {item.complete ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />
          )}
          <div>
            <p className={`text-sm font-bold ${item.complete ? 'text-zinc-100' : 'text-zinc-400'}`}>{item.label}</p>
            {item.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
