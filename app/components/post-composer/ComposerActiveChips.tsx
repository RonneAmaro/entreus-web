type ComposerActiveChipsProps = {
  chips: string[]
}

export default function ComposerActiveChips({ chips }: ComposerActiveChipsProps) {
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Opcoes avancadas ativas">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}
