import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  canUseProfileTheme,
  getProfileTheme,
  isProfileThemeKey,
  type ProfileThemeKey,
} from '@/lib/profile-themes'
import { resolveUserTier } from '@/lib/user-tiers'

type UpdateProfileThemeBody = {
  theme?: unknown
}

type ProfileEntitlementRow = {
  vip_status?: string | null
  vip_expires_at?: string | null
}

type UserBadgeRow = {
  badges: { slug?: string | null } | { slug?: string | null }[] | null
}

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function getBadgeSlugs(rows: UserBadgeRow[]) {
  return rows
    .flatMap((row) => (Array.isArray(row.badges) ? row.badges : [row.badges]))
    .map((badge) => badge?.slug || '')
    .filter(Boolean)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdateProfileThemeBody
    const theme = typeof body.theme === 'string' ? body.theme : ''

    if (!isProfileThemeKey(theme)) {
      return NextResponse.json(
        { ok: false, error: 'Tema de perfil invalido.' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Entre na sua conta para personalizar o perfil.' },
        { status: 401 },
      )
    }

    const [{ data: profileData, error: profileError }, { data: badgeRows, error: badgesError }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('vip_status, vip_expires_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('user_badges')
          .select('badges ( slug )')
          .eq('user_id', user.id),
      ])

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: 'Nao foi possivel carregar seu perfil.' },
        { status: 400 },
      )
    }

    if (badgesError) {
      return NextResponse.json(
        { ok: false, error: 'Nao foi possivel validar seus beneficios.' },
        { status: 400 },
      )
    }

    const profile = (profileData || {}) as ProfileEntitlementRow
    const tier = resolveUserTier({
      vipStatus: profile.vip_status,
      vipExpiresAt: profile.vip_expires_at,
      badgeSlugs: getBadgeSlugs((badgeRows || []) as UserBadgeRow[]),
    })
    const themeConfig = getProfileTheme(theme)

    if (!canUseProfileTheme(tier, theme)) {
      return NextResponse.json(
        {
          ok: false,
          error: `${themeConfig.name} nao esta disponivel para seu nivel atual.`,
        },
        { status: 403 },
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        profile_theme: theme satisfies ProfileThemeKey,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      const missingColumn = /profile_theme/i.test(updateError.message)

      return NextResponse.json(
        {
          ok: false,
          error: missingColumn
            ? 'A migration de temas de perfil ainda precisa ser aplicada no Supabase.'
            : 'Nao foi possivel salvar o tema do perfil.',
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      theme,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
