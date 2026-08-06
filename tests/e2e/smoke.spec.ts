import { expect, test, type Page } from '@playwright/test'
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
