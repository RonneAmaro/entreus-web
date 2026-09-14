import { expect, test, type Page } from '@playwright/test'

const userId = '00000000-0000-4000-8000-000000000091'
const e2eSupabaseUrl = 'https://entreus-e2e.invalid'

function fakeJwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test`
}

async function installFakeSession(page: Page) {
  const projectRef = new URL(e2eSupabaseUrl).hostname.split('.')[0]
  const token = fakeJwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'session@example.test', app_metadata: {}, user_metadata: {} }

  await page.addInitScript(({ key, session }) => {
    window.localStorage.setItem(key, JSON.stringify(session))
    window.localStorage.setItem('entreus-language', 'pt')
  }, {
    key: `sb-${projectRef}-auth-token`,
    session: { access_token: token, refresh_token: 'test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user },
  })

  await page.route(`${e2eSupabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname.endsWith('/auth/v1/logout')) {
      await route.fulfill({ status: 204 })
      return
    }
    if (url.pathname.includes('/rest/v1/profiles')) {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: userId, username: 'session-test', display_name: 'Session Test', birth_date: '1990-01-01', is_minor: false, parental_consent_status: null }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' })
  })
}

test.describe('auth session persistence and account menu', () => {
  test('restores a valid browser session after refresh and redirects /login without showing its form', async ({ page }) => {
    await installFakeSession(page)
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/feed$/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0)
  })

  test('opens, closes, and signs out from the desktop account menu', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })

    const trigger = page.locator('aside').getByRole('button', { name: 'Abrir menu da conta' })
    await trigger.evaluate((button: HTMLButtonElement) => button.click())
    const menu = page.getByRole('menu', { name: 'Menu da conta' })
    await expect(menu).toContainText('Minha conta')
    await expect(menu.getByRole('menuitem', { name: 'Meu perfil' })).toHaveAttribute('href', '/profile')
    await expect(menu.getByRole('menuitem', { name: 'Configurações' })).toHaveAttribute('href', '/settings')
    await expect(menu.getByRole('menuitem', { name: 'Sair' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.evaluate((button: HTMLButtonElement) => button.click())
    await page.mouse.click(500, 200)
    await expect(menu).toHaveCount(0)

    await trigger.evaluate((button: HTMLButtonElement) => button.click())
    await menu.getByRole('menuitem', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })
})
