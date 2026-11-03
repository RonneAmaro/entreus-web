import { chromium, expect, test, type Page } from '@playwright/test'
import type { SavedProject } from '@/lib/video-editor/project-persistence'

async function project(page: Page): Promise<SavedProject | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!) : null
  })
}

async function imageFiles(page: Page) {
  return Promise.all(['red', 'green', 'blue'].map(async (color, index) => ({
    name: `${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((fill) => {
      const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 90, 160)
      return canvas.toDataURL().split(',')[1]
    }, color), 'base64'),
  })))
}

async function open(page: Page) {
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
}

test('reabre o navegador com fotos e montagem sem duplicar assets', async ({ baseURL }, testInfo) => {
  test.setTimeout(180000)
  const directory = testInfo.outputPath('browser-profile')
  let context = await chromium.launchPersistentContext(directory, { headless: true, baseURL })
  try {
    let page = context.pages()[0] || await context.newPage()
    await open(page)
    const files = await imageFiles(page)
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files)
    await expect.poll(async () => (await project(page))?.photoSlides.filter((slide) => slide.assetId).length).toBe(3)
    await page.getByText('AutoReels', { exact: true }).click()
    const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
    for (const name of ['3.png', '1.png', '2.png']) await panel.getByRole('checkbox', { name }).check()
    await panel.getByLabel('Duração por imagem (s)').fill('2')
    await panel.getByRole('button', { name: 'Gerar proposta' }).click()
    await panel.getByRole('button', { name: 'Confirmar e inserir ao final' }).click()
    await expect.poll(async () => (await project(page))?.photoSlides.length).toBe(6)
    const before = (await project(page))!
    expect(before.photoSlides.slice(3).map((slide) => slide.assetId)).toEqual([before.photoSlides[2].assetId, before.photoSlides[0].assetId, before.photoSlides[1].assetId])
    const count = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      const records = await new Promise<Array<{ assetId: string }>>((resolve, reject) => { const r = db.transaction('assets').objectStore('assets').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      db.close(); return records.filter((record) => record.assetId.startsWith('photo-sha256-')).length
    })
    expect(count).toBe(3)
    await context.close()
    context = await chromium.launchPersistentContext(directory, { headless: true, baseURL })
    page = context.pages()[0] || await context.newPage()
    await open(page)
    await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
    const recovered = (await project(page))!
    expect(recovered.photoSlides).toEqual(before.photoSlides)
    expect(recovered.sequenceOrder).toEqual(before.sequenceOrder)
    const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
    await expect(seek).toHaveAttribute('max', '15')
    await seek.fill('9.2')
    await expect(page.getByTestId('editor-preview').getByRole('img', { name: '3.png', exact: true })).toBeVisible()
  } finally { await context.close() }
})

test('foto ausente ou corrompida permite reassociação sem perder o projeto', async ({ page }) => {
  test.setTimeout(90000)
  await open(page)
  const files = await imageFiles(page)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files)
  await expect.poll(async () => (await project(page))?.photoSlides.filter((slide) => slide.assetId).length).toBe(3)
  const before = (await project(page))!
  await page.evaluate(async ({ id, missing, corrupt, corruptSize }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite'), store = tx.objectStore('assets')
      store.delete([id, missing])
      store.put({ projectId: id, assetId: corrupt, file: new File([new Uint8Array(corruptSize)], '2.png', { type: 'image/png' }) })
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
    }); db.close()
  }, { id: before.id, missing: before.photoSlides[0].assetId!, corrupt: before.photoSlides[1].assetId!, corruptSize: before.photoSlides[1].media.size })
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByLabel('Reassociar 1.png')).toHaveCount(1)
  await expect(page.getByLabel('Reassociar 2.png')).toHaveCount(1)
  await expect(page.getByLabel('Reassociar 3.png')).toHaveCount(0)
  await page.getByLabel('Reassociar 1.png').setInputFiles(files[0])
  await page.getByLabel('Reassociar 2.png').setInputFiles(files[1])
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  expect((await project(page))!.sequenceOrder).toEqual(before.sequenceOrder)
})

test('falha de cota avisa e mantém edição com reassociação manual', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (typeof value?.assetId === 'string' && value.assetId.startsWith('photo-sha256-')) throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, value, ...args)
    }
  })
  await open(page)
  const files = await imageFiles(page)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files[0])
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível guardar uma foto' })).toBeVisible()
  await expect.poll(async () => (await project(page))?.photoSlides.length).toBe(1)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByLabel('Reassociar 1.png')).toBeVisible()
  await page.getByLabel('Reassociar 1.png').setInputFiles(files[0])
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível guardar a foto' })).toBeVisible()
})

test('projeto antigo oferece reassociação e passa a recuperar a foto', async ({ page }) => {
  await open(page)
  const [file] = await imageFiles(page)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(file)
  await expect.poll(async () => Boolean((await project(page))?.photoSlides[0]?.assetId)).toBe(true)
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const saved = JSON.parse(localStorage.getItem(key)!)
    delete saved.photoSlides[0].assetId
    localStorage.setItem(key, JSON.stringify(saved))
  })
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.getByLabel('Reassociar 1.png').setInputFiles(file)
  await expect.poll(async () => Boolean((await project(page))?.photoSlides[0]?.assetId)).toBe(true)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
})

test('limite de dez fotos é respeitado e informado', async ({ page }) => {
  await open(page)
  const [file] = await imageFiles(page)
  const files = Array.from({ length: 11 }, (_, index) => ({ ...file, name: `foto-${index}.png` }))
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files)
  await expect.poll(async () => (await project(page))?.photoSlides.length).toBe(10)
  await expect(page.getByText(/Foram adicionadas 10 fotos/)).toBeVisible()
  await page.getByText('AutoReels', { exact: true }).click()
  await expect(page.getByRole('region', { name: 'Montagem AutoReels' })).toContainText('Espaço disponível: 0 novos clipes')
})
