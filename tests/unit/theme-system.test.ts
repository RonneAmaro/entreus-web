import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('EntreUS theme system', () => {
  const providers = readFileSync('app/providers.tsx', 'utf8')
  const globals = readFileSync('app/globals.css', 'utf8')
  const layout = readFileSync('app/layout.tsx', 'utf8')
  const wordmark = readFileSync('app/components/EntreUSWordmark.tsx', 'utf8')
  const hub = readFileSync('app/components/EntreUSHub.tsx', 'utf8')
  const sidebar = readFileSync('app/components/AppSidebar.tsx', 'utf8')
  const mobile = readFileSync('app/components/MobileNavigation.tsx', 'utf8')

  it('uses a deterministic dark default while preserving next-themes storage', () => {
    expect(providers).toContain('defaultTheme="dark"')
    expect(providers).toContain('enableSystem={false}')
    expect(providers).toContain('attribute="class"')
    expect(layout).toContain('suppressHydrationWarning')
    expect(layout).toContain("colorScheme: 'dark light'")
  })

  it('defines non-empty semantic tokens for both themes', () => {
    for (const token of ['background', 'foreground', 'surface', 'surface-muted', 'text-muted', 'border', 'brand', 'brand-light', 'brand-dark', 'glow', 'success', 'warning', 'danger']) {
      expect(globals).toMatch(new RegExp(`--${token}:\\s*#[0-9a-fA-F]{6}`))
    }
    expect(globals).toContain(':root {')
    expect(globals).toContain('.dark {')
    expect(globals).toContain('--background: #ffffff')
    expect(globals).toContain('--background: #0a0a0a')
  })

  it('keeps the wordmark and critical shell surfaces theme-aware', () => {
    expect(wordmark).toContain('text-blue-600 dark:text-blue-400')
    expect(wordmark).toContain('aria-label="EntreUS"')
    expect(hub).toContain('bg-white text-zinc-950')
    expect(hub).toContain('dark:bg-zinc-950 dark:text-white')
    expect(sidebar).toContain('bg-white/95')
    expect(sidebar).toContain('dark:bg-black/95')
    expect(mobile).toContain('bg-white/95')
    expect(mobile).toContain('dark:bg-black/95')
  })

  it('preserves reduced motion in the modal shell', () => {
    expect(hub).toContain('motion-reduce:transform-none')
    expect(hub).not.toMatch(/animate-(spin|pulse|bounce)|infinite/)
  })
})
