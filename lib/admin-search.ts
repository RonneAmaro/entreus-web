export type AdminSearchableCard = {
  title: string
  description: string
  href: string
  keywords?: readonly string[]
}

export function normalizeAdminSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function filterAdminCards<T extends AdminSearchableCard>(
  cards: readonly T[],
  query: string,
) {
  const normalizedQuery = normalizeAdminSearchText(query)

  if (!normalizedQuery) {
    return [...cards]
  }

  const terms = normalizedQuery.split(' ').filter(Boolean)

  return cards.filter((card) => {
    const haystack = normalizeAdminSearchText([
      card.title,
      card.description,
      card.href,
      ...(card.keywords || []),
    ].join(' '))

    return terms.every((term) => haystack.includes(term))
  })
}
