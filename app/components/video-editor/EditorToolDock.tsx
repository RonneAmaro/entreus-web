'use client'

import { AudioLines, Captions, Clapperboard, SlidersHorizontal, SmilePlus, Sparkles, Type, Workflow } from 'lucide-react'

export type EditorTool = 'edit' | 'sound' | 'text' | 'effects' | 'transitions' | 'captions' | 'stickers' | 'adjust'

const tools = [
  { id: 'edit' as const, label: 'Mídia', Icon: Clapperboard },
  { id: 'sound' as const, label: 'Áudio', Icon: AudioLines },
  { id: 'text' as const, label: 'Texto', Icon: Type },
  { id: 'effects' as const, label: 'Efeitos', Icon: Sparkles },
  { id: 'stickers' as const, label: 'Stickers', Icon: SmilePlus },
  { id: 'transitions' as const, label: 'Transições', Icon: Workflow },
  { id: 'captions' as const, label: 'Legendas', Icon: Captions },
  { id: 'adjust' as const, label: 'Ajustar', Icon: SlidersHorizontal },
]

export default function EditorToolDock({ active, onSelect }: { active: EditorTool; onSelect: (tool: EditorTool) => void }) {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(44px,1fr))] gap-1 border-b border-white/10 bg-[#11111b]/95 p-1.5" role="toolbar" aria-label="Ferramentas de edição">
      {tools.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={active === id}
          title={label}
          aria-label={label}
          className={`group flex h-11 min-w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
            active === id ? 'bg-gradient-to-br from-sky-400 via-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/25' : 'text-zinc-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={active === id ? 2.5 : 2} />
          <span className="text-[8px] font-extrabold leading-none">{label}</span>
        </button>
      ))}
    </div>
  )
}
