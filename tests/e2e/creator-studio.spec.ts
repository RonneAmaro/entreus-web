import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import type { CreatorStudioOverview } from '@/lib/creator/creator-studio'

const userId = '00000000-0000-4000-8000-000000000053'
const postId = '00000000-0000-4000-8000-000000000054'
function supabaseUrl() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((item) => item.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) throw new Error('Supabase URL required')
  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}
function jwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test`
}
function overview(overrides: Partial<CreatorStudioOverview> = {}): CreatorStudioOverview {
  return {
    profile: { username: 'criadora', displayName: 'Criadora EntreUS', avatarUrl: null, bio: 'Conteúdo sobre criatividade.', ageVerificationStatus: 'not_started' },
    metrics: { posts: 2, followers: 120, likes: 44, comments: 9, views: 780 },
    earnings: { availableBalance: 1250, tipsReceived: 850, paidPostsReceived: 400, pendingWithdrawals: 200 },
    checklist: [
      { id: 'avatar', label: 'Adicionar foto de perfil', complete: false, href: '/profile' },
      { id: 'identity', label: 'Completar nome e identificador', complete: true, href: '/profile' },
      { id: 'first-post', label: 'Publicar o primeiro conteúdo', complete: true, href: '/feed?compose=text' },
    ],
    content: [
      { id: postId, content: 'Minha publicação pública mais recente', createdAt: '2026-07-17T10:00:00.000Z', category: 'cotidiano', visibility: 'public', moderationStatus: 'active', isPaid: false, likes: 30, comments: 8, views: 600 },
      { id: '00000000-0000-4000-8000-000000000055', content: 'Conteúdo exclusivo para seguidores', createdAt: '2026-07-16T10:00:00.000Z', category: 'cotidiano', visibility: 'followers', moderationStatus: 'hidden', isPaid: true, likes: 14, comments: 1, views: 180 },
    ],
    nextCursor: 'next-page', partialErrors: [], period: 30, ...overrides,
  }
}
async function mockStudio(page: Page, theme: 'dark' | 'light', data = overview()) {
  const base = supabaseUrl()
  const ref = new URL(base).hostname.split('.')[0]
  const token = jwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'creator@example.test', app_metadata: {}, user_metadata: {} }
  await page.addInitScript(({ key, value, selectedTheme }) => {
    localStorage.setItem(key, JSON.stringify(value))
    localStorage.setItem('theme', selectedTheme)
  }, { key: `sb-${ref}-auth-token`, value: { access_token: token, refresh_token: 'test', expires_at: 4102444800, user }, selectedTheme: theme })
  await page.route(`${base}/**`, (route) => route.abort())
  await page.route('**/api/creator-studio/overview**', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('cursor')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, overview: { ...data, content: [{ ...data.content[0], id: '00000000-0000-4000-8000-000000000056', content: 'Página adicional' }], nextCursor: null } }) })
    }
    const period = Number(url.searchParams.get('period') || 30)
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify({ ok: true, overview: { ...data, period } }) })
  })
}

test('Creator Studio consolidates sections, filters and pagination', async ({ page }) => {
  await mockStudio(page, 'dark')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/creator-studio')
  await expect(page.getByRole('heading', { name: 'Olá, Criadora EntreUS' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Criar publicação' }).first()).toHaveAttribute('href', '/feed?compose=text')
  await page.getByRole('button', { name: 'Conteúdo', exact: true }).click()
  await page.getByRole('textbox', { name: 'Buscar conteúdo' }).fill('exclusivo')
  await expect(page.getByText('Conteúdo exclusivo para seguidores')).toBeVisible()
  await page.getByRole('combobox', { name: 'Filtrar por visibilidade' }).selectOption('public')
  await expect(page.getByText('Nenhuma publicação encontrada.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Filtrar por visibilidade' }).selectOption('all')
  await page.getByRole('textbox', { name: 'Buscar conteúdo' }).fill('')
  await page.getByRole('button', { name: 'Carregar mais' }).click()
  await expect(page.getByText('Página adicional')).toBeVisible()
  await page.getByRole('button', { name: 'Métricas' }).click()
  await page.getByRole('button', { name: '7 dias' }).click()
  await expect(page.getByText('Resumo acessível · 7 dias')).toBeVisible()
  await page.getByRole('button', { name: 'Ganhos', exact: true }).click()
  await expect(page.getByText('Saldo disponível', { exact: true })).toBeVisible()
  await expect(page.getByText('Saques pendentes', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Perfil', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Editar perfil' })).toHaveAttribute('href', '/profile')
  expect(errors).toEqual([])
})

test('Creator Studio handles empty and partial data', async ({ page }) => {
  await mockStudio(page, 'light', overview({ metrics: { posts: 0, followers: null, likes: null, comments: null, views: null }, earnings: { availableBalance: null, tipsReceived: null, paidPostsReceived: null, pendingWithdrawals: null }, content: [], nextCursor: null, partialErrors: ['views', 'wallet'] }))
  await page.goto('/creator-studio')
  await expect(page.getByText(/Alguns dados estão temporariamente indisponíveis/)).toBeVisible()
  await expect(page.getByText('Indisponível').first()).toBeVisible()
  await page.getByRole('button', { name: 'Conteúdo', exact: true }).click()
  await expect(page.getByText('Nenhuma publicação encontrada.')).toBeVisible()
})

const captures = [
  ['overview-desktop-dark.png', 'dark', 1440, 900, 'overview'],
  ['overview-desktop-light.png', 'light', 1440, 900, 'overview'],
  ['overview-mobile-dark.png', 'dark', 390, 844, 'overview'],
  ['content-management.png', 'dark', 1366, 768, 'content'],
  ['creator-insights.png', 'dark', 768, 1024, 'insights'],
  ['creator-earnings.png', 'dark', 1440, 900, 'earnings'],
  ['creator-profile-preview.png', 'light', 768, 1024, 'profile'],
] as const
for (const [name, theme, width, height, section] of captures) {
  test(`capture ${name}`, async ({ page }) => {
    await mockStudio(page, theme)
    await page.setViewportSize({ width, height })
    await page.goto('/creator-studio')
    await expect(page.getByRole('heading', { name: 'Olá, Criadora EntreUS' })).toBeVisible()
    if (section !== 'overview') {
      const labels = { content: 'Conteúdo', insights: 'Métricas', earnings: 'Ganhos', profile: 'Perfil' } as const
      await page.getByRole('button', { name: labels[section], exact: true }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    mkdirSync('reports/creator-experience', { recursive: true })
    await page.screenshot({ path: `reports/creator-experience/${name}` })
  })
}
test('capture empty-state.png', async ({ page }) => {
  await mockStudio(page, 'dark', overview({ content: [], nextCursor: null, metrics: { posts: 0, followers: 0, likes: 0, comments: 0, views: 0 } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/creator-studio')
  await page.getByRole('button', { name: 'Conteúdo', exact: true }).click()
  mkdirSync('reports/creator-experience', { recursive: true })
  await page.screenshot({ path: 'reports/creator-experience/empty-state.png' })
})
