import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalogs, SUPPORTED_LOCALES } from '../../lib/i18n'

type AuditResult = {
  files: string[]
  routes: Array<{ route: string; file: string }>
  findings: Array<{ file: string; line: number; text: string; reason: string }>
  strictRoutes: string[]
  classifiedExceptions: Array<unknown>
  invalidExceptions: Array<unknown>
  staleExceptions: Array<unknown>
  unclassifiedStrict: Array<unknown>
}

function runAudit(): AuditResult {
  return JSON.parse(execFileSync(
    process.execPath,
    ['scripts/audit-i18n-hardcodes.mjs', '--json'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )) as AuditResult
}

describe('complete source internationalization audit', () => {
  it('keeps all eight runtime catalogs structurally identical and non-empty', () => {
    const referenceKeys = Object.keys(catalogs['pt-BR']).sort()
    expect(SUPPORTED_LOCALES).toHaveLength(8)
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(catalogs[locale]).sort(), locale).toEqual(referenceKeys)
      expect(
        Object.entries(catalogs[locale])
          .filter(([, value]) => !value.trim())
          .map(([key]) => key),
        locale,
      ).toEqual([])
    }
  })

  it('does not let covered UI source import the Brazilian Portuguese catalog directly', () => {
    const audit = runAudit()
    const offenders = audit.files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /(?:from|import\()\s*['"][^'"]*i18n\/catalogs\/pt-BR['"]/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('keeps the migrated profile and priority Package 53 surfaces free of Portuguese JSX', () => {
    const audit = runAudit()
    const covered = new Set([
      'app/profile/page.tsx',
      'app/settings/page.tsx',
      'app/feed/page.tsx',
      'app/components/PostComposer.tsx',
      'app/components/PostCard.tsx',
      'app/components/ThreadedComments.tsx',
      'app/components/EntreUSHub.tsx',
      'app/components/AppSidebar.tsx',
      'app/components/MobileNavigation.tsx',
    ])
    const portuguese = /[áàâãéêíóôõúç]|\b(?:você|não|salvar|carregando|comentários|comunidades|publicar|perfil|conta)\b/i
    expect(
      audit.findings
        .filter(({ file, text }) => covered.has(file) && portuguese.test(text))
        .map(({ file, line, text }) => `${file}:${line} ${text}`),
    ).toEqual([])
  })

  it('tracks the explicit legacy debt and fails if the global hardcode count grows', () => {
    const audit = runAudit()
    expect(audit.routes).toHaveLength(72)
    expect(audit.files.length).toBeGreaterThanOrEqual(288)
    expect(audit.findings.length).toBeLessThanOrEqual(1231)
  })

  it('requires every finding in completed routes to be migrated or individually classified', () => {
    const audit = runAudit()
    const inventory = JSON.parse(
      readFileSync('scripts/i18n-audit-exceptions.json', 'utf8'),
    ) as { strictRoutes: string[]; exceptions: Array<unknown> }
    expect(audit.strictRoutes).toContain('/settings')
    expect(audit.strictRoutes).toEqual(inventory.strictRoutes)
    expect(audit.classifiedExceptions).toHaveLength(inventory.exceptions.length)
    expect(audit.invalidExceptions).toEqual([])
    expect(audit.staleExceptions).toEqual([])
    expect(audit.unclassifiedStrict).toEqual([])
    expect(() => execFileSync(
      process.execPath,
      ['scripts/audit-i18n-hardcodes.mjs', '--strict'],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    )).not.toThrow()
  })
})
