'use client'

import { useEffect, useRef, useState } from 'react'
import { decodeAudioClip } from '@/lib/video-editor/audio-clips'
import { verifyLibraryFile, type AudioCategory, type AudioLicenseInfo, type LocalLibraryAsset } from '@/lib/video-editor/audio-library'

export default function LocalAudioLibrary({ assets, disabled, projectId, timelinePlaying, onImport, onAdd, onReassociate, onPreviewStart, onLicenseChange }: {
  assets: LocalLibraryAsset[]; disabled: boolean; projectId: string; timelinePlaying: boolean
  onImport: (files: File[], category: AudioCategory) => void
  onAdd: (asset: LocalLibraryAsset) => void
  onReassociate: (asset: LocalLibraryAsset, file: File) => void
  onLicenseChange: (asset: LocalLibraryAsset, info: AudioLicenseInfo) => void
  onPreviewStart: () => void
}) {
  const [category, setCategory] = useState<AudioCategory>('music')
  const [query, setQuery] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [failedId, setFailedId] = useState<string | null>(null)
  const preview = useRef<{ audio: HTMLAudioElement; url: string } | null>(null)
  const operation = useRef(0)
  const stop = () => {
    operation.current++
    if (preview.current) { preview.current.audio.pause(); URL.revokeObjectURL(preview.current.url); preview.current = null }
    setPlayingId(null)
  }
  useEffect(() => {
    const ref = preview
    const token = operation
    return () => { token.current++; if (ref.current) { ref.current.audio.pause(); URL.revokeObjectURL(ref.current.url); ref.current = null } }
  }, [projectId])
  useEffect(() => {
    if (!timelinePlaying || !preview.current) return
    operation.current++
    preview.current.audio.pause(); URL.revokeObjectURL(preview.current.url); preview.current = null
    const timer = window.setTimeout(() => setPlayingId(null), 0)
    return () => window.clearTimeout(timer)
  }, [timelinePlaying])
  const visible = assets.filter((asset) => asset.category === category && asset.media.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR').trim()))
  async function play(asset: LocalLibraryAsset) {
    if (playingId === asset.assetId) { stop(); return }
    stop(); const token = operation.current
    try {
      if (!asset.file || !await verifyLibraryFile(asset)) throw new Error('Arquivo ausente ou alterado. Reassocie o áudio.')
      await decodeAudioClip(asset.file)
      if (operation.current !== token) return
      onPreviewStart()
      const url = URL.createObjectURL(asset.file), audio = new Audio(url)
      preview.current = { audio, url }
      audio.onended = stop
      await audio.play()
      if (operation.current === token) { setMessage(''); setFailedId(null); setPlayingId(asset.assetId) }
    } catch (error) {
      if (operation.current === token) { stop(); setFailedId(asset.assetId); setMessage(error instanceof Error ? error.message : 'Não foi possível reproduzir o áudio.') }
    }
  }
  return <section aria-label="Biblioteca de áudio local" className="space-y-3 rounded-xl border border-white/15 bg-white/[0.03] p-3 text-xs">
    <div><p className="text-sm font-black">Biblioteca de áudio</p><p className="text-zinc-400">Arquivos deste projeto, salvos neste navegador.</p></div>
    <details className="rounded-lg border border-white/10 p-3 text-zinc-300">
      <summary className="cursor-pointer font-bold text-white">Encontrar músicas e efeitos gratuitos</summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a href="https://pixabay.com/music/" target="_blank" rel="noopener noreferrer" className="underline">Pixabay Music (abre em nova aba)</a>
          <a href="https://pixabay.com/sound-effects/" target="_blank" rel="noopener noreferrer" className="underline">Pixabay Sound Effects (abre em nova aba)</a>
        </div>
        <p>Encontre o áudio no site externo, confira a licença e as restrições, baixe-o diretamente da fonte e volte ao EntreUS Studio para importá-lo na biblioteca abaixo.</p>
        <p>O uso depende da licença do arquivo escolhido: confira a origem e os direitos. O EntreUS não fornece nem redistribui esses arquivos automaticamente. Não use mídias Pixabay em contextos proibidos pela licença correspondente.</p>
      </div>
    </details>
    <div role="tablist" aria-label="Categorias da biblioteca" className="flex flex-wrap gap-2">
      <button type="button" role="tab" aria-selected={category === 'music'} onClick={() => { stop(); setCategory('music') }} className={`rounded-lg px-3 py-2 font-bold ${category === 'music' ? 'bg-emerald-300 text-zinc-950' : 'bg-white/10'}`}>Músicas</button>
      <button type="button" role="tab" aria-selected={category === 'effect'} onClick={() => { stop(); setCategory('effect') }} className={`rounded-lg px-3 py-2 font-bold ${category === 'effect' ? 'bg-emerald-300 text-zinc-950' : 'bg-white/10'}`}>Efeitos sonoros</button>
    </div>
    <label className="block">Buscar por nome<input aria-label="Buscar áudio na biblioteca" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" /></label>
    <label className="block font-bold">Importar {category === 'music' ? 'músicas' : 'efeitos'} (MP3/WAV)
      <input aria-label="Importar para biblioteca" type="file" multiple accept=".mp3,.wav" disabled={disabled} onChange={(event) => { onImport(Array.from(event.target.files || []), category); event.target.value = '' }} className="mt-2 block w-full" />
    </label>
    {message && <p role="status" className="text-amber-200">{message}</p>}
    {visible.length === 0 && <p className="text-zinc-400">{query ? 'Nenhum áudio encontrado para esta busca.' : 'Nenhum arquivo nesta categoria. Importe um áudio para começar.'}</p>}
    {visible.map((asset) => <div key={`${asset.category}:${asset.assetId}`} data-testid="local-audio-asset" data-asset-id={asset.assetId} className="space-y-2 rounded-lg border border-white/10 bg-zinc-950/50 p-2">
      <p className="break-all font-bold">{asset.media.name}</p><p className="text-zinc-400">{Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}</p>
      {(!asset.file || failedId === asset.assetId) && <label className="block text-amber-200">Arquivo indisponível. Reassocie o áudio.
        <input type="file" accept=".mp3,.wav" aria-label={`Reassociar biblioteca ${asset.media.name}`} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) { onReassociate(asset, file); setFailedId(null) }; event.target.value = '' }} />
      </label>}
      <details className="text-zinc-300">
        <summary className="cursor-pointer">Origem e licença (opcional)</summary>
        <div className="mt-2 grid gap-2">
          {([['source', 'Fonte do áudio'], ['creator', 'Autor ou criador'], ['originalUrl', 'Link original'], ['license', 'Licença ou observação']] as const).map(([key, label]) => <label key={key} className="block">{label}
            <input type={key === 'originalUrl' ? 'url' : 'text'} maxLength={500} disabled={disabled} value={asset.licenseInfo?.[key] || ''} onChange={(event) => onLicenseChange(asset, { ...asset.licenseInfo, [key]: event.target.value })} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" />
          </label>)}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !asset.file} aria-label={`${playingId === asset.assetId ? 'Pausar prévia' : 'Ouvir prévia'} ${asset.media.name}`} onClick={() => void play(asset)} className="rounded-lg bg-white/10 px-2 py-1.5">{playingId === asset.assetId ? 'Pausar' : 'Ouvir'}</button>
        <button type="button" disabled={disabled || !asset.file} aria-label={`Adicionar à timeline ${asset.media.name}`} onClick={() => { stop(); onAdd(asset) }} className="rounded-lg bg-emerald-300 px-2 py-1.5 font-bold text-zinc-950">Adicionar</button>
      </div>
    </div>)}
  </section>
}
