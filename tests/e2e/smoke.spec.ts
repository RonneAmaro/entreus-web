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
  '/meet',
  '/selos',
  '/vip-plus',
  '/status',
  '/creators',
  '/creators/apply',
]

const protectedRoutes = ['/feed', '/admin/meet-recording']

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
      expect(page.url()).toMatch(/\/(feed|admin\/meet-recording|login|signup)(?:[/?#]|$)/)
    })
  }
})

test('VIP checkout action is visible without starting a payment', async ({ page }) => {
  const response = await page.goto('/vip-plus', { waitUntil: 'domcontentloaded' })

  expect(response?.status() || 200).toBeLessThan(500)
  await expectNoServerError(page)
  await expect(page.getByRole('button', { name: 'Pagar com Mercado Pago' })).toBeVisible()
})
