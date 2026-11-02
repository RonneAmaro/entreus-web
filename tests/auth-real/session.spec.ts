import { expect, test } from '@playwright/test'
import { createChunks } from '@supabase/ssr'

test('real Supabase session survives Preview navigation, refresh, new context and rotation until explicit logout', async ({ page, browser, baseURL }) => {
  await page.goto('/login')
  await page.locator('#login-email').fill(process.env.ENTREUS_AUTH_TEST_EMAIL!)
  await page.locator('#login-password').fill(process.env.ENTREUS_AUTH_TEST_PASSWORD!).catch(() => { throw new Error('Unable to enter dedicated test credentials') })
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/feed$/)
  for (const path of ['/', '/login']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/feed$/)
  }
  await page.reload()
  await expect(page.getByTestId('feed-layout')).toBeVisible()
  const tab = await page.context().newPage()
  await tab.goto(baseURL! + '/')
  await expect(tab).toHaveURL(/\/feed$/)
  const state = await page.context().storageState()
  const persisted = state.cookies.filter((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'))
  expect(persisted.length > 0 && persisted.every((cookie) => cookie.expires > Date.now() / 1000)).toBe(true)
  await page.context().close()

  // Keep secrets only in memory. Do not write storageState, traces, screenshots or HAR files.
  const restored = await browser.newContext({ storageState: { cookies: state.cookies, origins: [] } })
  try {
    const next = await restored.newPage()
    await next.goto(baseURL! + '/')
    await expect(next).toHaveURL(/\/feed$/)
    const cookies = (await restored.cookies()).filter((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'))
    const encoded = cookies.sort((a, b) => a.name.localeCompare(b.name)).map((cookie) => cookie.value).join('')
    const session = JSON.parse(Buffer.from(encoded.replace(/^base64-/, ''), 'base64url').toString())
    // Expire only local cache metadata to trigger the real SDK's supported refresh flow.
    // The signed JWT and refresh token stay intact; Supabase validates and rotates them.
    session.expires_at = Math.floor(Date.now() / 1000) - 1
    const name = cookies[0].name.replace(/\.\d+$/, '')
    await restored.clearCookies({ name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.\\d+)?$') })
    await restored.addCookies(createChunks(name, 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')).map((cookie) => ({
      ...cookie, domain: new URL(baseURL!).hostname, path: '/', secure: true, sameSite: 'Lax', expires: cookies[0].expires,
    })))
    await next.goto(baseURL! + '/')
    await expect(next).toHaveURL(/\/feed$/)
    const updatedCookies = (await restored.cookies()).filter((cookie) => cookie.name === name || cookie.name.startsWith(name + '.'))
    const updated = JSON.parse(Buffer.from(updatedCookies.sort((a, b) => a.name.localeCompare(b.name)).map((cookie) => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString())
    expect(updated.refresh_token !== session.refresh_token).toBe(true)
    expect(updated.expires_at > Date.now() / 1000).toBe(true)

    await next.setViewportSize({ width: 1440, height: 900 })
    await next.locator('aside').getByRole('button', { name: 'Abrir menu da conta' }).click()
    await next.getByRole('menuitem', { name: 'Sair', exact: true }).click()
    await expect(next).toHaveURL(/\/login$/)
    await next.goto(baseURL! + '/')
    await expect(next).toHaveURL(baseURL!.replace(/\/$/, '') + '/')
    await next.goto(baseURL! + '/login')
    await expect(next.locator('#login-email')).toBeVisible()
  } finally {
    await restored.close()
  }
})
