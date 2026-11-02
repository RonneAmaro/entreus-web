import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(240_000)

type Mark = { x: number; y: number; count: number } | null

function scan(pixels: Uint8Array | number[], width: number, height: number, channels = 4): { red: Mark; green: Mark; blue: Mark } {
  const sums = { red: { x: 0, y: 0, count: 0 }, green: { x: 0, y: 0, count: 0 }, blue: { x: 0, y: 0, count: 0 } }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const target = r > 160 && r > g * 1.7 && r > b * 1.7 ? sums.red
      : g > 150 && g > r * 1.5 && g > b * 1.5 ? sums.green
        : b > 100 && b > r * 1.4 && b > g * 1.2 ? sums.blue : null
    if (target) { target.x += x; target.y += y; target.count++ }
  }
  return Object.fromEntries(Object.entries(sums).map(([color, item]) => [color, item.count ? { x: item.x / item.count, y: item.y / item.count, count: item.count } : null])) as { red: Mark; green: Mark; blue: Mark }
}

async function makeVideo(page: Page, overlay: boolean, withAudio = false, frequency = 440) {
  return page.evaluate(async ({ isOverlay, withAudio, frequency }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => {
      context.fillStyle = '#1643c7'; context.fillRect(0, 0, 160, 90)
      if (isOverlay) {
        context.fillStyle = '#ff2020'; context.fillRect(0, 0, 80, 90)
        context.fillStyle = '#20ff20'; context.fillRect(80, 0, 80, 90)
      }
    }
    paint()
    const audio = withAudio ? new AudioContext() : null
    const destination = audio?.createMediaStreamDestination()
    const oscillator = audio?.createOscillator()
    if (oscillator && destination && audio) {
      const gain = audio.createGain(); gain.gain.value = 0.25
      oscillator.frequency.value = frequency
      oscillator.connect(gain).connect(destination)
      oscillator.start()
    }
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...(destination?.stream.getAudioTracks() || [])])
    const recorder = new MediaRecorder(stream, { mimeType: withAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2200))
    clearInterval(timer)
    recorder.stop()
    const video = await finished
    oscillator?.stop()
    stream.getTracks().forEach((track) => track.stop())
    await audio?.close()
    return Array.from(new Uint8Array(await video.arrayBuffer()))
  }, { isOverlay: overlay, withAudio, frequency })
}

async function openPiP(page: Page, audioBase = false, audioOverlay = false) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const base = await makeVideo(page, false, audioBase)
  const upper = await makeVideo(page, true, audioOverlay, 880)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: Buffer.from(base) })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'superior.webm', mimeType: 'video/webm', buffer: Buffer.from(upper) })
  await expect(page.getByLabel('Propriedades contextuais').getByText('Vídeo sobreposto', { exact: true })).toBeVisible()
  return page.getByLabel('Propriedades contextuais')
}

async function point(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas[width="160"][height="90"]').boundingBox())!
  return { x: box.x + x * box.width / 160, y: box.y + y * box.height / 90 }
}

async function previewMarks(page: Page) {
  const canvas = page.locator('canvas[width="160"][height="90"]')
  const png = await canvas.locator('..').screenshot()
  const { data, info } = await sharp(png).resize(160, 90).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return scan(data, info.width, info.height, info.channels)
}

