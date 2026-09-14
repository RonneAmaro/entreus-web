import { expect, test, type Page, type Route } from '@playwright/test'

test.describe.configure({ timeout: 90_000 })

const e2eSupabaseUrl = 'https://entreus-e2e.invalid'
const viewerId = '00000000-0000-4000-8000-000000000201'
const requestId = '00000000-0000-4000-8000-000000000202'

type VerificationStatus = 'not_started' | 'pending' | 'approved' | 'rejected'
type Scenario = {
  birthDate: string
  isMinor?: boolean
  status?: VerificationStatus
  submitted?: boolean
  failCreate?: boolean
  failStorage?: boolean
  failFinalize?: boolean
  storageErrorMessage?: string
}

function yearsAgo(years: number) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function jwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: viewerId, role: 'authenticated', exp: 4102444800 })}.test`
}

async function mockAgeVerification(page: Page, scenario: Scenario) {
  const base = e2eSupabaseUrl.replace(/\/$/, '')
  const ref = new URL(base).hostname.split('.')[0]
  const token = jwt()
  const user = { id: viewerId, aud: 'authenticated', role: 'authenticated', email: 'age@example.test', app_metadata: {}, user_metadata: {} }
  let status = scenario.status || 'not_started'
  let submitted = Boolean(scenario.submitted)
  let storageFailed = false

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value))
  }, { key: `sb-${ref}-auth-token`, value: { access_token: token, refresh_token: 'test', expires_at: 4102444800, user } })
  await page.routeWebSocket(`${base.replace(/^http/, 'ws')}/realtime/v1/websocket**`, (socket) => socket.close())

  const fulfill = (route: Route, body: unknown, statusCode = 200) => route.fulfill({
    status: statusCode,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  const verificationRequest = () => ({
    id: requestId,
    status,
    created_at: '2026-09-08T10:00:00.000Z',
    document_front_path: submitted ? `${viewerId}/${requestId}/document-front-fake.png` : null,
    document_back_path: null,
    selfie_path: submitted ? `${viewerId}/${requestId}/selfie-fake.png` : null,
    submitted_at: submitted ? '2026-09-08T10:05:00.000Z' : null,
    document_type: submitted ? 'rg' : null,
  })

  await page.route(`${base}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith('/auth/v1/user')) return fulfill(route, user)
    if (path.includes('/rest/v1/rpc/create_age_verification_request')) {
      if (scenario.failCreate) return fulfill(route, { message: 'raw_sql_create_failure' }, 500)
      status = 'pending'
      submitted = false
      return fulfill(route, requestId)
    }
    if (path.includes('/rest/v1/rpc/finalize_age_verification_request')) {
      if (scenario.failFinalize) return fulfill(route, { message: 'raw_sql_finalize_failure' }, 500)
      status = 'pending'
      submitted = true
      return fulfill(route, null)
    }
    if (path.includes('/storage/v1/object/age-verifications/')) {
      if (scenario.failStorage && !storageFailed) {
        storageFailed = true
        return fulfill(route, { message: scenario.storageErrorMessage || 'raw_storage_failure' }, 500)
      }
      return fulfill(route, { Key: path.replace('/storage/v1/object/', '') })
    }
    if (path.includes('/rest/v1/profiles')) {
      const profile = {
        id: viewerId,
        birth_date: scenario.birthDate,
        is_minor: Boolean(scenario.isMinor),
        wants_18_plus: status === 'approved',
        age_verification_status: status,
      }
      return fulfill(route, request.headers().accept?.includes('application/vnd.pgrst.object+json') ? profile : [profile])
    }
    if (path.includes('/rest/v1/age_verification_requests')) {
      const hasRequest = status !== 'not_started'
      const body = hasRequest ? verificationRequest() : null
      return fulfill(route, request.headers().accept?.includes('application/vnd.pgrst.object+json') ? body : body ? [body] : [])
    }
    return fulfill(route, [])
  })
}

