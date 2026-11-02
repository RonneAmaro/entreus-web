import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(420_000)

async function makeVideo(page: Page, width: number, height: number) {
  return Buffer.from(await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#181020'; context.fillRect(0, 0, width, height) }
    paint()
    const audio = new AudioContext()
    const destination = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 440
    const gain = audio.createGain(); gain.gain.value = 0.2
    oscillator.connect(gain).connect(destination); oscillator.start()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2300))
    clearInterval(timer); recorder.stop(); const blob = await finished
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { width, height }))
}

async function importVideo(page: Page, width: number, height: number) {
  console.log(`[09fa] opening ${width}x${height}`)
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  console.log('[09fa] workspace ready')
  const video = await makeVideo(page, width, height)
  console.log(`[09fa] fixture video ready (${video.length} bytes)`)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: `${width}x${height}.webm`, mimeType: 'video/webm', buffer: video })
  console.log('[09fa] fixture video assigned')
  await expect(page.locator(`canvas[width="${width}"][height="${height}"]`)).toBeVisible()
  console.log('[09fa] fixture metadata loaded')
  return video
}

async function addAnimatedSticker(page: Page) {
  console.log('[09fa] opening sticker gallery')
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  console.log('[09fa] sticker gallery opened')
  await expect(page.getByLabel('Galeria de figurinhas')).toContainText('Animados quadro a quadro')
  await page.getByRole('button', { name: 'Adicionar figurinha Brilho pulsante animada' }).click()
  console.log('[09fa] animated sticker added')
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Tamanho da figurinha').fill('44')
  await properties.getByLabel('Rotacao da figurinha').fill('32')
  await properties.getByLabel('Opacidade da figurinha nas propriedades').fill('0.65')
  await properties.getByLabel('Entrada da figurinha').fill('0.25')
  await properties.getByLabel('Saída da figurinha').fill('1.75')
  console.log('[09fa] animated sticker configured')
}

async function exportAndMeasure(page: Page, testInfo: TestInfo, name: string, expected: { width: number; height: number }) {
  console.log(`[09fa] preparing audited FFmpeg for ${name}`)
  await serveAuditedFfmpegForLocalTest(page)
  console.log(`[09fa] exporting ${name}`)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 360_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  console.log(`[09fa] download received for ${name}`)
  const output = testInfo.outputPath(`${name}.mp4`)
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const measured = await page.evaluate(async ({ base64, sampleWidth, sampleHeight }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video'); video.src = url; video.muted = true
    const frame = async (time: number) => {
      video.currentTime = time
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let bright = 0, rightBright = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] <= 420) continue
        bright++
        if ((index / 4) % canvas.width > canvas.width * 0.68) rightBright++
      }
      return { pixels: Array.from(pixels), bright, rightBright }
    }
    const difference = (left: number[], right: number[], minX = 0) => {
      let changed = 0
      for (let index = 0; index < left.length; index += 4) {
        if ((index / 4) % video.videoWidth < video.videoWidth * minX) continue
        if (Math.abs(left[index] - right[index]) + Math.abs(left[index + 1] - right[index + 1]) + Math.abs(left[index + 2] - right[index + 2]) > 60) changed++
      }
      return changed
    }
    try {
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve() })
      const before = await frame(0.05)
      const animatedOnly = await frame(0.40)
      const preStatic = await frame(0.47)
      // Sample well inside the static sticker interval, clear of the 0.5s frame boundary.
      const first = await frame(0.75)
      const second = await frame(1.05)
      const after = await frame(Math.min(1.95, video.duration - 0.05))
      const audio = await new AudioContext().decodeAudioData(await blob.arrayBuffer())
      const samples = audio.getChannelData(0)
      let sum = 0
      for (let index = 0; index < samples.length; index += Math.max(1, Math.floor(samples.length / 20_000))) sum += samples[index] * samples[index]
      const rms = Math.sqrt(sum / Math.min(samples.length, 20_000))
      return {
        width: video.videoWidth, height: video.videoHeight, duration: video.duration,
        bright: { before: before.bright, animatedOnly: animatedOnly.bright, preStatic: preStatic.bright, first: first.bright, second: second.bright, after: after.bright },
        rightBright: { before: before.rightBright, animatedOnly: animatedOnly.rightBright, preStatic: preStatic.rightBright, first: first.rightBright, second: second.rightBright, after: after.rightBright },
        changed: {
          beforeToAnimated: difference(before.pixels, animatedOnly.pixels),
          preStaticToFirst: difference(preStatic.pixels, first.pixels),
          preStaticToFirstRight: difference(preStatic.pixels, first.pixels, 0.68),
          firstToSecond: difference(first.pixels, second.pixels),
          secondToAfter: difference(second.pixels, after.pixels),
        },
        rms, requested: [sampleWidth, sampleHeight],
      }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), sampleWidth: expected.width, sampleHeight: expected.height })
  await writeFile(testInfo.outputPath(`${name}-measurements.json`), JSON.stringify(measured, null, 2))
  expect(measured).toMatchObject(expected)
  expect(measured.changed.beforeToAnimated).toBeGreaterThan(20)
  expect(measured.changed.firstToSecond).toBeGreaterThan(10)
  expect(measured.changed.secondToAfter).toBeGreaterThan(20)
  expect(measured.rms).toBeGreaterThan(0.005)
  return measured
}

