import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { assertExport, probeExport, type ExportFixture } from './video-editor-09gb4-probe'

for (const mode of ['A-horizontal', 'B-vertical', 'C-mista', 'D-fallback']) test(`09G-B.4 releitura sem renderizar: ${mode}`, async ({ page }) => {
  test.skip(Boolean(process.env.ENTREUS_09GB4_MODE) && process.env.ENTREUS_09GB4_MODE !== mode)
  test.setTimeout(90000)
  const root = process.env.ENTREUS_09GB4_ARTIFACTS || '.local-cache/09gb4-homologated'
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(`${mode}.mp4`))
  expect(files).toHaveLength(1)
  const file = join(root, files[0]), bytes = await readFile(file)
  const { fixture } = JSON.parse(await readFile(join(dirname(file), 'fixture.json'), 'utf8')) as { fixture: ExportFixture }
  await page.context().route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/lab/video-editor')
  const probe = await probeExport(page, bytes, fixture)
  await writeFile(join(dirname(file), 'exported-frame.png'), Buffer.from(probe.thumbnail.split(',')[1], 'base64'))
  await writeFile(join(dirname(file), 'measurements-recheck.json'), JSON.stringify({ file, sha256: createHash('sha256').update(bytes).digest('hex'), fixture, probe }, null, 2))
  assertExport(probe, fixture)
})
