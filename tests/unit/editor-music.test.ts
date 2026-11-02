import { describe, expect, it } from 'vitest'
import { createEditorMusicFile, EDITOR_MUSIC_TRACKS } from '@/lib/editor-music'

describe('editor music library', () => {
  it('creates playable PCM WAV files for every included track', async () => {
    for (const track of EDITOR_MUSIC_TRACKS) {
      const file = createEditorMusicFile(track)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const header = new DataView(bytes.buffer)

      expect(file.type).toBe('audio/wav')
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
      expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
      expect(header.getUint16(20, true)).toBe(1)
      expect(header.getUint16(22, true)).toBe(1)
      expect(header.getUint32(24, true)).toBe(16000)
      expect(header.getUint32(40, true)).toBe(track.duration * 16000 * 2)
      expect(bytes.some((value, index) => index > 44 && value !== 0)).toBe(true)
    }
  })
})
