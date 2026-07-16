import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const userId = '00000000-0000-4000-8000-000000000050'
const authenticatedRoutes = [
  '/feed', '/messages', '/notifications', '/profile', '/search', '/saved', '/challenges',
  '/creator-dashboard', '/wallet', '/gifts', '/vip-plus', '/settings', '/help', '/editor',
  '/lab', '/meet', '/admin', '/creators', '/convite', '/age-verification',
]
const publicRoutes = ['/login', '/signup', '/forgot-password']

test.setTimeout(240_000)

function publicSupabaseUrl() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for intercepted theme tests.')
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}

function fakeJwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test`
}

async function installFakeSession(page: Page, theme: 'dark' | 'light') {
  const supabaseUrl = publicSupabaseUrl()
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const token = fakeJwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'theme-audit@example.test', app_metadata: {}, user_metadata: {} }
  await page.addInitScript(({ key, session, selectedTheme }) => {
    window.localStorage.setItem(key, JSON.stringify(session))
    if (!window.localStorage.getItem('theme')) window.localStorage.setItem('theme', selectedTheme)
    window.localStorage.setItem('entreus-language', 'pt')
  }, { key: `sb-${projectRef}-auth-token`, session: { access_token: token, refresh_token: 'theme-test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }, selectedTheme: theme })

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
    if (url.pathname.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: userId, username: 'theme-audit', display_name: 'Theme Audit', role: 'admin', birth_date: '1990-01-01', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false, parental_consent_status: null }]) })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' })
  })
}

function relativeLuminance(rgb: string) {
  const values = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
  const channels = values.map((value) => { const normalized = value / 255; return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

for (const theme of ['dark', 'light'] as const) {
  for (const device of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }] as const) {
    test(`${theme} theme audit on ${device.name}`, async ({ page }) => {
      await installFakeSession(page, theme)
      await page.setViewportSize({ width: device.width, height: device.height })
      const pageErrors: string[] = []
      const relevantConsoleErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => {
        const value = message.text()
        if (message.type() === 'error' && !/Failed to fetch/i.test(value) && /hydration|uncaught|typeerror|referenceerror|minified react/i.test(value)) relevantConsoleErrors.push(value)
      })
      const output = `reports/theme-audit/${theme}/${device.name}`
      mkdirSync(output, { recursive: true })

      for (const route of [...authenticatedRoutes, ...publicRoutes]) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`), { timeout: 10_000 })
        await expect(page.locator('body')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
        const colors = await page.locator('body').evaluate((element) => { const style = getComputedStyle(element); return { color: style.color, background: style.backgroundColor } })
        expect(contrastRatio(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5)
        await page.screenshot({ path: `${output}/${route.slice(1).replaceAll('/', '-') || 'home'}.png` })
      }

      await page.goto('/feed', { waitUntil: 'domcontentloaded' })
      const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
      await expect(navigation).toBeVisible({ timeout: 20_000 })
      await navigation.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
      const hub = page.getByRole('dialog', { name: 'EntreUS' })
      await expect(hub).toBeVisible()
      await expect(hub.getByRole('textbox', { name: 'Buscar no Hub' })).toBeVisible()
      await page.screenshot({ path: `${output}/hub-open.png` })
      expect(pageErrors).toEqual([])
      expect(relevantConsoleErrors).toEqual([])
    })
  }
}

test('theme preference toggles and survives reload', async ({ page }) => {
  await installFakeSession(page, 'dark')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(/light/)
})
