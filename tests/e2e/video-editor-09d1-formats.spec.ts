import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(480_000)

async function makeStripedVideo(page: Page) {
  return Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#ee2020'; context.fillRect(0, 0, 80, 90); context.fillStyle = '#2040ee'; context.fillRect(80, 0, 80, 90) }
    paint()
    const stream = canvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    clearInterval(timer); recorder.stop(); const blob = await done
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
}

async function openEditor(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'formato.webm', mimeType: 'video/webm', buffer: await makeStripedVideo(page) })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
}

async function readFormat(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const { aspectPreset, frameMode, canvasSize, originalCanvasSize } = JSON.parse(localStorage.getItem(key)!)
    return { aspectPreset, frameMode, canvasSize, originalCanvasSize }
  })
}

async function previewPixel(page: Page, selector = 'video[playsinline]') {
  const png = await page.locator(selector).first().screenshot()
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return Array.from(context.getImageData(Math.floor(canvas.width * 0.35), Math.floor(canvas.height * 0.08), 1, 1).data).slice(0, 3)
  }, png.toString('base64'))
}

async function mp4Frame(page: Page, bytes: Buffer, x = 0.35, y = 0.08) {
  return page.evaluate(async ({ base64, x, y }) => {
    const source = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([source], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = 0.5
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return { width: canvas.width, height: canvas.height, pixel: Array.from(context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data).slice(0, 3) }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), x, y })
}

async function exportMp4(page: Page, testInfo: TestInfo, name: string) {
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 240_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const output = testInfo.outputPath(name)
  await download.saveAs(output)
  await page.getByRole('button', { name: 'Voltar para edicao' }).click()
  return readFile(output)
}

test('09D.1 formatos: presets, enquadramento e restauração do projeto', async ({ page }) => {
  await openEditor(page)
  const format = page.getByRole('combobox', { name: 'Proporção do projeto' })
  await expect(format).toHaveValue('original')
  for (const [preset, width, height] of [['16:9', 1280, 720], ['9:16', 720, 1280], ['1:1', 1080, 1080], ['4:3', 1280, 960]] as const) {
    await format.selectOption(preset)
    await expect(page.locator(`canvas[width="${width}"][height="${height}"]`)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Enquadramento Fill' }).click()
  await expect(page.getByRole('button', { name: 'Enquadramento Fill' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('video[playsinline]').first()).toHaveCSS('object-fit', 'cover')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  expect(await readFormat(page)).toMatchObject({ aspectPreset: '4:3', frameMode: 'fill', canvasSize: { width: 1280, height: 960 }, originalCanvasSize: { width: 160, height: 90 } })
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(format).toHaveValue('4:3')
  await expect(page.getByRole('button', { name: 'Enquadramento Fill' })).toHaveAttribute('aria-pressed', 'true')
  await format.selectOption('original')
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
})

test('09D.1 formatos: Fit e Fill coincidem na prévia e no MP4 vertical', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await openEditor(page)
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('9:16')
  await serveAuditedFfmpegForLocalTest(page)
  const fitPreview = await previewPixel(page)
  const fitMp4 = await mp4Frame(page, await exportMp4(page, testInfo, '09d1-fit.mp4'))
  expect(fitMp4).toMatchObject({ width: 720, height: 1280 })
  expect(fitPreview.every((channel) => channel < 30)).toBe(true)
  expect(fitMp4.pixel.every((channel) => channel < 30)).toBe(true)

  await page.getByRole('button', { name: 'Enquadramento Fill' }).click()
  const fillPreview = await previewPixel(page)
  const fillMp4 = await mp4Frame(page, await exportMp4(page, testInfo, '09d1-fill.mp4'))
  expect(fillMp4).toMatchObject({ width: 720, height: 1280 })
  expect(fillPreview[0]).toBeGreaterThan(fillPreview[2] + 60)
  expect(fillMp4.pixel[0]).toBeGreaterThan(fillMp4.pixel[2] + 60)
})

test('09D.1 formatos: Original, 16:9, 1:1 e 4:3 preservam quadro e barras no MP4', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await openEditor(page)
  await serveAuditedFfmpegForLocalTest(page)
  const format = page.getByRole('combobox', { name: 'Proporção do projeto' })
  for (const [preset, width, height, hasTopBar] of [
    ['original', 160, 90, false], ['16:9', 1280, 720, false],
    ['1:1', 1080, 1080, true], ['4:3', 1280, 960, true],
  ] as const) {
    await format.selectOption(preset)
    const preview = await previewPixel(page)
    const frame = await mp4Frame(page, await exportMp4(page, testInfo, `09d1-${preset.replace(':', '-')}.mp4`))
    expect(frame).toMatchObject({ width, height })
    if (hasTopBar) {
      expect(preview.every((channel) => channel < 30)).toBe(true)
      expect(frame.pixel.every((channel) => channel < 30)).toBe(true)
    } else {
      expect(preview[0]).toBeGreaterThan(preview[2] + 60)
      expect(frame.pixel[0]).toBeGreaterThan(frame.pixel[2] + 60)
    }
  }
})

test('09D.1 formatos: sequência multiclipes exporta Fill igual à prévia', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await openEditor(page)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'segundo.webm', mimeType: 'video/webm', buffer: await makeStripedVideo(page) })
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).extraVideos.length as number
  })).toBe(1)
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('9:16')
  await page.getByRole('button', { name: 'Enquadramento Fill' }).click()
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.5')
  await serveAuditedFfmpegForLocalTest(page)
  const preview = await previewPixel(page)
  const frame = await mp4Frame(page, await exportMp4(page, testInfo, '09d1-sequence-fill.mp4'))
  expect(frame).toMatchObject({ width: 720, height: 1280 })
  expect(preview[0]).toBeGreaterThan(preview[2] + 60)
  expect(frame.pixel[0]).toBeGreaterThan(frame.pixel[2] + 60)
})

