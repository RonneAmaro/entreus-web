import { expect, test, type Page } from '@playwright/test'

const publicRoutes = [
  '/',
  '/login',
  '/signup',
  '/terms',
  '/privacy',
  '/safety',
  '/contact',
  '/help',
  '/selos',
  '/vip-plus',
  '/status',
  '/creators',
]

const protectedRoutes = ['/feed']

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
      expect(page.url()).toMatch(/\/(feed|login|signup)(?:[/?#]|$)/)
    })
  }
})
