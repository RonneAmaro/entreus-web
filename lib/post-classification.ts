export type PostCommunityType =
  | 'general'
  | 'sports'
  | 'geopolitics'
  | 'military'
  | 'adult_18plus'

export type PostContentRating = 'safe' | 'sensitive' | 'adult_18plus'

export type PostCommunityFilter = PostCommunityType

export type PostClassificationViewer = {
  isMinor?: boolean | null
  wants18Plus?: boolean | null
  ageVerificationStatus?: string | null
}

export type PostCommunityDefinition = {
  key: PostCommunityType
  label: string
  description: string
  sensitive: boolean
  requires18Plus: boolean
  defaultRating: PostContentRating
}

export const POST_COMMUNITIES: PostCommunityDefinition[] = [
  {
    key: 'general',
    label: 'Geral',
    description: 'Assuntos cotidianos e posts seguros do feed geral.',
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

export const POST_CONTENT_RATINGS: {
  key: PostContentRating
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

const POST_COMMUNITY_KEYS = new Set(POST_COMMUNITIES.map((community) => community.key))
const POST_CONTENT_RATING_KEYS = new Set(POST_CONTENT_RATINGS.map((rating) => rating.key))

export function isPostCommunityType(value: unknown): value is PostCommunityType {
  return typeof value === 'string' && POST_COMMUNITY_KEYS.has(value as PostCommunityType)
}

export function isPostContentRating(value: unknown): value is PostContentRating {
  return typeof value === 'string' && POST_CONTENT_RATING_KEYS.has(value as PostContentRating)
}

export function getSafePostCommunity(value: unknown): PostCommunityType {
  return isPostCommunityType(value) ? value : 'general'
}

export function getSafePostContentRating(value: unknown): PostContentRating {
  return isPostContentRating(value) ? value : 'safe'
}

export function getPostCommunityDefinition(value: unknown) {
  const community = getSafePostCommunity(value)

  return POST_COMMUNITIES.find((item) => item.key === community) || POST_COMMUNITIES[0]
}

export function canViewAdultPostContent(viewer: PostClassificationViewer | null | undefined) {
  return Boolean(
    viewer &&
      !viewer.isMinor &&
      viewer.wants18Plus &&
      viewer.ageVerificationStatus === 'approved',
  )
}

export function isAdultPostClassification(community: unknown, rating?: unknown) {
  return getSafePostCommunity(community) === 'adult_18plus' || getSafePostContentRating(rating) === 'adult_18plus'
}

export function canViewerSeePostClassification(
  viewer: PostClassificationViewer | null | undefined,
  community: unknown,
  rating?: unknown,
) {
  if (!isAdultPostClassification(community, rating)) return true

  return canViewAdultPostContent(viewer)
}

export function shouldShowInGeneralFeed(community: unknown, rating?: unknown) {
  return getSafePostCommunity(community) === 'general' && getSafePostContentRating(rating) === 'safe'
}

export function resolvePostContentRating(
  community: unknown,
  requestedRating?: unknown,
): PostContentRating {
  const safeCommunity = getSafePostCommunity(community)

  if (safeCommunity === 'adult_18plus') return 'adult_18plus'

  const safeRating = getSafePostContentRating(requestedRating)
  if (safeRating === 'adult_18plus') return 'adult_18plus'
  if (safeRating === 'sensitive') return 'sensitive'

  return getPostCommunityDefinition(safeCommunity).defaultRating
}

export function getPostCommunityLabel(value: unknown) {
  return getPostCommunityDefinition(value).label
}

export function getPostContentRatingLabel(value: unknown) {
  const rating = getSafePostContentRating(value)

  return POST_CONTENT_RATINGS.find((item) => item.key === rating)?.label || 'Seguro'
}

export function getAllowedPostCommunityFilters(viewer: PostClassificationViewer | null | undefined) {
  const filters: PostCommunityFilter[] = ['general', 'sports', 'geopolitics', 'military']

  return canViewAdultPostContent(viewer) ? [...filters, 'adult_18plus'] : filters
}
