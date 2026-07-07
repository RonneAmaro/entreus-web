import { describe, expect, it } from 'vitest'
import {
  BETA_CHECKLIST_ITEMS,
  buildBetaChecklistReport,
  calculateBetaChecklistSummary,
  filterBetaChecklistItems,
  normalizeBetaChecklistText,
  type BetaChecklistProgress,
} from '../../lib/beta-checklist'

const sampleItems = [
  {
    id: 'login',
    category: 'Login e cadastro',
    title: 'Cadastro inicial',
    description: 'Criar conta ficticia e validar login.',
    route: '/signup',
  },
  {
    id: 'media',
    category: 'Upload de mídia',
    title: 'Foto e vídeo',
    description: 'Enviar imagem e video curto.',
    route: '/feed?compose=video',
  },
  {
    id: 'moderation',
    category: 'Moderação',
    title: 'Denúncias',
    description: 'Revisar fila de reports.',
    route: '/admin/reports',
  },
]

describe('beta checklist helpers', () => {
  it('normalizes accents, case and spacing', () => {
    expect(normalizeBetaChecklistText('  MÍDIA   Mobile  ')).toBe('midia mobile')
  })

  it('summarizes all items as pending by default', () => {
    expect(calculateBetaChecklistSummary(sampleItems, {})).toEqual({
      total: 3,
      pending: 3,
      passed: 0,
      bug: 0,
      review: 0,
      completed: 0,
      completionPercent: 0,
    })
  })

  it('summarizes passed, bug and review statuses', () => {
    const progress: BetaChecklistProgress = {
      login: { status: 'passed' },
      media: { status: 'bug' },
      moderation: { status: 'review' },
    }

    expect(calculateBetaChecklistSummary(sampleItems, progress)).toEqual({
      total: 3,
      pending: 0,
      passed: 1,
      bug: 1,
      review: 1,
      completed: 3,
      completionPercent: 100,
    })
  })

  it('filters by status', () => {
    const progress: BetaChecklistProgress = {
      login: { status: 'passed' },
      media: { status: 'bug' },
    }

    expect(filterBetaChecklistItems(sampleItems, progress, { status: 'bug' })).toEqual([
      sampleItems[1],
    ])
    expect(filterBetaChecklistItems(sampleItems, progress, { status: 'pending' })).toEqual([
      sampleItems[2],
    ])
  })

  it('filters by accent and case insensitive search', () => {
    expect(filterBetaChecklistItems(sampleItems, {}, { query: 'MIDIA' })).toEqual([
      sampleItems[1],
    ])
    expect(filterBetaChecklistItems(sampleItems, {}, { query: 'denuncias reports' })).toEqual([
      sampleItems[2],
    ])
  })

  it('builds a report with bugs, review items and notes', () => {
    const progress: BetaChecklistProgress = {
      media: {
        status: 'bug',
        note: 'Seletor de video nao abriu no celular.',
      },
      moderation: {
        status: 'review',
        note: 'Revisar copy da fila.',
      },
    }

    const report = buildBetaChecklistReport(
      sampleItems,
      progress,
      new Date('2026-07-07T12:00:00'),
    )

    expect(report).toContain('Relatório Beta Fechado - EntreUS')
    expect(report).toContain('- Bug: 1')
    expect(report).toContain('- Revisar: 1')
    expect(report).toContain('[Upload de mídia] Foto e vídeo')
    expect(report).toContain('[Moderação] Denúncias')
    expect(report).toContain('Seletor de video nao abriu no celular.')
    expect(report).toContain('Revisar copy da fila.')
  })

  it('keeps the production checklist populated with recommended categories', () => {
    const categories = new Set(BETA_CHECKLIST_ITEMS.map((item) => item.category))

    expect(BETA_CHECKLIST_ITEMS.length).toBeGreaterThan(15)
    expect(categories).toEqual(
      new Set([
        'Login e cadastro',
        'Perfil',
        'Feed e postagem',
        'Upload de mídia',
        'Admin',
        'Financeiro',
        'ItaCash',
        '18+',
        'Moderação',
        'Creator Dashboard',
        'Lab',
        'Meet',
        'Mobile/PWA',
        'Segurança',
        'Políticas',
      ]),
    )
  })
})
