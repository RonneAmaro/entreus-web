import { expect, test, type Route } from '@playwright/test'

const e2eSupabaseUrl = 'https://entreus-e2e.invalid'
const viewerId = '00000000-0000-4000-8000-000000000052'
const authorId = '00000000-0000-4000-8000-000000000053'
const postId = '00000000-0000-4000-8000-000000000054'

function jwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: viewerId, role: 'authenticated', exp: 4102444800 })}.test`
}

test('post page uses threaded comments RPC without legacy comment writes', async ({ page }) => {
  const base = e2eSupabaseUrl.replace(/\/$/, '')
  const ref = new URL(base).hostname.split('.')[0]
  const token = jwt()
  const user = { id: viewerId, aud: 'authenticated', role: 'authenticated', email: 'post-thread@example.test', app_metadata: {}, user_metadata: {} }
  const profile = { id: viewerId, username: 'visitante', display_name: 'Visitante', avatar_url: null, role: 'user', birth_date: '1990-01-01', parental_consent_status: 'not_required', terms_accepted_at: '2026-01-01T00:00:00Z', privacy_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2026-05', privacy_version: '2026-05', profile_content_mode: 'general', show_sensitive_content: false, wants_18_plus: false, is_minor: false }
  const roots = [{ id: '00000000-0000-4000-8000-000000000101', post_id: postId, user_id: authorId, parent_comment_id: null, content: 'Comentário raiz da página do post.', expression: null, depth: 0, reply_count: 0, deleted_at: null, edited_at: null, created_at: '2026-07-17T10:00:00.000Z', profiles: { username: 'criadora', display_name: 'Criadora', avatar_url: null } }]
  const rpcCalls: Record<string, unknown>[] = []
  let legacyCommentPost = false
  let legacyCommentNotification = false

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value))
    localStorage.setItem('entreus-language', 'pt')
  }, { key: `sb-${ref}-auth-token`, value: { access_token: token, refresh_token: 'test', expires_at: 4102444800, user } })
  await page.routeWebSocket(`${base.replace(/^http/, 'ws')}/realtime/v1/websocket**`, (socket) => socket.close())

  const fulfill = (route: Route, body: unknown, headers: Record<string, string> = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
  await page.route(`${base}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith('/auth/v1/user')) return fulfill(route, user)
    if (path.includes('/rest/v1/rpc/create_threaded_comment')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      rpcCalls.push(payload)
      roots.unshift({ ...roots[0], id: String(payload.p_client_request_id), user_id: viewerId, content: String(payload.p_content), created_at: '2026-07-17T11:00:00.000Z', profiles: { username: 'visitante', display_name: 'Visitante', avatar_url: null } })
      return fulfill(route, [roots[0]])
    }
    if (path.includes('/rest/v1/comments')) {
      if (request.method() === 'POST') legacyCommentPost = true
      return fulfill(route, roots)
    }
    if (path.includes('/rest/v1/notifications')) {
      const payload = request.postDataJSON() as Record<string, unknown> | null
      if (request.method() === 'POST' && payload?.type === 'comment') legacyCommentNotification = true
      return fulfill(route, [])
    }
    if (path.includes('/rest/v1/profiles')) return fulfill(route, request.headers().accept?.includes('application/vnd.pgrst.object+json') ? profile : [profile])
    if (path.includes('/rest/v1/posts')) return fulfill(route, { id: postId, content: 'Publicação simulada da página individual.', category: 'cotidiano', created_at: '2026-07-17T09:00:00.000Z', user_id: authorId, image_url: null, video_url: null, visibility: 'public', is_sensitive: false, community_type: 'general', content_rating: 'safe', moderation_status: 'active', is_paid: false, price_itacash: null, profiles: { username: 'criadora', display_name: 'Criadora', avatar_url: null, vip_status: null, vip_expires_at: null, profile_theme: null } })
    return fulfill(route, [])
  })

  await page.goto(`/post/${postId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Publicação simulada da página individual.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: 'Comentários' })).toBeVisible()
  await expect(page.getByText('Comentário raiz da página do post.')).toBeVisible()

  const composer = page.getByPlaceholder('Escreva um comentário...')
  await composer.fill('Comentário criado pela RPC na página do post.')
  await composer.locator('..').getByRole('button', { name: 'Comentar' }).click()
  await expect(page.getByText('Comentário criado pela RPC na página do post.')).toBeVisible()
  expect(rpcCalls).toHaveLength(1)
  expect(rpcCalls[0]).toMatchObject({ p_post_id: postId, p_parent_comment_id: null, p_content: 'Comentário criado pela RPC na página do post.' })
  expect(legacyCommentPost).toBe(false)
  expect(legacyCommentNotification).toBe(false)
})
