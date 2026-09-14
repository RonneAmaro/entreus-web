import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalProductionUrl } from '@/lib/canonical-host'

export function proxy(request: NextRequest) {
  const canonicalUrl = getCanonicalProductionUrl(request.nextUrl)

  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 307)

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
