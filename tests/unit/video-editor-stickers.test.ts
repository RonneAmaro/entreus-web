import { describe, expect, it } from 'vitest'
import { STICKER_CATEGORIES, STICKER_LIBRARY, stickerFrameAt, stickerFrameEnableExpression, stickerFrameIndex, stickerFrameRate, stickerFrames, stickerIsAnimated } from '@/lib/video-editor/stickers'

describe('stickers do Studio', () => {
  it('mantem uma galeria categorizada, leve e com nomes unicos', () => {
    expect(STICKER_CATEGORIES.map((item) => item.id)).toEqual(['reactions', 'highlights', 'animated'])
    expect(new Set(STICKER_LIBRARY.map((item) => item.id)).size).toBe(STICKER_LIBRARY.length)
    expect(STICKER_LIBRARY.every((item) => item.frames.length >= 1 && item.frames.length <= 12)).toBe(true)
    expect(STICKER_LIBRARY.filter((item) => item.category === 'animated').every((item) => item.frames.length > 1)).toBe(true)
  })

  it('seleciona quadros reais pelo tempo da timeline e permanece deterministico em seek', () => {
    const sticker = { value: '✦', frames: ['✦', '✧', '✶', '✧'], frameRate: 4, startTime: 1 }
    expect(stickerFrameAt(sticker, 1)).toBe('✦')
    expect(stickerFrameAt(sticker, 1.26)).toBe('✧')
    expect(stickerFrameAt(sticker, 1.51)).toBe('✶')
    expect(stickerFrameAt(sticker, 2)).toBe('✦')
    expect(stickerFrameIndex(sticker, 1.51)).toBe(2)
    expect(stickerIsAnimated(sticker)).toBe(true)
  })

  it('oferece fallback estatico e limita dados defensivamente', () => {
    expect(stickerFrames({ value: 'A', frames: [] })).toEqual(['A'])
    expect(stickerFrameRate({ frameRate: 99 })).toBe(12)
    expect(stickerFrameRate({ frameRate: 0 })).toBe(1)
    expect(stickerIsAnimated({ value: 'A' })).toBe(false)
  })

  it('gera expressoes FFmpeg mutuamente exclusivas para cada quadro', () => {
    const sticker = { value: '*', frames: ['*', '+', 'x', '+'], frameRate: 6, startTime: 0.25 }
    expect(stickerFrameEnableExpression(sticker, 0, 2)).toBe('between(t,0.250,2.000)*eq(mod(floor(max(0,t-0.250)*6.000),4),0)')
    expect(stickerFrameEnableExpression(sticker, 3, 2)).toContain('),4),3)')
    expect(stickerFrameEnableExpression({ value: 'A', startTime: 0 }, 0, 1.5)).toBe('between(t,0.000,1.500)')
  })
})
