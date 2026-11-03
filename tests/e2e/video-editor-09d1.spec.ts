import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(240_000)

async function makeMedia(page: Page) {
  return page.evaluate(async () => {
    const videoCanvas = document.createElement('canvas')
    videoCanvas.width = 160
    videoCanvas.height = 90
    const context = videoCanvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#1643c7'; context.fillRect(0, 0, 160, 90) }
    paint()
    const stream = videoCanvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const painting = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1400))
    clearInterval(painting)
    recorder.stop()
    const video = await finished
    stream.getTracks().forEach((track) => track.stop())

    const image = document.createElement('canvas')
    image.width = 40
    image.height = 20
    const imageContext = image.getContext('2d')!
    imageContext.fillStyle = '#00ff00'
    imageContext.fillRect(0, 0, 40, 20)
    const green = image.toDataURL('image/png').split(',')[1]
    imageContext.fillStyle = '#ff00ff'
    imageContext.fillRect(0, 0, 40, 20)
    const magenta = image.toDataURL('image/jpeg', 0.95).split(',')[1]
    return { video: Array.from(new Uint8Array(await video.arrayBuffer())), green, magenta }
  })
}

async function openEditorWithImage(page: Page) {
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const media = await makeMedia(page)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({
    name: 'base.webm', mimeType: 'video/webm', buffer: Buffer.from(media.video),
  })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({
    name: 'verde.png', mimeType: 'image/png', buffer: Buffer.from(media.green, 'base64'),
  })
  await expect(page.getByText('Imagem sobreposta selecionada')).toBeVisible()
  await expect.poll(() => colorBounds(page, 'green')).not.toBeNull()
  return media
}

type Bounds = { x: number; y: number; width: number; height: number }

async function colorBounds(page: Page, color: 'green' | 'magenta'): Promise<Bounds | null> {
  return page.locator('canvas[width="160"][height="90"]').evaluate((canvas: HTMLCanvasElement, target) => {
    const { width, height } = canvas
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
    let left = width; let top = height; let right = -1; let bottom = -1
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const [r, g, b, a] = pixels.slice(index, index + 4)
      const matches = target === 'green' ? g > 180 && r < 70 && b < 70 : r > 180 && b > 180 && g < 70
      if (!matches || a < 200) continue
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
    return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  }, color)
}

async function canvasPoint(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas[width="160"][height="90"]')
  const box = (await canvas.boundingBox())!
  return { x: box.x + x * box.width / 160, y: box.y + y * box.height / 90 }
}

async function resizeWithMouse(page: Page, bounds: Bounds, deltaWidth: number) {
  const start = await canvasPoint(page, bounds.x + bounds.width, bounds.y + bounds.height)
  const end = await canvasPoint(page, bounds.x + bounds.width + deltaWidth, bounds.y + bounds.height + deltaWidth / 2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

test('alça redimensiona somente a imagem selecionada e preserva geometria ao mudar a prévia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const media = await openEditorWithImage(page)
  const before = (await colorBounds(page, 'green'))!
  const timeline = await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max')
  await resizeWithMouse(page, before, 20)
  const resized = (await colorBounds(page, 'green'))!
  expect(resized.width).toBeGreaterThan(before.width + 14)
  expect(Math.abs(resized.width - resized.height * 2)).toBeLessThanOrEqual(2)
  expect(resized.x).toBeCloseTo(before.x, 0)
  expect(resized.y).toBeCloseTo(before.y, 0)
  expect(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max')).toBe(timeline)

  await page.setViewportSize({ width: 1280, height: 800 })
  expect(await colorBounds(page, 'green')).toEqual(resized)
  const center = await canvasPoint(page, resized.x + resized.width / 2, resized.y + resized.height / 2)
  const moved = await canvasPoint(page, resized.x + resized.width / 2 + 10, resized.y + resized.height / 2 + 5)
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(moved.x, moved.y, { steps: 6 })
  await page.mouse.up()
  const afterMove = (await colorBounds(page, 'green'))!
  expect(afterMove.x).toBeGreaterThan(resized.x + 6)
  expect(afterMove.width).toBe(resized.width)

  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({
    name: 'magenta.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(media.magenta, 'base64'),
  })
  const importedSecond = (await colorBounds(page, 'magenta'))!
  const secondCenter = await canvasPoint(page, importedSecond.x + importedSecond.width / 2, importedSecond.y + importedSecond.height / 2)
  const secondDestination = await canvasPoint(page, 22, 18)
  await page.mouse.move(secondCenter.x, secondCenter.y)
  await page.mouse.down()
  await page.mouse.move(secondDestination.x, secondDestination.y, { steps: 6 })
  await page.mouse.up()
  const second = (await colorBounds(page, 'magenta'))!
  expect(await colorBounds(page, 'green')).toEqual(afterMove)
  await resizeWithMouse(page, second, -10)
  expect(await colorBounds(page, 'green')).toEqual(afterMove)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  expect((await colorBounds(page, 'magenta'))!.width).toBe(second.width)
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  expect((await colorBounds(page, 'magenta'))!.width).toBeLessThan(second.width)
  const outside = await canvasPoint(page, 150, 10)
  await page.mouse.click(outside.x, outside.y)
  await expect(page.getByText('Imagem sobreposta selecionada')).toBeHidden()
})

test('canto superior redimensiona a foto e Delete remove apenas a camada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openEditorWithImage(page)
  const before = (await colorBounds(page, 'green'))!
  const start = await canvasPoint(page, before.x, before.y)
  const end = await canvasPoint(page, before.x - 10, before.y - 5)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
  const resized = (await colorBounds(page, 'green'))!
  expect(resized.width).toBeGreaterThan(before.width + 7)
  expect(resized.x + resized.width).toBeCloseTo(before.x + before.width, 0)
  expect(resized.y + resized.height).toBeCloseTo(before.y + before.height, 0)
  await page.keyboard.press('Delete')
  await expect(page.getByText('Imagem sobreposta selecionada')).toBeHidden()
  expect(await colorBounds(page, 'green')).toBeNull()
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
})

test('toque usa a mesma alça sem deixar o arraste preso', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openEditorWithImage(page)
  const before = (await colorBounds(page, 'green'))!
  const start = await canvasPoint(page, before.x + before.width, before.y + before.height)
  const end = await canvasPoint(page, before.x + before.width + 15, before.y + before.height + 7)
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x, y: end.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const after = (await colorBounds(page, 'green'))!
  expect(after.width).toBeGreaterThan(before.width + 10)
  const cancelStart = await canvasPoint(page, after.x + after.width, after.y + after.height)
  const cancelEnd = await canvasPoint(page, after.x + after.width - 8, after.y + after.height - 4)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelStart.x, y: cancelStart.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelEnd.x, y: cancelEnd.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  expect(await colorBounds(page, 'green')).toEqual(after)
  await page.mouse.move(0, 0)
  expect(await colorBounds(page, 'green')).toEqual(after)
  await session.detach()
})

