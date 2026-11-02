export type EditorMusicTrack = {
  id: string
  title: string
  artist: string
  region: 'Brasil' | 'Global'
  duration: number
  bpm: number
  notes: number[]
  colors: string
}

// Original instrumental loops synthesized in the browser. No external catalog or license is required.
export const EDITOR_MUSIC_TRACKS: EditorMusicTrack[] = [
  { id: 'pulso-verao', title: 'Pulso de verão', artist: 'EntreUS Sounds', region: 'Brasil', duration: 12, bpm: 112, notes: [220, 277.18, 329.63, 440], colors: 'from-orange-400 via-rose-500 to-fuchsia-700' },
  { id: 'luz-cidade', title: 'Luz da cidade', artist: 'EntreUS Sounds', region: 'Global', duration: 12, bpm: 104, notes: [196, 246.94, 293.66, 392], colors: 'from-sky-400 via-blue-600 to-indigo-900' },
  { id: 'brisa-boa', title: 'Brisa boa', artist: 'EntreUS Sounds', region: 'Brasil', duration: 12, bpm: 96, notes: [174.61, 220, 261.63, 349.23], colors: 'from-emerald-300 via-teal-500 to-cyan-800' },
  { id: 'horizonte', title: 'Horizonte', artist: 'EntreUS Sounds', region: 'Global', duration: 12, bpm: 120, notes: [164.81, 207.65, 246.94, 329.63], colors: 'from-violet-400 via-purple-600 to-blue-900' },
  { id: 'noite-azul', title: 'Noite azul', artist: 'EntreUS Sounds', region: 'Global', duration: 12, bpm: 88, notes: [146.83, 185, 220, 293.66], colors: 'from-blue-500 via-indigo-800 to-slate-950' },
]

export function createEditorMusicFile(track: EditorMusicTrack): File {
  const sampleRate = 16000
  const sampleCount = track.duration * sampleRate
  const bytes = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(bytes)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount * 2, true)

  const beatSeconds = 60 / track.bpm
  const noteSeconds = beatSeconds / 2
  const lowNote = track.notes[0] / 2
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const step = Math.floor(time / noteSeconds)
    const note = track.notes[[0, 1, 2, 1, 3, 2, 1, 2][step % 8]]
    const envelope = Math.exp(-((time % noteSeconds) / noteSeconds) * 3)
    const melody = Math.sin(2 * Math.PI * note * time) * envelope * 0.27
    const harmony = Math.sin(2 * Math.PI * track.notes[(Math.floor(time / (beatSeconds * 4)) + 1) % 4] * time) * 0.09
    const bass = Math.sin(2 * Math.PI * lowNote * time) * Math.exp(-((time % beatSeconds) / beatSeconds) * 4) * 0.25
    const kickPhase = time % beatSeconds
    const kick = Math.sin(2 * Math.PI * (58 - kickPhase * 24) * kickPhase) * Math.exp(-kickPhase * 18) * 0.3
    const fade = Math.min(1, time * 5, (track.duration - time) * 5)
    const sample = Math.max(-1, Math.min(1, (melody + harmony + bass + kick) * Math.max(fade, 0)))
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true)
  }

  return new File([bytes], `${track.title}.wav`, { type: 'audio/wav' })
}
