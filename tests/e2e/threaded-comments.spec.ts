import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.describe.configure({ mode: 'serial' })

const viewerId = '00000000-0000-4000-8000-000000000052'
const authorId = '00000000-0000-4000-8000-000000000053'
const postId = '00000000-0000-4000-8000-000000000054'
const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`)

type MockComment = {
  id: string; post_id: string; user_id: string; parent_comment_id: string | null
  content: string; expression: Record<string, unknown> | null; depth: number
  reply_count: number; deleted_at: string | null; edited_at: string | null
  created_at: string; profiles: { username: string; display_name: string; avatar_url: null }
}

function supabaseUrl() {
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  if (!line) throw new Error('Supabase URL required')
  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}
function jwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: viewerId, role: 'authenticated', exp: 4102444800 })}.test`
}
function comment(id: string, parent: string | null, depth: number, content: string, replies = 0, userId = authorId): MockComment {
  return {
    id, post_id: postId, user_id: userId, parent_comment_id: parent, content,
    expression: null, depth, reply_count: replies, deleted_at: null, edited_at: null,
    created_at: new Date(Date.UTC(2026, 6, 17, 10, [...id].reduce((sum, value) => sum + value.charCodeAt(0), 0) % 60)).toISOString(),
    profiles: { username: userId === viewerId ? 'visitante' : 'criadora', display_name: userId === viewerId ? 'Visitante' : 'Criadora', avatar_url: null },
  }
}
function initialComments() {
  const root = comment(ids[0], null, 0, 'Comentário raiz com uma conversa completa.', 4)
  const removed = { ...comment(ids[1], null, 0, '', 1), deleted_at: '2026-07-17T11:00:00.000Z' }
  const ownRoot = comment(ids[2], null, 0, 'Comentário do visitante', 2, viewerId)
  const roots = [root, removed, ownRoot, ...ids.slice(3, 11).map((id, index) => comment(id, null, 0, `Comentário adicional ${index + 2}`))]
  const replies = [
    comment(ids[11], root.id, 1, 'Primeira resposta', 1),
    comment(ids[12], root.id, 1, 'Resposta com emoji 😀'),
    { ...comment(ids[13], root.id, 1, '', 0), expression: { kind: 'gif', provider: 'tenor', providerId: 'mock-gif', title: 'Festa', altText: 'GIF de festa', previewUrl: 'https://media.tenor.com/mock/preview.webp', mediaUrl: 'https://media.tenor.com/mock/media.mp4', contentRating: 'g' } },
    comment(ids[14], root.id, 1, 'Quarta resposta para paginação'),
  ]
  const deep = [
    comment(ids[15], ids[11], 2, 'Resposta da resposta', 1),
    comment(ids[16], ids[15], 3, 'Nível lógico quatro sem recuo excessivo', 1),
    comment(ids[17], ids[16], 4, 'Nível lógico cinco', 1),
    comment(ids[18], ids[17], 5, 'Nível lógico seis'),
    comment(ids[19], removed.id, 1, 'Filho preservado após remoção'),
    comment('00000000-0000-4000-8000-000000000999', ownRoot.id, 1, 'Filho preservado no soft delete'),
    comment('00000000-0000-4000-8000-000000000998', ownRoot.id, 1, 'Segundo filho preservado', 0, authorId),
  ]
  return [...roots, ...replies, ...deep]
}

