import { expect, test, type Page, type Route } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd(), true, { info() {}, error() {} })

const supabaseProjectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
const smokeAuthStorageKey = `sb-${supabaseProjectHost.split('.')[0]}-auth-token`
const smokeSession = JSON.stringify({
  access_token: 'smoke-access-token',
  refresh_token: 'smoke-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated' },
})

const smokeSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')

test.describe.configure({ mode: 'serial' })

const publicRoutes = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/safety',
  '/contact',
  '/help',
  '/convite',
  '/meet',
  '/selos',
  '/vip-plus',
  '/status',
  '/creators',
  '/creators/apply',
]

const protectedRoutes = ['/feed', '/admin/meet-recording', '/creator-dashboard']

async function expectNoServerError(page: Page) {
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('Application error', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Internal Server Error', { exact: false })).toHaveCount(0)
  await expect(page.getByText('500', { exact: true })).toHaveCount(0)
}

test.describe('public smoke routes', () => {
  for (const route of publicRoutes) {
    test(`${route} does not render a server error`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' })

      expect(response?.status() || 200).toBeLessThan(500)
      await expectNoServerError(page)
    })
  }
})

test.describe('protected smoke routes', () => {
  for (const route of protectedRoutes) {
    test(`${route} redirects or renders without a server error`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' })

      expect(response?.status() || 200).toBeLessThan(500)
      await expectNoServerError(page)
      expect(page.url()).toMatch(/\/(feed|admin\/meet-recording|creator-dashboard|login|signup)(?:[/?#]|$)/)
    })
  }
})

test('VIP checkout action is visible without starting a payment', async ({ page }) => {
  const response = await page.goto('/vip-plus', { waitUntil: 'domcontentloaded' })

  expect(response?.status() || 200).toBeLessThan(500)
  await expectNoServerError(page)
  await expect(page.getByRole('button', { name: /Mercado Pago/i })).toBeVisible()
})

test('VIP plans and mocked manual Pix render without starting a real charge', async ({ page }) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: smokeAuthStorageKey, value: smokeSession })
  let manualPixRequests = 0
  let externalMercadoPagoRequests = 0
  await page.route(/https?:\/\/[^/]*mercadopago\.[^/]+\/.*/, async (route) => {
    externalMercadoPagoRequests += 1
    await route.abort()
  })
  await page.route('**/api/payments/pix/manual-code', async (route) => {
    manualPixRequests += 1
    expect(route.request().headers().authorization).toMatch(/^Bearer\s+\S+$/)
    const body = route.request().postDataJSON() as { plan_key?: string }
    const totals = { vip_30d: 1990, vip_90d: 4990, vip_365d: 14990 }
    const total = totals[body.plan_key as keyof typeof totals] || 4990
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        product_type: 'vip_plus',
        plan_key: 'vip_90d',
        total_brl_cents: total,
        pix_copy_paste: '000201-safe-smoke-payload-6304ABCD',
        qr_code_data_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        receiver_name: 'EntreUS Test',
        receiver_city: 'Test City',
      }),
    })
  })

  const response = await page.goto('/vip-plus', { waitUntil: 'domcontentloaded' })
  expect(response?.status() || 200).toBeLessThan(500)
  await expectNoServerError(page)
  await page.waitForTimeout(1_000)
  expect(pageErrors).toEqual([])
  await expect(page.getByTestId('vip-page')).toHaveAttribute('data-mounted', 'true', { timeout: 45_000 })

  const plan30 = page.getByTestId('vip-plan-vip_30d')
  const plan90 = page.getByTestId('vip-plan-vip_90d')
  const plan365 = page.getByTestId('vip-plan-vip_365d')
  await expect(plan30).toBeVisible()
  await expect(plan90).toBeVisible()
  await expect(plan365).toBeVisible()
  await expect(plan90.getByTestId('vip-plan-savings')).toBeVisible()
  await expect(plan90.getByTestId('vip-plan-monthly-equivalent')).toBeVisible()
  await expect(plan365.getByTestId('vip-plan-savings')).toBeVisible()
  await expect(plan365.getByTestId('vip-plan-monthly-equivalent')).toBeVisible()
  await expect(page.getByTestId('vip-mercadopago-option')).toBeVisible()
  await expect(page.getByTestId('vip-payment-choice-notice')).toBeVisible()
  await expect(page.getByTestId('vip-mercadopago-summary')).toContainText(/49[,.]90/)
  await expect(page.getByTestId('vip-mercadopago-summary')).toContainText(/51[,.]40/)
  await expect(page.getByTestId('vip-manual-pix-option')).toBeVisible()
  await expect(page.getByTestId('vip-manual-pix-no-fee')).toBeVisible()

  await page.getByTestId('vip-manual-pix-option').click()
  await expect(page.getByTestId('vip-manual-pix-panel')).toBeVisible()
  await expect(page.getByTestId('vip-manual-pix-qr')).toBeVisible()
  await expect(page.getByTestId('vip-manual-pix-copy-paste')).toContainText('safe-smoke-payload')
  await expect(page.getByTestId('vip-manual-pix-copy-button')).toBeVisible()
  await expect(page.getByTestId('vip-manual-pix-total')).toContainText(/49[,.]90/)

  await plan30.click()
  await expect(page.getByTestId('vip-manual-pix-total')).toContainText(/19[,.]90/)
  await plan365.click()
  await expect(page.getByTestId('vip-manual-pix-total')).toContainText(/149[,.]90/)
  expect(manualPixRequests).toBe(3)
  expect(externalMercadoPagoRequests).toBe(0)
})

