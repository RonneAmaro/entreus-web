import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(240_000)

type Markers = { red: { x: number; y: number; count: number } | null; green: { x: number; y: number; count: number } | null }

async function makeMedia(page: Page) {
  return page.evaluate(async () => {
    const base = document.createElement('canvas')
    base.width = 160; base.height = 90
    const context = base.getContext('2d')!
    const paint = () => { context.fillStyle = '#1643c7'; context.fillRect(0, 0, 160, 90) }
    paint()
    const stream = base.captureStream(15)
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
    image.width = 40; image.height = 20
    const imageContext = image.getContext('2d')!
    imageContext.fillStyle = '#ff2020'; imageContext.fillRect(0, 0, 20, 20)
    imageContext.fillStyle = '#20ff20'; imageContext.fillRect(20, 0, 20, 20)
    return { video: Array.from(new Uint8Array(await video.arrayBuffer())), png: image.toDataURL('image/png').split(',')[1], jpeg: image.toDataURL('image/jpeg', 0.95).split(',')[1] }
  })
}

async function openEditor(page: Page, format: 'png' | 'jpeg' = 'png') {
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const media = await makeMedia(page)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: Buffer.from(media.video) })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: format === 'png' ? 'marcadores.png' : 'marcadores.jpg', mimeType: format === 'png' ? 'image/png' : 'image/jpeg', buffer: Buffer.from(media[format], 'base64') })
  await expect(page.getByText('Imagem sobreposta selecionada')).toBeVisible()
  await expect.poll(() => markersInPreview(page)).toMatchObject({ red: { count: expect.any(Number) }, green: { count: expect.any(Number) } })
}

async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas[width="160"][height="90"]').boundingBox())!
  return { x: box.x + x * box.width / 160, y: box.y + y * box.height / 90 }
}

function scanPixels(pixels: number[], width: number, height: number): Markers {
  const sums = { red: { x: 0, y: 0, count: 0 }, green: { x: 0, y: 0, count: 0 } }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const red = pixels[i] > 150 && pixels[i] > pixels[i + 1] * 1.5 && pixels[i] > pixels[i + 2] * 1.5
    const green = pixels[i + 1] > 150 && pixels[i + 1] > pixels[i] * 1.5 && pixels[i + 1] > pixels[i + 2] * 1.5
    const target = red ? sums.red : green ? sums.green : null
    if (target) { target.x += x; target.y += y; target.count++ }
  }
  return {
    red: sums.red.count ? { x: sums.red.x / sums.red.count, y: sums.red.y / sums.red.count, count: sums.red.count } : null,
    green: sums.green.count ? { x: sums.green.x / sums.green.count, y: sums.green.y / sums.green.count, count: sums.green.count } : null,
  }
}

async function markersInPreview(page: Page): Promise<Markers> {
  const data = await page.locator('canvas[width="160"][height="90"]').evaluate((canvas: HTMLCanvasElement) => ({
    pixels: Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height,
  }))
  return scanPixels(data.pixels, data.width, data.height)
}

async function rotateWithMouse(page: Page) {
  const start = await canvasPoint(page, 80, 13)
  const end = await canvasPoint(page, 111.5, 45)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

test('mouse gira em torno do centro, permite undo/redo, resize e arraste em outra prévia', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openEditor(page)
  const before = await markersInPreview(page)
  const timeline = await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max')
  await rotateWithMouse(page)
  const rotated = await markersInPreview(page)
  expect(rotated.red!.y).toBeLessThan(rotated.green!.y - 8)
  expect(Math.abs((rotated.red!.x + rotated.green!.x) / 2 - 80)).toBeLessThan(2)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  expect((await markersInPreview(page)).red!.x).toBeCloseTo(before.red!.x, 0)
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  expect((await markersInPreview(page)).red!.y).toBeCloseTo(rotated.red!.y, 0)
  await page.setViewportSize({ width: 1280, height: 800 })
  expect((await markersInPreview(page)).red!.y).toBeCloseTo(rotated.red!.y, 0)
  const angle = Number(await page.getByRole('slider', { name: 'Rotacao' }).first().inputValue())
  expect(angle).toBeGreaterThan(85)
  expect(angle).toBeLessThan(95)
  const width = Number(await page.getByRole('slider', { name: 'Largura' }).first().inputValue())
  const radians = angle * Math.PI / 180
  const corner = { x: 80 + width / 2 * Math.cos(radians) - width / 4 * Math.sin(radians), y: 45 + width / 2 * Math.sin(radians) + width / 4 * Math.cos(radians) }
  const resizeStart = await canvasPoint(page, corner.x, corner.y)
  const resizeEnd = await canvasPoint(page, corner.x + 12 * Math.cos(radians) - 6 * Math.sin(radians), corner.y + 12 * Math.sin(radians) + 6 * Math.cos(radians))
  await page.mouse.move(resizeStart.x, resizeStart.y); await page.mouse.down()
  await page.mouse.move(resizeEnd.x, resizeEnd.y, { steps: 6 }); await page.mouse.up()
  const resized = await markersInPreview(page)
  expect(resized.red!.count + resized.green!.count).toBeGreaterThan(rotated.red!.count + rotated.green!.count)
  const moveStart = await canvasPoint(page, 80, 45)
  const moveEnd = await canvasPoint(page, 91, 48)
  await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down()
  await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 6 }); await page.mouse.up()
  const moved = await markersInPreview(page)
  expect(moved.red!.x).toBeGreaterThan(resized.red!.x + 7)
  expect(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max')).toBe(timeline)
})

