import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const MAX_SOURCE_ROWS = 5000
const MAX_CANDIDATES = 50
const MAX_ALREADY_AWARDED = 20
const COMMUNITY_BADGE_SLUG = 'community'

type PostMetricRow = {
  id: string
  user_id: string | null
  created_at?: string | null
  moderation_status?: string | null
}

type InteractionRow = {
  id: string
  user_id: string | null
  post_id: string | null
  created_at?: string | null
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type UserBadgeRow = {
  user_id: string
  badges: { slug: string | null } | { slug: string | null }[] | null
}

type UserMetrics = {
  userId: string
  postsPublished: number
  commentsMade: number
  likesReceived: number
  commentsReceived: number
  repostsReceived: number
  hiddenPosts: number
  activeDays: Set<string>
}

function createMetrics(userId: string): UserMetrics {
  return {
    userId,
    postsPublished: 0,
    commentsMade: 0,
    likesReceived: 0,
    commentsReceived: 0,
    repostsReceived: 0,
    hiddenPosts: 0,
    activeDays: new Set<string>(),
  }
}

function getActivityDay(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString().slice(0, 10)
}

function getRelatedBadgeSlug(value: UserBadgeRow['badges']) {
  if (Array.isArray(value)) return value[0]?.slug || null
  return value?.slug || null
}

function getScore(metrics: UserMetrics) {
  const activeDayBonus = Math.min(metrics.activeDays.size, 10)

  return (
    metrics.postsPublished * 5 +
    metrics.commentsMade * 2 +
    metrics.likesReceived +
    metrics.commentsReceived * 2 +
    metrics.repostsReceived * 3 +
    activeDayBonus -
    metrics.hiddenPosts * 20
  )
}

function isEligible(metrics: UserMetrics, score: number) {
  const realInteractions = metrics.likesReceived + metrics.commentsReceived + metrics.repostsReceived + metrics.commentsMade
  return score >= 50 || (metrics.postsPublished >= 10 && realInteractions >= 30)
}

async function requireAdmin(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuracao Supabase ausente no servidor.', 500) }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError) return { error: jsonError('Nao foi possivel verificar permissao admin.', 500) }
  if (!isAdminRole(profile?.role)) return { error: jsonError('Acesso restrito a administradores.', 403) }

  return { supabase }
}

async function loadPosts(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, warnings: string[]) {
  const withModeration = await supabase
    .from('posts')
    .select('id, user_id, created_at, moderation_status')
    .order('created_at', { ascending: false })
    .range(0, MAX_SOURCE_ROWS - 1)

  if (!withModeration.error) {
    return withModeration.data as PostMetricRow[]
  }

  const fallback = await supabase
    .from('posts')
    .select('id, user_id, created_at')
    .order('created_at', { ascending: false })
    .range(0, MAX_SOURCE_ROWS - 1)

  if (fallback.error) {
    warnings.push('posts indisponivel')
    return []
  }

  warnings.push('moderation_status indisponivel; penalidade de moderacao nao foi calculada')
  return fallback.data as PostMetricRow[]
}

async function loadInteractions(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: 'comments' | 'likes' | 'reposts',
  warnings: string[],
) {
  const withDate = await supabase
    .from(table)
    .select('id, user_id, post_id, created_at')
    .range(0, MAX_SOURCE_ROWS - 1)

  if (!withDate.error) {
    return withDate.data as InteractionRow[]
  }

  const fallback = await supabase
    .from(table)
    .select('id, user_id, post_id')
    .range(0, MAX_SOURCE_ROWS - 1)

  if (fallback.error) {
    warnings.push(`${table} indisponivel`)
    return []
  }

  return fallback.data as InteractionRow[]
}

async function loadCommunityBadgeHolders(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  warnings: string[],
) {
  const { data, error } = await supabase
    .from('user_badges')
    .select(`
      user_id,
      badges (
        slug
      )
    `)

  if (error) {
    warnings.push('user_badges indisponivel; duplicidade de selo nao pode ser filtrada')
    return new Set<string>()
  }

  return new Set(
    ((data || []) as UserBadgeRow[])
      .filter((row) => getRelatedBadgeSlug(row.badges) === COMMUNITY_BADGE_SLUG)
      .map((row) => row.user_id),
  )
}

async function loadProfiles(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userIds: string[],
  warnings: string[],
) {
  if (userIds.length === 0) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds)

  if (error) {
    warnings.push('profiles indisponivel')
    return {}
  }

  return ((data || []) as ProfileRow[]).reduce<Record<string, ProfileRow>>((acc, profile) => {
    acc[profile.id] = profile
    return acc
  }, {})
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request)
  if ('error' in admin) return admin.error

  const warnings: string[] = []

  try {
    const [posts, comments, likes, reposts, communityBadgeHolders] = await Promise.all([
      loadPosts(admin.supabase, warnings),
      loadInteractions(admin.supabase, 'comments', warnings),
      loadInteractions(admin.supabase, 'likes', warnings),
      loadInteractions(admin.supabase, 'reposts', warnings),
      loadCommunityBadgeHolders(admin.supabase, warnings),
    ])

    const metricsByUser = new Map<string, UserMetrics>()
    const postOwnerById = new Map<string, string>()

    function ensureMetrics(userId: string) {
      if (!metricsByUser.has(userId)) metricsByUser.set(userId, createMetrics(userId))
      return metricsByUser.get(userId) as UserMetrics
    }

    for (const post of posts) {
      if (!post.user_id) continue
      postOwnerById.set(post.id, post.user_id)
      const metrics = ensureMetrics(post.user_id)
      metrics.postsPublished += 1
      const day = getActivityDay(post.created_at)
      if (day) metrics.activeDays.add(day)
      if (post.moderation_status === 'hidden' || post.moderation_status === 'removed') {
        metrics.hiddenPosts += 1
      }
    }

    for (const comment of comments) {
      if (comment.user_id) {
        const metrics = ensureMetrics(comment.user_id)
        metrics.commentsMade += 1
        const day = getActivityDay(comment.created_at)
        if (day) metrics.activeDays.add(day)
      }

      const postOwnerId = comment.post_id ? postOwnerById.get(comment.post_id) : null
      if (postOwnerId && postOwnerId !== comment.user_id) {
        ensureMetrics(postOwnerId).commentsReceived += 1
      }
    }

    for (const like of likes) {
      const postOwnerId = like.post_id ? postOwnerById.get(like.post_id) : null
      if (postOwnerId && postOwnerId !== like.user_id) {
        ensureMetrics(postOwnerId).likesReceived += 1
      }
    }

    for (const repost of reposts) {
      const postOwnerId = repost.post_id ? postOwnerById.get(repost.post_id) : null
      if (postOwnerId && postOwnerId !== repost.user_id) {
        ensureMetrics(postOwnerId).repostsReceived += 1
      }

      if (repost.user_id) {
        const day = getActivityDay(repost.created_at)
        if (day) ensureMetrics(repost.user_id).activeDays.add(day)
      }
    }

    const ranked = Array.from(metricsByUser.values())
      .map((metrics) => {
        const score = getScore(metrics)
        return {
          metrics,
          score,
          eligible: isEligible(metrics, score),
          hasCommunityBadge: communityBadgeHolders.has(metrics.userId),
        }
      })
      .filter((item) => item.eligible || item.hasCommunityBadge)
      .sort((a, b) => b.score - a.score)

    const candidateRows = ranked
      .filter((item) => item.eligible && !item.hasCommunityBadge)
      .slice(0, MAX_CANDIDATES)
    const alreadyAwardedRows = ranked
      .filter((item) => item.hasCommunityBadge)
      .slice(0, MAX_ALREADY_AWARDED)

    const profilesById = await loadProfiles(
      admin.supabase,
      Array.from(new Set([...candidateRows, ...alreadyAwardedRows].map((item) => item.metrics.userId))),
      warnings,
    )

    function serialize(item: (typeof ranked)[number]) {
      const profile = profilesById[item.metrics.userId] || null
      return {
        userId: item.metrics.userId,
        username: profile?.username || null,
        displayName: profile?.display_name || null,
        avatarUrl: profile?.avatar_url || null,
        score: item.score,
        hasCommunityBadge: item.hasCommunityBadge,
        metrics: {
          postsPublished: item.metrics.postsPublished,
          commentsMade: item.metrics.commentsMade,
          likesReceived: item.metrics.likesReceived,
          commentsReceived: item.metrics.commentsReceived,
          repostsReceived: item.metrics.repostsReceived,
          hiddenPosts: item.metrics.hiddenPosts,
          activeDays: item.metrics.activeDays.size,
        },
        reason: `Score ${item.score}: ${item.metrics.postsPublished} posts, ${item.metrics.commentsMade} comentarios, ${item.metrics.likesReceived} curtidas recebidas, ${item.metrics.commentsReceived} comentarios recebidos, ${item.metrics.repostsReceived} reposts recebidos.`,
      }
    }

    return NextResponse.json({
      ok: true,
      threshold: {
        score: 50,
        alternative: '10 posts e 30 interacoes reais',
      },
      scoring: {
        postPublished: 5,
        commentMade: 2,
        likeReceived: 1,
        commentReceived: 2,
        repostReceived: 3,
        activeDayBonusMax: 10,
        hiddenPostPenalty: -20,
      },
      metricsUsed: [
        'posts publicados',
        'comentarios feitos',
        'curtidas recebidas nos posts',
        'comentarios recebidos nos posts',
        'reposts recebidos',
        'dias de atividade',
        'penalidade por post oculto/removido quando moderation_status esta disponivel',
      ],
      warnings: Array.from(new Set(warnings)),
      candidates: candidateRows.map(serialize),
      alreadyAwarded: alreadyAwardedRows.map(serialize),
    })
  } catch (error) {
    console.warn('[AdminBadgeSuggestions] Load failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonError('Nao foi possivel carregar recomendacoes de selo agora.', 500)
  }
}
