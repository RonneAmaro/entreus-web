import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/meet-server'
import { ExpressionProviderError, searchExpressions } from '@/lib/expressions/expression-provider'
import { parseExpressionSearch } from '@/lib/expressions/expression-search'

export const runtime = 'nodejs'
const requests = new Map<string, { count: number; resetAt: number }>()

function limited(id: string) {
  const now = Date.now(), current = requests.get(id)
  if (!current || current.resetAt <= now) { requests.set(id, { count: 1, resetAt: now + 60_000 }); return false }
  if (current.count >= 30) return true
  current.count += 1
  return false
}

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return NextResponse.json({ ok: false, error: 'Autenticacao obrigatoria.' }, { status: 401 })
  if (limited(auth.user.id)) return NextResponse.json({ ok: false, error: 'Muitas buscas. Aguarde um instante.' }, { status: 429 })
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  if (kind !== 'gif' && kind !== 'sticker') return NextResponse.json({ ok: false, error: 'Tipo invalido.' }, { status: 400 })
  const parsed = parseExpressionSearch({ query: url.searchParams.get('q') ?? '', limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') })
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500)
  try {
    const result = await searchExpressions({ kind, ...parsed, signal: controller.signal })
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const code = error instanceof ExpressionProviderError ? error.code : 'external'
    const status = code === 'disabled' || code === 'configuration' ? 503 : code === 'quota' ? 429 : code === 'timeout' ? 504 : 502
    return NextResponse.json({ ok: false, error: error instanceof ExpressionProviderError ? error.message : 'Galeria indisponivel.' }, { status })
  } finally { clearTimeout(timer) }
}