test('PiP: seleção, arraste, resize, giro, undo/redo, cancelamento, toque e relógio conjunto', async ({ page }, testInfo) => {
  const properties = await openPiP(page)
  const pip = page.locator('video.pointer-events-none.absolute')
  await expect(pip).toBeVisible()
  const canvas = page.locator('canvas[width="160"][height="90"]')
  const middle = await point(page, 80, 45)
  const moved = await point(page, 96, 50)
  await page.mouse.move(middle.x, middle.y); await page.mouse.down()
  await page.mouse.move(moved.x, moved.y, { steps: 8 }); await page.mouse.up()
  const left = Number.parseFloat((await pip.getAttribute('style'))!.match(/left: ([\d.]+)%/)![1])
  expect(left).toBeGreaterThan(40)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect.poll(async () => Number.parseFloat((await pip.getAttribute('style'))!.match(/left: ([\d.]+)%/)![1])).toBeLessThan(left)
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect.poll(async () => Number.parseFloat((await pip.getAttribute('style'))!.match(/left: ([\d.]+)%/)![1])).toBeCloseTo(left, 1)
  const widthBefore = Number(await properties.getByLabel('Largura do vídeo sobreposto').inputValue())
  const resizeStart = await point(page, 96 + widthBefore / 2, 50 + widthBefore * 90 / 160 / 2)
  const resizeEnd = await point(page, 96 + widthBefore / 2 + 8, 50 + widthBefore * 90 / 160 / 2 + 4.5)
  await page.mouse.move(resizeStart.x, resizeStart.y); await page.mouse.down()
  await page.mouse.move(resizeEnd.x, resizeEnd.y, { steps: 5 }); await page.mouse.up()
  await expect.poll(async () => Number(await properties.getByLabel('Largura do vídeo sobreposto').inputValue())).toBeGreaterThan(widthBefore)
  const style = (await pip.getAttribute('style'))!
  const x = Number(style.match(/left: ([\d.]+)%/)![1]) * 1.6
  const y = Number(style.match(/top: ([\d.]+)%/)![1]) * 0.9
  const width = Number(style.match(/width: ([\d.]+)%/)![1]) * 1.6
  const height = Number(style.match(/height: ([\d.]+)%/)![1]) * 0.9
  const rotationStart = await point(page, x + width / 2, y - 18)
  const rotationEnd = await point(page, x + width / 2 + height / 2 + 18, y + height / 2)
  await page.mouse.move(rotationStart.x, rotationStart.y); await page.mouse.down()
  await page.mouse.move(rotationEnd.x, rotationEnd.y, { steps: 8 }); await page.mouse.up()
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeGreaterThan(80)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(properties.getByLabel('Rotação do vídeo sobreposto')).toHaveValue('0')
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeGreaterThan(80)
  await properties.getByLabel('Largura do vídeo sobreposto').fill('40')
  const rotatedStyle = (await pip.getAttribute('style'))!
  const rotatedX = Number(rotatedStyle.match(/left: ([\d.]+)%/)![1]) * 1.6
  const rotatedY = Number(rotatedStyle.match(/top: ([\d.]+)%/)![1]) * 0.9
  const rotatedWidth = Number(rotatedStyle.match(/width: ([\d.]+)%/)![1]) * 1.6
  const rotatedHeight = Number(rotatedStyle.match(/height: ([\d.]+)%/)![1]) * 0.9
  const radians = Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue()) * Math.PI / 180
  const handleX = rotatedX + rotatedWidth / 2 + rotatedWidth / 2 * Math.cos(radians) - rotatedHeight / 2 * Math.sin(radians)
  const handleY = rotatedY + rotatedHeight / 2 + rotatedWidth / 2 * Math.sin(radians) + rotatedHeight / 2 * Math.cos(radians)
  const rotatedResizeStart = await point(page, handleX, handleY)
  const rotatedResizeEnd = await point(page, handleX + 7 * Math.cos(radians) - 3.5 * Math.sin(radians), handleY + 7 * Math.sin(radians) + 3.5 * Math.cos(radians))
  await page.mouse.move(rotatedResizeStart.x, rotatedResizeStart.y); await page.mouse.down()
  await page.mouse.move(rotatedResizeEnd.x, rotatedResizeEnd.y, { steps: 5 }); await page.mouse.up()
  await expect.poll(async () => Number(await properties.getByLabel('Largura do vídeo sobreposto').inputValue())).toBeGreaterThan(40)
  await properties.getByLabel('Rotação do vídeo sobreposto').fill('45')
  await expect(pip).toHaveCSS('transform', /matrix/)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeGreaterThan(80)
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect(properties.getByLabel('Rotação do vídeo sobreposto')).toHaveValue('45')
  const leftBeforeCancel = Number.parseFloat((await pip.getAttribute('style'))!.match(/left: ([\d.]+)%/)![1])
  const session = await page.context().newCDPSession(page)
  const touchBox = (await pip.boundingBox())!
  const touchStart = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 }
  const touchEnd = { x: touchStart.x + 20, y: touchStart.y + 10 }
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart.x, y: touchStart.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchEnd.x, y: touchEnd.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect.poll(async () => Number.parseFloat((await pip.getAttribute('style'))!.match(/left: ([\d.]+)%/)![1])).toBeCloseTo(leftBeforeCancel, 1)
  await session.detach()
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.4')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.4')
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await timeline.fill('0.2'); await expect(pip).toBeHidden()
  await timeline.fill('0.8'); await expect(pip).toBeVisible()
  await expect.poll(() => pip.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.3)
  await expect.poll(() => pip.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await expect.poll(() => previewMarks(page)).toMatchObject({ red: { count: expect.any(Number) }, green: { count: expect.any(Number) } })
  await timeline.fill('1.7'); await expect(pip).toBeHidden()
  await timeline.fill('0.45')
  await page.getByRole('button', { name: /^Reproduzir/ }).first().click()
  await expect.poll(() => pip.evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true)
  const syncSamples: { base: number; overlay: number; drift: number; paused: boolean }[] = []
  for (let index = 0; index < 3; index++) {
    const sample = await page.evaluate(() => {
      const base = document.querySelector('video:not(.pointer-events-none)') as HTMLVideoElement
      const overlay = document.querySelector('video.pointer-events-none.absolute') as HTMLVideoElement
      // Moving the entry from 0 to 0.4 also trims 0.4s from the PiP source.
      return { base: base.currentTime, overlay: overlay.currentTime, drift: Math.abs(overlay.currentTime - base.currentTime), paused: overlay.paused }
    })
    syncSamples.push(sample)
    await page.waitForTimeout(50)
  }
  await writeFile(testInfo.outputPath('09d4-preview-sync.json'), JSON.stringify(syncSamples, null, 2))
  expect(syncSamples.every((sample) => !sample.paused && sample.base < 1.4)).toBe(true)
  expect(Math.max(...syncSamples.map((sample) => sample.drift))).toBeLessThan(0.25)
  await page.getByRole('button', { name: /^Pausar/ }).first().click()
  await expect.poll(() => pip.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await timeline.fill('0.8')
  await expect.poll(() => previewMarks(page)).toMatchObject({ red: { count: expect.any(Number) }, green: { count: expect.any(Number) } })
  const blank = await point(page, 10, 10)
  await page.mouse.click(blank.x, blank.y)
  await expect(properties.getByText('Vídeo sobreposto', { exact: true })).toBeHidden()
  await timeline.fill('0.8')
  const pauseAfterBlank = page.getByRole('button', { name: /^Pausar/ }).first()
  if (await pauseAfterBlank.isVisible()) await pauseAfterBlank.click()
  await timeline.fill('0.8')
  await expect(pip).toBeVisible()
  const select = (await pip.boundingBox())!
  await page.mouse.click(select.x + select.width / 2, select.y + select.height / 2)
  await expect(properties.getByText('Vídeo sobreposto', { exact: true })).toBeVisible()
  await expect(canvas).toBeVisible()
})

