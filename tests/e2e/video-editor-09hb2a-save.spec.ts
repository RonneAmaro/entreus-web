import { expect, test } from '@playwright/test'

test('autosave pendente preserva áudio e montagem ao recarregar após confirmação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const saved = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!) : null
  })
  const photos = await Promise.all(['red', 'green', 'blue'].map(async (color, index) => ({
    name: `${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((fill) => {
      const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160
      const context = canvas.getContext('2d')!; context.fillStyle = fill; context.fillRect(0, 0, 90, 160)
      return canvas.toDataURL().split(',')[1]
    }, color), 'base64'),
  })))
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(photos)
  await expect.poll(async () => (await saved())?.photoSlides?.filter((photo: { assetId?: string }) => photo.assetId).length).toBe(3)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const before = await saved()
  // Hold only the documented 700 ms autosave callback to inspect its pending state deterministically.
  await page.evaluate(() => {
    const nativeSetTimeout = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, timeout === 700 ? 2147483647 : timeout, ...args)) as typeof window.setTimeout
  })
  const rate = 16000, wav = Buffer.alloc(44 + rate * 6 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  for (const time of [1.5, 3.5, 5]) for (let i = 0; i < 160; i++) wav.writeInt16LE(25000, 44 + (time * rate + i) * 2)
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name: 'Áudio', exact: true }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await library.getByLabel('Importar para biblioteca').setInputFiles({ name: 'pulsos.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(1)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Alterações pendentes')
  expect((await saved()).audioLibrary || []).toHaveLength(0)
  const stored = await page.evaluate(async (projectId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      const records = await new Promise<Array<{ projectId: string; assetId: string; file: File }>>((resolve, reject) => {
        const request = db.transaction('assets').objectStore('assets').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
      return records.filter((item) => item.projectId === projectId && item.file.name === 'pulsos.wav').map((item) => ({ assetId: item.assetId, size: item.file.size }))
    } finally { db.close() }
  }, before.id)
  expect(stored).toHaveLength(1)
  expect(stored[0].size).toBe(wav.length)
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).check()
  await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
  await panel.getByLabel('Duração total (s)').fill('6')
  await panel.getByLabel('Música da biblioteca').selectOption({ label: 'pulsos.wav' })
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('Proposta sincronizada')
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const after = await saved()
  expect(after.id).toBe(before.id)
  expect(after.audioLibrary[0].assetId).toBe(stored[0].assetId)
  expect(after.photoSlides).toHaveLength(6)
  expect(after.audioClips).toHaveLength(1)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
})
