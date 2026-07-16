import { describe, expect, it } from 'vitest'
import { insertAtSelection } from '@/lib/expressions/expression-insertion'
import { parseExpressionSearch } from '@/lib/expressions/expression-search'
import { readExpressions, storeExpression } from '@/lib/expressions/expression-storage'
import { isAllowedExpressionUrl, isValidEmoji, sanitizeExpressionText, validateExpressionAsset, validateExpressionSubmission } from '@/lib/expressions/expression-validation'
import type { ExpressionAsset } from '@/lib/expressions/expression-types'

const gif: ExpressionAsset = { kind: 'gif', provider: 'tenor', providerId: 'abc_123', title: 'Festa', altText: 'Pessoa comemorando', previewUrl: 'https://media.tenor.com/a/tiny.webp', mediaUrl: 'https://media.tenor.com/a/video.mp4', staticUrl: 'https://media.tenor.com/a/still.webp', width: 320, height: 240, attributionUrl: 'https://tenor.com/', contentRating: 'g' }
const sticker: ExpressionAsset = { ...gif, kind: 'sticker', providerId: 'sticker-1', title: 'Coração' }

function memoryStorage(fail = false) {
  const data = new Map<string, string>()
  return { getItem(key: string) { if (fail) throw new Error('blocked'); return data.get(key) ?? null }, setItem(key: string, value: string) { if (fail) throw new Error('blocked'); data.set(key, value) } }
}

describe('unified expressions', () => {
  it('inserts emoji at the cursor and preserves/replaces selection', () => {
    expect(insertAtSelection('ola mundo', '😀', 3, 3)).toEqual({ value: 'ola😀 mundo', selectionStart: 5, selectionEnd: 5 })
    expect(insertAtSelection('ola mundo', '✨', 4, 9).value).toBe('ola ✨')
  })
  it('accepts Unicode emoji and rejects text pretending to be emoji', () => { expect(isValidEmoji('👩🏽‍💻')).toBe(true); expect(isValidEmoji('<img>')).toBe(false) })
  it('represents GIF and sticker as validated structured attachments', () => { expect(validateExpressionAsset(gif).ok).toBe(true); expect(validateExpressionAsset(sticker).ok).toBe(true) })
  it('rejects arbitrary URLs, domains, providers, incomplete payloads and unsafe ratings', () => {
    expect(isAllowedExpressionUrl('https://evil.example/a.gif')).toBe(false)
    expect(validateExpressionAsset({ ...gif, mediaUrl: 'https://evil.example/a.gif' }).ok).toBe(false)
    expect(validateExpressionAsset({ ...gif, provider: 'unknown' }).ok).toBe(false)
    expect(validateExpressionAsset({ kind: 'gif' }).ok).toBe(false)
    expect(validateExpressionAsset({ ...gif, contentRating: 'r' }).ok).toBe(false)
  })
  it('sanitizes alt text and control characters', () => { expect(sanitizeExpressionText('  festa\u0000   boa  ')).toBe('festa boa') })
  it('accepts expression-only or text plus one expression and rejects empty input', () => {
    expect(validateExpressionSubmission('', gif).ok).toBe(true)
    expect(validateExpressionSubmission('oi', sticker).ok).toBe(true)
    expect(validateExpressionSubmission('', null).ok).toBe(false)
    expect(validateExpressionSubmission('', [gif, sticker]).ok).toBe(false)
  })
  it('normalizes searches, cursor and maximum batch', () => {
    expect(parseExpressionSearch({ query: '  festa   boa ', limit: '999', cursor: '12' })).toEqual({ ok: true, query: 'festa boa', limit: 24, cursor: 12 })
    expect(parseExpressionSearch({ query: 'x'.repeat(81) }).ok).toBe(false)
    expect(parseExpressionSearch({ query: 'oi', cursor: 'bad' }).ok).toBe(false)
  })
  it('separates recent/favorite data by user and tolerates unavailable storage', () => {
    const storage = memoryStorage()
    expect(storeExpression(storage, 'user-a', 'recent', gif)).toBe(true)
    expect(readExpressions(storage, 'user-a', 'recent', 'gif')).toHaveLength(1)
    expect(readExpressions(storage, 'user-b', 'recent', 'gif')).toHaveLength(0)
    expect(readExpressions(memoryStorage(true), 'user-a', 'favorite', 'gif')).toEqual([])
  })
  it('stores only canonical fields without secrets or raw provider payloads', () => {
    const serialized = JSON.stringify(validateExpressionAsset(gif))
    expect(serialized).not.toMatch(/api[_-]?key|secret|rawPayload/i)
  })
})
