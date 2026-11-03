import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('09H-B.2-FINAL cancela requisição real do worker e executa nova análise', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const state = { urls: [] as string[], terminated: 0 }
    ;(window as typeof window & { observedWorkers: typeof state }).observedWorkers = state
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (options?.name === 'entreus-rhythm') state.urls.push(new URL(url, location.href).href)
      }
      terminate() { state.terminated++; return super.terminate() }
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true)
  const photos = await Promise.all(['red', 'green', 'blue'].map(async (color, index) => ({
    name: `${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((fill) => {
      const c = document.createElement('canvas'); c.width = 90; c.height = 160
      const ctx = c.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 90, 160)
      return c.toDataURL().split(',')[1]
    }, color), 'base64'),
  })))
  const saved = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!) : null
  })
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(photos)
  await expect.poll(async () => (await saved())?.photoSlides?.filter((photo: { assetId?: string }) => photo.assetId).length).toBe(3)
  const rate = 16000, wav = Buffer.alloc(44 + rate * 6 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  for (const time of [1.5, 3.5, 5]) for (let i = 0; i < 160; i++) wav.writeInt16LE(25000, 44 + (time * rate + i) * 2)
  const sidebar = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  await sidebar.getByRole('button', { name: 'Áudio', exact: true }).click()
  await page.getByRole('region', { name: 'Biblioteca de áudio local' }).getByLabel('Importar para biblioteca').setInputFiles({ name: 'pulsos.wav', mimeType: 'audio/wav', buffer: wav })
  await expect.poll(async () => (await saved())?.audioLibrary?.length).toBe(1)
  await sidebar.getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).check()
  await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
  await panel.getByLabel('Duração total (s)').fill('6')
  await panel.getByLabel('Música da biblioteca').selectOption({ label: 'pulsos.wav' })
  const baseline = await saved()
  const gateStatus = async () => (await page.request.get('/__09hb2_gate/status')).json() as Promise<{ seen: boolean; url: string; destination: string; closed: boolean; finished: boolean; statusCode: number; forwarded: boolean }>
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect.poll(async () => (await gateStatus()).seen).toBe(true)
  const held = await gateStatus()
  const observed = await page.evaluate(() => (window as typeof window & { observedWorkers: { urls: string[]; terminated: number } }).observedWorkers)
  expect(held.destination).toBe('worker')
  expect(new URL(observed.urls[0]).pathname).toBe(held.url)
  expect(held.forwarded).toBe(false)
  await info.attach('worker-request', { body: JSON.stringify({ held, observed }, null, 2), contentType: 'application/json' })
  await panel.getByRole('button', { name: 'Cancelar análise' }).click()
  await expect(panel.getByRole('status')).toContainText('Análise cancelada')
  expect(await page.evaluate(() => (window as typeof window & { observedWorkers: { terminated: number } }).observedWorkers.terminated)).toBeGreaterThan(0)
  await page.request.post('/__09hb2_gate/release')
  await expect.poll(async () => (await gateStatus()).finished).toBe(true)
  const released = await gateStatus()
  expect(released.forwarded).toBe(true)
  expect(released.statusCode).toBe(200)
  await writeFile(info.outputPath('worker-evidence.json'), JSON.stringify({ beforeCancel: held, observed, afterCancel: released }, null, 2))
  await info.attach('worker-request-after-cancel', { body: JSON.stringify(released, null, 2), contentType: 'application/json' })
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toHaveCount(0)
  expect((await saved()).photoSlides).toEqual(baseline.photoSlides)
  expect((await saved()).audioClips).toEqual(baseline.audioClips)
  await panel.getByLabel('Duração total (s)').fill('5.5')
  await panel.getByLabel('Duração total (s)').fill('6')
  const nextWorker = page.waitForEvent('worker')
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  expect(new URL((await nextWorker).url()).pathname).toBe(held.url)
  const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
  await expect(proposal).toContainText('Proposta sincronizada')
  await expect(proposal.getByLabel('Tempos da montagem')).toContainText('1.png: 0.000–1.500')
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved())?.photoSlides?.length).toBe(6)
  expect((await saved()).audioClips).toHaveLength(1)
  expect((await saved()).photoSlides.slice(3).map((p: { duration: number }) => p.duration)).toEqual([1.5, 2, 2.5])
})
