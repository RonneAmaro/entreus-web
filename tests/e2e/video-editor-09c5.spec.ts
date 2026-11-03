import { expect, test, type Page } from '@playwright/test'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')
test.setTimeout(90_000)

function silentWav(seconds: number) {
  const sampleRate = 8000
  const dataBytes = seconds * sampleRate * 2
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataBytes, 40)
  return wav
}

async function importVideo(page: Page, seconds = 8) {
  const bytes = await page.evaluate(async (duration) => {
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
    for (let frame = 0; frame < duration * 10; frame++) {
      context.fillStyle = frame < duration * 5 ? '#2563eb' : '#ef4444'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    recorder.stop()
    const blob = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, seconds)
  await page.getByLabel('Importar mídias').setInputFiles({ name: 'sequencia.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
  await expect(page.locator('[data-clip-id="base-video"]')).toBeVisible()
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max'))).toBeGreaterThan(7.5)
}

test('escala fixa, playhead, corte, divisão e Delete no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  const header = await page.locator('main header').boundingBox()
  expect(header!.height).toBeGreaterThanOrEqual(36)
  expect(header!.height).toBeLessThanOrEqual(44)
  await importVideo(page)
  const clip = page.locator('[data-clip-id="base-video"]')
  await clip.locator('button').first().click()
  await page.getByRole('slider', { name: 'Fim do corte' }).fill('8')
  const ruler = page.getByRole('slider', { name: 'Régua temporal' })
  const tickBefore = await ruler.locator('span').filter({ hasText: '00:02' }).first().boundingBox()
  const widthBefore = (await clip.boundingBox())!.width
  const pixelsPerSecond = widthBefore / Number(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max'))
  await page.getByRole('slider', { name: 'Fim do corte' }).fill('6')
  await expect.poll(async () => (await clip.boundingBox())!.width).toBeLessThan(widthBefore * 0.78)
  const widthAfter = (await clip.boundingBox())!.width
  expect(widthAfter / widthBefore).toBeCloseTo(0.75, 1)
  const tickAfter = await ruler.locator('span').filter({ hasText: '00:02' }).first().boundingBox()
  expect(tickAfter!.x).toBeCloseTo(tickBefore!.x, 0)
  console.log('09C.5 trim', { widthBefore, widthAfter, pixelsPerSecond, tickBefore: tickBefore!.x, tickAfter: tickAfter!.x })

  await page.getByRole('button', { name: 'Texto', exact: true }).first().click()
  const textLayer = page.getByTestId('timeline-text-layer')
  const textExit = page.getByLabel('Propriedades contextuais').getByLabel('Saída do texto')
  await textExit.fill('6')
  await expect.poll(async () => (await textLayer.boundingBox())!.width).toBeCloseTo(360, 0)
  await textExit.fill('4')
  await expect.poll(async () => (await textLayer.boundingBox())!.width).toBeCloseTo(240, 0)

  await page.getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.getByLabel('Importar mídias').setInputFiles({ name: 'trilha.wav', mimeType: 'audio/wav', buffer: silentWav(3) })
  const musicClip = page.getByTestId('timeline-music-clip')
  await expect.poll(async () => (await musicClip.boundingBox())!.width).toBeGreaterThan(170)
  const musicWidthBefore = (await musicClip.boundingBox())!.width
  await musicClip.click()
  await page.getByLabel('Propriedades contextuais').getByLabel('Início do trecho musical').fill('1')
  await expect.poll(async () => (await musicClip.boundingBox())!.width).toBeLessThan(musicWidthBefore * 0.7)
  expect((await ruler.locator('span').filter({ hasText: '00:02' }).first().boundingBox())!.x).toBeCloseTo(tickBefore!.x, 0)
  await clip.locator('button').first().click()

  const rulerBox = (await ruler.boundingBox())!
  await page.mouse.move(rulerBox.x + pixelsPerSecond * 2, rulerBox.y + 18)
  await page.mouse.down()
  await page.mouse.move(rulerBox.x + pixelsPerSecond * 3, rulerBox.y + 18, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(2.8)
  await expect.poll(async () => page.locator('video').first().evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(2.8)
  await expect(page.getByRole('button', { name: 'Dividir clipe no playhead' })).toBeEnabled()
  await page.getByRole('button', { name: 'Dividir clipe no playhead' }).click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(2)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Mídia', exact: true }).click()
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
})

test('importação múltipla, propriedades de texto e atalho seguro em campo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Importar mídias').setInputFiles([
    { name: 'primeira.png', mimeType: 'image/png', buffer: pixel },
    { name: 'segunda.png', mimeType: 'image/png', buffer: pixel },
  ])
  await expect(page.locator('[data-clip-id]')).toHaveCount(2)
  await expect(page.locator('[data-media-id]').filter({ hasText: 'primeira.png' })).toBeVisible()
  await expect(page.locator('[data-media-id]').filter({ hasText: 'segunda.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Texto', exact: true }).first().click()
  const properties = page.getByLabel('Propriedades contextuais')
  await expect(properties.getByLabel('Fonte do texto selecionado')).toBeVisible()
  await expect(page.locator('[aria-label="Editar texto selecionado"]')).toBeHidden()
  await properties.getByLabel('Conteúdo do texto selecionado').fill('Cena de teste')
  await properties.getByLabel('Fonte do texto selecionado').selectOption({ index: 1 })
  const clips = page.locator('[data-clip-id]')
  await clips.first().locator('button').first().click()
  const projectName = page.getByRole('button', { name: /Renomear projeto/ })
  await projectName.click()
  const nameInput = page.getByRole('textbox', { name: 'Nome do projeto' })
  await nameInput.fill('Projeto seguro')
  await page.keyboard.press('Backspace')
  await expect(clips).toHaveCount(2)
  await nameInput.press('Enter')
  await expect(page.getByRole('button', { name: /Renomear projeto: Projeto segur/ })).toBeVisible()
})
