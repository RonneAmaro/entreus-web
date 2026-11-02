'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import { generateAutoReels, type AutoReelsOptions, type AutoReelsMedia, type AutoReelsProposal } from '@/lib/video-editor/auto-reels'
import type { RhythmPreparation } from '@/lib/video-editor/auto-reels-rhythm-session'

type MusicChoice = { key: string; name: string; duration: number }
export default function AutoReelsPanel({ media, music, startTime, revision, slots, disabled, unavailable = [], onApply, onAnalyze }: {
  media: AutoReelsMedia[]; music: MusicChoice[]; startTime: number; revision: string; slots: number; disabled: boolean
  unavailable?: string[]
  onApply: (proposal: AutoReelsProposal, revision: string, musicKey: string, rhythmToken?: string) => Promise<void>
  onAnalyze: (ids: string[], format: AutoReelsOptions['format'], seconds: number, musicKey: string, signal: AbortSignal) => Promise<RhythmPreparation>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [format, setFormat] = useState<AutoReelsOptions['format']>('9:16')
  const [timing, setTiming] = useState<AutoReelsOptions['timing']>('per-photo')
  const [seconds, setSeconds] = useState('3')
  const [musicKey, setMusicKey] = useState('')
  const [draft, setDraft] = useState<{ proposal: AutoReelsProposal; revision: string; kind: 'regular' | 'synchronized' | 'fallback'; token?: string } | null>(null)
  const [rhythmic, setRhythmic] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const operation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const durationHintId = useId()
  const musicHintId = useId()
  const selectionHintId = useId()
  const mounted = useRef(true)
  const dragSource = useRef<string | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => () => { controller.current?.abort() }, [revision])
  const [message, setMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const inputClass = 'mt-1 w-full rounded-lg bg-zinc-950 p-2'
  const chosenMedia = media.filter((item) => selected.includes(item.id))
  const photoCount = chosenMedia.filter((item) => item.type !== 'video').length
  const videoDuration = chosenMedia.reduce((sum, item) => sum + (item.type === 'video' ? item.trimEnd - item.trimStart : 0), 0)
  const blockedReason = disabled ? 'Aguarde a operação atual do editor.' : slots <= 0 ? 'A timeline está no limite. Remova um clipe antes de inserir uma montagem.' : !media.length ? 'Importe ou reassocie fotos e vídeos para começar.' : !selected.length ? 'Selecione ao menos uma foto ou vídeo para gerar a proposta.' : selected.some((id) => !media.some((item) => item.id === id)) ? 'Uma mídia ficou indisponível. Remova-a da seleção e reassocie o arquivo original.' : selected.length > slots ? `Selecione no máximo ${slots} itens para o espaço disponível.` : rhythmic && !musicKey ? 'Escolha uma música para liberar a análise sincronizada.' : ''
  function reorder(id: string, target: string) {
    if (id === target || !selected.includes(id) || !selected.includes(target)) return
    change(); setSelected((current) => { const next = current.filter((item) => item !== id); next.splice(current.indexOf(target), 0, id); return next })
    setMessage('Ordem da montagem atualizada.')
  }
  function change() { operation.current++; controller.current?.abort(); controller.current = null; setAnalyzing(false); setDraft(null); setMessage('') }
  function returnFocusToGenerate() { requestAnimationFrame(() => generateButtonRef.current?.focus()) }
  async function generate() {
    change()
    const current = operation.current
    try {
      if (blockedReason) throw new Error(blockedReason)
      const chosen = selected.map((id) => media.find((item) => item.id === id))
      if (chosen.some((item) => !item)) throw new Error('Uma mídia ficou indisponível. Selecione novamente.')
      if (rhythmic) {
        if (!musicKey) throw new Error('Selecione uma música da biblioteca para sincronizar.')
        const abort = new AbortController(); controller.current = abort; setAnalyzing(true)
        const prepared = await onAnalyze([...selected], format, Number(seconds), musicKey, abort.signal)
        if (!mounted.current || current !== operation.current || abort.signal.aborted) return
        setDraft({ proposal: prepared.result.proposal, revision, kind: prepared.result.kind, token: prepared.token })
        setMessage(prepared.result.kind === 'fallback' ? '' : 'Proposta pronta para revisão. Confira os detalhes antes de inserir.')
      } else {
        const proposal = generateAutoReels(chosen as AutoReelsMedia[], { format, timing, seconds: Number(seconds) })
        setDraft({ proposal, revision, kind: 'regular' })
        setMessage('Proposta pronta para revisão. Confira os detalhes antes de inserir.')
      }
    } catch (error) { if (mounted.current && current === operation.current) setMessage(controller.current?.signal.aborted ? 'Análise cancelada. Gere outra proposta.' : error instanceof Error ? error.message : 'Não foi possível gerar a proposta.') }
    finally { if (mounted.current && current === operation.current) setAnalyzing(false) }
  }
  async function apply() {
    if (!draft || applying || draft.revision !== revision) return
    setApplying(true); setMessage('')
    try {
      await onApply(draft.proposal, draft.revision, musicKey, draft.token)
      setDraft(null); setSelected([]); setMessage('Montagem inserida ao final da timeline. Continue editando pelos controles habituais.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'A montagem não foi aplicada.') }
    finally { setApplying(false) }
  }
  return <details className="rounded-xl border border-sky-300/20 bg-sky-500/5 p-3 text-sm">
    <summary className="cursor-pointer font-black text-sky-100">AutoReels</summary>
    <section aria-label="Montagem AutoReels" className="mt-2 space-y-2">
      <p className="text-zinc-300">Selecione, ordene e gere uma proposta para inserir ao final. Os clipes atuais serão mantidos; o formato vale para todo o projeto.</p>
      {unavailable.length > 0 && <p className="rounded-lg border border-amber-300/40 bg-zinc-950 p-2 text-amber-100">Arquivos indisponíveis para a montagem: {unavailable.join(', ')}. Use “Escolher arquivo original” na biblioteca para reassociar; nenhum arquivo será substituído.</p>}
      <fieldset disabled={disabled || applying || analyzing} aria-describedby={blockedReason ? selectionHintId : undefined} className="min-w-0 space-y-2 disabled:opacity-60">
        <legend className="font-bold">Selecionar fotos e vídeos</legend>
        {media.length === 0 && <p className="text-zinc-400">Importe fotos JPG/PNG ou vídeos e aguarde a leitura, ou reassocie os arquivos ausentes.</p>}
        <div aria-label="Galeria de mídias AutoReels" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-2">
          {media.map((item) => { const index = selected.indexOf(item.id); const type = item.type === 'video' ? `Vídeo · ${(item.trimEnd - item.trimStart).toFixed(2)} s` : 'Foto'
            return <div key={item.id} data-autoreels-media={item.id} draggable={index >= 0 && !disabled && !applying && !analyzing}
              onDragStart={(event) => { dragSource.current = item.id; event.dataTransfer.setData('application/x-entreus-autoreels', item.id); event.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => { dragSource.current = null }}
              onDragOver={(event) => { if (dragSource.current && index >= 0) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled && !applying && !analyzing && dragSource.current) reorder(dragSource.current, item.id); dragSource.current = null }}
              className={`relative min-w-0 overflow-hidden rounded-lg border-2 ${index >= 0 ? 'border-sky-300 bg-sky-950' : 'border-zinc-600 bg-zinc-950'}`}>
              <label className="relative block cursor-pointer p-1.5 focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-white">
                <span className="relative block aspect-video overflow-hidden rounded bg-zinc-900">
                  {item.type === 'video' ? <video src={item.previewUrl} preload="metadata" muted playsInline aria-hidden="true" draggable={false} className="h-full w-full object-cover" /> : <Image unoptimized src={item.previewUrl} alt="" draggable={false} fill sizes="160px" className="object-cover" />}
                  {index >= 0 && <span aria-hidden="true" className="absolute left-1 top-1 rounded bg-sky-300 px-1.5 py-0.5 font-bold text-slate-950">✓ {index + 1}</span>}
                </span>
                <span className="mt-1 flex items-start gap-1"><input className="mt-0.5 shrink-0 accent-sky-300" type="checkbox" checked={index >= 0} onChange={(event) => { change(); setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)) }} /><span className="min-w-0"><span className="block truncate" title={item.name}>{item.name}</span><span className="block text-[10px] text-zinc-300">({type})</span></span></span>
              </label>
              {index >= 0 && <button type="button" aria-label={`Remover ${item.name} da seleção`} onClick={() => { change(); setSelected((current) => current.filter((id) => id !== item.id)) }} className="absolute right-1 top-1 min-h-8 min-w-8 rounded bg-zinc-950 font-bold text-white focus-visible:outline-2 focus-visible:outline-sky-200">×</button>}
            </div>
          })}
        </div>
        {selected.length > 0 && <>
          <p className="text-zinc-300">Arraste para ordenar ou use as setas.</p>
          <ol aria-label="Ordem da montagem" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-1">{selected.map((id, index) => <li key={id} className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate">{index + 1}. {media.find((item) => item.id === id)?.name || 'Mídia indisponível'}</span>
            {([-1, 1] as const).map((direction) => <button key={direction} type="button" aria-label={`${direction === -1 ? 'Subir' : 'Descer'} ${media.find((item) => item.id === id)?.type === 'video' ? 'vídeo' : 'foto'} ${index + 1}`} disabled={index + direction < 0 || index + direction >= selected.length} onClick={() => reorder(id, selected[index + direction])} className="min-h-8 min-w-8 rounded bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-200 disabled:opacity-30">{direction === -1 ? '↑' : '↓'}</button>)}
            {!media.some((item) => item.id === id) && <button type="button" aria-label="Remover mídia indisponível da seleção" onClick={() => { change(); setSelected((current) => current.filter((item) => item !== id)) }} className="min-h-8 min-w-8 rounded bg-white/10">×</button>}
          </li>)}</ol>
          <button type="button" onClick={() => { change(); setSelected([]); setMessage('Seleção limpa. Os arquivos da biblioteca e a timeline foram preservados.') }} className="min-h-8 rounded bg-white/10 px-2 focus-visible:outline-2 focus-visible:outline-sky-200">Limpar seleção</button>
        </>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-2">
        <label className="block">Formato AutoReels<select value={format} onChange={(event) => { change(); setFormat(event.target.value as AutoReelsOptions['format']) }} className={inputClass}>
          <option value="9:16">Vertical (9:16)</option><option value="16:9">Horizontal (16:9)</option>
        </select></label>
        <label className="block">Definir duração<select disabled={rhythmic} value={timing} onChange={(event) => { change(); setTiming(event.target.value as AutoReelsOptions['timing']) }} className={inputClass}>
          <option value="per-photo">Por imagem</option><option value="total">Total da montagem</option>
        </select></label>
        <label className="block">{timing === 'total' ? 'Duração total (s)' : 'Duração por imagem (s)'}<input type="number" aria-describedby={durationHintId} min={rhythmic ? Math.max(0.5, photoCount + (chosenMedia.length - photoCount) * 0.5) : timing === 'total' ? Math.max(1, videoDuration + photoCount) : 1} max={rhythmic ? 60 : timing === 'total' ? Math.max(1, videoDuration + photoCount * 8) : 8} step="0.1" value={seconds} onChange={(event) => { change(); setSeconds(event.target.value) }} className={inputClass} /></label>
        <label className="block">Música da biblioteca<select aria-required={rhythmic || undefined} aria-describedby={rhythmic ? musicHintId : undefined} value={musicKey} onChange={(event) => { change(); setMusicKey(event.target.value) }} className={inputClass}>
          <option value="">Sem música adicional</option>{music.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}
        </select></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={rhythmic} onChange={(event) => { change(); setRhythmic(event.target.checked); if (event.target.checked) setTiming('total') }} />Sincronizar cortes com a música</label>
        {blockedReason && <p id={selectionHintId} className="rounded border border-sky-300/30 bg-zinc-950 p-2 text-zinc-100">{blockedReason}</p>}
        {rhythmic && <p id={musicHintId} className="text-zinc-300">{musicKey ? 'Uma música da biblioteca é necessária para analisar o ritmo.' : 'Selecione uma música da biblioteca para analisar o ritmo.'}</p>}
        <button ref={generateButtonRef} type="button" aria-describedby={blockedReason ? selectionHintId : undefined} onClick={() => void generate()} disabled={Boolean(blockedReason)} className="w-full rounded-lg bg-sky-300 px-3 py-2 font-bold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200 disabled:opacity-40">{rhythmic ? 'Analisar música e gerar proposta' : 'Gerar proposta'}</button>
        <p id={durationHintId} className="text-zinc-400">{rhythmic ? 'Eventos rítmicos aproximados, sem garantia de BPM. Fotos: 1–8 s. Vídeos: mínimo de 0,5 s; alguns poderão ser encurtados a partir do início do recorte. Música: até 60 s e 10 MiB, com limite estimado de memória de 100 MiB.' : 'De 1 a 8 segundos por foto. Os vídeos mantêm seus recortes; o tempo restante do total é distribuído entre as fotos. Com apenas vídeos, o total é a soma dos trechos.'}</p>
        <p className="text-zinc-400">Limite AutoReels: 10 itens na timeline, incluindo os atuais. Espaço disponível: {slots} novos clipes.</p>
        <p className="text-zinc-400">Vídeos selecionados de até 25 MB podem ser recuperados localmente. Arquivos maiores ou falhas de armazenamento exigem reassociação ao reabrir.</p>
        {draft && <div aria-label="Proposta AutoReels" role="region" className="space-y-2 rounded-lg border border-sky-200/30 p-2">
          <p>{draft.proposal.clips.length} clipes · {draft.proposal.duration.toFixed(2)} s · {draft.proposal.format}</p>
          {draft.kind === 'synchronized' && <p className="text-emerald-200">Proposta sincronizada com eventos rítmicos aproximados. Vídeos poderão ter seu fim encurtado.</p>}
          {draft.kind === 'fallback' && <p role="alert" className="text-amber-200">Não foi possível sincronizar com os eventos disponíveis. Alternativa regular, sem sincronização musical. Confirme apenas se desejar esta alternativa.</p>}
          <p>{draft.proposal.photoCount} foto(s) e {draft.proposal.videoCount} vídeo(s). Duração resultante: {draft.proposal.duration.toFixed(2)} s{draft.kind === 'synchronized' ? '.' : ', preservando os trechos de vídeo.'}</p>
          {draft.kind === 'synchronized' && <ol aria-label="Tempos da montagem">{draft.proposal.clips.map((clip) => <li key={clip.id}>{clip.name}: {clip.startTime.toFixed(3)}–{clip.endTime.toFixed(3)} s · duração {clip.duration.toFixed(3)} s{clip.type === 'video' ? ` · recorte ${clip.trimStart!.toFixed(3)}–${clip.trimEnd!.toFixed(3)} s` : ''}</li>)}</ol>}
          <p>Inserir em {startTime.toFixed(2)} s. O formato de todo o projeto será {draft.proposal.format}; as camadas visuais serão reenquadradas.</p>
          {musicKey && <p>A música será limitada a {Math.min(music.find((asset) => asset.key === musicKey)?.duration || 0, draft.proposal.duration).toFixed(2)} s, sem repetição automática.</p>}
          {draft.revision !== revision && <p role="alert">O projeto mudou. Gere outra proposta antes de aplicar.</p>}
          <button type="button" onClick={() => void apply()} disabled={draft.revision !== revision} className="w-full rounded-lg bg-emerald-300 p-2 font-bold text-zinc-950 disabled:opacity-40">{draft.kind === 'fallback' ? 'Confirmar alternativa regular e inserir ao final' : 'Confirmar e inserir ao final'}</button>
          <button type="button" onClick={() => { change(); setMessage('Proposta cancelada. O projeto foi preservado.'); returnFocusToGenerate() }} className="w-full rounded-lg bg-white/10 p-2">Cancelar proposta</button>
        </div>}
      </fieldset>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sky-100">{analyzing ? 'Preparando os arquivos e analisando a música neste dispositivo… Isso pode levar alguns instantes.' : message}</p>
      {analyzing && <button type="button" onClick={() => { change(); setMessage('Análise cancelada. O projeto foi preservado.'); returnFocusToGenerate() }} className="rounded bg-white/10 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200">Cancelar análise</button>}
    </section>
  </details>
}
