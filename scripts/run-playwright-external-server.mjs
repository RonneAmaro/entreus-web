import { createServer } from 'node:net'
import { request } from 'node:http'
import { spawn } from 'node:child_process'

const port = Number.parseInt(process.env.PLAYWRIGHT_EXTERNAL_PORT || '3105', 10)
const baseUrl = `http://localhost:${port}`
const e2eEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'https://entreus-e2e.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  PLAYWRIGHT_EXTERNAL_SERVER: '1',
  PLAYWRIGHT_BASE_URL: baseUrl,
}

function run(command, args, options = {}, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    onSpawn?.(child)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      console.log(`[runner] PLAYWRIGHT_EXIT code=${code ?? 1} signal=${signal ?? 'none'}`)
      resolve(code ?? 1)
    })
  })
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', (error) => reject(new Error(`E2E port ${port} is unavailable: ${error.message}`)))
    probe.listen(port, 'localhost', () => probe.close(resolve))
  })
}

function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const probe = request(baseUrl, (response) => {
        response.resume()
        resolve()
      })
      probe.once('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for E2E server at ${baseUrl}`))
          return
        }
        setTimeout(attempt, 500)
      })
      probe.end()
    }

    attempt()
  })
}

function stopServer(server) {
  if (!server?.pid) return

  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.unref()
    server.unref()
    return
  }

  server.kill('SIGTERM')
}

let server
let playwrightExitCode = 1

console.log('[runner] START')

try {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PLAYWRIGHT_EXTERNAL_PORT must be a valid TCP port')

  await assertPortAvailable()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', 'localhost', '--port', String(port)], {
    cwd: process.cwd(),
    env: e2eEnvironment,
    stdio: 'inherit',
  })
  console.log(`[runner] NEXT_PID=${server.pid}`)
  const serverFailure = new Promise((_, reject) => server.once('error', reject))

  console.log('[runner] WAIT_SERVER')
  await Promise.race([waitForServer(), serverFailure])
  console.log('[runner] SERVER_READY')
  console.log('[runner] PLAYWRIGHT_START')
  playwrightExitCode = await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: e2eEnvironment,
    stdio: 'inherit',
  }, (playwright) => console.log(`[runner] PLAYWRIGHT_PID=${playwright.pid}`))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  playwrightExitCode = 1
} finally {
  console.log('[runner] CLEANUP_START')
  console.log(`[runner] CLEANUP_NEXT_PID=${server?.pid ?? 'none'}`)
  stopServer(server)
  console.log('[runner] CLEANUP_DONE')
}

process.exitCode = playwrightExitCode
console.log(`[runner] EXIT code=${playwrightExitCode}`)