test('creator onboarding shows founder and monetization CTAs', async ({ page }) => {
  const response = await page.goto('/creators', { waitUntil: 'domcontentloaded' })

  expect(response?.status() || 200).toBeLessThan(500)
  await expectNoServerError(page)
  await expect(page.getByRole('link', { name: 'Quero ser criador fundador' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Conhecer monetizacao com ItaCash' }).first()).toBeVisible()
  await expect(page.getByText('Voce recebe 85% do valor.')).toBeVisible()
})

test('creator application exposes onboarding questions without sensitive documents', async ({ page }) => {
  const response = await page.goto('/creators/apply', { waitUntil: 'domcontentloaded' })

  expect(response?.status() || 200).toBeLessThan(500)
  await expectNoServerError(page)
  await expect(page.getByLabel('WhatsApp ou contato')).toBeVisible()
  await expect(page.getByLabel('Usuario ou rede principal')).toBeVisible()
  await expect(page.getByLabel('Tamanho aproximado da audiencia')).toBeVisible()
  await expect(page.getByText('nao pede documento')).toBeVisible()
})

test('threaded comments smoke keeps error, empty and data states exclusive without remote writes', async ({ page }) => {
  test.setTimeout(90_000)
  const viewerId = '11111111-1111-4111-8111-111111111111'
  const authorId = '22222222-2222-4222-8222-222222222222'
  const postId = '33333333-3333-4333-8333-333333333333'
  const rootId = '44444444-4444-4444-8444-444444444444'
  const replyId = '55555555-5555-4555-8555-555555555555'
  const encodeJwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encodeJwtPart({ alg: 'HS256' })}.${encodeJwtPart({ sub: viewerId, role: 'authenticated', exp: 4102444800 })}.smoke`
  const user = { id: viewerId, aud: 'authenticated', role: 'authenticated', email: 'comments-smoke@example.test', app_metadata: {}, user_metadata: {} }
  let threadedRootRequests = 0
  let supabaseWriteRequests = 0

  await page.addInitScript(({ key, token, currentUser }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'smoke', expires_at: 4102444800, user: currentUser }))
    localStorage.setItem('entreus-language', 'pt')
  }, { key: smokeAuthStorageKey, token: accessToken, currentUser: user })
  await page.routeWebSocket(`${smokeSupabaseUrl.replace(/^http/, 'ws')}/realtime/v1/websocket**`, (socket) => socket.close())

  const fulfill = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const root = {
    id: rootId, post_id: postId, user_id: authorId, parent_comment_id: null,
    content: 'Comentário existente no smoke.', expression: null, depth: 0, reply_count: 1,
    deleted_at: null, edited_at: null, created_at: '2026-08-28T10:00:00.000Z',
  }
  const reply = {
    ...root, id: replyId, parent_comment_id: rootId, content: 'Resposta existente no smoke.',
    depth: 1, reply_count: 0, created_at: '2026-08-28T10:01:00.000Z',
  }

  await page.route(`${smokeSupabaseUrl}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.includes('/rest/v1/') && !['GET', 'HEAD'].includes(request.method())) {
      supabaseWriteRequests += 1
    }
    if (url.pathname.endsWith('/auth/v1/user')) return fulfill(route, user)
    if (url.pathname.includes('/rest/v1/profiles')) return fulfill(route, [
      { id: viewerId, username: 'smoke-viewer', display_name: 'Smoke Viewer', avatar_url: null, role: 'user', birth_date: '1990-01-01', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false },
      { id: authorId, username: 'smoke-author', display_name: 'Smoke Author', avatar_url: null, role: 'creator' },
    ])
    if (url.pathname.includes('/rest/v1/posts')) return fulfill(route, [{
      id: postId, content: 'Post para smoke de comentários.', category: 'cotidiano',
      created_at: '2026-08-28T09:00:00.000Z', user_id: authorId, image_url: null, video_url: null,
      visibility: 'public', is_sensitive: false, community_type: 'general', content_rating: 'safe',
      moderation_status: 'active', expression: null, is_paid: false, price_itacash: null,
      profiles: { username: 'smoke-author', display_name: 'Smoke Author', avatar_url: null, vip_status: null },
    }], 200, { 'content-range': '0-0/1' })
    if (url.pathname.includes('/rest/v1/comments')) {
      const select = url.searchParams.get('select') || ''
      const parentFilter = url.searchParams.get('parent_comment_id')
      if (!select.includes('reply_count')) return fulfill(route, [])
      if (parentFilter === 'is.null') {
        threadedRootRequests += 1
        if (threadedRootRequests === 1) return fulfill(route, { message: 'simulated missing schema', code: 'PGRST204' }, 400)
        if (threadedRootRequests === 2) return fulfill(route, [])
        return fulfill(route, [root])
      }
      if (parentFilter === `eq.${rootId}`) return fulfill(route, [reply])
      return fulfill(route, [])
    }
    return fulfill(route, [])
  })

  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  const loadAlert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os comentários.' })
  await expect(loadAlert).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Seja a primeira pessoa a comentar.')).toHaveCount(0)
  await loadAlert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('Seja a primeira pessoa a comentar.')).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Comentário existente no smoke.')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Ver 1 resposta' }).click()
  await expect(page.getByText('Resposta existente no smoke.')).toBeVisible()
  expect(supabaseWriteRequests).toBe(0)
})
