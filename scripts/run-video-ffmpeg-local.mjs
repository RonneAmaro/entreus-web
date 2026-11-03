import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100'
const hostname = new URL(baseURL).hostname
if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
  throw new Error('O teste FFmpeg só pode acessar um servidor local.')
}

const response = await fetch(`${baseURL}/lab/video-editor`)
if (!response.ok) {
  throw new Error(`O servidor local respondeu HTTP ${response.status}.`)
}

const runDir = await mkdtemp(path.join(tmpdir(), 'entreus-ffmpeg-local-'))
const configPath = path.join(runDir, 'playwright.config.cjs')
const playwrightPackage = path.join(repo, 'node_modules', '@playwright', 'test')
const testMatch = process.env.ENTREUS_FFMPEG_FAILURES_ONLY === '1'
  ? ['video-editor-09c68-failures.spec.ts']
  : process.env.ENTREUS_FFMPEG_TIMELINE_ONLY === '1'
    ? ['video-editor-09c3.spec.ts']
  : process.env.ENTREUS_FFMPEG_EXPORT_ONLY === '1'
    ? ['video-editor-09b-export.spec.ts']
    : ['video-editor-09b-export.spec.ts', 'video-compression-09c62.spec.ts']
const config = `
const path = require('node:path')
const { defineConfig, devices } = require(${JSON.stringify(playwrightPackage)})
module.exports = defineConfig({
  testDir: ${JSON.stringify(path.join(repo, 'tests', 'e2e'))},
  testMatch: ${JSON.stringify(testMatch)},
  timeout: 240000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: [['list']],
  outputDir: path.join(__dirname, 'results'),
  use: { baseURL: ${JSON.stringify(baseURL)}, ...devices['Desktop Chrome'] },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
`
await writeFile(configPath, config)
console.log(`Resultados isolados: ${runDir}`)

const child = spawn(
  process.execPath,
  [path.join(repo, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', configPath],
  {
    cwd: repo,
    env: { ...process.env, NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG: '1' },
    stdio: 'inherit',
    shell: false,
  },
)
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})
process.exitCode = exitCode
