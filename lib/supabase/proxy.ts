import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isMissingOrInvalidSession, isProtectedPath } from '@/lib/auth/session-routing'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: request.nextUrl.protocol === 'https:' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          const previous = response
          response = NextResponse.next({ request })
          previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
          previous.headers.forEach((value, name) => {
            if (!name.startsWith('x-middleware-') && name !== 'set-cookie') response.headers.set(name, value)
          })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
        },
      },
    },
  )

  // Verify with Auth, including revocation. Never authorize from getSession().
  const { data: { user }, error } = await supabase.auth.getUser()
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('CDN-Cache-Control', 'no-store')
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store')

  if (error && !isMissingOrInvalidSession(error)) {
    // Preserve cookies on network/service failures; no false login or redirect loop.
    const unavailable = new NextResponse('Não foi possível verificar sua sessão. Atualize a página para tentar novamente.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'Retry-After': '5' },
    })
    // Refresh may have succeeded before a later verification request failed.
    response.cookies.getAll().forEach((cookie) => unavailable.cookies.set(cookie))
    return unavailable
  }

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const destination = request.nextUrl.clone()
    destination.pathname = '/login'
    destination.search = ''
    destination.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    const redirect = NextResponse.redirect(destination)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    redirect.headers.set('Cache-Control', 'private, no-store')
    return redirect
  }
  return response
}
