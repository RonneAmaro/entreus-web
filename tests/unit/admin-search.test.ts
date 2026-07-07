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
    keywords: ['idade', 'maioridade'],
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

  it('finds 18+ verification by keyword', () => {
    expect(filterAdminCards(cards, 'idade').map((card) => card.title)).toEqual(['Verificacoes 18+'])
  })

  it('finds reports and moderation by denuncia', () => {
    expect(filterAdminCards(cards, 'denúncia').map((card) => card.title)).toEqual([
      'Denuncias',
      'Moderacao',
    ])
  })

  it('returns an empty list when there is no match', () => {
    expect(filterAdminCards(cards, 'nao existe')).toEqual([])
  })
})
