'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Clock3, Flame, Globe2, Heart, Music2, Pause, Play, Search } from 'lucide-react'
import { createEditorMusicFile, EDITOR_MUSIC_TRACKS, EditorMusicTrack } from '@/lib/editor-music'

type MusicTab = 'trending' | 'favorites' | 'recent' | 'brasil' | 'global'

const tabs = [
  { id: 'trending' as const, label: 'Em alta', Icon: Flame },
  { id: 'favorites' as const, label: 'Favoritos', Icon: Heart },
  { id: 'recent' as const, label: 'Recentes', Icon: Clock3 },
  { id: 'brasil' as const, label: 'Brasil', Icon: Music2 },
  { id: 'global' as const, label: 'Global', Icon: Globe2 },
]

function readSavedIds(key: string) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(saved) ? saved.filter((id: unknown): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // Browser storage is optional; the current editing session still works.
  }
}

type MusicLibraryProps = {
  selectedId: string | null
  onUse: (file: File, track: EditorMusicTrack) => void
}

export default function MusicLibrary({ selectedId, onUse }: MusicLibraryProps) {
  const [tab, setTab] = useState<MusicTab>('trending')
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFavorites(readSavedIds('entreus-editor-music-favorites'))
      setRecent(readSavedIds('entreus-editor-music-recent'))
    }, 0)
    return () => {
      window.clearTimeout(timer)
      previewRef.current?.pause()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const visibleTracks = EDITOR_MUSIC_TRACKS.filter((track) => {
    const matchesTab = tab === 'trending' ||
      (tab === 'favorites' && favorites.includes(track.id)) ||
      (tab === 'recent' && recent.includes(track.id)) ||
      (tab === 'brasil' && track.region === 'Brasil') ||
      (tab === 'global' && track.region === 'Global')
    const matchesQuery = `${track.title} ${track.artist}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))
    return matchesTab && matchesQuery
  })

  function stopPreview() {
    previewRef.current?.pause()
    previewRef.current = null
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewId(null)
  }

  function togglePreview(track: EditorMusicTrack) {
    if (previewId === track.id) {
      stopPreview()
      return
    }
    stopPreview()
    const url = URL.createObjectURL(createEditorMusicFile(track))
    const audio = new Audio(url)
    previewRef.current = audio
    previewUrlRef.current = url
    audio.onended = stopPreview
    audio.play().then(() => {
      if (previewRef.current === audio) setPreviewId(track.id)
    }).catch(() => {
      if (previewRef.current === audio) stopPreview()
    })
  }

  function selectTrack(track: EditorMusicTrack) {
    stopPreview()
    onUse(createEditorMusicFile(track), track)
    const next = [track.id, ...recent.filter((id) => id !== track.id)].slice(0, 5)
    setRecent(next)
    saveIds('entreus-editor-music-recent', next)
  }

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]
    setFavorites(next)
    saveIds('entreus-editor-music-favorites', next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black tracking-tight text-white">Músicas grátis</p>
          <p className="text-[11px] font-medium text-zinc-400">Trilhas originais EntreUS</p>
        </div>
        <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black text-emerald-200">LIVRE</span>
      </div>

      <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 text-zinc-400 focus-within:border-sky-400/60">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar música"
          aria-label="Buscar música"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categorias de música">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition ${
              tab === id ? 'bg-white text-zinc-950 shadow-lg shadow-white/10' : 'bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" fill={id === 'favorites' && tab === id ? 'currentColor' : 'none'} />
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto pr-1 lg:max-h-72">
        {visibleTracks.map((track) => (
          <div key={track.id} className={`flex items-center gap-2.5 rounded-2xl border p-2 transition ${selectedId === track.id ? 'border-sky-300/60 bg-sky-400/10' : 'border-white/10 bg-white/[0.04]'}`}>
            <div className={`relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br ${track.colors}`} aria-hidden="true">
              <div className="absolute inset-x-1 bottom-1 flex h-4 items-end justify-center gap-0.5 opacity-70">
                {[5, 11, 7, 14, 9, 12, 6].map((height, bar) => <span key={bar} className="w-0.5 rounded-full bg-white" style={{ height }} />)}
              </div>
              <Music2 className="relative -mt-1 h-5 w-5 text-white drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-white">{track.title}</p>
              <p className="truncate text-[11px] text-zinc-400">{track.artist} · 0:{String(track.duration).padStart(2, '0')}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleFavorite(track.id)}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${favorites.includes(track.id) ? 'text-rose-400' : 'text-zinc-500 hover:text-rose-300'}`}
              aria-label={favorites.includes(track.id) ? `Remover ${track.title} dos favoritos` : `Favoritar ${track.title}`}
            >
              <Heart className="h-4 w-4" fill={favorites.includes(track.id) ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={() => togglePreview(track)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label={previewId === track.id ? `Pausar ${track.title}` : `Ouvir ${track.title}`}
            >
              {previewId === track.id ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => selectTrack(track)}
              className={`h-8 shrink-0 rounded-full px-3 text-[11px] font-black transition ${selectedId === track.id ? 'bg-sky-400 text-sky-950' : 'bg-white text-zinc-950 hover:bg-sky-100'}`}
              aria-label={`Usar ${track.title}`}
            >
              {selectedId === track.id ? <Check className="mx-auto h-4 w-4" /> : 'Usar'}
            </button>
          </div>
        ))}
        {visibleTracks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-zinc-400">
            {query ? 'Nenhuma música encontrada.' : tab === 'favorites' ? 'Toque no coração para salvar músicas.' : 'As músicas usadas aparecem aqui.'}
          </div>
        )}
      </div>
    </div>
  )
}
