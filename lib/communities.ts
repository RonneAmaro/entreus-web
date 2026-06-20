export type CommunityType =
  | 'general'
  | 'sports'
  | 'geopolitics'
  | 'military'
  | 'adult_18plus'

export type ContentRating = 'safe' | 'sensitive' | 'adult_18plus'

export type CommunityFilter = 'all' | CommunityType

export type CommunityViewer = {
  isMinor?: boolean | null
  wants18Plus?: boolean | null
  ageVerificationStatus?: string | null
}

export type CommunityDefinition = {
  key: CommunityType
  label: string
  description: string
  sensitive: boolean
  requires18Plus: boolean
  defaultRating: ContentRating
}

export const COMMUNITIES: CommunityDefinition[] = [
  {
    key: 'general',
    label: 'Geral',
    description: 'Assuntos cotidianos e posts gerais.',
    sensitive: false,
    requires18Plus: false,
    defaultRating: 'safe',
  },
  {
    key: 'sports',
    label: 'Esportes',
    description: 'Times, campeonatos, treinos e cultura esportiva.',
    sensitive: false,
    requires18Plus: false,
    defaultRating: 'safe',
  },
  {
    key: 'geopolitics',
    label: 'Geopolitica',
    description: 'Debates politicos e acontecimentos internacionais.',
    sensitive: true,
    requires18Plus: false,
    defaultRating: 'sensitive',
  },
  {
    key: 'military',
    label: 'Militar',
    description: 'Historia, defesa, tecnologia e analises militares.',
    sensitive: true,
    requires18Plus: false,
    defaultRating: 'sensitive',
  },
  {
    key: 'adult_18plus',
    label: 'Adulto 18+',
    description: 'Ambiente isolado para conteudo adulto verificado.',
    sensitive: true,
    requires18Plus: true,
    defaultRating: 'adult_18plus',
  },
]

export const CONTENT_RATINGS: {
  key: ContentRating
  label: string
  description: string
  requires18Plus: boolean
}[] = [
  {
    key: 'safe',
    label: 'Seguro',
    description: 'Conteudo adequado para areas comuns.',
    requires18Plus: false,
  },
  {
    key: 'sensitive',
    label: 'Sensivel',
    description: 'Tema delicado, sem ser adulto.',
    requires18Plus: false,
  },
  {
    key: 'adult_18plus',
    label: 'Adulto 18+',
    description: 'Apenas para usuarios verificados 18+.',
    requires18Plus: true,
  },
]

const COMMUNITY_KEYS = new Set(COMMUNITIES.map((community) => community.key))
const CONTENT_RATING_KEYS = new Set(CONTENT_RATINGS.map((rating) => rating.key))

export function isCommunityType(value: unknown): value is CommunityType {
  return typeof value === 'string' && COMMUNITY_KEYS.has(value as CommunityType)
}

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && CONTENT_RATING_KEYS.has(value as ContentRating)
}

export function normalizeCommunity(value: unknown): CommunityType {
  return isCommunityType(value) ? value : 'general'
}

export function normalizeContentRating(value: unknown): ContentRating {
  return isContentRating(value) ? value : 'safe'
}

export function getCommunityDefinition(value: unknown) {
  const community = normalizeCommunity(value)

  return COMMUNITIES.find((item) => item.key === community) || COMMUNITIES[0]
}

export function canViewAdult18Plus(viewer: CommunityViewer | null | undefined) {
  return Boolean(
    viewer &&
      !viewer.isMinor &&
      viewer.wants18Plus &&
      viewer.ageVerificationStatus === 'approved',
  )
}

export function canViewCommunity(
  viewer: CommunityViewer | null | undefined,
  community: unknown,
  rating?: unknown,
) {
  const normalizedCommunity = normalizeCommunity(community)
  const normalizedRating = normalizeContentRating(rating)

  if (normalizedCommunity !== 'adult_18plus' && normalizedRating !== 'adult_18plus') {
    return true
  }

  return canViewAdult18Plus(viewer)
}

export function resolveContentRating(
  community: unknown,
  requestedRating?: unknown,
): ContentRating {
  const normalizedCommunity = normalizeCommunity(community)

  if (normalizedCommunity === 'adult_18plus') return 'adult_18plus'

  const normalizedRating = normalizeContentRating(requestedRating)
  if (normalizedRating === 'adult_18plus') return 'adult_18plus'
  if (normalizedRating === 'sensitive') return 'sensitive'

  return getCommunityDefinition(normalizedCommunity).defaultRating
}

export function getCommunityLabel(value: unknown) {
  return getCommunityDefinition(value).label
}

export function getContentRatingLabel(value: unknown) {
  const rating = normalizeContentRating(value)

  return CONTENT_RATINGS.find((item) => item.key === rating)?.label || 'Seguro'
}

export function getAllowedCommunityFilters(viewer: CommunityViewer | null | undefined) {
  const baseFilters: CommunityFilter[] = ['all', 'general', 'sports', 'geopolitics', 'military']

  return canViewAdult18Plus(viewer) ? [...baseFilters, 'adult_18plus'] : baseFilters
}

export function isAdultCommunityOrRating(community: unknown, rating?: unknown) {
  return normalizeCommunity(community) === 'adult_18plus' || normalizeContentRating(rating) === 'adult_18plus'
}
