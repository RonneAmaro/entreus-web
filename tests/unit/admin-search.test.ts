import { describe, expect, it } from 'vitest'
import { filterAdminCards, normalizeAdminSearchText } from '../../lib/admin-search'

const cards = [
  {
    title: 'Financeiro',
    description: 'Controle receitas, despesas, custos e lucro da plataforma.',
    href: '/admin/finance',
    keywords: ['financas'],
  },
  {
    title: 'Compras ItaCash',
    description: 'Aprovar solicitacoes manuais de compra de ItaCash.',
    href: '/admin/itacash-purchases',
    keywords: ['itacash', 'pix', 'pagamentos'],
  },
  {
    title: 'Saques de criadores',
    description: 'Revisar solicitacoes de saque manual e registrar Pix pago.',
    href: '/admin/creator-withdrawals',
    keywords: ['saque', 'saques', 'repasses'],
  },
  {
    title: 'Verificacoes 18+',
    description: 'Analisar documentos e selfies.',
    href: '/admin/age-verifications',
    keywords: ['idade', 'maioridade', 'verificacao'],
  },
  {
    title: 'Denuncias',
    description: 'Revisar denuncias de posts e usuarios.',
    href: '/admin/reports',
    keywords: ['reports', 'moderacao'],
  },
  {
    title: 'Moderacao',
    description: 'Conteudos ocultos e revisao de moderacao.',
    href: '/admin/moderation',
    keywords: ['denuncia', 'reports'],
  },
  {
    title: 'Checklist Beta Fechado',
    description: 'Roteiro manual para validacao.',
    href: '/admin/beta-checklist',
    keywords: ['beta'],
  },
  {
    title: 'Auditoria R2',
    description: 'Verifique possiveis midias orfas no armazenamento.',
    href: '/admin/r2-orphans',
    keywords: ['r2', 'storage'],
  },
  {
    title: 'Selos de usuarios',
    description: 'Conceda ou remova selos manualmente.',
    href: '/admin/badges',
    keywords: ['selos', 'badges'],
  },
  {
    title: 'Checklist de seguranca',
    description: 'Confira pontos criticos antes de liberar usuarios reais.',
    href: '/admin/security-check',
    keywords: ['seguranca', 'security'],
  },
  {
    title: 'Feedbacks e Bugs',
    description: 'Acompanhar sugestoes e problemas enviados pelos usuarios.',
    href: '/admin/feedback',
    keywords: ['feedback', 'bugs'],
  },
]

describe('admin search helpers', () => {
  it('normalizes accents, case and spacing', () => {
    expect(normalizeAdminSearchText('  Denúncia   URGENTE  ')).toBe('denuncia urgente')
  })

  it('returns all cards for an empty search', () => {
    expect(filterAdminCards(cards, '')).toEqual(cards)
    expect(filterAdminCards(cards, '   ')).toEqual(cards)
  })

  it('finds Financeiro by title', () => {
    expect(filterAdminCards(cards, 'financeiro').map((card) => card.title)).toEqual(['Financeiro'])
  })

  it('finds ItaCash areas by keyword', () => {
    expect(filterAdminCards(cards, 'itacash').map((card) => card.title)).toEqual([
      'Compras ItaCash',
    ])
  })

  it('finds creator withdrawals by saque keyword', () => {
    expect(filterAdminCards(cards, 'saque').map((card) => card.title)).toEqual([
      'Saques de criadores',
    ])
  })

  it('finds creator withdrawals by repasse keyword', () => {
    expect(filterAdminCards(cards, 'repasse').map((card) => card.title)).toEqual([
      'Saques de criadores',
    ])
  })

  it('finds 18+ verification by keyword', () => {
    expect(filterAdminCards(cards, 'idade').map((card) => card.title)).toEqual(['Verificacoes 18+'])
    expect(filterAdminCards(cards, 'verificação').map((card) => card.title)).toEqual(['Verificacoes 18+'])
  })

  it('finds reports and moderation by denuncia', () => {
    expect(filterAdminCards(cards, 'denúncia').map((card) => card.title)).toEqual([
      'Denuncias',
      'Moderacao',
    ])
  })

  it('finds reports and moderation by moderation terms', () => {
    expect(filterAdminCards(cards, 'moderacao').map((card) => card.title)).toEqual([
      'Denuncias',
      'Moderacao',
    ])
    expect(filterAdminCards(cards, 'moderação').map((card) => card.title)).toEqual([
      'Denuncias',
      'Moderacao',
    ])
  })

  it('finds the final audit recommended admin areas', () => {
    expect(filterAdminCards(cards, 'beta').map((card) => card.title)).toEqual(['Checklist Beta Fechado'])
    expect(filterAdminCards(cards, 'r2').map((card) => card.title)).toEqual(['Auditoria R2'])
    expect(filterAdminCards(cards, 'selo').map((card) => card.title)).toEqual(['Selos de usuarios'])
    expect(filterAdminCards(cards, 'segurança').map((card) => card.title)).toEqual(['Checklist de seguranca'])
    expect(filterAdminCards(cards, 'feedback').map((card) => card.title)).toEqual(['Feedbacks e Bugs'])
  })

  it('returns an empty list when there is no match', () => {
    expect(filterAdminCards(cards, 'nao existe')).toEqual([])
  })
})
