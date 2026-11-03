import { expect, test } from '@playwright/test'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('editor mobile mantém ordem, playhead, fade e música até a exportação', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/lab/video-editor')
  await page.locator('input[type="file"][accept^="image/png"]').first().setInputFiles([
    { name: 'primeira.png', mimeType: 'image/png', buffer: pixel },
    { name: 'segunda.png', mimeType: 'image/png', buffer: pixel },
  ])

  const track = page.locator('[data-timeline-track]').filter({ has: page.locator('button img') }).first()
  const clips = track.locator('button').filter({ has: page.locator('img') })
  await expect(clips).toHaveCount(2)
  const secondSource = await clips.nth(1).locator('img').getAttribute('src')
  await clips.nth(1).tap()
  const moveLeft = page.getByRole('button', { name: 'Mover clipe para esquerda' })
  await expect(moveLeft).toBeVisible()
  await moveLeft.tap()
  await expect(clips.first().locator('img')).toHaveAttribute('src', secondSource!)

  await clips.nth(1).tap()
  await page.getByRole('button', { name: 'Fade', exact: true }).tap()
  const progress = page.getByRole('slider', { name: 'Linha do tempo do video' })
  const box = await progress.boundingBox()
  expect(box).not.toBeNull()
  await page.touchscreen.tap(box!.x + box!.width * 0.7, box!.y + box!.height / 2)
  await expect.poll(async () => Number(await progress.inputValue()) / Number(await progress.getAttribute('max'))).toBeGreaterThan(0.5)

  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.getByRole('button', { name: 'Usar Pulso de verão' }).click()
  await expect(page.getByText('Pulso de verão').first()).toBeVisible()
  await page.getByRole('button', { name: 'Silenciar música' }).first().click()
  await expect(page.getByRole('button', { name: 'Ativar música' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Informações da exportação' }).tap()
  await expect(page.getByRole('dialog', { name: 'Informações da exportação' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar informações da exportação' }).tap()

  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  await expect(page.getByRole('button', { name: 'Baixar video' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
})

test('corte de início e fim do vídeo altera a duração da timeline', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/lab/video-editor')
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    })
    recorder.start()
    for (let frame = 0; frame < 15; frame++) {
      context.fillStyle = frame % 2 ? '#2563eb' : '#ef4444'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    recorder.stop()
    const blob = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({
    name: 'clipe.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes),
  })

  const start = page.locator('input[aria-label="Início do corte"]:visible')
  const end = page.locator('input[aria-label="Fim do corte"]:visible')
  await expect(start).toBeVisible()
  await expect.poll(async () => Number(await end.getAttribute('max'))).toBeLessThan(3)
  const initialDuration = Number(await end.inputValue())
  expect(initialDuration).toBeGreaterThan(0.8)
  expect(initialDuration).toBeLessThan(3)
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  const initialTimelineDuration = Number(await timeline.getAttribute('max'))
  await start.fill('0.2')
  const trimmedEnd = String(Math.max(0.8, Math.floor((initialDuration - 0.2) * 10) / 10))
  await end.fill(trimmedEnd)
  await expect(start).toHaveValue('0.2')
  await expect(end).toHaveValue(trimmedEnd)
  await expect.poll(async () => Number(await timeline.getAttribute('max'))).toBeLessThan(initialTimelineDuration)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  await expect(page.getByRole('button', { name: 'Baixar video' })).toBeVisible()
})
