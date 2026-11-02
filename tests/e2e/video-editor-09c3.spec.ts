import { expect, test, type Page } from '@playwright/test'
test.setTimeout(90_000)

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

async function shortVideo(page: Page) {
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    for (let frame = 0; frame < 20; frame++) {
      context.fillStyle = frame < 10 ? '#2563eb' : '#ef4444'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    recorder.stop()
    const blob = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[accept^="video/"]').setInputFiles({ name: 'filme.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
}

test('controles ficam fixos, progresso único e aviso de exportação sai da timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  const controls = page.locator('[aria-label="Controles da prévia"]')
  const timeline = page.getByRole('separator', { name: 'Redimensionar timeline' })
  await expect.poll(async () => (await timeline.boundingBox())!.y - (await controls.boundingBox())!.y - (await controls.boundingBox())!.height).toBeGreaterThanOrEqual(-1)
  expect((await timeline.boundingBox())!.height).toBeGreaterThan(12)
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toHaveCount(1)
  await expect(page.getByLabel('Régua temporal')).toBeVisible()
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('1')
  await expect.poll(async () => Number.parseFloat((await page.getByTestId('timeline-playhead').getAttribute('style'))?.match(/left:\s*([\d.]+)px/)?.[1] || '0')).toBeGreaterThan(30)
  await page.getByRole('button', { name: 'Informações da exportação' }).click()
  await expect(page.getByRole('dialog', { name: 'Informações da exportação' })).toContainText('não cria post no feed')
  await page.getByRole('button', { name: 'Fechar informações da exportação' }).click()
  await page.getByRole('button', { name: 'Músicas' }).click()
  await expect(page.getByText('Pulso de verão').first()).toBeVisible()
})

test('bordas alteram cortes reais e tesoura cria dois segmentos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await shortVideo(page)
  const progress = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await expect.poll(async () => Number(await progress.getAttribute('max'))).toBeLessThan(3)
  const initial = Number(await progress.getAttribute('max'))
  const clip = page.locator('[data-clip-id="base-video"]')
  await clip.locator('button').first().click()
  const start = page.getByRole('slider', { name: 'Aparar início do clipe' })
  const startBox = (await start.boundingBox())!
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(startBox.x + startBox.width / 2 + 20, startBox.y + startBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Number(await start.getAttribute('aria-valuenow'))).toBeGreaterThan(0.1)
  const end = page.getByRole('slider', { name: 'Aparar fim do clipe' })
  await end.scrollIntoViewIfNeeded()
  const beforeEnd = Number(await end.getAttribute('aria-valuenow'))
  const endBox = (await end.boundingBox())!
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(endBox.x + endBox.width / 2 - 20, endBox.y + endBox.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => Number(await end.getAttribute('aria-valuenow'))).toBeLessThan(beforeEnd - 0.05)
  const trimmed = Number(await progress.getAttribute('max'))
  expect(trimmed).toBeLessThan(initial - 0.15)
  const widthBeforeZoom = (await clip.boundingBox())!.width
  await page.getByRole('slider', { name: 'Zoom horizontal da timeline' }).fill('2')
  expect((await clip.boundingBox())!.width).toBeGreaterThan(widthBeforeZoom * 1.8)
  expect(Number(await progress.getAttribute('max'))).toBeCloseTo(trimmed, 1)
  const splitTime = Number((Math.round(trimmed / 2 / 0.05) * 0.05).toFixed(2))
  expect(splitTime).toBeGreaterThan(0.5)
  await progress.fill(String(splitTime))
  await expect.poll(async () => Number.parseFloat((await page.getByTestId('timeline-playhead').getAttribute('style'))?.match(/left:\s*([\d.]+)px/)?.[1] || '0')).toBeGreaterThan(40)
  await expect.poll(async () => page.locator('video').first().evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(splitTime - 0.1)
  await expect(page.getByRole('button', { name: 'Dividir clipe no playhead' })).toBeEnabled()
  await page.getByRole('button', { name: 'Dividir clipe no playhead' }).click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(2)
  expect(Number(await progress.getAttribute('max'))).toBeCloseTo(trimmed, 1)
  const secondStart = Number(await page.locator('[data-clip-id]').nth(1).getByRole('slider', { name: 'Aparar início do clipe' }).getAttribute('aria-valuenow'))
  await page.locator('[data-clip-id="base-video"] button').first().click()
  const firstEnd = Number(await page.locator('[data-clip-id="base-video"]').getByRole('slider', { name: 'Aparar fim do clipe' }).getAttribute('aria-valuenow'))
  expect(secondStart).toBeCloseTo(firstEnd, 1)
  await expect(page.getByRole('button', { name: 'Mover clipe para direita' })).toBeEnabled()
})

test('arraste reposiciona dois clipes de foto na sequência', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[accept^="image/png"]').setInputFiles([
    { name: 'primeira.png', mimeType: 'image/png', buffer: pixel },
    { name: 'segunda.png', mimeType: 'image/png', buffer: pixel },
  ])
  const clips = page.locator('[data-clip-id]')
  await expect(clips).toHaveCount(2)
  const secondId = await clips.nth(1).getAttribute('data-clip-id')
  await clips.nth(1).evaluate((element) => {
    const counts = { down: 0, move: 0, up: 0, drag: 0 }
    ;(window as typeof window & { clipPointerCounts?: typeof counts }).clipPointerCounts = counts
    element.addEventListener('pointerdown', () => counts.down++)
    element.addEventListener('pointermove', () => counts.move++)
    element.addEventListener('pointerup', () => counts.up++)
    element.addEventListener('dragstart', () => counts.drag++)
  })
  const from = (await clips.nth(1).boundingBox())!
  const to = (await clips.nth(0).boundingBox())!
  await page.mouse.move(from.x + Math.min(50, from.width / 2), from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + Math.min(50, to.width / 2), to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
  const counts = await page.evaluate(() => (window as typeof window & { clipPointerCounts?: { down: number; move: number; up: number; drag: number } }).clipPointerCounts)
  expect(counts?.down).toBe(1)
  expect(counts?.move).toBeGreaterThan(0)
  expect(counts?.up).toBe(1)
  expect(counts?.drag).toBe(0)
  await expect(clips.first()).toHaveAttribute('data-clip-id', secondId!)
})

test('geometria de 20 minutos mantém rolagem horizontal sem mídia grande', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration')!
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get() { return (this as HTMLMediaElement).src.startsWith('blob:') ? 1200 : original.get!.call(this) },
    })
  })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await shortVideo(page)
  const progress = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await expect.poll(async () => Number(await progress.getAttribute('max'))).toBe(1200)
  const clip = page.locator('[data-clip-id="base-video"]')
  expect((await clip.boundingBox())!.width).toBeGreaterThan(9000)
  const scroll = page.locator('.overflow-auto').filter({ has: page.getByLabel('Régua temporal') }).first()
  await page.getByRole('separator', { name: 'Redimensionar timeline' }).focus()
  await page.keyboard.press('Home')
  const rulerY = (await page.getByLabel('Régua temporal').boundingBox())!.y
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
  expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect((await page.getByLabel('Régua temporal').boundingBox())!.y).toBeCloseTo(rulerY, 0)
  await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(8000)
  await expect(page.getByLabel('Régua temporal')).toContainText('19:')
  await page.getByRole('slider', { name: 'Zoom horizontal da timeline' }).fill('0.5')
  expect((await clip.boundingBox())!.width).toBeGreaterThan(4000)
  expect(Number(await progress.getAttribute('max'))).toBe(1200)
})
