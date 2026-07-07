import { describe, expect, it } from 'vitest'
import { getComposeHref, resolveComposeIntent } from '../../lib/compose-intent'

describe('compose intent helpers', () => {
  it('maps compose=1 to text intent', () => {
    expect(resolveComposeIntent('1')).toBe('text')
    expect(resolveComposeIntent('publish')).toBe('text')
    expect(resolveComposeIntent('post')).toBe('text')
  })

  it('maps compose=photo to photo intent', () => {
    expect(resolveComposeIntent('photo')).toBe('photo')
    expect(resolveComposeIntent('foto')).toBe('photo')
    expect(resolveComposeIntent('imagem')).toBe('photo')
  })

  it('maps compose=video to video intent', () => {
    expect(resolveComposeIntent('video')).toBe('video')
    expect(resolveComposeIntent('vídeo')).toBe('video')
  })

  it('uses the first compose value when the router gives an array', () => {
    expect(resolveComposeIntent(['photo', 'video'])).toBe('photo')
  })

  it('returns null for invalid or missing values', () => {
    expect(resolveComposeIntent('anything')).toBeNull()
    expect(resolveComposeIntent(null)).toBeNull()
    expect(resolveComposeIntent(undefined)).toBeNull()
  })

  it('builds feed compose links', () => {
    expect(getComposeHref('text')).toBe('/feed?compose=1')
    expect(getComposeHref('photo')).toBe('/feed?compose=photo')
    expect(getComposeHref('video')).toBe('/feed?compose=video')
  })
})
