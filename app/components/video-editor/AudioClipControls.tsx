'use client'

import { audioClipTiming, type LocalAudioClip } from '@/lib/video-editor/audio-clips'

export default function AudioClipControls({ clips, selected, duration, disabled, onSelect, onChange, onRemove, onImport, onReassociate }: {
  clips: LocalAudioClip[]; selected: string | null; duration: number; disabled: boolean
  onSelect: (id: string) => void
  onChange: (id: string, changes: Partial<Pick<LocalAudioClip, 'startTime' | 'trimStart' | 'trimEnd' | 'volume' | 'muted' | 'fadeIn' | 'fadeOut'>>) => void
  onRemove: (id: string) => void
  onImport: (files: File[]) => void
  onReassociate: (id: string, file: File) => void
}) {
  return <section aria-label="Faixas de áudio independentes" className="space-y-3 rounded-xl border border-emerald-300/20 p-3 text-xs">
    <label className="block font-bold">Adicionar faixas de áudio (MP3/WAV)
      <input type="file" multiple accept=".mp3,.wav" aria-label="Adicionar faixas de áudio" disabled={disabled} onChange={(event) => { onImport(Array.from(event.target.files || [])); event.target.value = '' }} className="mt-2 block w-full" />
    </label>
    {clips.map((clip) => <div key={clip.id} data-testid="audio-clip-controls" data-audio-id={clip.id} className={`space-y-2 rounded-lg border p-2 ${selected === clip.id ? 'border-emerald-300' : 'border-white/15'}`}>
      <button type="button" onClick={() => onSelect(clip.id)} aria-pressed={selected === clip.id} className="font-bold">{clip.media.name}</button>
      {!clip.file && <label className="block text-amber-200">Arquivo local ausente. Reassocie MP3/WAV.
        <input type="file" accept=".mp3,.wav" aria-label={`Reassociar áudio ${clip.media.name}`} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onReassociate(clip.id, file); event.target.value = '' }} />
      </label>}
      <label className="block">Início (s)<input aria-label={`Início do áudio ${clip.media.name}`} type="number" min="0" max={duration} step="0.1" value={clip.startTime} disabled={disabled} onChange={(event) => onChange(clip.id, { startTime: Math.min(duration, Math.max(0, Number(event.target.value) || 0)) })} className="ml-2 w-20 rounded bg-zinc-950 p-1" /></label>
      <label className="block">Duração (s)<input aria-label={`Duração do áudio ${clip.media.name}`} type="number" min="0.05" max={clip.sourceDuration - clip.trimStart} step="0.05" value={Number((clip.trimEnd - clip.trimStart).toFixed(3))} disabled={disabled} onChange={(event) => onChange(clip.id, { trimEnd: clip.trimStart + Math.min(clip.sourceDuration - clip.trimStart, Math.max(0.05, Number(event.target.value) || 0.05)) })} className="ml-2 w-20 rounded bg-zinc-950 p-1" /></label>
      <label className="block">Volume {Math.round(clip.volume * 100)}%<input aria-label={`Volume do áudio ${clip.media.name}`} type="range" min="0" max="1" step="0.01" value={clip.volume} disabled={disabled} onChange={(event) => onChange(clip.id, { volume: Number(event.target.value) })} className="block w-full accent-emerald-400" /></label>
      {selected === clip.id && <div className="space-y-2 rounded bg-white/5 p-2">
        {(['fadeIn', 'fadeOut'] as const).map((field) => {
          const timing = audioClipTiming(clip, duration)
          const label = field === 'fadeIn' ? 'Fade-in' : 'Fade-out'
          return <label key={field} className="flex flex-wrap items-center justify-between gap-2">{label} (s)
            <input aria-label={`${label} do áudio ${clip.media.name}`} type="number" min="0" max={Math.max(0, timing.trimEnd - timing.trimStart)} step="0.1" value={Number(timing[field].toFixed(3))} disabled={disabled}
              onChange={(event) => onChange(clip.id, { [field]: Number(event.target.value) || 0 })} className="w-20 rounded bg-zinc-950 p-1" />
          </label>
        })}
        <p className="text-zinc-400">0 desativa. Na sobreposição, as rampas são combinadas sem aumentar o volume.</p>
      </div>}
      <button type="button" disabled={disabled} aria-label={`${clip.muted ? 'Ativar' : 'Silenciar'} áudio ${clip.media.name}`} onClick={() => onChange(clip.id, { muted: !clip.muted })} className="mr-2 rounded bg-white/10 p-2">{clip.muted ? 'Ativar som' : 'Silenciar'}</button>
      <button type="button" disabled={disabled} aria-label={`Excluir áudio ${clip.media.name}`} onClick={() => onRemove(clip.id)} className="rounded bg-red-500/20 p-2">Excluir áudio</button>
    </div>)}
    {clips.length > 0 && <p className="text-zinc-400">Os trechos são limitados ao fim do projeto. Arquivos salvos apenas neste navegador.</p>}
  </section>
}