async function openAgePage(page: Page, scenario: Scenario) {
  await mockAgeVerification(page, scenario)
  await page.goto('/age-verification', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Verificacao 18+' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Carregando...')).toHaveCount(0, { timeout: 40_000 })
}

async function submitFakeDocuments(page: Page) {
  const files = page.locator('input[type="file"]')
  await files.nth(0).setInputFiles({ name: 'documento-ficticio.png', mimeType: 'image/png', buffer: Buffer.from('fake-document') })
  await files.nth(2).setInputFiles({ name: 'selfie-ficticia.png', mimeType: 'image/png', buffer: Buffer.from('fake-selfie') })
  await page.locator('input[type="checkbox"]').nth(0).check()
  await page.locator('input[type="checkbox"]').nth(1).check()
  await page.getByRole('button', { name: 'Enviar para analise' }).click()
}

test('17 years old sees a hard block and no submission controls', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(17) })
  await expect(page.getByText('Verificacao bloqueada')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar para analise' })).toHaveCount(0)
})

test('exactly 18 years old can access the form', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(18) })
  await expect(page.locator('input[type="file"]')).toHaveCount(3)
  await expect(page.getByText('Tipo de documento')).toBeVisible()
})

test('adult can access the form', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30) })
  await expect(page.getByRole('button', { name: 'Enviar para analise' })).toBeVisible()
})

test('submitted pending request hides the form and shows analysis state', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), status: 'pending', submitted: true })
  await expect(page.getByText('Sua verificacao esta em analise.').last()).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

test('approved request hides the form', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), status: 'approved', submitted: true })
  await expect(page.getByText('Verificacao 18+ aprovada.').last()).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

test('rejected request allows a new submission', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), status: 'rejected' })
  await expect(page.getByText('Verificacao recusada. Voce pode enviar uma nova solicitacao.')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(3)
})

test('create RPC failure is visible and does not leak backend details', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), failCreate: true })
  await submitFakeDocuments(page)
  await expect(page.getByText('Nao foi possivel iniciar a solicitacao. Tente novamente.')).toBeVisible()
  await expect(page.getByText('raw_sql_create_failure')).toHaveCount(0)
})

test('storage failure is visible and does not leak backend details', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), failStorage: true })
  await submitFakeDocuments(page)
  await expect(page.getByText('Nao foi possivel enviar a frente do documento. Tente novamente.')).toBeVisible()
  await expect(page.getByText('raw_storage_failure')).toHaveCount(0)
})

test('development diagnostics identify the failed upload stage without retaining paths or tokens', async ({ page }) => {
  const diagnostics: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith('[age-verification]')) {
      diagnostics.push(message.text())
    }
  })

  await openAgePage(page, {
    birthDate: yearsAgo(30),
    failStorage: true,
    storageErrorMessage: 'https://storage.example.test/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-000000000202/front.png?token=secret',
  })
  await submitFakeDocuments(page)

  await expect(page.getByText('Nao foi possivel enviar a frente do documento. Tente novamente.')).toBeVisible()
  expect(diagnostics.some((diagnostic) => diagnostic.includes('DOCUMENT_FRONT_UPLOAD_FAILED'))).toBe(true)
  expect(diagnostics.some((diagnostic) => diagnostic.includes('[redacted-url]'))).toBe(true)
  expect(diagnostics.join('\n')).not.toContain('secret')
  expect(diagnostics.join('\n')).not.toContain('00000000-0000-4000-8000-000000000201')
})

test('finalize RPC failure is visible and does not leak backend details', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30), failFinalize: true })
  await submitFakeDocuments(page)
  await expect(page.getByText('Nao foi possivel concluir o envio. Tente novamente.')).toBeVisible()
  await expect(page.getByText('raw_sql_finalize_failure')).toHaveCount(0)
})

test('successful fake-document submission shows success and pending state', async ({ page }) => {
  await openAgePage(page, { birthDate: yearsAgo(30) })
  await submitFakeDocuments(page)
  await expect(page.getByText('Sua solicitacao foi enviada para analise.')).toBeVisible()
  await expect(page.getByText('Sua verificacao esta em analise.').last()).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})
