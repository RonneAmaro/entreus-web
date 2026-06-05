import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const MAX_SEARCH_RESULTS = 12
const MAX_EMAIL_SCAN_PAGES = 3
const EMAIL_SCAN_PAGE_SIZE = 100

type BadgeRow = {
  id: string
  slug: string
  name: string
  title: string | null
  icon: string | null
  color: string | null
  rarity: string | null
}

type BadgeGrantRow = {
  id: string
  slug: string
  name: string
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  vip_plan?: string | null
  vip_status?: string | null
  vip_plus_badge_enabled?: boolean | null
}

type UserBadgeRow = {
  id: string
  user_id: string
  badge_id: string
  awarded_at: string | null
  reason: string | null
  badges: BadgeRow | BadgeRow[] | null
}

type BadgeActionBody = {
  action?: unknown
  userId?: unknown
  badgeSlug?: unknown
  userBadgeId?: unknown
  reason?: unknown
}

function cleanSearchQuery(value: string | null) {
  return (value || '').trim().replace(/^@+/, '').replace(/[%,]/g, '').slice(0, 80)
}

function normalizeReason(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, 240)
  return clean || null
}

function normalizeRelatedBadge(value: BadgeRow | BadgeRow[] | null) {
  if (Array.isArray(value)) return value[0] || null
  return value
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

  return { supabase, adminId: auth.user.id }
}

async function loadBadges(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await supabase
    .from('badges')
    .select('id, slug, name, title, icon, color, rarity')
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []) as BadgeRow[]
}

async function loadProfilesByIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  ids: string[],
) {
  if (ids.length === 0) return []

  const selectWithVip = 'id, username, display_name, avatar_url, vip_plan, vip_status, vip_plus_badge_enabled'
  const selectFallback = 'id, username, display_name, avatar_url'

  let { data, error } = await supabase
    .from('profiles')
    .select(selectWithVip)
    .in('id', ids)
    .limit(MAX_SEARCH_RESULTS)

  if (error && /vip_/i.test(error.message)) {
    const fallback = await supabase
      .from('profiles')
      .select(selectFallback)
      .in('id', ids)
      .limit(MAX_SEARCH_RESULTS)

    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) throw error
  return (data || []) as ProfileRow[]
}

async function searchAuthUserIdsByEmail(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  query: string,
) {
  if (!query.includes('@')) return { ids: [] as string[], emailsById: {} as Record<string, string> }

  const ids: string[] = []
  const emailsById: Record<string, string> = {}
  const lowerQuery = query.toLowerCase()

  for (let page = 1; page <= MAX_EMAIL_SCAN_PAGES && ids.length < MAX_SEARCH_RESULTS; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: EMAIL_SCAN_PAGE_SIZE,
    })

    if (error) break

    for (const user of data.users || []) {
      const email = user.email || ''
      if (email.toLowerCase().includes(lowerQuery)) {
        ids.push(user.id)
        emailsById[user.id] = email
      }
    }
  }

  return { ids: Array.from(new Set(ids)).slice(0, MAX_SEARCH_RESULTS), emailsById }
}

async function loadEmailsById(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  ids: string[],
  knownEmails: Record<string, string> = {},
) {
  const entries = await Promise.all(
    ids.map(async (id) => {
      if (knownEmails[id]) return [id, knownEmails[id]] as const
      const { data, error } = await supabase.auth.admin.getUserById(id)
      if (error) return [id, null] as const
      return [id, data.user?.email || null] as const
    }),
  )

  return entries.reduce<Record<string, string | null>>((acc, [id, email]) => {
    acc[id] = email
    return acc
  }, {})
}

async function searchProfiles(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  query: string,
) {
  if (query.length < 2) return { profiles: [] as ProfileRow[], emailsById: {} as Record<string, string | null> }

  const emailSearch = await searchAuthUserIdsByEmail(supabase, query)
  let profiles: ProfileRow[] = []

  if (emailSearch.ids.length > 0) {
    profiles = await loadProfilesByIds(supabase, emailSearch.ids)
  } else {
    const selectWithVip = 'id, username, display_name, avatar_url, vip_plan, vip_status, vip_plus_badge_enabled'
    const selectFallback = 'id, username, display_name, avatar_url'

    let { data, error } = await supabase
      .from('profiles')
      .select(selectWithVip)
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(MAX_SEARCH_RESULTS)

    if (error && /vip_/i.test(error.message)) {
      const fallback = await supabase
        .from('profiles')
        .select(selectFallback)
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(MAX_SEARCH_RESULTS)

      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) throw error
    profiles = (data || []) as ProfileRow[]
  }

  const emailsById = await loadEmailsById(
    supabase,
    profiles.map((profile) => profile.id),
    emailSearch.emailsById,
  )

  return { profiles, emailsById }
}

async function loadUserBadges(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userIds: string[],
) {
  if (userIds.length === 0) return {}

  const { data, error } = await supabase
    .from('user_badges')
    .select(`
      id,
      user_id,
      badge_id,
      awarded_at,
      reason,
      badges (
        id,
        slug,
        name,
        title,
        icon,
        color,
        rarity
      )
    `)
    .in('user_id', userIds)
    .order('awarded_at', { ascending: true })

  if (error) throw error

  return ((data || []) as UserBadgeRow[]).reduce<Record<string, UserBadgeRow[]>>((acc, row) => {
    acc[row.user_id] = acc[row.user_id] || []
    acc[row.user_id].push(row)
    return acc
  }, {})
}

