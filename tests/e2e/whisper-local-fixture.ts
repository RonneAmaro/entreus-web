import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from '@playwright/test'

const AUDIT_DIR = process.env.ENTREUS_WHISPER_CACHE || path.join(tmpdir(), 'entreus-whisper-09eb1')
const EXPECTED = {
  'main.js': { hash: '11ffd6ca6345033d319c14855309ece7aa21d59b02fad70f9eab4c2311e08b9f', type: 'text/javascript' },
  'ggml-tiny.bin': { hash: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21', type: 'application/octet-stream' },
  'referencia-pt-br.wav': { hash: '', type: 'audio/wav' },
} as const

export const WHISPER_TEST_HASHES = {
  runtime: EXPECTED['main.js'].hash,
  model: EXPECTED['ggml-tiny.bin'].hash,
}

export async function serveAuditedWhisperForLocalTest(page: Page) {
  const files = new Map<string, { body: Buffer; type: string }>()
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const body = await readFile(path.join(AUDIT_DIR, name))
    if (expected.hash && createHash('sha256').update(body).digest('hex') !== expected.hash) {
      throw new Error(`O arquivo local ${name} não corresponde à auditoria do Whisper.`)
    }
    files.set(name, { body, type: expected.type })
  }

  await page.context().route('**/__entreus_whisper_local/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || ''
    const file = files.get(name)
    if (!file) {
      await route.fulfill({ status: 404, body: 'Unknown local Whisper test asset' })
      return
    }
    await route.fulfill({ status: 200, body: file.body, contentType: file.type })
  })
  return files.get('referencia-pt-br.wav')!.body
}