test('09D.1 formatos: fotos em vídeo usam o mesmo Fill no MP4 quadrado', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ee2020'; context.fillRect(0, 0, 80, 90)
    context.fillStyle = '#2040ee'; context.fillRect(80, 0, 80, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto-formato.png', mimeType: 'image/png', buffer: picture })
  await expect(page.getByRole('combobox', { name: 'Proporção do projeto' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('1:1')
  await page.getByRole('button', { name: 'Enquadramento Fill' }).click()
  await serveAuditedFfmpegForLocalTest(page)
  const preview = await previewPixel(page, 'img[alt="foto-formato.png"]')
  const frame = await mp4Frame(page, await exportMp4(page, testInfo, '09d1-photo-fill.mp4'))
  expect(frame).toMatchObject({ width: 1080, height: 1080 })
  expect(preview[0]).toBeGreaterThan(preview[2] + 60)
  expect(frame.pixel[0]).toBeGreaterThan(frame.pixel[2] + 60)
})

test('09D.1 formatos: foto sobreposta mantém proporção e centro após trocar o quadro', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await openEditor(page)
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 20
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 40, 20)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'sobreposta.png', mimeType: 'image/png', buffer: picture })
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.5')
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('1:1')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const geometry = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0] as { x: number; y: number; width: number; height: number }
  })
  expect(geometry.width / geometry.height).toBeCloseTo(2, 1)
  expect(geometry.x + geometry.width / 2).toBeCloseTo(540, 0)
  expect(geometry.y + geometry.height / 2).toBeCloseTo(540, 0)
  const preview = await page.locator('canvas[data-editor-preview-surface]').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(540, 540, 1, 1).data).slice(0, 3))
  expect(preview[0]).toBeGreaterThan(150)
  expect(preview[1]).toBeGreaterThan(150)
  await serveAuditedFfmpegForLocalTest(page)
  const frame = await mp4Frame(page, await exportMp4(page, testInfo, '09d1-overlay-square.mp4'), 0.5, 0.5)
  expect(frame).toMatchObject({ width: 1080, height: 1080 })
  expect(frame.pixel[0]).toBeGreaterThan(150)
  expect(frame.pixel[1]).toBeGreaterThan(150)
})

