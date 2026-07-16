'use client'
import { SmilePlus } from 'lucide-react'
export default function ExpressionTrigger({ onClick, expanded = false }: { onClick: () => void; expanded?: boolean }) {
  return <button type="button" onClick={onClick} aria-label="Abrir emojis, GIFs e stickers" aria-expanded={expanded} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:bg-zinc-800"><SmilePlus className="h-5 w-5" /></button>
}