test('toque gira a alça do PiP e pointercancel restaura o ângulo', async ({ page }) => {
  const properties = await openPiP(page)
  const pip = page.locator('video.pointer-events-none.absolute')
  const style = (await pip.getAttribute('style'))!
  const x = Number(style.match(/left: ([\d.]+)%/)![1]) * 1.6
  const y = Number(style.match(/top: ([\d.]+)%/)![1]) * 0.9
  const width = Number(style.match(/width: ([\d.]+)%/)![1]) * 1.6
  const height = Number(style.match(/height: ([\d.]+)%/)![1]) * 0.9
  const center = { x: x + width / 2, y: y + height / 2 }
  const start = await point(page, center.x, y - 18)
  const end = await point(page, center.x + height / 2 + 18, center.y)
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x, y: end.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeGreaterThan(80)
  const rotated = Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: end.x, y: end.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeCloseTo(rotated, 0)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(properties.getByLabel('Rotação do vídeo sobreposto')).toHaveValue('0')
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect.poll(async () => Number(await properties.getByLabel('Rotação do vídeo sobreposto').inputValue())).toBeCloseTo(rotated, 0)
  await session.detach()
})

for (const angle of [45, -45]) test(`MP4 real compõe PiP ${angle}° com janela e cantos transparentes`, async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
  const served = await serveAuditedFfmpegForLocalTest(page)
  const properties = await openPiP(page)
  await properties.getByLabel('Rotação do vídeo sobreposto').fill(String(angle))
  await properties.getByLabel('Largura do vídeo sobreposto').fill('48')
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.4')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.5')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.8')
  const expected = await previewMarks(page)
  expect(expected.red).not.toBeNull(); expect(expected.green).not.toBeNull()
  const renderPaths: string[] = []
  page.on('console', (message) => { if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text()) })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const output = testInfo.outputPath(`09d4-pip-${angle}.mp4`)
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.subarray(4, 8).toString()).toBe('ftyp')
  expect(served).toContain('ffmpeg-core.wasm')
  expect(renderPaths).toHaveLength(1)
  const actual = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
    try {
      const video = document.createElement('video')
      video.muted = true; video.src = url
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!
      const frames: number[][] = []
      for (const time of [0.1, 0.8, 1.8]) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        context.drawImage(video, 0, 0)
        frames.push(Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data))
      }
      return { width: canvas.width, height: canvas.height, duration: video.duration, frames }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  expect(actual.width).toBe(160); expect(actual.height).toBe(90)
  expect(actual.duration).toBeGreaterThan(1.8)
  const frames = actual.frames.map((pixels) => scan(pixels, actual.width, actual.height))
  expect(frames[0].red).toBeNull(); expect(frames[0].green).toBeNull()
  expect(frames[2].red).toBeNull(); expect(frames[2].green).toBeNull()
  expect(frames[1].red).not.toBeNull(); expect(frames[1].green).not.toBeNull()
  expect(frames[1].blue!.count).toBeGreaterThan(5_000)
  expect(Math.sign(frames[1].green!.y - frames[1].red!.y)).toBe(Math.sign(angle))
  const corner = (22 * actual.width + 55) * 4
  expect(actual.frames[1][corner + 2]).toBeGreaterThan(actual.frames[1][corner] * 1.5)
  for (const color of ['red', 'green'] as const) for (const coordinate of ['x', 'y'] as const) {
    expect(Math.abs(frames[1][color]![coordinate] - expected[color]![coordinate]), `${color} ${coordinate}`).toBeLessThanOrEqual(4)
  }
  const vector = (mark: typeof expected) => ({ x: mark.green!.x - mark.red!.x, y: mark.green!.y - mark.red!.y })
  const before = vector(expected), after = vector(frames[1])
  const measuredAngle = { preview: Math.atan2(before.y, before.x) * 180 / Math.PI, mp4: Math.atan2(after.y, after.x) * 180 / Math.PI }
  const measuredSize = { preview: Math.hypot(before.x, before.y), mp4: Math.hypot(after.x, after.y) }
  const centerDelta = { x: Math.abs((frames[1].red!.x + frames[1].green!.x - expected.red!.x - expected.green!.x) / 2), y: Math.abs((frames[1].red!.y + frames[1].green!.y - expected.red!.y - expected.green!.y) / 2) }
  expect(centerDelta.x).toBeLessThanOrEqual(4); expect(centerDelta.y).toBeLessThanOrEqual(4)
  expect(Math.abs(measuredAngle.mp4 - measuredAngle.preview)).toBeLessThanOrEqual(8)
  expect(Math.abs(measuredSize.mp4 - measuredSize.preview)).toBeLessThanOrEqual(4)
  const measurements = { angle, expected, frames: frames.map(({ red, green, blue }) => ({ red, green, blue })), duration: actual.duration, measuredAngle, measuredSize, centerDelta, renderPaths }
  await writeFile(testInfo.outputPath(`09d4-${angle}-measurements.json`), JSON.stringify(measurements, null, 2))
})