test('09D.1.1: ciclos repetidos preservam foto, texto, PiP, camadas e edição manual', async ({ page }) => {
  await openEditor(page)
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 20
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 40, 20)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'ciclo.png', mimeType: 'image/png', buffer: picture })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Entrada da imagem').fill('0.2')
  await properties.getByLabel('Saída da imagem').fill('1.0')
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Texto' }).click()
  await properties.getByLabel('Conteúdo do texto selecionado').fill('Linha A Linha B')
  await properties.getByLabel('Entrada do texto').fill('0.3')
  await properties.getByLabel('Saída do texto').fill('1.1')
  await page.getByRole('button', { name: 'Adicionar mídia' }).click()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'ciclo-pip.webm', mimeType: 'video/webm', buffer: await makeStripedVideo(page) })
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.4')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.2')
  const format = page.getByRole('combobox', { name: 'Proporção do projeto' })
  await format.selectOption('16:9')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const snapshot = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!) as {
      imageOverlays: Array<{ x: number; y: number; width: number; height: number; rotation: number; startTime: number; endTime: number }>
      videoOverlays: Array<{ x: number; y: number; width: number; height: number; rotation: number; startTime: number; endTime: number }>
      texts: Array<{ x: number; y: number; width: number; height: number; fontSize: number; rotation?: number; text: string; startTime: number; endTime: number }>
      visualLayerOrder: string[]
    }
  })
  const baseline = await snapshot()
  const cycles = [
    ['1:1', '16:9'], ['9:16', '16:9'], ['4:3', '9:16', '1:1', '16:9'],
    ['original', '1:1', '9:16', '16:9'],
  ]
  for (const cycle of cycles) for (const preset of cycle) await format.selectOption(preset)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const after = await snapshot()
  for (const key of ['imageOverlays', 'videoOverlays', 'texts'] as const) {
    expect(after[key]).toHaveLength(1)
    for (const field of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[key][0][field] - baseline[key][0][field])).toBeLessThan(0.01)
    expect(after[key][0]).toMatchObject({ rotation: baseline[key][0].rotation, startTime: baseline[key][0].startTime, endTime: baseline[key][0].endTime })
  }
  expect(after.texts[0].text).toBe('Linha A Linha B')
  expect(after.visualLayerOrder).toEqual(baseline.visualLayerOrder)
  await page.getByRole('button', { name: 'Mostrar camadas' }).click()
  await page.getByTestId('timeline-image-layer').click()
  await page.locator('canvas[data-editor-preview-surface]').focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await snapshot()).imageOverlays[0].x).toBeCloseTo(after.imageOverlays[0].x + 1, 2)
  await format.selectOption('1:1')
  await format.selectOption('16:9')
  await expect.poll(async () => (await snapshot()).imageOverlays[0].x).toBeCloseTo(after.imageOverlays[0].x + 1, 2)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  expect((await snapshot()).imageOverlays[0].x).toBeCloseTo(after.imageOverlays[0].x + 1, 2)
})

test('09D.1.1: prévia acompanha três viewports desktop sem distorção ou overflow', async ({ page }) => {
  await openEditor(page)
  const format = page.getByRole('combobox', { name: 'Proporção do projeto' })
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768]] as const) {
    await page.setViewportSize({ width, height })
    for (const preset of ['16:9', '9:16', '1:1', '4:3'] as const) {
      await format.selectOption(preset)
      const canvas = page.locator('canvas[data-editor-preview-surface]')
      await expect(canvas).toBeVisible()
      const geometry = await canvas.evaluate((element: HTMLCanvasElement) => {
        const rect = element.getBoundingClientRect()
        return { intrinsic: element.width / element.height, displayed: rect.width / rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      })
      expect(Math.abs(geometry.intrinsic - geometry.displayed)).toBeLessThan(0.02)
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(width + 1)
      expect(geometry.top).toBeGreaterThanOrEqual(0)
      expect(geometry.bottom).toBeLessThanOrEqual(height + 1)
    }
    await expect(format).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enquadramento Fill' })).toBeVisible()
  }
})
