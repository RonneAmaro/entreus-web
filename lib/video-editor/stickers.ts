export type StickerCategory = 'reactions' | 'highlights' | 'animated'

export type StickerAsset = {
  id: string
  label: string
  category: StickerCategory
  frames: readonly string[]
  frameRate?: number
}

export type StickerFrameSource = {
  value: string
  frames?: readonly string[]
  frameRate?: number
  startTime: number
}

export const STICKER_CATEGORIES: ReadonlyArray<{ id: StickerCategory; label: string }> = [
  { id: 'reactions', label: 'Reacoes' },
  { id: 'highlights', label: 'Destaques' },
  { id: 'animated', label: 'Animados quadro a quadro' },
]

export const STICKER_LIBRARY: readonly StickerAsset[] = [
  { id: 'star', label: 'Estrela', category: 'highlights', frames: ['⭐'] },
  { id: 'fire', label: 'Fogo', category: 'highlights', frames: ['🔥'] },
  { id: 'sparkles', label: 'Brilho', category: 'highlights', frames: ['✨'] },
  { id: 'gem', label: 'Diamante', category: 'highlights', frames: ['💎'] },
  { id: 'coin', label: 'Moeda', category: 'highlights', frames: ['🪙'] },
  { id: 'trophy', label: 'Trofeu', category: 'highlights', frames: ['🏆'] },
  { id: 'crown', label: 'Coroa', category: 'highlights', frames: ['👑'] },
  { id: 'rocket', label: 'Foguete', category: 'highlights', frames: ['🚀'] },
  { id: 'heart', label: 'Coracao', category: 'reactions', frames: ['❤️'] },
  { id: 'laugh', label: 'Riso', category: 'reactions', frames: ['😂'] },
  { id: 'clap', label: 'Palmas', category: 'reactions', frames: ['👏'] },
  { id: 'party', label: 'Festa', category: 'reactions', frames: ['🎉'] },
  { id: 'check', label: 'Confirmado', category: 'reactions', frames: ['✅'] },
  { id: 'warning', label: 'Atencao', category: 'reactions', frames: ['⚠️'] },
  { id: 'arrow', label: 'Seta', category: 'reactions', frames: ['➡️'] },
  { id: 'twinkle-loop', label: 'Brilho pulsante', category: 'animated', frames: ['✦', '✧', '✶', '✧'], frameRate: 6 },
  { id: 'heart-loop', label: 'Coracao pulsante', category: 'animated', frames: ['♡', '♥', '♥', '♡'], frameRate: 5 },
  { id: 'orbit-loop', label: 'Orbita', category: 'animated', frames: ['◴', '◷', '◶', '◵'], frameRate: 8 },
]

export function stickerFrames(sticker: Pick<StickerFrameSource, 'value' | 'frames'>): string[] {
  const frames = sticker.frames?.filter((frame) => typeof frame === 'string' && frame.length > 0).slice(0, 12)
  return frames?.length ? [...frames] : [sticker.value]
}

export function stickerFrameRate(sticker: Pick<StickerFrameSource, 'frameRate'>): number {
  return Number.isFinite(sticker.frameRate) ? Math.min(Math.max(Number(sticker.frameRate), 1), 12) : 1
}

export function stickerFrameIndex(sticker: StickerFrameSource, currentTime: number): number {
  const frames = stickerFrames(sticker)
  if (frames.length <= 1) return 0
  const elapsed = Math.max(0, currentTime - sticker.startTime)
  return Math.floor(elapsed * stickerFrameRate(sticker)) % frames.length
}

export function stickerFrameAt(sticker: StickerFrameSource, currentTime: number): string {
  const frames = stickerFrames(sticker)
  return frames[stickerFrameIndex(sticker, currentTime)] || sticker.value
}

export function stickerIsAnimated(sticker: Pick<StickerFrameSource, 'value' | 'frames'>): boolean {
  return stickerFrames(sticker).length > 1
}

export function stickerFrameEnableExpression(sticker: StickerFrameSource, frameIndex: number, endTime: number): string {
  const frames = stickerFrames(sticker)
  const start = Math.max(0, sticker.startTime)
  if (frames.length <= 1) return `between(t,${start.toFixed(3)},${endTime.toFixed(3)})`
  return `between(t,${start.toFixed(3)},${endTime.toFixed(3)})*eq(mod(floor(max(0,t-${start.toFixed(3)})*${stickerFrameRate(sticker).toFixed(3)}),${frames.length}),${frameIndex})`
}