test('MP4 conserva áudio principal e não mistura áudio do PiP silenciado', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
  await serveAuditedFfmpegForLocalTest(page)
  await openPiP(page, true, true)
  const pip = page.locator('video.pointer-events-none.absolute')
  expect(await pip.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true)
  const renderPaths: string[] = []
  page.on('console', (message) => { if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text()) })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const output = testInfo.outputPath('09d4-pip-audio.mp4')
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  expect(renderPaths).toHaveLength(1)
  const powers = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const audio = new AudioContext()
    try {
      const decoded = await audio.decodeAudioData(await new Blob([bytes], { type: 'video/mp4' }).arrayBuffer())
      const samples = decoded.getChannelData(0)
      const count = Math.min(8192, samples.length - Math.floor(decoded.sampleRate * 0.5))
      const start = Math.floor(decoded.sampleRate * 0.5)
      function power(frequency: number) {
        let real = 0, imaginary = 0
        for (let index = 0; index < count; index++) {
          const phase = 2 * Math.PI * frequency * index / decoded.sampleRate
          real += samples[start + index] * Math.cos(phase)
          imaginary += samples[start + index] * Math.sin(phase)
        }
        return Math.hypot(real, imaginary) / count
      }
      return { base: power(440), overlay: power(880), duration: decoded.duration }
    } finally { await audio.close() }
  }, bytes.toString('base64'))
  expect(powers.base).toBeGreaterThan(0.02)
  expect(powers.base).toBeGreaterThan(powers.overlay * 5)
  expect(powers.duration).toBeGreaterThan(1.8)
  await writeFile(testInfo.outputPath('09d4-audio-measurements.json'), JSON.stringify({ ...powers, renderPaths }, null, 2))
})
