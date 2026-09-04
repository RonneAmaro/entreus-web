import { defineConfig, devices } from '@playwright/test'

const e2eSupabaseUrl = 'https://entreus-e2e.invalid'
const e2eSupabaseAnonKey = 'e2e-anon-key'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: process.env.PLAYWRIGHT_PRODUCTION_BUILD === '1'
    ? './tests/e2e/production-server-global-setup.ts'
    : undefined,
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1' || process.env.PLAYWRIGHT_PRODUCTION_BUILD === '1' ? undefined : {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname localhost --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: e2eSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eSupabaseAnonKey,
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
