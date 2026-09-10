export type PublicLiker = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
}

export const LIKER_PREVIEW_LIMIT = 3
export const LIKER_DETAILS_LIMIT = 20

export function uniqueLikerIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter(Boolean)))
}

export function publicLikerName(liker: Pick<PublicLiker, 'display_name' | 'username'>) {
  return liker.display_name?.trim() || liker.username?.trim() || null
}

export function summarizeLikers(
  likers: PublicLiker[],
  totalLikes: number,
  locale: string,
) {
  const names = likers
    .map(publicLikerName)
    .filter((name): name is string => Boolean(name))
    .slice(0, LIKER_PREVIEW_LIMIT)

  if (names.length === 0) return ''

  if (totalLikes <= names.length) {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names)
  }

  const visibleNames = names.slice(0, Math.min(2, names.length))
  const remaining = Math.max(0, totalLikes - visibleNames.length)
  return `${new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(visibleNames)} +${remaining}`
}
