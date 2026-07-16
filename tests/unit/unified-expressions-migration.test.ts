import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260716_add_unified_expression_attachments.sql',
  'utf8',
)

describe('unified expressions migration validator', () => {
  it('returns a total boolean while preserving null legacy values', () => {
    expect(migration).toContain('when value is null then true')
    expect(migration).toContain("when jsonb_typeof(value) <> 'object' then false")
    expect(migration).toMatch(/else coalesce\([\s\S]*false\s*\)\s*end/)
  })

  it('requires the canonical keys and rejects every key outside the allowlist', () => {
    expect(migration).toContain('value ?& array[')
    expect(migration).toContain('from jsonb_object_keys(value)')
    for (const key of [
      'kind', 'provider', 'providerId', 'title', 'altText', 'contentRating',
      'mediaUrl', 'previewUrl', 'staticUrl', 'attributionUrl', 'width', 'height',
    ]) expect(migration).toContain(`'${key}'`)
    expect(migration).toContain('where expression_key.key <> all')
  })

  it('constrains dimensions, URL length, exact CDN host, provider, kind and rating', () => {
    expect(migration).toContain("(value->>'width')::numeric between 1 and 10000")
    expect(migration).toContain("(value->>'height')::numeric between 1 and 10000")
    expect(migration).toContain("length(value->>'mediaUrl') between 1 and 2048")
    expect(migration).toContain("length(value->>'previewUrl') between 1 and 2048")
    expect(migration).toContain("^https://media[.]tenor[.]com(?:/|$)")
    expect(migration).toContain("value->>'provider' = 'tenor'")
    expect(migration).toContain("value->>'kind' in ('gif', 'sticker')")
    expect(migration).toContain("value->>'contentRating' = 'g'")
    expect(migration).toContain("value->>'attributionUrl' = 'https://tenor.com/'")
  })
})