test('09F-A: galeria, multiplos stickers, transformacoes, timeline, previa animada e persistencia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  await addAnimatedSticker(page)
  await page.getByRole('button', { name: 'Adicionar figurinha Confirmado' }).click()
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Tamanho da figurinha').fill('28')
  await properties.getByLabel('Entrada da figurinha').fill('0.5')
  await properties.getByLabel('Saída da figurinha').fill('1.4')
  await expect(page.getByText('Nenhuma figurinha adicionada.')).toHaveCount(0)
  await expect(page.locator('[data-editor-layer-id]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Selecionar figurinha twinkle-loop animada' }).click()
  const canvas = page.locator('canvas[data-editor-preview-surface]')
  const box = (await canvas.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(start.x + box.width * 0.08, start.y + box.height * 0.08, { steps: 5 }); await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).stickers
  })
  expect(stored).toHaveLength(2)
  expect(stored[0]).toMatchObject({ assetId: 'twinkle-loop', frames: ['✦', '✧', '✶', '✧'], frameRate: 6, opacity: 0.65, rotation: 32, startTime: 0.25, endTime: 1.75 })
  expect(stored[0].x).toBeGreaterThan(85)
  expect(stored[0].y).toBeGreaterThan(49)
  expect(stored[1]).toMatchObject({ assetId: 'check', frames: ['✅'], opacity: 1, startTime: 0.5, endTime: 1.4 })
  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('1 arquivo(s)')
  const restored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).stickers
  })
  expect(restored).toEqual(stored)
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await page.getByRole('button', { name: 'Selecionar figurinha twinkle-loop animada' }).click()
  const preview = page.locator('canvas[data-editor-preview-surface]')
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  const seek = async (value: number) => timeline.evaluate((element: HTMLInputElement, next) => {
    element.value = String(next)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  await seek(0.55); await page.waitForTimeout(100)
  const firstFrame = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await seek(0.82); await page.waitForTimeout(100)
  const secondFrame = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  expect(secondFrame).not.toBe(firstFrame)
})

test('09F-A: stickers estatico e animado entram no MP4 horizontal com audio', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await importVideo(page, 160, 90)
  await addAnimatedSticker(page)
  console.log('[09fa] adding static sticker')
  await page.getByRole('button', { name: 'Adicionar figurinha Confirmado' }).click({ timeout: 10_000 })
  console.log('[09fa] static sticker added')
  const properties = page.getByLabel('Propriedades contextuais')
  // Keep the static sticker clear of the animated one so frame differences remain observable.
  const canvas = page.locator('canvas[data-editor-preview-surface]')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await properties.getByLabel('Entrada da figurinha').fill('0.5')
  await properties.getByLabel('Saída da figurinha').fill('1.4')
  console.log('[09fa] static sticker configured')
  const measured = await exportAndMeasure(page, testInfo, '09fa-horizontal', { width: 160, height: 90 })
  expect(measured.changed.preStaticToFirst).toBeGreaterThan(20)
})

test('09F-A: sticker animado permanece quadro a quadro no MP4 vertical com audio', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await importVideo(page, 90, 160)
  await addAnimatedSticker(page)
  const measured = await exportAndMeasure(page, testInfo, '09fa-vertical', { width: 90, height: 160 })
  expect(measured.height / measured.width).toBeCloseTo(16 / 9, 1)
})
