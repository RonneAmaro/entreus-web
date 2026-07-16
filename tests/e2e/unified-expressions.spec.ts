import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const userId = '00000000-0000-4000-8000-000000000051'
function supabaseUrl() { const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL=')); if (!line) throw new Error('Supabase URL required'); return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '') }
function jwt() { const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url'); return `${enc({ alg: 'HS256' })}.${enc({ sub: userId, role: 'authenticated', exp: 4102444800 })}.test` }
async function mockApp(page: Page, theme: 'dark' | 'light') {
  const base = supabaseUrl(), ref = new URL(base).hostname.split('.')[0], token = jwt(), user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'expressions@example.test', app_metadata: {}, user_metadata: {} }
  await page.addInitScript(({ key, value, selectedTheme }) => { localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('theme', selectedTheme); localStorage.setItem('entreus-language', 'pt') }, { key: `sb-${ref}-auth-token`, value: { access_token: token, refresh_token: 'test', expires_at: 4102444800, user }, selectedTheme: theme })
  await page.route(`${base}/**`, (route) => { const path = new URL(route.request().url()).pathname; if (path.endsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }); if (path.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: userId, username: 'expressions', display_name: 'Expressions Test', role: 'user', birth_date: '1990-01-01', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false }]) }); return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
  await page.route('**/api/expressions/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [{ kind: 'gif', provider: 'tenor', providerId: 'mock-gif', title: 'Festa', altText: 'Pessoa comemorando', previewUrl: 'https://media.tenor.com/mock/preview.webp', mediaUrl: 'https://media.tenor.com/mock/media.mp4', staticUrl: 'https://media.tenor.com/mock/still.webp', width: 320, height: 240, attributionUrl: 'https://tenor.com/', contentRating: 'g' }], nextCursor: null, attribution: 'Conteudo por Tenor' }) }))
  await page.route('https://media.tenor.com/**', (route) => route.fulfill({ status: 404, body: '' }))
}

for (const scenario of [{ theme: 'dark' as const, width: 1440, height: 900, name: 'desktop' }, { theme: 'light' as const, width: 390, height: 844, name: 'mobile' }]) {
  test(`shared expression picker in post composer - ${scenario.theme} ${scenario.name}`, async ({ page }) => {
    await mockApp(page, scenario.theme); await page.setViewportSize(scenario); await page.goto('/feed', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'O que voce quer compartilhar hoje?' }).click(); const trigger = page.getByRole('button', { name: 'Adicionar emoji' }).first(); await expect(trigger).toBeVisible({ timeout: 20_000 }); await trigger.click()
    const picker = page.getByRole('dialog', { name: 'Emojis, GIFs e stickers' }); await expect(picker).toBeVisible(); await expect(picker.getByRole('tab', { name: 'Emojis' })).toHaveAttribute('aria-selected', 'true')
    await picker.getByRole('button', { name: 'Inserir 😀' }).click(); const composer = page.locator('textarea').first(); await expect(composer).toHaveValue(/😀/)
    await trigger.click(); await picker.getByRole('tab', { name: 'GIFs' }).click(); await expect(picker.getByRole('button', { name: 'Selecionar Pessoa comemorando' })).toBeVisible({ timeout: 10_000 })
    mkdirSync('reports/unified-expressions', { recursive: true }); await page.screenshot({ path: `reports/unified-expressions/post-picker-${scenario.theme}-${scenario.name}.png` })
    await page.keyboard.press('Escape'); await expect(picker).toBeHidden(); await expect(composer).toBeFocused()
  })
}

test('provider failure remains controlled and never calls a real provider', async ({ page }) => {
  await mockApp(page, 'dark'); let realProviderCalls = 0; await page.route('https://tenor.googleapis.com/**', (route) => { realProviderCalls += 1; return route.abort() }); await page.route('**/api/expressions/search**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Galeria externa desativada.' }) }))
  await page.goto('/feed'); await page.getByRole('button', { name: 'O que voce quer compartilhar hoje?' }).click(); await page.getByRole('button', { name: 'Adicionar emoji' }).first().click(); const picker = page.getByRole('dialog', { name: 'Emojis, GIFs e stickers' }); await picker.getByRole('tab', { name: 'Stickers' }).click(); await expect(picker.getByRole('alert')).toContainText('desativada'); expect(realProviderCalls).toBe(0)
})
