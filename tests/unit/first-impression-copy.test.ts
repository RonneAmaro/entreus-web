import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('first impression polish surfaces', () => {
  it('keeps the public home translated and action-oriented', () => {
    const source = readFileSync('app/page.tsx', 'utf8')

    expect(source).toContain("translate(locale, key")
    expect(source).toContain("t('home.title')")
    expect(source).toContain('href="/signup"')
    expect(source).toContain('href="/login"')
    expect(source).toContain('href="/creators"')
  })

  it('documents the beta manual checklist', () => {
    const source = readFileSync('docs/beta-first-impression-checklist.md', 'utf8')

    expect(source).toContain('## Home')
    expect(source).toContain('## Usuário Novo')
    expect(source).toContain('## Criador')
    expect(source).toContain('## Estados')
    expect(source).toContain('## Mobile')
  })

  it('keeps notifications, complete-profile, and feed empty states guided by copy keys', () => {
    const notifications = readFileSync('app/notifications/page.tsx', 'utf8')
    const completeProfile = readFileSync('app/complete-profile/page.tsx', 'utf8')
    const feed = readFileSync('app/feed/page.tsx', 'utf8')

    expect(notifications).toContain("t('notifications.emptyTitle')")
    expect(notifications).toContain("t('notifications.markAllRead')")
    expect(completeProfile).toContain("t('completeProfile.nextStepTitle')")
    expect(feed).toContain("t('feed.emptyTitle')")
    expect(feed).toContain("t('feed.emptyDescription')")
  })
})
