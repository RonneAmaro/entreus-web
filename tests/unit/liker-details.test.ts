import { describe, expect, it } from 'vitest'
import {
  LIKER_DETAILS_LIMIT,
  LIKER_PREVIEW_LIMIT,
  publicLikerName,
  summarizeLikers,
  uniqueLikerIds,
  type PublicLiker,
} from '@/lib/liker-details'

const maria: PublicLiker = { id: 'not-rendered-1', display_name: 'Maria', username: 'maria', avatar_url: null }
const joao: PublicLiker = { id: 'not-rendered-2', display_name: 'João', username: 'joao', avatar_url: null }
const ana: PublicLiker = { id: 'not-rendered-3', display_name: 'Ana', username: 'ana', avatar_url: null }

describe('liker preview helpers', () => {
  it('keeps the lazy-query limits intentionally small', () => {
    expect(LIKER_PREVIEW_LIMIT).toBe(3)
    expect(LIKER_DETAILS_LIMIT).toBe(20)
  })

  it('returns an empty preview for zero available public profiles', () => {
    expect(summarizeLikers([], 0, 'pt-BR')).toBe('')
  })

  it('uses only public display name or username', () => {
    expect(publicLikerName({ display_name: ' Maria ', username: 'maria' })).toBe('Maria')
    expect(publicLikerName({ display_name: null, username: 'maria' })).toBe('maria')
    expect(publicLikerName({ display_name: null, username: null })).toBeNull()
  })

  it('summarizes one, two, and many public likers without IDs', () => {
    expect(summarizeLikers([maria], 1, 'pt-BR')).toBe('Maria')
    expect(summarizeLikers([maria, joao], 2, 'pt-BR')).toContain('Maria')
    expect(summarizeLikers([maria, joao], 2, 'pt-BR')).toContain('João')
    expect(summarizeLikers([maria, joao, ana], 5, 'pt-BR')).toBe('Maria e João +3')
  })

  it('deduplicates liker IDs before a single profile query', () => {
    expect(uniqueLikerIds(['u1', 'u1', '', 'u2'])).toEqual(['u1', 'u2'])
  })
})
