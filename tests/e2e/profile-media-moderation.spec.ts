import { expect, test, type APIResponse } from '@playwright/test'

const blockedPayloadTerms = [
  'storage_key', 'approved_storage_key', 'bucket', 'r2_bucket_name',
  'r2_access_key_id', 'r2_secret_access_key', 'service_role', 'token', 'copysource',
]

async function expectPrivateNoStore(response: APIResponse) {
  expect(response.headers()['cache-control']).toBe('private, no-store, no-cache, max-age=0, must-revalidate')
  expect(response.headers().pragma).toBe('no-cache')
  expect(response.headers().expires).toBe('0')
  const vary = response.headers().vary.toLowerCase().split(',').map((value) => value.trim())
  expect(vary).toContain('authorization')
  expect(vary).toContain('cookie')
}

async function expectNoInternalPayload(response: APIResponse) {
  const payload = (await response.text()).toLowerCase()
  for (const term of blockedPayloadTerms) expect(payload).not.toContain(term)
}

test.describe('profile media moderation security without test credentials', () => {
  test('signed-out visitor cannot open the profile media admin queue', async ({ page }) => {
    await page.goto('/admin/profile-media', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)
    await page.waitForURL(/\/login(?:[/?#]|$)/)
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/)
  })

  test('closed checking state renders no queue until the server authorizes access', async ({ page }) => {
    let releaseResponse: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })
    await page.route('**/api/admin/profile-media-submissions', async (route) => {
      await responseGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, submissions: [] }) })
    })
    await page.goto('/admin/profile-media', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Verificando acesso...')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)
    releaseResponse?.()
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toBeVisible()
  })

  test('server 403 redirects a non-admin to feed without rendering the queue', async ({ page }) => {
    await page.route('**/api/admin/profile-media-submissions', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Acesso negado.' }) }))
    await page.route('**/feed', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<main>Feed protegido</main>' }))
    await page.goto('/admin/profile-media', { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/feed(?:[/?#]|$)/)
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toHaveCount(0)
  })

  test('server 200 reveals the admin queue and controls', async ({ page }) => {
    await page.route('**/api/admin/profile-media-submissions', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, submissions: [{ id: 'submission-1', media_type: 'avatar', status: 'pending_review', submitted_at: '2026-07-12T00:00:00Z', previewUrl: null, profile: { username: 'creator', display_name: 'Creator', profile_content_mode: 'mixed' } }] }),
    }))
    await page.goto('/admin/profile-media', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible()
    await expect(page.getByText('Creator', { exact: true })).toBeVisible()
  })

  test('server failure keeps a neutral error state without queue data or actions', async ({ page }) => {
    await page.route('**/api/admin/profile-media-submissions', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) }))
    await page.goto('/admin/profile-media', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Nao foi possivel verificar o acesso agora.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Avatar e capa' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)
  })

  test('user submission API rejects anonymous reads and writes without leaking internals', async ({ request }) => {
    for (const response of [
      await request.get('/api/profile/media-submissions'),
      await request.post('/api/profile/media-submissions', { data: { mediaType: 'avatar', storageKey: 'protected/profile-media/other/file.jpg' } }),
    ]) {
      expect(response.status()).toBe(401)
      await expectPrivateNoStore(response)
      await expectNoInternalPayload(response)
    }
  })

  test('admin list and review APIs reject anonymous requests with private no-store payloads', async ({ request }) => {
    const responses = [
      await request.get('/api/admin/profile-media-submissions'),
      await request.post('/api/admin/profile-media-submissions/00000000-0000-4000-8000-000000000000/review', {
        data: { decision: 'approved', category: 'safe' },
      }),
    ]
    for (const response of responses) {
      expect(response.status()).toBe(401)
      await expectPrivateNoStore(response)
      await expectNoInternalPayload(response)
    }
  })
})
