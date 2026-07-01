import { describe, expect, it } from 'vitest'
import {
  getCommunityHref,
  getMentionHref,
  parseRichTextLinks,
  resolveCommunityFilterSlug,
} from '../../lib/rich-text-links'

describe('rich text links parser', () => {
  it('keeps plain text unchanged', () => {
    expect(parseRichTextLinks('texto simples sem links')).toEqual([
      { type: 'text', value: 'texto simples sem links' },
    ])
  })

  it('parses one mention', () => {
    expect(parseRichTextLinks('Oi @fernanda')).toEqual([
      { type: 'text', value: 'Oi ' },
      { type: 'mention', value: '@fernanda', username: 'fernanda' },
    ])
  })

  it('parses multiple mentions with supported username characters', () => {
    expect(parseRichTextLinks('@ronne_amaro e @joao.silva')).toEqual([
      { type: 'mention', value: '@ronne_amaro', username: 'ronne_amaro' },
      { type: 'text', value: ' e ' },
      { type: 'mention', value: '@joao.silva', username: 'joao.silva' },
    ])
  })

  it('parses one community hashtag', () => {
    expect(parseRichTextLinks('vamos falar de #esporte')).toEqual([
      { type: 'text', value: 'vamos falar de ' },
      { type: 'community', value: '#esporte', slug: 'sports' },
    ])
  })

  it('parses mention and hashtag in the same text', () => {
    expect(parseRichTextLinks('Parabéns @fernanda pelo conteúdo em #esporte')).toEqual([
      { type: 'text', value: 'Parabéns ' },
      { type: 'mention', value: '@fernanda', username: 'fernanda' },
      { type: 'text', value: ' pelo conteúdo em ' },
      { type: 'community', value: '#esporte', slug: 'sports' },
    ])
  })

  it('does not turn an email into a mention', () => {
    expect(parseRichTextLinks('mande para teste@email.com')).toEqual([
      { type: 'text', value: 'mande para teste@email.com' },
    ])
  })

  it('keeps punctuation after a mention outside the username', () => {
    expect(parseRichTextLinks('Obrigado @fernanda!')).toEqual([
      { type: 'text', value: 'Obrigado ' },
      { type: 'mention', value: '@fernanda', username: 'fernanda' },
      { type: 'text', value: '!' },
    ])
  })

  it('keeps trailing dot after a dotted username outside the username', () => {
    expect(parseRichTextLinks('Valeu @joao.silva.')).toEqual([
      { type: 'text', value: 'Valeu ' },
      { type: 'mention', value: '@joao.silva', username: 'joao.silva' },
      { type: 'text', value: '.' },
    ])
  })

  it('keeps punctuation after a hashtag outside the slug', () => {
    expect(parseRichTextLinks('Hoje tem #esporte!')).toEqual([
      { type: 'text', value: 'Hoje tem ' },
      { type: 'community', value: '#esporte', slug: 'sports' },
      { type: 'text', value: '!' },
    ])
  })

  it('supports hashtags with hyphen and underline', () => {
    expect(parseRichTextLinks('#conteudo-adulto #meu_time')).toEqual([
      { type: 'community', value: '#conteudo-adulto', slug: 'adult_18plus' },
      { type: 'text', value: ' ' },
      { type: 'community', value: '#meu_time', slug: 'meu_time' },
    ])
  })

  it('keeps special characters as text instead of HTML', () => {
    expect(parseRichTextLinks('<b>@ana</b> & #esporte')).toEqual([
      { type: 'text', value: '<b>' },
      { type: 'mention', value: '@ana', username: 'ana' },
      { type: 'text', value: '</b> & ' },
      { type: 'community', value: '#esporte', slug: 'sports' },
    ])
  })

  it('keeps simple XSS payloads as text', () => {
    expect(parseRichTextLinks('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ])
  })

  it('does not parse mentions or hashtags inside URLs', () => {
    expect(parseRichTextLinks('veja https://entreus.app/u/@ana#esporte agora')).toEqual([
      { type: 'text', value: 'veja https://entreus.app/u/@ana#esporte agora' },
    ])
  })

  it('generates internal hrefs safely', () => {
    expect(getMentionHref('joao.silva')).toBe('/u/joao.silva')
    expect(getCommunityHref('sports')).toBe('/feed?community=sports')
  })

  it('normalizes community aliases and accents', () => {
    expect(resolveCommunityFilterSlug('geopolítica')).toBe('geopolitics')
    expect(resolveCommunityFilterSlug('#conteúdo-adulto')).toBe('adult_18plus')
  })

  it('preserves line breaks in text tokens', () => {
    expect(parseRichTextLinks('linha 1\n@ana em #esporte')).toEqual([
      { type: 'text', value: 'linha 1\n' },
      { type: 'mention', value: '@ana', username: 'ana' },
      { type: 'text', value: ' em ' },
      { type: 'community', value: '#esporte', slug: 'sports' },
    ])
  })
})
