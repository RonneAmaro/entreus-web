import { createChunks } from '@supabase/ssr'
import type { Page } from '@playwright/test'

export const fixtureUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54329'

/** Seed once before navigation. Never recreate auth storage on reload. */
export async function seedSession<T extends { key: string; session?: unknown; value?: unknown }>(
  page: Page, init: (arg: T) => unknown, arg: T,
) {
  const raw = arg.session ?? arg.value
  const session = typeof raw === 'string' ? JSON.parse(raw) : raw
  const registered = await page.request.post(`${fixtureUrl}/__fixture/register`, { data: { session } })
  if (!registered.ok()) throw new Error('Local auth fixture registration failed')
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  await page.context().addCookies(createChunks(arg.key, value).map(({ name, value }) => ({
    name, value, domain: new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').hostname,
    path: '/', sameSite: 'Lax' as const, expires: Math.floor(Date.now() / 1000) + 400 * 86400,
  })))
  await page.addInitScript(init as Parameters<Page['addInitScript']>[0], arg)
}
