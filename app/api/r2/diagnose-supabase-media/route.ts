import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getMissingEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]

  return required.filter((key) => !process.env[key])
}

async function countSupabaseUrl(
  supabase: SupabaseClient,
  table: string,
  column: string
) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .ilike(column, '%supabase%')

  if (error) {
    throw new Error(`${table}.${column}: ${error.message}`)
  }

  return count || 0
}

export async function GET() {
  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_ENV_VARS',
        message: 'Variaveis de ambiente do Supabase ausentes.',
        missing,
      },
      { status: 500 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )

  try {
    const [
      postsImageCount,
      postsVideoCount,
      postMediaCount,
      profileAvatarCount,
      profileBannerCount,
    ] = await Promise.all([
      countSupabaseUrl(supabase, 'posts', 'image_url'),
      countSupabaseUrl(supabase, 'posts', 'video_url'),
      countSupabaseUrl(supabase, 'post_media', 'media_url'),
      countSupabaseUrl(supabase, 'profiles', 'avatar_url'),
      countSupabaseUrl(supabase, 'profiles', 'banner_url'),
    ])

    const total =
      postsImageCount +
      postsVideoCount +
      postMediaCount +
      profileAvatarCount +
      profileBannerCount

    return NextResponse.json({
      ok: true,
      postsImageCount,
      postsVideoCount,
      postMediaCount,
      profileAvatarCount,
      profileBannerCount,
      total,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SUPABASE_DIAGNOSE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
