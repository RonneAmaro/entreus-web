import { expect, test, type Page } from '@playwright/test'

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
