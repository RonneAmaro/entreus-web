import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('discovery and activation surfaces', () => {
  it('keeps search as the central discovery surface for public profiles', () => {
    const source = readFileSync('app/search/page.tsx', 'utf8')

    expect(source).toContain("useLanguage()")
    expect(source).toContain("t('search.headerDescription')")
    expect(source).toContain("t('search.scopeBadge')")
    expect(source).toContain("t('search.empty.initialTitle')")
    expect(source).toContain("t('search.empty.noResults')")
    expect(source).toContain("href={`/u/${profile.username}`}")
    expect(source).toContain(".from('profiles')")
    expect(source).not.toContain('Nenhum usuÃ¡rio para mostrar.')
  })

  it('explains Hub scope and routes discovery to search', () => {
    const source = readFileSync('app/components/EntreUSHub.tsx', 'utf8')

    expect(source).toContain("t('hub.discoveryScope')")
    expect(source).toContain("t('hub.discoveryProfiles')")
    expect(source).toContain("t('hub.openSearch')")
    expect(source).toContain('href="/search"')
  })

  it('keeps feed empty actions pointed to real destinations', () => {
    const source = readFileSync('app/feed/page.tsx', 'utf8')

    expect(source).toContain("t('feed.emptySearchCta')")
    expect(source).toContain("t('feed.emptyComposeCta')")
    expect(source).toContain('href="/search"')
    expect(source).toContain('href="/feed?compose=text"')
  })

  it('keeps public profile continuity pointed to discovery', () => {
    const source = readFileSync('app/u/[username]/page.tsx', 'utf8')

    expect(source).toContain('t("publicProfile.searchHint")')
    expect(source).toContain('t("publicProfile.searchProfiles")')
    expect(source).toContain('href="/search"')
  })

  it('documents the manual beta checklist for discovery and activation', () => {
    const source = readFileSync('docs/beta-discovery-activation-checklist.md', 'utf8')

    for (const heading of [
      '## Descoberta',
      '## Feed Vazio',
      '## Perfil Público',
      '## Busca',
      '## Privacidade',
    ]) {
      expect(source).toContain(heading)
    }

    expect(source).toContain('Hub abre sem erro')
    expect(source).toContain('ações do feed vazio possuem destino real')
    expect(source).toContain('Nenhuma informação privada aparece na descoberta')
  })
})
