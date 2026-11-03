import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.ENTREUS_AUTH_TEST_ORIGIN
if (!baseURL || !process.env.ENTREUS_AUTH_TEST_EMAIL || !process.env.ENTREUS_AUTH_TEST_PASSWORD) {
  throw new Error('Configure ENTREUS_AUTH_TEST_ORIGIN, ENTREUS_AUTH_TEST_EMAIL and ENTREUS_AUTH_TEST_PASSWORD securely for a dedicated test account.')
}
const url = new URL(baseURL)
if (url.protocol !== 'https:' || !/^entreus-[a-z0-9-]+-ronneamaros-projects\.vercel\.app$/.test(url.hostname)) {
  throw new Error('Real auth validation requires an exact independent EntreUS Preview origin.')
}

export default defineConfig({
  testDir: './tests/auth-real',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL, trace: 'off', screenshot: 'off', video: 'off' },
})
