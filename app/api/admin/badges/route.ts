import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const MAX_SEARCH_RESULTS = 12
const MAX_EMAIL_SCAN_PAGES = 3
const EMAIL_SCAN_PAGE_SIZE = 100
const PROFILE_SCAN_PAGE_SIZE = 500
const MAX_PROFILE_SCAN_PAGES = 6

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

type BadgeLoadResult = {
  badges: BadgeRow[]
  warnings: string[]
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at?: string | null
  vip_plan?: string | null
  vip_status?: string | null
  vip_started_at?: string | null
  vip_expires_at?: string | null
  vip_plus_badge_enabled?: boolean | null
  vip_source?: string | null
  vip_reason?: string | null
  vip_updated_at?: string | null
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
  durationDays?: unknown
  planKey?: unknown
}

type VipActionProfileRow = {
  vip_status: string | null
  vip_started_at: string | null
  vip_expires_at: string | null
}

type ProfileSearchDiagnostics = {
  originalTerm: string
  normalizedTerm: string
  usernameTerm: string
  directCount: number
  fallbackScannedCount: number
  fallbackCount: number
  finalCount: number
}

class SafeApiError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

function cleanSearchQuery(value: string | null) {
  return (value || '').trim().replace(/^@+/, '').replace(/[%,]/g, '').replace(/\s+/g, ' ').slice(0, 80)
}

