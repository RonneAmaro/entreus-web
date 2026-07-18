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

async function installFakeSession(
  page: Page,
  role: 'user' | 'admin' = 'user',
  includePosts = false,
  selectedTheme?: 'dark' | 'light',
) {
  const supabaseUrl = publicSupabaseUrl()
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const token = fakeJwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'navigation@example.test', app_metadata: {}, user_metadata: {} }

  await page.addInitScript(({ key, session, theme }) => {
    window.localStorage.setItem(key, JSON.stringify(session))
    if (theme) window.localStorage.setItem('theme', theme)
    window.localStorage.setItem('entreus-language', 'pt')
  }, {
    key: `sb-${projectRef}-auth-token`,
    session: { access_token: token, refresh_token: 'test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user },
    theme: selectedTheme,
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
    if (includePosts && url.pathname.includes('/rest/v1/posts')) {
      const profile = { username: 'navigation-test', display_name: 'Navigation Test', avatar_url: null, vip_status: null, vip_expires_at: null, profile_theme: null }
      const posts = [
        { id: '00000000-0000-4000-8000-000000000051', content: 'Primeira publicação de teste', category: 'general', created_at: '2026-07-18T12:00:00Z', user_id: userId, image_url: null, video_url: null, visibility: 'public', is_sensitive: false, community_type: 'general', content_rating: 'general', is_paid: false, price_itacash: null, profiles: profile },
        { id: '00000000-0000-4000-8000-000000000052', content: 'Segunda publicação de teste', category: 'general', created_at: '2026-07-18T11:00:00Z', user_id: userId, image_url: null, video_url: null, visibility: 'public', is_sensitive: false, community_type: 'general', content_rating: 'general', is_paid: false, price_itacash: null, profiles: profile },
      ]
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-1/2' }, body: JSON.stringify(posts) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' })
  })
}

test.describe('responsive navigation and EntreUS Hub', () => {
  for (const destination of [
    { id: 'feed', title: 'Casa', href: '/feed', start: '/messages' },
    { id: 'messages', title: 'Mensagens', href: '/messages', start: '/feed' },
    { id: 'profile', title: 'Meu perfil', href: '/profile', start: '/feed', showAll: true },
    { id: 'lab', title: 'EntreUS Lab', href: '/lab', start: '/feed' },
    { id: 'meet', title: 'EntreUS Meet', href: '/meet', start: '/feed' },
  ] as const) {
    test(`Hub navigates to ${destination.title} on the first desktop click`, async ({ page }) => {
      await installFakeSession(page)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(destination.start, { waitUntil: 'domcontentloaded' })
      await page.getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('button', { name: 'Abrir Hub EntreUS' })
        .click()
      const dialog = page.getByRole('dialog', { name: 'EntreUS' })
      await expect(dialog).toBeVisible()
      if (destination.showAll) {
        await dialog.getByRole('button', { name: /Ver todos/ }).click()
      }

      const destinationLink = destination.id === 'profile'
        ? dialog.getByRole('link', { name: /Perfil, identidade/ })
        : dialog.getByRole('link', { name: new RegExp(destination.title) })
      await destinationLink.click()
      await expect(page).toHaveURL(new RegExp(`${destination.href}$`), { timeout: 20_000 })
      await expect(page.getByRole('dialog', { name: 'EntreUS' })).toHaveCount(0)
      const recent = await page.evaluate(({ currentUserId }) => {
        const raw = window.localStorage.getItem(`entreus:hub-usage:v1:${currentUserId}`)
        return raw ? JSON.parse(raw).recent[0] : null
      }, { currentUserId: userId })
      expect(recent).toBe(destination.id)
    })
  }

  test('Hub shows the navigated item in Recentes when reopened', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    await page.getByRole('dialog', { name: 'EntreUS' })
      .getByRole('link', { name: /Mensagens/ })
      .click()
    await expect(page).toHaveURL(/\/messages$/)

    await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const dialog = page.getByRole('dialog', { name: 'EntreUS' })
    const recentSection = dialog.getByTestId('recent-apps')
    await expect(recentSection.getByRole('link', { name: /Mensagens/ })).toBeVisible()
  })

  test('Hub compose action closes and opens the existing composer with Space', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const dialog = page.getByRole('dialog', { name: 'EntreUS' })
    const postAction = dialog.getByRole('button', { name: /Postar/ })
    await postAction.focus()
    await postAction.press('Space')
    await expect(page).toHaveURL(/\/feed\?compose=1$/)
    await expect(page.getByRole('dialog', { name: 'EntreUS' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Adicionar emoji' }).first()).toBeVisible({ timeout: 20_000 })
  })

  test('Hub route links support keyboard Enter', async ({ page }) => {
    await installFakeSession(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Abrir Hub EntreUS' }).click()
    const labLink = page.getByRole('dialog', { name: 'EntreUS' })
      .getByRole('link', { name: /EntreUS Lab/ })
    await labLink.focus()
    await labLink.press('Enter')
    await expect(page).toHaveURL(/\/lab$/)
    await expect(page.getByRole('dialog', { name: 'EntreUS' })).toHaveCount(0)
  })

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

  test('post options stay open predictably and only one menu exists at a time', async ({ page }) => {
    await installFakeSession(page, 'user', true)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })

    const firstPost = page.locator('#post-00000000-0000-4000-8000-000000000051')
    const secondPost = page.locator('#post-00000000-0000-4000-8000-000000000052')
    await expect(firstPost).toBeVisible({ timeout: 20_000 })
    const firstTrigger = firstPost.getByRole('button', { name: 'Mais opções' })
    const secondTrigger = secondPost.getByRole('button', { name: 'Mais opções' })

    await firstTrigger.click()
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(1)
    await firstTrigger.click()
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(0)

    await firstTrigger.click()
    await secondTrigger.click()
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false')
    await expect(secondTrigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(1)

    await page.getByText('Comunidades', { exact: true }).click()
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(0)

    await firstTrigger.click()
    await page.getByRole('menuitem', { name: 'Copiar link' }).click()
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(0)

    await firstTrigger.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Opções da publicação' })).toHaveCount(0)
    await expect(firstTrigger).toBeFocused()
  })

  for (const theme of ['dark', 'light'] as const) {
    for (const device of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ] as const) {
      test(`${theme} theme keeps Feed, post menu and Hub readable on ${device.name}`, async ({ page }) => {
        await installFakeSession(page, 'user', true, theme)
        await page.setViewportSize({ width: device.width, height: device.height })
        await page.goto('/feed', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
        await expect(page.getByTestId('feed-layout')).toBeVisible({ timeout: 20_000 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

        const firstPost = page.locator('#post-00000000-0000-4000-8000-000000000051')
        await expect(firstPost).toBeVisible()
        await firstPost.getByRole('button', { name: 'Mais opções' }).click()
        const menu = page.getByRole('menu', { name: 'Opções da publicação' })
        await expect(menu).toBeVisible()
        await expect(menu).toHaveCSS('background-color', theme === 'dark' ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)')
        await page.keyboard.press('Escape')

        const navigation = page.getByRole('navigation', { name: 'Navegação principal' })
        const hubButton = navigation.getByRole('button', { name: 'Abrir Hub EntreUS' })
        await hubButton.click()
        await expect(hubButton).toHaveAttribute('data-active', 'true')
        const hub = page.getByRole('dialog', { name: 'EntreUS' })
        await expect(hub).toBeVisible()
        expect(await hub.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
        await expect(hub.getByRole('textbox', { name: 'Buscar no Hub' })).toBeVisible()
      })
    }
  }

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
