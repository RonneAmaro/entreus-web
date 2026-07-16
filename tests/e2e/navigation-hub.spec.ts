import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const userId = '00000000-0000-4000-8000-000000000050'

function publicSupabaseUrl() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for the intercepted browser test.')
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}

function fakeJwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test`
}

async function installFakeSession(page: Page, role: 'user' | 'admin' = 'user') {
  const supabaseUrl = publicSupabaseUrl()
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const token = fakeJwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'navigation@example.test', app_metadata: {}, user_metadata: {} }

  await page.addInitScript(({ key, session }) => {
    window.localStorage.setItem(key, JSON.stringify(session))
  }, {
    key: `sb-${projectRef}-auth-token`,
    session: { access_token: token, refresh_token: 'test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user },
  })

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname.includes('/rest/v1/profiles')) {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: userId, username: 'navigation-test', display_name: 'Navigation Test', role, birth_date: '1990-01-01', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false, parental_consent_status: null }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' })
  })
}

test.describe('responsive navigation and EntreUS Hub', () => {
  test('desktop rail exposes the official order, searchable Hub and keyboard behavior', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })

    const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(navigation).toBeVisible({ timeout: 20_000 })
    await expect(navigation.getByRole('link', { name: 'Casa' })).toHaveAttribute('aria-current', 'page')
    await expect(navigation.locator('a,button')).toHaveCount(5)

    const hubButton = navigation.getByRole('button', { name: 'Abrir Hub EntreUS' })
    await hubButton.click()
    const dialog = page.getByRole('dialog', { name: 'EntreUS' })
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.width).toBeGreaterThan(1440 * 0.7)
    expect(dialogBox!.x).toBeGreaterThan(0)
    expect(Math.abs(dialogBox!.x - (1440 - dialogBox!.width) / 2)).toBeLessThan(3)
    await expect(page.getByTestId('entreus-hub-overlay')).toHaveCSS('z-index', '10000')
    await expect(dialog.getByPlaceholder('Buscar aplicativos, páginas e recursos')).toBeVisible()
    await expect(dialog.getByText('Fixados', { exact: true })).toBeVisible()
    await expect(dialog.locator('h2 [aria-label="EntreUS"] > span > span')).toHaveClass(/text-blue-600/)
    await expect(page.getByTestId('pinned-apps').getByRole('link').first()).toHaveClass(/items-center/)
    await expect(dialog.getByRole('link', { name: /EntreUS Lab/ })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /EntreUS Meet/ })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /Administração/ })).toHaveCount(0)

    await dialog.getByRole('button', { name: /Ver todos/ }).click()
    await expect(dialog.getByRole('button', { name: /Voltar aos fixados/ })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /Carteira/ })).toBeVisible()

    const search = page.getByRole('textbox', { name: 'Buscar no Hub' })
    await search.fill('configuracoes')
    await expect(dialog.getByRole('link', { name: /Configurações/ })).toBeVisible()
    await search.fill('recurso inexistente')
    await expect(page.getByText('Nenhum resultado')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'EntreUS' })).toHaveCount(0)
    await expect(hubButton).toBeFocused()
  })

  test('mobile bar keeps five actions, opens the Hub and respects the viewport', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })

    const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(navigation).toBeVisible({ timeout: 20_000 })
    await expect(navigation.locator('a,button')).toHaveCount(5)
    await expect(navigation).toContainText('Casa')
    await expect(navigation).toContainText('Mensagens')
    await expect(navigation).toContainText('EntreUS')
    await expect(navigation).toContainText('Perfil')
    await expect(navigation).toContainText('Postar')
    const box = await navigation.boundingBox()
    expect(box).not.toBeNull()
    expect(Math.ceil((box?.y || 0) + (box?.height || 0))).toBeLessThanOrEqual(844)

    await navigation.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const dialog = page.getByRole('dialog', { name: 'EntreUS' })
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.width).toBeGreaterThanOrEqual(389)
    expect(dialogBox!.height).toBeGreaterThanOrEqual(843)
    await expect(page.getByTestId('entreus-hub-overlay')).toHaveCSS('z-index', '10000')
    await expect(page.getByTestId('entreus-hub-overlay')).toHaveCSS('pointer-events', 'auto')
    await dialog.getByRole('link', { name: /EntreUS Lab/ }).click()
    await expect(page).toHaveURL(/\/lab$/, { timeout: 20_000 })
  })

  test('administration appears only after an authorized profile response', async ({ page }) => {
    await installFakeSession(page, 'admin')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const dialog = page.getByRole('dialog', { name: 'EntreUS' })
    await dialog.getByRole('button', { name: /Ver todos/ }).click()
    await expect(dialog.getByRole('link', { name: /Administração/ })).toBeVisible({ timeout: 20_000 })
  })

  test('captures the required visual audit states', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(navigation).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: 'reports/navigation-hub/desktop-1440x900-closed-v2.png', fullPage: true })

    await navigation.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const desktopDialog = page.getByRole('dialog', { name: 'EntreUS' })
    await expect(desktopDialog).toBeVisible()
    await expect(desktopDialog.getByText('Só Entre Nós', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'reports/navigation-hub/desktop-open-colors-v4.png' })
    const desktopSearch = desktopDialog.getByRole('textbox', { name: 'Buscar no Hub' })
    await desktopSearch.fill('carteira')
    await expect(desktopDialog.getByRole('link', { name: /Carteira/ })).toBeVisible()
    await page.screenshot({ path: 'reports/navigation-hub/desktop-search-result.png' })
    await desktopSearch.fill('')
    await desktopDialog.getByRole('button', { name: /Ver todos/ }).click()
    await expect(desktopDialog.getByRole('button', { name: /Voltar aos fixados/ })).toBeVisible()
    await page.screenshot({ path: 'reports/navigation-hub/desktop-all-apps-colors-v4.png' })
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileNavigation = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(mobileNavigation).toBeVisible()
    await mobileNavigation.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const mobileDialog = page.getByRole('dialog', { name: 'EntreUS' })
    await expect(mobileDialog).toBeVisible()
    await page.screenshot({ path: 'reports/navigation-hub/mobile-open-colors-v4.png' })
    await mobileDialog.getByRole('textbox', { name: 'Buscar no Hub' }).fill('recurso inexistente')
    await expect(mobileDialog.getByText('Nenhum resultado')).toBeVisible()
    await page.screenshot({ path: 'reports/navigation-hub/mobile-empty-search.png' })
  })

  test('keeps the Feed and right rail balanced across responsive layouts', async ({ page }) => {
    await installFakeSession(page)
    for (const viewport of [
      { width: 1920, height: 1080, path: 'reports/layout/feed-1920x1080-v4.png' },
      { width: 1440, height: 900, path: 'reports/layout/feed-1440x900-v4.png' },
      { width: 1366, height: 768, path: 'reports/layout/feed-1366x768-v4.png' },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/feed', { waitUntil: 'domcontentloaded' })
      const layout = page.getByTestId('feed-layout')
      const rail = page.getByTestId('feed-right-rail')
      await expect(layout).toBeVisible({ timeout: 20_000 })
      await expect(rail).toBeVisible()
      const layoutBox = await layout.boundingBox()
      const railBox = await rail.boundingBox()
      expect(layoutBox).not.toBeNull()
      expect(railBox).not.toBeNull()
      expect(railBox!.x).toBeGreaterThan(layoutBox!.x + layoutBox!.width / 2)
      expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(viewport.width)
      await page.screenshot({ path: viewport.path })
    }

    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('feed-right-rail')).toBeHidden()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('feed-right-rail')).toBeHidden()
    await page.screenshot({ path: 'reports/layout/feed-mobile-390x844-v4.png' })
  })
})
