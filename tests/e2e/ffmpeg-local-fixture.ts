import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from '@playwright/test'

const LEGACY_AUDIT_DIR = path.join(tmpdir(), 'entreus-ffmpeg-core-0.12.10-audit')
const AUDIT_DIR = process.env.ENTREUS_FFMPEG_AUDIT_DIR
  ? path.resolve(process.env.ENTREUS_FFMPEG_AUDIT_DIR)
  : path.join(process.cwd(), '.local-cache', 'ffmpeg-core-0.12.10-audit')
const FALLBACK_AUDIT_DIR = LEGACY_AUDIT_DIR
const WRAPPER_ESM_DIR = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm')
const EXPECTED_ARCHIVE_INTEGRITY = 'dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA=='
const EXPECTED_CORE_HASHES: Record<string, string> = {
  'ffmpeg-core.js': '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3',
  'ffmpeg-core.wasm': '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',
}

async function auditedFiles() {
  let auditDir = AUDIT_DIR
  let archive: Buffer
  try {
    archive = await readFile(path.join(auditDir, 'core-0.12.10.tgz'))
  } catch (error) {
    if (auditDir === FALLBACK_AUDIT_DIR) throw error
    auditDir = FALLBACK_AUDIT_DIR
    archive = await readFile(path.join(auditDir, 'core-0.12.10.tgz'))
  }
  const integrity = createHash('sha512').update(archive).digest('base64')
  if (integrity !== EXPECTED_ARCHIVE_INTEGRITY) {
    throw new Error('O pacote FFmpeg local não corresponde à auditoria.')
  }

  const files = new Map<string, Buffer>()
  const coreEsmDir = path.join(auditDir, 'extracted', 'package', 'dist', 'esm')
  for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
    const bytes = await readFile(path.join(coreEsmDir, name))
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== EXPECTED_CORE_HASHES[name]) {
      throw new Error(`O arquivo ${name} não corresponde ao pacote auditado.`)
    }
    files.set(name, bytes)
  }
  for (const name of ['worker.js', 'const.js', 'errors.js']) {
    files.set(name, await readFile(path.join(WRAPPER_ESM_DIR, name)))
  }
  return files
}

export async function serveAuditedFfmpegForLocalTest(page: Page) {
  const files = await auditedFiles()
  const servedAssets: string[] = []
  await page.context().route('**/__entreus_ffmpeg_local/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || ''
    const body = files.get(name)
    if (!body) {
      await route.fulfill({ status: 404, body: 'Unknown local FFmpeg test asset' })
      return
    }
    servedAssets.push(name)
    await route.fulfill({
      status: 200,
      body,
      contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      headers: {
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    })
  })
  return servedAssets
}