async function logBadgeAction(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: {
    userId: string
    badgeId: string | null
    badgeSlug: string
    action: 'granted' | 'revoked'
    adminId: string
    reason: string | null
  },
) {
  const { error } = await supabase.from('user_badge_audit_logs').insert({
    user_id: payload.userId,
    badge_id: payload.badgeId,
    badge_slug: payload.badgeSlug,
    action: payload.action,
    admin_id: payload.adminId,
    reason: payload.reason,
  })

  if (error) {
    console.warn('[AdminBadges] Audit log failed:', error.message)
  }
}

async function notifyBadgeAwarded(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: {
    userId: string
    adminId: string
    badgeId: string
  },
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: payload.userId,
    actor_id: payload.adminId,
    type: 'badge_awarded',
    badge_id: payload.badgeId,
  })

  if (error) {
    console.warn('[AdminBadges] Badge notification failed:', error.message)
  }
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request)
  if ('error' in admin) return admin.error

  const url = new URL(request.url)
  const query = cleanSearchQuery(url.searchParams.get('q'))

  try {
    const badges = await loadBadges(admin.supabase)
    const { profiles, emailsById } = await searchProfiles(admin.supabase, query)
    const userBadgesByUserId = await loadUserBadges(admin.supabase, profiles.map((profile) => profile.id))

    return NextResponse.json({
      ok: true,
      badges,
      users: profiles.map((profile) => ({
        ...profile,
        email: emailsById[profile.id] || null,
        badges: (userBadgesByUserId[profile.id] || []).map((row) => ({
          id: row.id,
          awardedAt: row.awarded_at,
          reason: row.reason,
          badge: normalizeRelatedBadge(row.badges),
        })),
      })),
    })
  } catch (error) {
    console.warn('[AdminBadges] Load failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonError('Nao foi possivel carregar selos. Confira se a migration de selos foi aplicada.', 500)
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request)
  if ('error' in admin) return admin.error

  let body: BadgeActionBody

  try {
    body = (await request.json()) as BadgeActionBody
  } catch {
    return jsonError('Envio invalido.', 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const badgeSlug = typeof body.badgeSlug === 'string' ? body.badgeSlug : ''
  const userBadgeId = typeof body.userBadgeId === 'string' ? body.userBadgeId : ''
  const reason = normalizeReason(body.reason)

  if (action !== 'grant' && action !== 'revoke') return jsonError('Acao invalida.', 400)
  if (!userId) return jsonError('Usuario invalido.', 400)

  try {
    if (action === 'grant') {
      if (!badgeSlug) return jsonError('Selo invalido.', 400)

      const { data: badge, error: badgeError } = await admin.supabase
        .from('badges')
        .select('id, slug, name')
        .eq('slug', badgeSlug)
        .maybeSingle()

      if (badgeError || !badge) return jsonError('Selo nao encontrado.', 404)
      const selectedBadge = badge as BadgeGrantRow

      const { data: existing, error: existingError } = await admin.supabase
        .from('user_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', selectedBadge.id)
        .maybeSingle()

      if (existingError) return jsonError('Nao foi possivel verificar selo atual.', 500)

      if (!existing) {
        const { error: insertError } = await admin.supabase.from('user_badges').insert({
          user_id: userId,
          badge_id: selectedBadge.id,
          awarded_by: admin.adminId,
          reason,
        })

        if (insertError) return jsonError('Nao foi possivel conceder selo.', 500)

        await logBadgeAction(admin.supabase, {
          userId,
          badgeId: selectedBadge.id,
          badgeSlug: selectedBadge.slug,
          action: 'granted',
          adminId: admin.adminId,
          reason,
        })

        await notifyBadgeAwarded(admin.supabase, {
          userId,
          adminId: admin.adminId,
          badgeId: selectedBadge.id,
        })
      }

      return NextResponse.json({
        ok: true,
        message: existing ? 'Usuario ja possui este selo.' : `Selo ${selectedBadge.name} concedido com sucesso.`,
      })
    }

    if (!userBadgeId) return jsonError('Selo do usuario invalido.', 400)

    const { data: current, error: currentError } = await admin.supabase
      .from('user_badges')
      .select(`
        id,
        user_id,
        badge_id,
        badges (
          id,
          slug,
          name
        )
      `)
      .eq('id', userBadgeId)
      .eq('user_id', userId)
      .maybeSingle()

    if (currentError || !current) return jsonError('Selo do usuario nao encontrado.', 404)

    const relatedBadge = normalizeRelatedBadge(current.badges as BadgeRow | BadgeRow[] | null)
    const { error: deleteError } = await admin.supabase
      .from('user_badges')
      .delete()
      .eq('id', userBadgeId)
      .eq('user_id', userId)

    if (deleteError) return jsonError('Nao foi possivel remover selo.', 500)

    await logBadgeAction(admin.supabase, {
      userId,
      badgeId: current.badge_id,
      badgeSlug: relatedBadge?.slug || 'unknown',
      action: 'revoked',
      adminId: admin.adminId,
      reason,
    })

    return NextResponse.json({
      ok: true,
      message: 'Selo removido com sucesso.',
    })
  } catch (error) {
    console.warn('[AdminBadges] Action failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonError('Nao foi possivel atualizar selo agora.', 500)
  }
}
