import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const userId = '00000000-0000-4000-8000-000000000053'
const postId = '00000000-0000-4000-8000-000000000054'
type TestLocale = 'pt-BR' | 'en' | 'es' | 'fr' | 'id' | 'ko' | 'ja' | 'zh-CN'
const PORTUGUESE_UI_TERMS = /\b(?:Tipo de conta|Conta pessoal|Conta profissional|Editar perfil|Informações pessoais|Dados da conta|Configurações|Carregando|Tentar novamente|Comunidades|Comentários|Publicar|Salvar|Cancelar|Excluir|Você|Não)\b/i
const REQUIRED_MIGRATED_ROUTES = [
  '/creator-dashboard',
  '/wallet',
  '/vip-plus',
  '/messages',
  `/messages/${userId}`,
  '/itacash',
  '/buy-itacash',
  '/settings',
  '/u/idioma-test',
] as const

async function assertNoKnownPortugueseUi(page: Page, route: string) {
  const visibleText = await page.locator('body').innerText()
  const describedText = await page.locator('[placeholder], [title], [aria-label]')
    .evaluateAll((elements) => elements.flatMap((element) => [
      element.getAttribute('placeholder'),
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
    ]).filter(Boolean).join('\n'))
  const inspectedText = `${visibleText}\n${describedText}`
  const match = inspectedText.match(PORTUGUESE_UI_TERMS)
  if (match) {
    throw new Error([
      'Portuguese text found:',
      `Route: ${route}`,
      `Element: text=${match[0]}`,
      `File candidate: app${route === '/' ? '' : route}/page.tsx or a rendered app/components dependency`,
    ].join('\n'))
  }
  if (inspectedText.includes('⟦')) {
    throw new Error([
      'Raw translation key found:',
      `Route: ${route}`,
      `Element: text=${inspectedText.match(/⟦[^⟧]+⟧/)?.[0] || 'unknown'}`,
      `File candidate: app${route === '/' ? '' : route}/page.tsx or a rendered app/components dependency`,
    ].join('\n'))
  }
}

function publicSupabaseUrl() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.')
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}

function fakeJwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test`
}

async function installSession(
  page: Page,
  locale: TestLocale,
  options: { remoteResult?: 'success' | 'migration_missing' | 'failure' } = {},
) {
  const supabaseUrl = publicSupabaseUrl()
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  const token = fakeJwt()
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'idioma@example.test', app_metadata: {}, user_metadata: {} }
  const persisted = {
    locale,
    countryCode: locale === 'es' ? 'MX' : locale === 'en' ? 'US' : 'BR',
    remoteCalls: 0,
  }

  await page.context().addCookies([{
    name: 'entreus-locale',
    value: locale,
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax',
  }])
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('theme', 'dark')
  }, {
    key: `sb-${ref}-auth-token`,
    session: { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user },
  })

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname.includes('/rest/v1/profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: userId,
          username: 'idioma-test',
          display_name: 'Idioma Test',
          interface_locale: persisted.locale,
          country_code: persisted.countryCode,
          role: 'user',
          birth_date: '1990-01-01',
          profile_content_mode: 'general',
          show_sensitive_content: false,
          wants_18_plus: false,
          is_minor: false,
        }]),
      })
      return
    }
    if (url.pathname.includes('/rest/v1/posts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify([{
          id: postId,
          content: 'This is the post that you can read in the app.',
          category: 'cotidiano',
          created_at: '2026-07-19T12:00:00Z',
          user_id: userId,
          image_url: null,
          video_url: null,
          visibility: 'public',
          is_sensitive: false,
          community_type: 'general',
          content_rating: 'general',
          is_paid: false,
          price_itacash: null,
          profiles: { username: 'idioma-test', display_name: 'Idioma Test', avatar_url: null },
        }]),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.route('**/api/profile/locale', async (route) => {
    persisted.remoteCalls += 1
    const input = route.request().postDataJSON() as {
      interfaceLocale?: TestLocale
      countryCode?: string | null
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (options.remoteResult === 'migration_missing') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          locale: input.interfaceLocale,
          synced: false,
          reason: 'migration_missing',
        }),
      })
      return
    }
    if (options.remoteResult === 'failure') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          synced: false,
          error: { code: 'profile_update_failed', message: 'Persistence failed.' },
        }),
      })
      return
    }
    if (!input.interfaceLocale) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
      return
    }
    persisted.locale = input.interfaceLocale
    persisted.countryCode = input.countryCode || persisted.countryCode
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        locale: persisted.locale,
        synced: true,
        countryCode: persisted.countryCode,
      }),
    })
  })

  return persisted
}

async function expectPriorityFeedCoverage(page: Page, locale: 'en' | 'es') {
  const expected = locale === 'en'
    ? {
        prompt: 'What would you like to share today?',
        publish: 'Publish',
        general: 'General',
        communities: 'Communities',
        lab: 'Open Lab',
        comment: 'Comment',
        emptyComments: 'Be the first person to comment.',
        pinned: 'Pinned',
        messages: /Messages/,
      }
    : {
        prompt: '¿Qué quieres compartir hoy?',
        publish: 'Publicar',
        general: 'General',
        communities: 'Comunidades',
        lab: 'Abrir laboratorio',
        comment: 'Comentar',
        emptyComments: 'Sé la primera persona en comentar.',
        pinned: 'Fijados',
        messages: /Mensajes/,
      }

  await expect(page.getByText(expected.prompt, { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: expected.publish, exact: true }).first()).toBeVisible()
  await expect(page.getByText(expected.communities, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: expected.general, exact: true })).toBeVisible()
  await expect(page.getByText(expected.lab, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: locale === 'en' ? 'Home' : 'Inicio', exact: true })).toBeVisible()

  await expect(page.getByRole('button', { name: expected.comment, exact: true }).first()).toBeVisible()
  await expect(page.getByText(expected.emptyComments, { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: locale === 'en' ? 'Open EntreUS Hub' : 'Abrir Hub EntreUS' }).click()
  const hub = page.getByRole('dialog', { name: 'EntreUS' })
  await expect(hub.getByText(expected.pinned, { exact: true })).toBeVisible()
  await expect(hub.getByRole('link', { name: expected.messages })).toBeVisible()
  await page.keyboard.press('Escape')

  for (const portuguese of [
    'O que você quer compartilhar hoje?',
    'Geral mostra apenas posts seguros. Escolha uma comunidade para mudar de ambiente.',
    'Abrir laboratório',
  ]) {
    if (locale === 'es' && portuguese === 'Abrir laboratório') continue
    await expect(page.getByText(portuguese, { exact: true })).toHaveCount(0)
  }
}

test.describe('global interface locale and post translation', () => {
  test.describe.configure({ mode: 'serial' })
  test('uses the explicit English cookie on the initial login render', async ({ page }) => {
    await page.context().addCookies([{
      name: 'entreus-locale',
      value: 'en',
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    }])
    await page.addInitScript(() => localStorage.setItem('theme', 'light'))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/light/)
  })

  test('changes signup to Spanish on mobile while keeping country separate', async ({ page }) => {
    await page.context().addCookies([{
      name: 'entreus-locale',
      value: 'pt-BR',
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    }])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/signup', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-locale-ready', 'true')
    const country = page.getByLabel(/País|Country/)
    await country.selectOption('MX')

    await expect(country).toHaveValue('MX')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible()
    await expect(page.getByLabel('Idioma de la plataforma')).toHaveValue('es')
    expect(await page.context().cookies()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'entreus-locale', value: 'es' }),
    ]))
  })

  test('covers the priority Feed surface in English and keeps it after reload', async ({ page }) => {
    await installSession(page, 'en')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/feed', { waitUntil: 'domcontentloaded' })

    await expectPriorityFeedCoverage(page, 'en')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByText('What would you like to share today?', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Open Lab', { exact: true })).toBeVisible()
  })

  test('scans the visible English text of the migrated authenticated routes', async ({ page }) => {
    await installSession(page, 'en')
    for (const route of ['/feed', '/settings', '/profile', '/lab', '/meet']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.locator('body')).toBeVisible()
      await assertNoKnownPortugueseUi(page, route)
    }
  })

  for (const locale of ['en', 'fr', 'ja'] as const) {
    test(`scans every migrated monetization, messages, and public-profile route in ${locale}`, async ({ page }) => {
      test.setTimeout(180_000)
      await installSession(page, locale)
      await page.setViewportSize({ width: 1440, height: 1000 })

      for (const route of REQUIRED_MIGRATED_ROUTES) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.locator('body')).toBeVisible()
        await assertNoKnownPortugueseUi(page, route)
      }
    })
  }

  test('changes the authenticated interface through Settings and persists English and Spanish', async ({ page }) => {
    const persisted = await installSession(page, 'pt-BR')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })

    const localeSelect = page.getByLabel('Idioma da plataforma')
    await expect(localeSelect).toHaveValue('pt-BR')
    await localeSelect.selectOption('en')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible()
    await expect(page.getByText('Platform language', { exact: true })).toBeVisible()
    await expect(page.getByText('Language saved successfully.', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Platform language')).toHaveValue('en')
    expect(persisted.locale).toBe('en')
    expect(persisted.remoteCalls).toBe(1)
    await page.getByRole('button', { name: 'Save language' }).click()
    await expect.poll(() => persisted.remoteCalls).toBe(2)
    expect(await page.context().cookies()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'entreus-locale', value: 'en', path: '/' }),
    ]))

    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expectPriorityFeedCoverage(page, 'en')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByText('What would you like to share today?', { exact: true })).toBeVisible()

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    const englishLocaleSelect = page.getByLabel('Platform language')
    await englishLocaleSelect.selectOption('es')

    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('heading', { name: 'Configuración de la cuenta' })).toBeVisible()
    await expect(page.getByText('Idioma de la plataforma', { exact: true })).toBeVisible()
    await expect(page.getByText('Idioma guardado correctamente.', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Idioma de la plataforma')).toHaveValue('es')
    expect(persisted.locale).toBe('es')

    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expectPriorityFeedCoverage(page, 'es')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByText('¿Qué quieres compartir hoy?', { exact: true })).toBeVisible()
  })

  test('changes through French, Indonesian, Korean, Japanese, and Simplified Chinese', async ({ page }) => {
    await installSession(page, 'pt-BR')
    const locales = [
      { code: 'fr', previousLabel: 'Idioma da plataforma', label: 'Langue de la plateforme', settings: 'Paramètres du compte', prompt: 'Que souhaitez-vous partager aujourd’hui ?', home: 'Accueil', communities: 'Communautés', openHub: 'Ouvrir le Hub EntreUS', pinned: 'Épinglés' },
      { code: 'id', previousLabel: 'Langue de la plateforme', label: 'Bahasa platform', settings: 'Pengaturan akun', prompt: 'Apa yang ingin Anda bagikan hari ini?', home: 'Beranda', communities: 'Komunitas', openHub: 'Buka Hub EntreUS', pinned: 'Disematkan' },
      { code: 'ko', previousLabel: 'Bahasa platform', label: '플랫폼 언어', settings: '계정 설정', prompt: '오늘 무엇을 공유하고 싶으신가요?', home: '홈', communities: '커뮤니티', openHub: 'EntreUS 허브 열기', pinned: '고정됨' },
      { code: 'ja', previousLabel: '플랫폼 언어', label: 'プラットフォームの言語', settings: 'アカウント設定', prompt: '今日は何を共有しますか？', home: 'ホーム', communities: 'コミュニティ', openHub: 'EntreUS Hubを開く', pinned: '固定済み' },
      { code: 'zh-CN', previousLabel: 'プラットフォームの言語', label: '平台语言', settings: '帐户设置', prompt: '今天想分享些什么？', home: '首页', communities: '社区', openHub: '打开EntreUS Hub', pinned: '已固定' },
    ] as const

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    for (const expected of locales) {
      await page.getByLabel(expected.previousLabel).selectOption(expected.code)
      await expect(page.locator('html')).toHaveAttribute('lang', expected.code)
      await expect(page.getByRole('heading', { name: expected.settings })).toBeVisible()
      await expect(page.getByLabel(expected.label)).toHaveValue(expected.code)
      if (expected.code === 'fr' || expected.code === 'ja') {
        await assertNoKnownPortugueseUi(page, '/settings')
      }

      await page.goto('/feed', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText(expected.prompt, { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(expected.communities, { exact: true }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: expected.home, exact: true })).toBeVisible()
      if (expected.code === 'fr' || expected.code === 'ja') {
        await assertNoKnownPortugueseUi(page, '/feed')
      }
      await page.getByRole('button', { name: expected.openHub }).click()
      await expect(page.getByRole('dialog', { name: 'EntreUS' }).getByText(expected.pinned, { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('html')).toHaveAttribute('lang', expected.code)
      await expect(page.getByText(expected.prompt, { exact: true })).toBeVisible({ timeout: 15_000 })
      await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    }
  })

  test('keeps the local language when the profile migration is missing', async ({ page }) => {
    const persisted = await installSession(page, 'pt-BR', { remoteResult: 'migration_missing' })
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })

    const localeSelect = page.getByLabel('Idioma da plataforma')
    await localeSelect.selectOption('en')
    await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible()

    await expect(page.getByLabel('Platform language')).toHaveValue('en')
    await expect(page.getByText('The database configuration has not been applied yet. Your preference was kept on this device but was not synced with your account.', {
      exact: true,
    })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    expect(persisted.locale).toBe('pt-BR')
    expect(await page.context().cookies()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'entreus-locale', value: 'en', path: '/' }),
    ]))
    expect(await page.evaluate(() => localStorage.getItem('entreus-language'))).toBe('en')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByLabel('Platform language')).toHaveValue('en')
  })

  test('translates a different-language post once and restores the original', async ({ page }) => {
    await installSession(page, 'es')
    let translationCalls = 0
    await page.route('**/api/translate', async (route) => {
      translationCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 150))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translatedText: 'Esta es la publicación que puedes leer en la aplicación.' }),
      })
    })

    await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await expectPriorityFeedCoverage(page, 'es')

    const original = page.getByText('This is the post that you can read in the app.', { exact: true })
    await expect(original).toBeVisible()
    const translate = page.getByRole('button', { name: 'Traducir publicación' }).first()
    await translate.evaluate((button) => {
      const element = button as HTMLButtonElement
      element.click()
      element.click()
    })
    await expect(page.getByText('Esta es la publicación que puedes leer en la aplicación.')).toBeVisible()
    expect(translationCalls).toBe(1)
    await page.getByRole('button', { name: 'Ver original' }).first().click()
    await expect(original).toBeVisible()
    await expect(page.getByText('Esta es la publicación que puedes leer en la aplicación.')).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByText('¿Qué quieres compartir hoy?', { exact: true })).toBeVisible({ timeout: 15_000 })
  })
})
