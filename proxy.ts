import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalProductionUrl } from '@/lib/canonical-host'
import { updateSession } from '@/lib/supabase/proxy'
import { isProtectedPath } from '@/lib/auth/session-routing'

export async function proxy(request: NextRequest) {
  // Next's local/proxied request URL can use the server hostname. Only the
  // explicit allowlist may turn the inbound Host header into a redirect.
  const entryUrl = new URL(request.nextUrl)
  entryUrl.host = request.headers.get('host') || entryUrl.host
  const canonicalUrl = getCanonicalProductionUrl(entryUrl)

  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 307)

  const path = request.nextUrl.pathname
  // Canonicalize every path first. API handlers keep their own verified bearer auth.
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path.startsWith('/auth/') || (!isProtectedPath(path) && /\.[a-z0-9]+$/i.test(path))) {
    return NextResponse.next()
  }
  return updateSession(request)
}

export const config = {
  matcher: '/:path*',
}
