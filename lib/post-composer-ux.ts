import { getComposerProfileContentModeGuidance as getProfileModeGuidance } from './profile-content-mode'

export const DEFAULT_POST_COMPOSER_ADVANCED_OPEN = false

export type ComposerVisibility = 'public' | 'followers' | 'private'
export type ComposerContentRating = 'safe' | 'sensitive' | 'adult_18plus'
export type ComposerCommunity = 'general' | 'sports' | 'geopolitics' | 'military' | 'adult_18plus'

export type ComposerSummaryItem = {
  label: string
  value: string
}

type ComposerAdvancedChipInput = {
  community: ComposerCommunity
  communityLabel: string
  contentRating: ComposerContentRating
  contentRatingLabel: string
  visibility: ComposerVisibility
  visibilityLabel: string
  isPaidPost: boolean
}

type ComposerPublishSummaryInput = {
  communityLabel: string
  visibilityLabel: string
  contentRatingLabel: string
  isPaidPost: boolean
}

type ComposerVisualGuardInput = {
  hasText: boolean
  mediaCount: number
  isOptimizingVideo: boolean
  isPaidPost: boolean
  paidPostPrice: string
  hasAdultSelection: boolean
  canAccessAdult18Plus: boolean
}

function hasValidPositiveInteger(value: string) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return false
  return Number.parseInt(trimmed, 10) > 0
}

export function getComposerActiveAdvancedChips(input: ComposerAdvancedChipInput) {
  const chips: string[] = []

  if (input.isPaidPost) chips.push('Post pago ativo')
  if (input.contentRating === 'adult_18plus' || input.community === 'adult_18plus') chips.push('Conteudo 18+')
  if (input.contentRating === 'sensitive') chips.push('Conteudo sensivel')
  if (input.community !== 'general') chips.push(`Comunidade: ${input.communityLabel}`)
  if (input.visibility !== 'public') chips.push(`Visibilidade: ${input.visibilityLabel}`)

  return chips
}

export function getComposerPublishSummary(input: ComposerPublishSummaryInput): ComposerSummaryItem[] {
  return [
    { label: 'Comunidade', value: input.communityLabel || 'Geral' },
    { label: 'Visibilidade', value: input.visibilityLabel || 'Publica' },
    { label: 'Tipo', value: input.isPaidPost ? 'Pago' : 'Gratuito' },
    { label: 'Classificacao', value: input.contentRatingLabel || 'Seguro' },
  ]
}

export function getComposerVisualGuardMessage(input: ComposerVisualGuardInput) {
  if (input.isOptimizingVideo) return 'Aguarde o video terminar de otimizar.'

  if (!input.hasText && input.mediaCount === 0) {
    return 'Escreva algo ou adicione uma foto ou video.'
  }

  if (input.isPaidPost && !hasValidPositiveInteger(input.paidPostPrice)) {
    return 'Defina um preco inteiro em ItaCash.'
  }

  if (input.hasAdultSelection && !input.canAccessAdult18Plus) {
    return 'Conteudo adulto 18+ exige verificacao aprovada.'
  }

  return null
}

export function getComposerProfileContentModeGuidance(profileContentMode: unknown) {
  return getProfileModeGuidance(profileContentMode)
}
