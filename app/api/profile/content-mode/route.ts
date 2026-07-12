import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildProfileContentModeUpdate,
  isProfileContentMode,
  type ProfileContentMode,
} from '@/lib/profile-content-mode'
import { parseBearerAuthorization, PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'

type UpdateProfileContentModeBody = {
  profileContentMode?: unknown
  profile_content_mode?: unknown
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      ...(init?.headers || {}),
    },
  })
}

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const parsedAuthorization = parseBearerAuthorization(request.headers.get('authorization'))

  if (!parsedAuthorization.ok) {
    return { ok: false as const, status: 401, error: 'Autenticacao invalida.' }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500, error: 'Configuracao indisponivel.' }
  }

  return {
    ok: true as const,
    supabase: createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: parsedAuthorization.authorization
          ? { Authorization: parsedAuthorization.authorization }
          : {},
      },
    }),
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdateProfileContentModeBody
    const requestedMode = body.profileContentMode ?? body.profile_content_mode

    if (!isProfileContentMode(requestedMode)) {
      return jsonNoStore({ ok: false, error: 'Modo de conteudo invalido.' }, { status: 400 })
    }

    const supabaseResult = getSupabaseForRequest(request)
    if (!supabaseResult.ok) {
      return jsonNoStore(
        { ok: false, error: supabaseResult.error },
        { status: supabaseResult.status },
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseResult.supabase.auth.getUser()

    if (userError || !user) {
      return jsonNoStore(
        { ok: false, error: 'Entre na sua conta para alterar esta configuracao.' },
        { status: 401 },
      )
    }

    const updatePayload = buildProfileContentModeUpdate(requestedMode)
    const { error: updateError } = await supabaseResult.supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id)

    if (updateError) {
      const missingColumn = /profile_content_mode/i.test(updateError.message)

      return jsonNoStore(
        {
          ok: false,
          error: missingColumn
            ? 'A migration do modo de conteudo do perfil ainda precisa ser aplicada no Supabase.'
            : 'Nao foi possivel salvar o modo do perfil.',
        },
        { status: 400 },
      )
    }

    return jsonNoStore({
      ok: true,
      profileContentMode: requestedMode satisfies ProfileContentMode,
    })
  } catch {
    return jsonNoStore({ ok: false, error: 'Nao foi possivel salvar o modo do perfil.' }, { status: 500 })
  }
}