async function mockThreadedFeed(
  page: Page,
  theme: 'dark' | 'light',
  options: { threadedRootFailures?: number } = {},
) {
  const base = supabaseUrl()
  const ref = new URL(base).hostname.split('.')[0]
  const token = jwt()
  const user = { id: viewerId, aud: 'authenticated', role: 'authenticated', email: 'thread@example.test', app_metadata: {}, user_metadata: {} }
  let comments = initialComments()
  let failNextReply = false
  let threadedRootFailures = options.threadedRootFailures || 0
  let reportCalls = 0

  await page.addInitScript(({ key, value, selectedTheme }) => {
    localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('theme', selectedTheme); localStorage.setItem('entreus-language', 'pt')
  }, { key: `sb-${ref}-auth-token`, value: { access_token: token, refresh_token: 'test', expires_at: 4102444800, user }, selectedTheme: theme })
  await page.routeWebSocket(`${base.replace(/^http/, 'ws')}/realtime/v1/websocket**`, (socket) => socket.close())

  const fulfill = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

  await page.route(`${base}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith('/auth/v1/user')) return fulfill(route, user)
    if (path.includes('/rest/v1/rpc/create_threaded_comment')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      if (failNextReply) { failNextReply = false; return fulfill(route, { message: 'Falha simulada' }, 409) }
      const duplicate = comments.find((item) => item.id === payload.p_client_request_id)
      if (duplicate) return fulfill(route, [duplicate])
      const parent = comments.find((item) => item.id === payload.p_parent_comment_id)
      const created = comment(String(payload.p_client_request_id), parent?.id || null, parent ? parent.depth + 1 : 0, String(payload.p_content || ''), 0, viewerId)
      created.expression = (payload.p_expression as MockComment['expression']) || null
      comments.push(created)
      if (parent) parent.reply_count += 1
      return fulfill(route, [created])
    }
    if (path.includes('/rest/v1/rpc/edit_threaded_comment')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      const target = comments.find((item) => item.id === payload.p_comment_id)
      if (!target || target.user_id !== viewerId) return fulfill(route, { message: 'comment_edit_forbidden' }, 403)
      target.content = String(payload.p_content || ''); target.edited_at = new Date().toISOString()
      return fulfill(route, target)
    }
    if (path.includes('/rest/v1/rpc/delete_threaded_comment')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      const target = comments.find((item) => item.id === payload.p_comment_id)
      if (!target || target.user_id !== viewerId) return fulfill(route, { message: 'comment_delete_forbidden' }, 403)
      if (target.reply_count) { target.content = ''; target.expression = null; target.deleted_at = new Date().toISOString() } else comments = comments.filter((item) => item.id !== target.id)
      return fulfill(route, target)
    }
    if (path.includes('/rest/v1/rpc/report_threaded_comment')) {
      reportCalls += 1
      return fulfill(route, { id: 'report-1', status: 'pending' })
    }
    if (path.includes('/rest/v1/profiles')) return fulfill(route, [
      { id: viewerId, username: 'visitante', display_name: 'Visitante', avatar_url: null, role: 'user', birth_date: '1990-01-01', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false },
      { id: authorId, username: 'criadora', display_name: 'Criadora', avatar_url: null, role: 'creator' },
    ])
    if (path.includes('/rest/v1/posts')) return fulfill(route, [{
      id: postId, content: 'Publicação simulada para validar comentários encadeados.', category: 'cotidiano',
      created_at: '2026-07-17T09:00:00.000Z', user_id: authorId, image_url: null, video_url: null,
      visibility: 'public', is_sensitive: false, community_type: 'general', content_rating: 'safe',
      moderation_status: 'active', expression: null, is_paid: false, price_itacash: null,
      profiles: { username: 'criadora', display_name: 'Criadora', avatar_url: null, vip_status: null },
    }], 200, { 'content-range': '0-0/1' })
    if (path.includes('/rest/v1/comments')) {
      const parentFilter = url.searchParams.get('parent_comment_id')
      const isThreadedQuery = (url.searchParams.get('select') || '').includes('reply_count')
      if (isThreadedQuery && parentFilter === 'is.null' && threadedRootFailures > 0) {
        threadedRootFailures -= 1
        return fulfill(route, { message: 'simulated schema failure', code: 'PGRST204' }, 400)
      }
      let result = comments
      if (parentFilter === 'is.null') result = comments.filter((item) => item.parent_comment_id === null)
      else if (parentFilter?.startsWith('eq.')) result = comments.filter((item) => item.parent_comment_id === parentFilter.slice(3))
      if (url.searchParams.has('or')) result = result.slice(parentFilter === 'is.null' ? 10 : 3)
      return fulfill(route, result)
    }
    return fulfill(route, [])
  })
  await page.route('**/api/expressions/search**', (route) => fulfill(route, { ok: true, items: [{ kind: 'gif', provider: 'tenor', providerId: 'picked-gif', title: 'Festa', altText: 'GIF escolhido', previewUrl: 'https://media.tenor.com/mock/preview.webp', mediaUrl: 'https://media.tenor.com/mock/media.mp4', contentRating: 'g' }], nextCursor: null }))
  await page.route('https://media.tenor.com/**', (route) => route.fulfill({ status: 404, body: '' }))
  return {
    failOnce: () => { failNextReply = true },
    failRootOnce: () => { threadedRootFailures += 1 },
    reportCalls: () => reportCalls,
  }
}

async function openThread(page: Page) {
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Comentário raiz com uma conversa completa.')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /Ver 4 respostas/ }).click()
  await expect(page.getByText('Primeira resposta')).toBeVisible()
}

test('threaded comments interactions, security states and retry', async ({ page }) => {
  const mock = await mockThreadedFeed(page, 'dark')
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()) })
  await page.setViewportSize({ width: 390, height: 844 }); await openThread(page)
  await expect(page.getByRole('button', { name: 'Ver mais respostas' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver mais respostas' }).click(); await expect(page.getByText('Quarta resposta para paginação')).toBeVisible()
  await page.getByRole('button', { name: 'Recolher' }).first().click(); await expect(page.getByText('Primeira resposta')).toBeHidden()
  await page.getByRole('button', { name: /Ver 4 respostas/ }).click()
  await page.getByText('Primeira resposta').locator('..').getByRole('button', { name: 'Responder' }).first().click()
  const composer = page.getByPlaceholder('Responder a @criadora').first()
  await composer.fill('Texto preservado')
  mock.failOnce(); await composer.locator('..').getByRole('button', { name: 'Responder' }).click()
  await expect(composer).toHaveValue('Texto preservado')
  await composer.locator('..').getByRole('button', { name: 'Responder' }).click()
  await expect(page.getByText('Texto preservado')).toBeVisible()
  await page.getByText('Primeira resposta').locator('..').getByRole('button', { name: 'Responder' }).first().click()
  await composer.fill('😀'); await composer.locator('..').getByRole('button', { name: 'Responder' }).click()
  await page.getByText('Primeira resposta').locator('..').getByRole('button', { name: 'Responder' }).first().click()
  await composer.locator('..').getByRole('button', { name: 'Emoji, GIF ou sticker' }).click()
  const picker = page.getByRole('dialog', { name: 'Emojis, GIFs e stickers' })
  await picker.getByRole('tab', { name: 'GIFs' }).click(); await picker.getByRole('button', { name: 'Selecionar GIF escolhido' }).click()
  await composer.locator('..').getByRole('button', { name: 'Responder' }).click()
  await page.getByText('Resposta com emoji 😀').locator('..').getByRole('button', { name: 'Opções do comentário' }).click()
  page.once('dialog', (dialog) => dialog.accept('Spam repetitivo e assédio.'))
  await page.getByRole('button', { name: 'Denunciar' }).click()
  await expect.poll(() => mock.reportCalls()).toBe(1)
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((body) => body.clientWidth))
  expect(errors).toEqual([])
})

test('root load error excludes empty state and retry recovers', async ({ page }) => {
  await mockThreadedFeed(page, 'dark', { threadedRootFailures: 1 })
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })

  const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os comentários.' })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Seja a primeira pessoa a comentar.')).toHaveCount(0)
  await alert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('Comentário raiz com uma conversa completa.')).toBeVisible()
  await expect(alert).toHaveCount(0)
})

test('secondary refresh failure preserves the existing conversation', async ({ page }) => {
  const mock = await mockThreadedFeed(page, 'dark')
  await openThread(page)
  await page.getByText('Comentário raiz com uma conversa completa.').locator('..').getByRole('button', { name: 'Responder' }).first().click()
  const composer = page.getByPlaceholder('Responder a @criadora').first()
  await composer.fill('Resposta que dispara atualização')
  mock.failRootOnce()
  await composer.locator('..').getByRole('button', { name: 'Responder' }).click()

  await expect(page.getByText('Comentário raiz com uma conversa completa.')).toBeVisible()
  const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os comentários.' })
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(alert).toHaveCount(0)
})

test('owner edits and soft-deletes a comment while preserving its child', async ({ page }) => {
  await mockThreadedFeed(page, 'dark')
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  const ownNode = page.getByRole('listitem', { name: 'Comentário no nível 1' })
    .filter({ hasText: 'Comentário do visitante' })
  await expect(ownNode).toBeVisible({ timeout: 20_000 })

  await ownNode.getByRole('button', { name: 'Opções do comentário' }).click()
  await ownNode.getByRole('button', { name: 'Editar' }).click()
  const editor = page.getByPlaceholder('Editar comentário')
  await editor.fill('Comentário editado pelo visitante')
  await editor.locator('..').getByRole('button', { name: 'Salvar' }).click()
  const editedNode = page.getByRole('listitem', { name: 'Comentário no nível 1' })
    .filter({ hasText: 'Comentário editado pelo visitante' })
  await expect(editedNode).toBeVisible()

  await editedNode.getByRole('button', { name: 'Opções do comentário' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await editedNode.getByRole('button', { name: 'Excluir' }).click()
  const removedOwnNode = page.getByRole('listitem', { name: 'Comentário no nível 1' })
    .filter({ has: page.getByRole('button', { name: 'Ver 2 respostas' }) })
  await expect(removedOwnNode.getByLabel('Comentário removido')).toBeVisible()
  await removedOwnNode.getByRole('button', { name: 'Ver 2 respostas' }).click()
  await expect(page.getByText('Filho preservado no soft delete')).toBeVisible()
  await expect(page.getByText('Segundo filho preservado')).toBeVisible()
})

for (const shot of [
  { name: 'desktop-dark.png', theme: 'dark' as const, width: 1440, height: 900 },
  { name: 'desktop-light.png', theme: 'light' as const, width: 1440, height: 900 },
  { name: 'tablet-dark.png', theme: 'dark' as const, width: 768, height: 1024 },
  { name: 'mobile-dark.png', theme: 'dark' as const, width: 390, height: 844 },
  { name: 'mobile-light.png', theme: 'light' as const, width: 360, height: 800 },
]) {
  test(`visual threaded comments ${shot.name}`, async ({ page }, testInfo) => {
    await mockThreadedFeed(page, shot.theme); await page.setViewportSize(shot); await openThread(page)
    await page.getByText('Comentário raiz com uma conversa completa.').scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(shot.name) })
  })
}

test('removed node keeps children and deep reply uses capped visual indentation', async ({ page }, testInfo) => {
  await mockThreadedFeed(page, 'dark'); await page.setViewportSize({ width: 1440, height: 900 }); await openThread(page)
  await expect(page.getByLabel('Comentário removido')).toBeVisible()
  await page.getByRole('button', { name: /Ver 1 resposta/ }).last().click()
  await expect(page.getByText('Filho preservado após remoção')).toBeVisible()
  await page.getByText('Filho preservado após remoção').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('removed-comment-with-replies.png') })
})

test('expression reply composer restores focus with Escape', async ({ page }, testInfo) => {
  await mockThreadedFeed(page, 'dark'); await page.setViewportSize({ width: 390, height: 844 }); await openThread(page)
  await page.getByText('Primeira resposta').locator('..').getByRole('button', { name: 'Responder' }).click()
  const composer = page.getByPlaceholder('Responder a @criadora').first()
  await composer.locator('..').getByRole('button', { name: 'Emoji, GIF ou sticker' }).click()
  await page.keyboard.press('Escape'); await expect(composer).toBeFocused()
  await composer.locator('..').getByRole('button', { name: 'Emoji, GIF ou sticker' }).click()
  await page.getByRole('dialog').getByRole('tab', { name: 'GIFs' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Selecionar GIF escolhido' }).click()
  await composer.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('expression-reply.png') })
})
