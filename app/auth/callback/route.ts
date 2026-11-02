import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSafeRedirectParam } from '@/lib/auth/safe-redirect'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const recovery = request.nextUrl.searchParams.get('type') === 'recovery'
  const destination = request.nextUrl.clone()
  destination.pathname = recovery ? '/reset-password' : '/auth/finish'
  destination.search = ''
  if (recovery) destination.searchParams.set('flow', 'recovery')
  else destination.searchParams.set('next', getSafeRedirectParam(request.nextUrl.searchParams, '/feed'))
  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'private, no-store')
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: request.nextUrl.protocol === 'https:' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
        },
      },
    },
  )
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (!error) return response
  }
  destination.pathname = '/login'
  destination.search = '?error=callback_failed'
  response.headers.set('Location', destination.toString())
  return response
}
