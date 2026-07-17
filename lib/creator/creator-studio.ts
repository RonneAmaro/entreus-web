export const CREATOR_CONTENT_PAGE_SIZE = 12
export const CREATOR_PERIODS = [7, 30, 90] as const
export type CreatorPeriod = typeof CREATOR_PERIODS[number]

export type CreatorStudioPost = {
  id: string
  content: string
  createdAt: string
  category: string
  visibility: 'public' | 'followers' | 'private'
  moderationStatus: 'active' | 'hidden' | 'removed'
  isPaid: boolean
  likes: number
  comments: number
  views: number | null
}

export type CreatorStudioOverview = {
  profile: {
    username: string
    displayName: string
    avatarUrl: string | null
    bio: string
    ageVerificationStatus: string
  }
  metrics: {
    posts: number
    followers: number | null
    likes: number | null
    comments: number | null
    views: number | null
  }
  earnings: {
    availableBalance: number | null
    tipsReceived: number | null
    paidPostsReceived: number | null
    pendingWithdrawals: number | null
  }
  checklist: Array<{ id: string; label: string; complete: boolean; href: string }>
  content: CreatorStudioPost[]
  nextCursor: string | null
  partialErrors: string[]
  period: CreatorPeriod
}

export function parseCreatorPeriod(value: unknown): CreatorPeriod | null {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return CREATOR_PERIODS.includes(parsed as CreatorPeriod) ? parsed as CreatorPeriod : null
}

export function encodeCreatorCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url')
}

export function decodeCreatorCursor(value: string | null) {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
    if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) return null
    if (typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

export function sanitizeCreatorSearch(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 80)
}

export function buildCreatorChecklist(input: {
  avatarUrl?: string | null
  displayName?: string | null
  username?: string | null
  bio?: string | null
  postCount: number
}) {
  return [
    { id: 'avatar', label: 'Adicionar foto de perfil', complete: Boolean(input.avatarUrl), href: '/profile' },
    { id: 'identity', label: 'Completar nome e identificador', complete: Boolean(input.displayName?.trim() && input.username?.trim()), href: '/profile' },
    { id: 'bio', label: 'Escrever uma biografia', complete: Boolean(input.bio?.trim()), href: '/profile' },
    { id: 'first-post', label: 'Publicar o primeiro conteúdo', complete: input.postCount > 0, href: '/feed?compose=text' },
  ]
}

export function sumIntegerAmounts(rows: Array<{ amount?: unknown }>) {
  return rows.reduce((total, row) => {
    const amount = typeof row.amount === 'number' && Number.isSafeInteger(row.amount) ? row.amount : 0
    return total + amount
  }, 0)
}
