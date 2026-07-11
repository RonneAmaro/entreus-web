import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import { buildCreatorProfilePostsPayload, type CreatorProfilePost } from '@/lib/creator-profile-access'
import {
  parseBearerAuthorization,
  PRIVATE_NO_STORE_HEADERS,
  sanitizeCreatorProfilePayloadForResponse,
} from '@/lib/creator-profile-route-security'
import { getSafePostCommunity, getSafePostContentRating } from '@/lib/post-classification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type ProfileRow = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role?: string | null
  is_minor?: boolean | null
  wants_18_plus?: boolean | null
  age_verification_status?: string | null
}

type RepostRow = {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

type MediaRow = {
  id: string
  post_id: string
  user_id: string
  media_url: string | null
  media_type: 'image' | 'video' | 'gif'
  position: number
  created_at?: string
  access_level?: string | null
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      ...(init?.headers || {}),
    },
  })
}

function getSupabaseForRequest(authorization: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function normalizePost(post: CreatorProfilePost): CreatorProfilePost {
  return {
    ...post,
    visibility: post.visibility || 'public',
    is_sensitive: Boolean(post.is_sensitive),
    community_type: getSafePostCommunity(post.community_type),
    content_rating: getSafePostContentRating(post.content_rating),
    profiles: Array.isArray(post.profiles) ? post.profiles[0] || null : post.profiles,
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  let supabase

  const bearer = parseBearerAuthorization(request.headers.get('authorization'))

  if (!bearer.ok) {
    return jsonNoStore({ error: 'Sessao invalida.' }, { status: 401 })
  }

  try {
    supabase = getSupabaseForRequest(bearer.authorization)
  } catch {
    return jsonNoStore({ error: 'Configuracao indisponivel.' }, { status: 500 })
  }

  const { username } = await context.params
  const normalizedUsername = decodeURIComponent(username || '').trim()

  if (!normalizedUsername) {
    return jsonNoStore({ error: 'Perfil invalido.' }, { status: 400 })
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (bearer.authorization && (authError || !user)) {
    return jsonNoStore({ error: 'Sessao invalida.' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (profileError) {
    return jsonNoStore({ error: 'Nao foi possivel carregar o perfil.' }, { status: 500 })
  }

  if (!profile) {
    return jsonNoStore({ error: 'Perfil nao encontrado.' }, { status: 404 })
  }

  const targetProfile = profile as ProfileRow
  let viewerProfile: ProfileRow | null = null
  let isBlocked = false

  if (user) {
    const { data: viewerData } = await supabase
      .from('profiles')
      .select('id, role, is_minor, wants_18_plus, age_verification_status')
      .eq('id', user.id)
      .maybeSingle()

    viewerProfile = (viewerData as ProfileRow | null) || null

    if (user.id !== targetProfile.id) {
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('id')
        .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${targetProfile.id}),and(blocker_id.eq.${targetProfile.id},blocked_id.eq.${user.id})`)
        .limit(1)

      if (blockError) {
        return jsonNoStore({ error: 'Nao foi possivel verificar bloqueio.' }, { status: 500 })
      }

      isBlocked = Boolean(blockData && blockData.length > 0)
    }
  }

  if (isBlocked) {
    return jsonNoStore({ access: user ? 'available' : 'signed_out', posts: [], reposts: [] })
  }

  const { data: repostRows, error: repostsError } = await supabase
    .from('reposts')
    .select('id, post_id, user_id, created_at')
    .eq('user_id', targetProfile.id)
    .order('created_at', { ascending: false })

  if (repostsError) {
    return jsonNoStore({ error: 'Nao foi possivel carregar reposts.' }, { status: 500 })
  }

  const reposts = (repostRows || []) as RepostRow[]
  const repostPostIds = reposts.map((repost) => repost.post_id)
  const postSelect = `
    id,
    content,
    category,
    created_at,
    user_id,
    image_url,
    video_url,
    visibility,
    is_sensitive,
    community_type,
    content_rating,
    is_paid,
    price_itacash,
    moderation_status,
    moderated_at,
    moderated_by,
    moderation_reason,
    profiles (
      username,
      display_name,
      avatar_url,
      vip_status,
      vip_expires_at,
      profile_theme
    )
  `

  const { data: ownPostsData, error: ownPostsError } = await supabase
    .from('posts')
    .select(postSelect)
    .eq('user_id', targetProfile.id)
    .order('created_at', { ascending: false })

  if (ownPostsError) {
    return jsonNoStore({ error: 'Nao foi possivel carregar publicacoes.' }, { status: 500 })
  }

  let repostedPostsData: unknown[] = []

  if (repostPostIds.length > 0) {
    const { data, error } = await supabase
      .from('posts')
      .select(postSelect)
      .in('id', repostPostIds)

    if (error) {
      return jsonNoStore({ error: 'Nao foi possivel carregar posts repostados.' }, { status: 500 })
    }

    repostedPostsData = data || []
  }

  const postsById = new Map<string, CreatorProfilePost>()

  for (const post of [...((ownPostsData || []) as unknown[]), ...repostedPostsData]) {
    const normalized = normalizePost(post as CreatorProfilePost)
    postsById.set(normalized.id, normalized)
  }

  const posts = Array.from(postsById.values())
  const postIds = posts.map((post) => post.id)
  const unlockedPostIds = new Set<string>()
  const followingAuthorIds = new Set<string>()
  let mediaByPost: Record<string, MediaRow[]> = {}

  if (user && postIds.length > 0) {
    const { data: unlockRows } = await supabase
      .from('paid_post_unlocks')
      .select('post_id')
      .eq('buyer_id', user.id)
      .in('post_id', postIds)

    for (const row of unlockRows || []) {
      if (row.post_id) unlockedPostIds.add(row.post_id)
    }
  }

  if (user) {
    const authorIds = unique(posts.map((post) => post.user_id)).filter((authorId) => authorId !== user.id)

    if (authorIds.length > 0) {
      const { data: followRows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', authorIds)

      for (const row of followRows || []) {
        if (row.following_id) followingAuthorIds.add(row.following_id)
      }
    }
  }

  if (postIds.length > 0) {
    const { data: mediaRows } = await supabase
      .from('post_media')
      .select('id, post_id, user_id, media_url, media_type, position, created_at, access_level')
      .in('post_id', postIds)
      .order('position', { ascending: true })

    mediaByPost = ((mediaRows || []) as MediaRow[]).reduce<Record<string, MediaRow[]>>((acc, media) => {
      if (!acc[media.post_id]) acc[media.post_id] = []
      acc[media.post_id].push(media)
      return acc
    }, {})
  }

  const payload = buildCreatorProfilePostsPayload({
    posts,
    reposts: reposts.map((repost) => ({
      ...repost,
      profiles: {
        username: targetProfile.username,
        display_name: targetProfile.display_name,
        avatar_url: targetProfile.avatar_url,
      },
    })),
    mediaByPost,
    unlockedPostIds,
    followingAuthorIds,
    viewer: {
      viewerId: user?.id || null,
      viewerProfile: viewerProfile
        ? {
            isMinor: viewerProfile.is_minor,
            wants18Plus: viewerProfile.wants_18_plus,
            ageVerificationStatus: viewerProfile.age_verification_status,
          }
        : null,
      isAdmin: isAdminRole(viewerProfile?.role),
    },
  })

  return jsonNoStore(sanitizeCreatorProfilePayloadForResponse(payload))
}