function getUsernameSearchQuery(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

function normalizeSearchText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function createSearchDiagnostics(originalQuery: string, query: string): ProfileSearchDiagnostics {
  return {
    originalTerm: originalQuery,
    normalizedTerm: normalizeSearchText(query),
    usernameTerm: getUsernameSearchQuery(query),
    directCount: 0,
    fallbackScannedCount: 0,
    fallbackCount: 0,
    finalCount: 0,
  }
}

function profileMatchesSearch(profile: ProfileRow, query: string) {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedUsernameQuery = normalizeSearchText(getUsernameSearchQuery(query))
  if (!normalizedQuery) return false

  return [
    normalizeSearchText(profile.display_name),
    normalizeSearchText(profile.username),
  ].some((value) => value.includes(normalizedQuery) || value.includes(normalizedUsernameQuery))
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

function normalizeBadgeRow(row: Partial<BadgeRow> & { id: string; slug: string; name: string }): BadgeRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title ?? null,
    icon: row.icon ?? null,
    color: row.color ?? null,
    rarity: row.rarity ?? null,
  }
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

async function loadBadges(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<BadgeLoadResult> {
  const warnings: string[] = []
  const fullSelect = await supabase
    .from('badges')
    .select('id, slug, name, title, icon, color, rarity')
    .order('name', { ascending: true })

  if (!fullSelect.error) {
    const badges = ((fullSelect.data || []) as BadgeRow[]).map(normalizeBadgeRow)
    if (badges.length === 0) throw new SafeApiError('Nenhum selo cadastrado na tabela badges.', 404)
    return { badges, warnings }
  }

  console.warn('[AdminBadges] Badge full select failed:', fullSelect.error.message)
  warnings.push('Campos opcionais de badges indisponiveis; usando id, slug e name.')

  const fallback = await supabase
    .from('badges')
    .select('id, slug, name')
    .order('name', { ascending: true })

  if (fallback.error) {
    console.warn('[AdminBadges] Badge fallback select failed:', fallback.error.message)
    throw new SafeApiError('Falha ao consultar tabela badges.', 500)
  }

  const badges = ((fallback.data || []) as Array<{ id: string; slug: string; name: string }>).map(normalizeBadgeRow)
  if (badges.length === 0) throw new SafeApiError('Nenhum selo cadastrado na tabela badges.', 404)

  return { badges, warnings }
}

async function loadProfilesByIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  ids: string[],
) {
  if (ids.length === 0) return []

  const selectWithVip = 'id, username, display_name, avatar_url, vip_plan, vip_status, vip_started_at, vip_expires_at, vip_plus_badge_enabled, vip_source, vip_reason, vip_updated_at'
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

async function enrichProfilesByIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  profiles: ProfileRow[],
) {
  if (profiles.length === 0) return []

  const enrichedProfiles = await loadProfilesByIds(
    supabase,
    profiles.map((profile) => profile.id),
  )
  const enrichedById = new Map(enrichedProfiles.map((profile) => [profile.id, profile]))

  return profiles.map((profile) => enrichedById.get(profile.id) || profile)
}

function mergeProfiles(profileGroups: ProfileRow[][]) {
  const profilesById = new Map<string, ProfileRow>()

  for (const group of profileGroups) {
    for (const profile of group) {
      profilesById.set(profile.id, profile)
    }
  }

  return Array.from(profilesById.values()).slice(0, MAX_SEARCH_RESULTS)
}

async function loadProfilesBySearch(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  query: string,
) {
  const baseSelect = 'id, username, display_name, avatar_url, created_at'
  const usernameQuery = getUsernameSearchQuery(query)
  const displayTerms = Array.from(new Set([query, usernameQuery].filter(Boolean)))

  async function runProfileSearch(column: 'username' | 'display_name', term: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select(baseSelect)
      .ilike(column, `%${term}%`)
      .order('created_at', { ascending: false })
      .limit(MAX_SEARCH_RESULTS)

    if (error) throw error
    return (data || []) as ProfileRow[]
  }

  const [usernameMatches, ...nameMatchGroups] = await Promise.all([
    runProfileSearch('username', usernameQuery),
    ...displayTerms.map((term) => runProfileSearch('display_name', term)),
  ])

  return mergeProfiles([usernameMatches, ...nameMatchGroups])
}

async function scanProfilesBySearch(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  query: string,
  originalQuery: string,
  diagnostics: ProfileSearchDiagnostics,
) {
  const baseSelect = 'id, username, display_name, avatar_url, created_at'
  const matches: ProfileRow[] = []
  let scannedCount = 0

  for (let page = 0; page < MAX_PROFILE_SCAN_PAGES && matches.length < MAX_SEARCH_RESULTS; page += 1) {
    const from = page * PROFILE_SCAN_PAGE_SIZE
    const to = from + PROFILE_SCAN_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('profiles')
      .select(baseSelect)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    const rows = (data || []) as ProfileRow[]
    scannedCount += rows.length
    for (const profile of rows) {
      if (profileMatchesSearch(profile, query)) matches.push(profile)
      if (matches.length >= MAX_SEARCH_RESULTS) break
    }

    if (rows.length < PROFILE_SCAN_PAGE_SIZE) break
  }

  diagnostics.fallbackScannedCount = scannedCount
  diagnostics.fallbackCount = matches.length

  console.info('[AdminBadges] Profile search fallback', {
    originalTerm: originalQuery,
    normalizedTerm: normalizeSearchText(query),
    scannedCount,
    foundCount: matches.length,
  })

  return matches
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
  originalQuery: string,
) {
  const diagnostics = createSearchDiagnostics(originalQuery, query)

  if (query.length < 2) {
    return {
      profiles: [] as ProfileRow[],
      emailsById: {} as Record<string, string | null>,
      diagnostics,
    }
  }

  const emailSearch = await searchAuthUserIdsByEmail(supabase, query)
  let profiles: ProfileRow[] = []

  if (emailSearch.ids.length > 0) {
    profiles = await loadProfilesByIds(supabase, emailSearch.ids)
  } else {
    profiles = await loadProfilesBySearch(supabase, query)
    diagnostics.directCount = profiles.length

    if (profiles.length === 0) {
      profiles = await scanProfilesBySearch(supabase, query, originalQuery, diagnostics)
    }

    profiles = await enrichProfilesByIds(supabase, profiles)
  }

  const emailsById = await loadEmailsById(
    supabase,
    profiles.map((profile) => profile.id),
    emailSearch.emailsById,
  )

  diagnostics.finalCount = profiles.length

  console.info('[AdminBadges] Profile search summary', diagnostics)

  return { profiles, emailsById, diagnostics }
}

async function ensureProfileExists(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new SafeApiError('Nao foi possivel verificar usuario.', 500)
  if (!data) throw new SafeApiError('Usuario nao encontrado.', 404)
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

  if (error) {
    console.warn('[AdminBadges] User badges load failed:', error.message)
    return {}
  }

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

async function loadBadgeBySlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  badgeSlug: string,
) {
  const { data, error } = await supabase
    .from('badges')
    .select('id, slug, name')
    .eq('slug', badgeSlug)
    .maybeSingle()

  if (error) throw new SafeApiError('Falha ao buscar selo.', 500)
  if (!data) return null
  return data as BadgeGrantRow
}

async function grantBadgeIfMissing(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: {
    userId: string
    adminId: string
    badgeSlug: string
    reason: string | null
  },
) {
  const selectedBadge = await loadBadgeBySlug(supabase, payload.badgeSlug)
  if (!selectedBadge) return { badge: null, inserted: false }

  const { data: existing, error: existingError } = await supabase
    .from('user_badges')
    .select('id')
    .eq('user_id', payload.userId)
    .eq('badge_id', selectedBadge.id)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return { badge: selectedBadge, inserted: false }

  const { error: insertError } = await supabase.from('user_badges').insert({
    user_id: payload.userId,
    badge_id: selectedBadge.id,
    awarded_by: payload.adminId,
    reason: payload.reason,
  })

  if (insertError?.code === '23505') return { badge: selectedBadge, inserted: false }

  if (insertError && /awarded_by|reason/i.test(insertError.message)) {
    const { error: fallbackInsertError } = await supabase.from('user_badges').insert({
      user_id: payload.userId,
      badge_id: selectedBadge.id,
    })

    if (fallbackInsertError?.code === '23505') return { badge: selectedBadge, inserted: false }
    if (fallbackInsertError) {
      console.warn('[AdminBadges] Badge fallback insert failed:', fallbackInsertError.message)
      throw new SafeApiError('Falha ao salvar selo.', 500)
    }
  } else if (insertError) {
    console.warn('[AdminBadges] Badge insert failed:', insertError.message)
    throw new SafeApiError('Falha ao salvar selo.', 500)
  }

  await logBadgeAction(supabase, {
    userId: payload.userId,
    badgeId: selectedBadge.id,
    badgeSlug: selectedBadge.slug,
    action: 'granted',
    adminId: payload.adminId,
    reason: payload.reason,
  })

  await notifyBadgeAwarded(supabase, {
    userId: payload.userId,
    adminId: payload.adminId,
    badgeId: selectedBadge.id,
  })

  return { badge: selectedBadge, inserted: true }
}

async function updateVipProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  payload: Record<string, string | boolean | null>,
) {
  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)

  if (!error) return

  if (/vip_source|vip_granted_by|vip_reason|vip_updated_at/i.test(error.message)) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.vip_source
    delete fallbackPayload.vip_granted_by
    delete fallbackPayload.vip_reason
    delete fallbackPayload.vip_updated_at
    const { error: fallbackError } = await supabase
      .from('profiles')
      .update(fallbackPayload)
      .eq('id', userId)

    if (fallbackError) throw fallbackError
    return
  }

  throw error
}

