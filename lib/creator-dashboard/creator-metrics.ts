export type CreatorMetricState = { value: number; available: boolean }
export type CreatorDashboardMetrics = {
  posts: number; safePosts: number; sensitivePosts: number; adultPosts: number; recentPosts: number
  likes: CreatorMetricState; comments: CreatorMetricState; reposts: CreatorMetricState; followers: CreatorMetricState; views: CreatorMetricState
}
export type CreatorRecentPost = { id: string; excerpt: string; createdAt: string; classification: 'Seguro' | 'Sensível' | 'Adulto 18+' }

export function createEmptyCreatorMetrics(): CreatorDashboardMetrics {
  const unavailable = { value: 0, available: false }
  return { posts: 0, safePosts: 0, sensitivePosts: 0, adultPosts: 0, recentPosts: 0, likes: unavailable, comments: unavailable, reposts: unavailable, followers: unavailable, views: unavailable }
}

export function normalizeCreatorPosts(rows: Array<Record<string, unknown>>): CreatorRecentPost[] {
  return rows.map((row) => {
    const adult = row.community_type === 'adult_18plus' || row.content_rating === 'adult_18plus'
    const sensitive = row.content_rating === 'sensitive'
    const text = typeof row.content === 'string' ? row.content.replace(/\s+/g, ' ').trim() : ''
    return { id: String(row.id || ''), excerpt: text.slice(0, 110) || 'Publicação sem legenda', createdAt: String(row.created_at || ''), classification: adult ? 'Adulto 18+' : sensitive ? 'Sensível' : 'Seguro' }
  })
}

export function summarizeCreatorPosts(rows: Array<Record<string, unknown>>) {
  const metrics = createEmptyCreatorMetrics()
  metrics.posts = rows.length
  metrics.recentPosts = rows.length
  rows.forEach((row) => {
    if (row.community_type === 'adult_18plus' || row.content_rating === 'adult_18plus') metrics.adultPosts += 1
    else if (row.content_rating === 'sensitive') metrics.sensitivePosts += 1
    else metrics.safePosts += 1
  })
  return metrics
}
