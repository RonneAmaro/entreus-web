import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseBearerAuthorization, PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { buildLocaleProfileUpdate, isLocaleProfileInput } from '@/lib/i18n/profile-locale'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  })
}

function errorResponse(status: number, code: string, message: string) {
  return jsonNoStore({ ok: false, synced: false, error: { code, message } }, { status })
}

export async function POST(request: Request) {
  const authorization = parseBearerAuthorization(request.headers.get('authorization'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!authorization.ok) return errorResponse(401, 'not_authenticated', 'Autenticacao invalida.')
  if (!url || !key) return errorResponse(500, 'configuration_unavailable', 'Configuracao indisponivel.')

  const input = await request.json().catch(() => null)
  if (!isLocaleProfileInput(input)) {
    return errorResponse(400, 'invalid_locale', 'Preferencia de idioma invalida.')
  }

  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization.authorization } },
  })
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()
  if (authError || !user) {
    return errorResponse(401, 'not_authenticated', 'Entre na sua conta para alterar esta configuracao.')
  }

  const update = buildLocaleProfileUpdate(input.interfaceLocale, input.countryCode)
  const { data: updatedProfile, error } = await client
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select('interface_locale, country_code')
    .maybeSingle()
  if (error) {
    const missingMigration =
      /interface_locale|country_code|profiles_interface_locale_check/i.test(error.message) ||
      error.code === '23514'
    if (missingMigration) {
      console.warn('[i18n] Profile locale sync unavailable: migration_missing')
      return jsonNoStore({
        ok: true,
        locale: input.interfaceLocale,
        synced: false,
        reason: 'migration_missing',
      })
    }
    console.error('[i18n] Profile locale sync failed', { code: error.code ?? 'unknown' })
    return errorResponse(500, 'profile_update_failed', 'Nao foi possivel sincronizar a preferencia de idioma.')
  }
  if (!updatedProfile || updatedProfile.interface_locale !== input.interfaceLocale) {
    console.error('[i18n] Profile locale sync failed', { code: 'profile_not_updated' })
    return errorResponse(500, 'profile_not_updated', 'Nao foi possivel confirmar a preferencia de idioma.')
  }

  return jsonNoStore({
    ok: true,
    locale: input.interfaceLocale,
    synced: true,
    countryCode: updatedProfile.country_code ?? null,
  })
}