function normalizeDurationDays(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return [7, 30, 90, 365].includes(numberValue) ? numberValue : null
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request)
  if ('error' in admin) return admin.error

  const url = new URL(request.url)
  const rawQuery = (url.searchParams.get('q') || '').trim().slice(0, 80)
  const query = cleanSearchQuery(rawQuery)

  try {
    const { badges, warnings } = await loadBadges(admin.supabase)
    if (!badges.some((badge) => badge.slug === 'community')) {
      warnings.push('Selo Comunidade nao encontrado na tabela badges.')
    }

    const { profiles, emailsById, diagnostics } = await searchProfiles(admin.supabase, query, rawQuery)
    const userBadgesByUserId = await loadUserBadges(admin.supabase, profiles.map((profile) => profile.id))

    console.info('[AdminBadges] Load result', {
      badgesCount: badges.length,
      usersCount: profiles.length,
      warnings,
    })

    return NextResponse.json({
      ok: true,
      badges,
      count: profiles.length,
      warnings,
      diagnostics: {
        directCount: diagnostics.directCount,
        fallbackScannedCount: diagnostics.fallbackScannedCount,
        fallbackCount: diagnostics.fallbackCount,
        finalCount: diagnostics.finalCount,
      },
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
    if (error instanceof SafeApiError) return jsonError(error.message, error.status)
    return jsonError('Nao foi possivel carregar selos agora. Verifique os logs seguros da rota admin/badges.', 500)
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
  const durationDays = normalizeDurationDays(body.durationDays)
  const planKey = body.planKey === 'vip_premium' ? 'vip_premium' : 'vip'

  if (!['grant', 'revoke', 'grant_vip', 'cancel_vip'].includes(action)) return jsonError('Acao invalida.', 400)
  if (!userId) return jsonError('Usuario invalido.', 400)

  try {
    await ensureProfileExists(admin.supabase, userId)

    if (action === 'grant') {
      if (!badgeSlug) return jsonError('Selo invalido.', 400)

      const grantResult = await grantBadgeIfMissing(admin.supabase, {
        userId,
        adminId: admin.adminId,
        badgeSlug,
        reason,
      })

      if (!grantResult.badge) return jsonError('Selo nao encontrado.', 404)

      return NextResponse.json({
        ok: true,
        message: grantResult.inserted ? `Selo ${grantResult.badge.name} concedido com sucesso.` : 'Usuario ja possui este selo.',
      })
    }

    if (action === 'grant_vip') {
      if (!durationDays) return jsonError('Periodo VIP invalido.', 400)

      const now = new Date()
      const nowIso = now.toISOString()
      const { data: currentProfile, error: currentProfileError } = await admin.supabase
        .from('profiles')
        .select('vip_status, vip_started_at, vip_expires_at')
        .eq('id', userId)
        .maybeSingle()

      if (currentProfileError) return jsonError('Nao foi possivel verificar VIP atual.', 500)

      const profile = (currentProfile || {}) as VipActionProfileRow
      const currentExpiration = profile.vip_expires_at ? new Date(profile.vip_expires_at) : null
      const baseTime = profile.vip_status === 'active' && currentExpiration && currentExpiration.getTime() > now.getTime()
        ? currentExpiration.getTime()
        : now.getTime()
      const nextExpiration = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000)
      const vipBadgeSlug = planKey === 'vip_premium' ? 'vip_premium' : 'vip'

      await updateVipProfile(admin.supabase, userId, {
        vip_plan: planKey === 'vip_premium' ? 'premium' : 'vip',
        vip_status: 'active',
        vip_started_at: profile.vip_started_at || nowIso,
        vip_expires_at: nextExpiration.toISOString(),
        vip_plus_badge_enabled: true,
        vip_source: 'admin',
        vip_granted_by: admin.adminId,
        vip_reason: reason,
        vip_updated_at: nowIso,
      })

      const grantResult = await grantBadgeIfMissing(admin.supabase, {
        userId,
        adminId: admin.adminId,
        badgeSlug: vipBadgeSlug,
        reason: reason || 'VIP concedido manualmente pela administracao.',
      })

      return NextResponse.json({
        ok: true,
        message: `VIP ${planKey === 'vip_premium' ? 'Premium ' : ''}ativo ate ${nextExpiration.toLocaleDateString('pt-BR')}.${grantResult.badge ? '' : ' Selo VIP nao encontrado no catalogo.'}`,
      })
    }

    if (action === 'cancel_vip') {
      const nowIso = new Date().toISOString()

      await updateVipProfile(admin.supabase, userId, {
        vip_status: 'canceled',
        vip_expires_at: nowIso,
        vip_plus_badge_enabled: false,
        vip_source: 'admin',
        vip_granted_by: admin.adminId,
        vip_reason: reason,
        vip_updated_at: nowIso,
      })

      const { data: vipBadges } = await admin.supabase
        .from('badges')
        .select('id, slug')
        .in('slug', ['vip', 'vip_premium'])

      const badgeRows = (vipBadges || []) as Array<{ id: string; slug: string }>
      if (badgeRows.length > 0) {
        const { error: deleteError } = await admin.supabase
          .from('user_badges')
          .delete()
          .eq('user_id', userId)
          .in('badge_id', badgeRows.map((badge) => badge.id))

        if (deleteError) return jsonError('VIP cancelado, mas nao foi possivel remover o selo VIP.', 500)

        await Promise.all(
          badgeRows.map((badge) =>
            logBadgeAction(admin.supabase, {
              userId,
              badgeId: badge.id,
              badgeSlug: badge.slug,
              action: 'revoked',
              adminId: admin.adminId,
              reason: reason || 'VIP cancelado manualmente pela administracao.',
            }),
          ),
        )
      }

      return NextResponse.json({
        ok: true,
        message: 'VIP cancelado e selos VIP removidos.',
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
    if (error instanceof SafeApiError) return jsonError(error.message, error.status)
    return jsonError('Nao foi possivel atualizar selo agora.', 500)
  }
}
