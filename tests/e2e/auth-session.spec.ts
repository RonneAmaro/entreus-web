import { expect, test, type Page } from '@playwright/test'
import { createChunks } from '@supabase/ssr'
import { fixtureUrl } from './session-fixture'

// Fixtures exercise the actual SDK and HTTP cookies, without production credentials.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })
test.describe.configure({ timeout: 90_000 })

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('entreus-language', 'pt'))
  await page.goto('/login')
  await page.locator('#login-email').fill('session@example.test')
  await page.locator('#login-password').fill('fixture-only-password')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByTestId('feed-layout')).toBeVisible()
}

async function authCookies(page: Page) {
  return (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'))
}

async function cookieSession(page: Page) {
  const cookies = (await authCookies(page)).sort((a, b) => a.name.localeCompare(b.name))
  return JSON.parse(Buffer.from(cookies.map((cookie) => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString())
}

async function logout(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  const trigger = page.locator('aside').getByRole('button', { name: 'Abrir menu da conta' })
  await trigger.evaluate((button: HTMLButtonElement) => button.click())
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test('E2E_AUTH_01 login writes persistent cookies and reaches feed', async ({ page }) => {
  await login(page)
  const cookies = await authCookies(page)
  expect(cookies.length > 0).toBe(true)
  expect(cookies.every((cookie) => cookie.expires > Date.now() / 1000 && cookie.sameSite === 'Lax')).toBe(true)
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('sb-')))).toBe(false)
})

test('E2E_AUTH_02 hard refresh keeps the session', async ({ page }) => {
  await login(page)
  await page.reload()
  await expect(page.getByTestId('feed-layout')).toBeVisible()
})

test('E2E_AUTH_03 root redirects on the server before browser hydration', async ({ page }) => {
  await login(page)
  const response = await page.request.get('/', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers().location).toBe('/feed')
  await page.goto('/')
  await expect(page).toHaveURL(/\/feed$/)
})

test('E2E_AUTH_04 login redirects on the server without displaying its form', async ({ page }) => {
  await login(page)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.locator('#login-email')).toHaveCount(0)
})

test('E2E_AUTH_05 new tab inherits the same-origin cookie session', async ({ page }) => {
  await login(page)
  const tab = await page.context().newPage()
  await tab.goto('/')
  await expect(tab).toHaveURL(/\/feed$/)
  await tab.close()
})

test('E2E_AUTH_06 restored context authenticates from persisted cookies only', async ({ page, browser }) => {
  await login(page)
  const state = await page.context().storageState()
  expect(state.cookies.some((cookie) => cookie.name.startsWith('sb-'))).toBe(true)
  await page.context().close()
  const restored = await browser.newContext({ storageState: { cookies: state.cookies, origins: [] } })
  const tab = await restored.newPage()
  await tab.goto(test.info().project.use.baseURL + '/')
  await expect(tab).toHaveURL(/\/feed$/)
  await restored.close()
})

test('E2E_AUTH_07 explicit logout makes root public', async ({ page }) => {
  await login(page)
  await logout(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  expect((await authCookies(page)).length === 0).toBe(true)
})

test('E2E_AUTH_08 explicit logout shows login and uses local scope', async ({ page }) => {
  await login(page)
  let localScope = false
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/auth/v1/logout') localScope = url.searchParams.get('scope') === 'local'
  })
  await logout(page)
  await expect(page.locator('#login-email')).toBeVisible()
  expect(localScope).toBe(true)
})

test('E2E_AUTH_09 canonical alias preserves pathname', async ({ request }) => {
  const response = await request.get('/settings', { headers: { host: 'entreus.vercel.app' }, maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers().location).toBe('https://www.entreus.com.br/settings')
})

test('E2E_AUTH_10 canonical alias preserves query', async ({ request }) => {
  const response = await request.get('/settings?tab=privacy', { headers: { host: 'entreus.com.br' }, maxRedirects: 0 })
  expect(response.headers().location).toBe('https://www.entreus.com.br/settings?tab=privacy')
})

test('E2E_AUTH_11 random Preview host stays independent', async ({ request }) => {
  const response = await request.get('/', { headers: { host: 'entreus-test-ronneamaros-projects.vercel.app' }, maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(response.headers().location).toBeUndefined()
})

test('E2E_AUTH_12 expired access cookie refreshes on server and persists the rotation', async ({ page }) => {
  await login(page)
  const current = await cookieSession(page)
  const expiredResponse = await page.request.post(fixtureUrl + '/__fixture/expire', { headers: { authorization: 'Bearer ' + current.access_token } })
  const expired = await expiredResponse.json()
  const key = 'sb-' + new URL(fixtureUrl).hostname.split('.')[0] + '-auth-token'
  const value = 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url')
  await page.context().addCookies(createChunks(key, value).map((cookie) => ({ ...cookie, domain: 'localhost', path: '/' })))
  const response = await page.request.get('/', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  // Next dev may replace Cache-Control with no-cache; the CDN policy stays explicit.
  expect(response.headers()['cache-control']).toMatch(/no-store|no-cache/)
  expect(response.headers()['cdn-cache-control']).toContain('no-store')
  const rotated = await cookieSession(page)
  expect(rotated.refresh_token !== expired.refresh_token).toBe(true)
  const state = await page.request.get(fixtureUrl + '/__fixture/state', { headers: { authorization: 'Bearer ' + rotated.access_token } })
  expect((await state.json()).refreshCount).toBe(1)
  await page.goto('/')
  await expect(page).toHaveURL(/\/feed$/)
})

test('guest root is public and protected areas require login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/feed')
  await expect(page.locator('#login-email')).toBeVisible()
})

test('incomplete and pending accounts get deterministic server destinations', async ({ page }) => {
  await login(page)
  const session = await cookieSession(page)
  const headers = { authorization: 'Bearer ' + session.access_token }
  await page.request.post(fixtureUrl + '/__fixture/profile', { headers, data: { username: null } })
  const incomplete = await page.request.get('/', { maxRedirects: 0 })
  expect(incomplete.headers().location).toBe('/complete-profile')
  await page.request.post(fixtureUrl + '/__fixture/profile', { headers, data: { username: 'minor', is_minor: true, parental_consent_status: 'pending' } })
  const pending = await page.request.get('/login', { maxRedirects: 0 })
  expect(pending.headers().location).toBe('/account-pending')
})

test('temporary Auth outage preserves cookies and recovers without another login', async ({ page }) => {
  await login(page)
  const session = await cookieSession(page)
  const headers = { authorization: 'Bearer ' + session.access_token }
  await page.request.post(fixtureUrl + '/__fixture/unavailable', { headers, data: { unavailable: true } })
  const response = await page.request.get('/', { maxRedirects: 0 })
  expect(response.status()).toBe(503)
  expect(response.headers().location).toBeUndefined()
  expect((await authCookies(page)).length > 0).toBe(true)
  await page.request.post(fixtureUrl + '/__fixture/unavailable', { headers, data: { unavailable: false } })
  await page.goto('/')
  await expect(page).toHaveURL(/\/feed$/)
})

test('existing same-origin legacy session upgrades once without entering credentials again', async ({ page }) => {
  await login(page)
  const session = await cookieSession(page)
  const key = 'sb-' + new URL(fixtureUrl).hostname.split('.')[0] + '-auth-token'
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session })
  await page.context().clearCookies()
  await page.goto('/')
  await expect(page).toHaveURL(/\/feed$/)
  expect((await authCookies(page)).length > 0).toBe(true)
  expect(await page.evaluate((key) => localStorage.getItem(key) === null, key)).toBe(true)
})
