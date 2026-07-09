import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POST_COMPOSER_ADVANCED_OPEN,
  getComposerActiveAdvancedChips,
  getComposerPublishSummary,
  getComposerVisualGuardMessage,
} from '../../lib/post-composer-ux'

describe('post composer UX helpers', () => {
  it('keeps advanced options closed by default', () => {
    expect(DEFAULT_POST_COMPOSER_ADVANCED_OPEN).toBe(false)
  })

  it('requires a valid price when paid post is active', () => {
    expect(getComposerVisualGuardMessage({
      hasText: true,
      mediaCount: 0,
      isOptimizingVideo: false,
      isPaidPost: true,
      paidPostPrice: '',
      hasAdultSelection: false,
      canAccessAdult18Plus: false,
    })).toBe('Defina um preco inteiro em ItaCash.')

    expect(getComposerVisualGuardMessage({
      hasText: true,
      mediaCount: 0,
      isOptimizingVideo: false,
      isPaidPost: true,
      paidPostPrice: '25',
      hasAdultSelection: false,
      canAccessAdult18Plus: false,
    })).toBeNull()
  })

  it('summarizes paid posts before publishing', () => {
    expect(getComposerPublishSummary({
      communityLabel: 'Geral',
      visibilityLabel: 'Publica',
      contentRatingLabel: 'Seguro',
      isPaidPost: true,
    })).toContainEqual({ label: 'Tipo', value: 'Pago' })
  })

  it('marks paid and adult advanced choices as active chips', () => {
    expect(getComposerActiveAdvancedChips({
      community: 'adult_18plus',
      communityLabel: 'Adulto 18+',
      contentRating: 'adult_18plus',
      contentRatingLabel: 'Adulto 18+',
      visibility: 'public',
      visibilityLabel: 'Publica',
      isPaidPost: true,
    })).toEqual(['Post pago ativo', 'Conteudo 18+', 'Comunidade: Adulto 18+'])
  })

  it('warns when an ineligible user selects adult content', () => {
    expect(getComposerVisualGuardMessage({
      hasText: true,
      mediaCount: 0,
      isOptimizingVideo: false,
      isPaidPost: false,
      paidPostPrice: '',
      hasAdultSelection: true,
      canAccessAdult18Plus: false,
    })).toBe('Conteudo adulto 18+ exige verificacao aprovada.')
  })
})