test('controle numérico e prévia concordam em 0, 45, 90, 180 e ângulo negativo', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openEditor(page)
  const slider = page.getByRole('slider', { name: 'Rotacao' }).first()
  for (const angle of [0, 45, 90, 180, -45]) {
    await slider.fill(String(angle))
    const markers = await markersInPreview(page)
    const dx = markers.green!.x - markers.red!.x
    const dy = markers.green!.y - markers.red!.y
    const expected = angle * Math.PI / 180
    expect(Math.abs(dx - Math.hypot(dx, dy) * Math.cos(expected))).toBeLessThan(2)
    expect(Math.abs(dy - Math.hypot(dx, dy) * Math.sin(expected))).toBeLessThan(2)
    expect(Number(await slider.inputValue())).toBe(angle)
  }
})

test('toque gira e cancelamento restaura o ângulo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openEditor(page)
  const session = await page.context().newCDPSession(page)
  const start = await canvasPoint(page, 80, 13)
  const end = await canvasPoint(page, 111.5, 45)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x, y: end.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const rotated = await markersInPreview(page)
  expect(rotated.red!.y).toBeLessThan(rotated.green!.y - 8)
  const cancelStart = await canvasPoint(page, 111.5, 45)
  const cancelEnd = await canvasPoint(page, 80, 13)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelStart.x, y: cancelStart.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelEnd.x, y: cancelEnd.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  expect((await markersInPreview(page)).red!.y).toBeCloseTo(rotated.red!.y, 0)
  await page.mouse.move(0, 0)
  expect((await markersInPreview(page)).red!.y).toBeCloseTo(rotated.red!.y, 0)
  await session.detach()
})

for (const { format, angle } of [{ format: 'png', angle: 90 }, { format: 'jpeg', angle: -45 }] as const) {
  test(`MP4 curto preserva sentido, centro e janela temporal: ${format} ${angle}°`, async ({ page }, testInfo) => {
    test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
    const served = await serveAuditedFfmpegForLocalTest(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openEditor(page, format)
    if (angle === 90) await rotateWithMouse(page)
    else await page.getByRole('slider', { name: 'Rotacao' }).first().fill(String(angle))
    const moveStart = await canvasPoint(page, 80, 45)
    const moveEnd = await canvasPoint(page, angle === 90 ? 91 : 142, 50)
    await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down()
    await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 6 }); await page.mouse.up()
    const expected = await markersInPreview(page)
    expect(expected.red!.x).toBeGreaterThan(80)
    const properties = page.getByLabel('Propriedades contextuais')
    await properties.getByLabel('Saída da imagem').fill('1.0')
    await properties.getByLabel('Entrada da imagem').fill('0.3')
    await expect.poll(() => markersInPreview(page)).toEqual({ red: null, green: null })
    const logs: string[] = []
    const renderPaths: string[] = []
    page.on('console', async (message) => {
      if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text())
      if (!message.text().includes('[VideoEditor] FFmpeg:')) return
      const entry = await message.args()[1]?.evaluate((value) => value?.message)
      logs.push(String(entry))
    })
    await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
    const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
    await page.getByRole('button', { name: 'Baixar video' }).click()
    const download = await downloadPromise
    const outputPath = testInfo.outputPath(`09d2-${format}-${angle}.mp4`)
    await download.saveAs(outputPath)
    const bytes = await readFile(outputPath)
    expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
    expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
    expect(served).toContain('ffmpeg-core.wasm')
    expect(renderPaths).toHaveLength(1)
    const actual = await page.evaluate(async (base64) => {
      const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
      try {
        const video = document.createElement('video')
        video.muted = true; video.src = url
        await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d')!
        const frames = []
        for (const time of [0.1, 0.6, 1.2]) {
          video.currentTime = time
          await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
          context.drawImage(video, 0, 0)
          frames.push(Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data))
        }
        return { width: canvas.width, height: canvas.height, frames }
      } finally { URL.revokeObjectURL(url) }
    }, bytes.toString('base64'))
    await testInfo.attach('ffmpeg-log', { body: logs.join('\n'), contentType: 'text/plain' })
    await testInfo.attach('render-path', { body: renderPaths.join('\n'), contentType: 'text/plain' })
    expect(actual.width).toBe(160); expect(actual.height).toBe(90)
    const frames = actual.frames.map((pixels) => scanPixels(pixels, actual.width, actual.height))
    expect(frames[0]).toEqual({ red: null, green: null })
    expect(frames[2]).toEqual({ red: null, green: null })
    if (angle === 90) expect(frames[1].red!.y).toBeLessThan(frames[1].green!.y - 8)
    else {
      expect(frames[1].red!.y).toBeGreaterThan(frames[1].green!.y + 8)
      // This pixel lies inside the expanded box but outside the rotated JPEG.
      const i = (24 * actual.width + 116) * 4
      expect(actual.frames[1][i + 2]).toBeGreaterThan(90)
      expect(actual.frames[1][i + 2]).toBeGreaterThan(actual.frames[1][i] * 1.5)
    }
    for (const color of ['red', 'green'] as const) for (const coordinate of ['x', 'y'] as const) {
      expect(Math.abs(frames[1][color]![coordinate] - expected[color]![coordinate]), `${color} ${coordinate}`).toBeLessThanOrEqual(3)
    }
  })
}