test('clipe vertical não altera as coordenadas da imagem no quadro do projeto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openEditorWithImage(page)
  const before = (await colorBounds(page, 'green'))!
  const portrait = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 90
    canvas.height = 160
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#d92323'; context.fillRect(0, 0, 90, 160) }
    paint()
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const painting = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 850))
    clearInterval(painting)
    recorder.stop()
    const video = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await video.arrayBuffer()))
  })
  await page.locator('input[type="file"][accept="video/*,.mp4,.mov,.webm,.m4v"]').first().setInputFiles({
    name: 'vertical.webm', mimeType: 'video/webm', buffer: Buffer.from(portrait),
  })
  await expect(page.locator('[data-clip-id]')).toHaveCount(2)
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('1.7')
  await expect.poll(() => page.locator('video').first().evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(90)
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  expect(await colorBounds(page, 'green')).toEqual(before)
})

test('MP4 curto conserva a caixa da imagem redimensionada', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
  const served = await serveAuditedFfmpegForLocalTest(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openEditorWithImage(page)
  await resizeWithMouse(page, (await colorBounds(page, 'green'))!, 20)
  const expected = (await colorBounds(page, 'green'))!
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Saída da imagem').fill('1.0')
  await properties.getByLabel('Entrada da imagem').fill('0.3')
  await expect.poll(() => colorBounds(page, 'green')).toBeNull()

  const ffmpegLogs: string[] = []
  const renderPaths: string[] = []
  page.on('console', async (message) => {
    if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text())
    if (!message.text().includes('[VideoEditor] FFmpeg:')) return
    const entry = await message.args()[1]?.evaluate((value) => value?.message)
    ffmpegLogs.push(String(entry))
  })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const outputPath = testInfo.outputPath('09d1.mp4')
  await download.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(renderPaths).toHaveLength(1)
  expect(served).toContain('ffmpeg-core.wasm')

  const actual = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    try {
      const video = document.createElement('video')
      video.muted = true
      video.src = url
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!
      const bounds = []
      for (const time of [0.1, 0.6, 1.2]) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        context.drawImage(video, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4
          if (pixels[i + 1] < 100 || pixels[i + 1] < pixels[i] * 1.25 || pixels[i + 1] < pixels[i + 2] * 1.25) continue
          left = Math.min(left, x); top = Math.min(top, y)
          right = Math.max(right, x); bottom = Math.max(bottom, y)
        }
        bounds.push(right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 })
      }
      return { videoWidth: canvas.width, videoHeight: canvas.height, bounds }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  expect(actual.videoWidth).toBe(160)
  expect(actual.videoHeight).toBe(90)
  await testInfo.attach('ffmpeg-log', { body: ffmpegLogs.join('\n'), contentType: 'text/plain' })
  expect(actual.bounds[0]).toBeNull()
  expect(actual.bounds[1]).not.toBeNull()
  expect(actual.bounds[2]).toBeNull()
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual.bounds[1]![key] - expected[key]), key).toBeLessThanOrEqual(3)
  }
})
