import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(360_000)

test('09D.2-B: ajustes de um clipe persistem e aparecem no MP4', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#db271b'; context.fillRect(0, 0, 160, 90) }
    paint()
    const stream = canvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    clearInterval(timer); recorder.stop(); const blob = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'cor.webm', mimeType: 'video/webm', buffer: bytes })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.locator('[data-media-id="base-video"]').click()
  await page.getByRole('button', { name: /Efeitos/ }).first().click()
  await page.getByRole('button', { name: 'P&B' }).click()
  await page.getByRole('slider', { name: 'Brilho' }).fill('20')
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).colorAdjustments?.['base-video']?.brightness as number | undefined
  })).toBe(20)
  const previewFilter = await page.locator('video[src]').first().evaluate((video) => getComputedStyle(video).filter)
  expect(previewFilter).toContain('grayscale(1)')
  const previewRgb = await page.locator('video[src]').first().evaluate(async (element) => {
    const video = element as HTMLVideoElement
    if (video.readyState < 2) await new Promise<void>((resolve) => { video.onloadeddata = () => resolve() })
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const context = canvas.getContext('2d')!; context.filter = getComputedStyle(video).filter; context.drawImage(video, 0, 0)
    return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
  })

  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Inspeção MP4 requer FFmpeg auditado já disponível localmente.')
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 240_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = testInfo.outputPath('09d2b-mono.mp4')
  await (await download).saveAs(file)
  const mp4 = await readFile(file)
  const rgb = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = 0.4
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
    } finally { URL.revokeObjectURL(url) }
  }, mp4.toString('base64'))
  expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThan(12)
  expect(Math.max(...previewRgb) - Math.min(...previewRgb)).toBeLessThan(12)
  expect(Math.abs(rgb[0] - previewRgb[0])).toBeLessThan(75)
})

test('09D.2-B: duas fotografias recebem ajustes independentes na prévia e na exportação', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const images = await page.evaluate(() => ['#df211c', '#22be4e'].map((color) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 160, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  }))
  const input = page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]')
  for (let i = 0; i < 2; i++) {
    await input.setInputFiles({ name: `foto-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(images[i], 'base64') })
  }
  const saved = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key) || 'null') as { photoSlides: { id: string; duration: number }[]; colorAdjustments: Record<string, { preset: string }> } | null
  })
  await expect.poll(async () => (await saved())?.photoSlides.length).toBe(2)
  const slides = (await saved())!.photoSlides
  await page.locator(`[data-media-id="${slides[0].id}"]`).click()
  await page.getByRole('button', { name: /Efeitos/ }).first().click()
  await page.getByRole('button', { name: 'Frio' }).click()
  await expect.poll(async () => (await saved())?.colorAdjustments?.[slides[0].id]?.preset).toBe('cool')
  const previewCool = await page.locator('img[alt="foto-0.png"]').last().evaluate((element) => {
    const image = element as HTMLImageElement
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!; context.filter = getComputedStyle(image).filter; context.drawImage(image, 0, 0)
    return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
  })
  await page.getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.locator(`[data-media-id="${slides[1].id}"]`).click({ timeout: 10_000 })
  await page.getByRole('button', { name: /Efeitos/ }).first().click()
  await page.getByRole('button', { name: 'P&B' }).click()
  await expect.poll(async () => (await saved())?.colorAdjustments?.[slides[1].id]?.preset).toBe('mono')
  expect(await page.locator(`img[alt="foto-1.png"]`).last().evaluate((image) => getComputedStyle(image).filter)).toContain('grayscale(1)')

  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Inspeção MP4 requer FFmpeg auditado já disponível localmente.')
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 240_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = testInfo.outputPath('09d2b-duas-fotos.mp4')
  await (await download).saveAs(file)
  const mp4 = await readFile(file)
  const coolRgb = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = 0.5
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
    } finally { URL.revokeObjectURL(url) }
  }, mp4.toString('base64'))
  expect(Math.max(...coolRgb.map((value, index) => Math.abs(value - previewCool[index])))).toBeLessThan(75)
  const rgb = await page.evaluate(async ({ base64, time }) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = time
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
    } finally { URL.revokeObjectURL(url) }
  }, { base64: mp4.toString('base64'), time: slides[0].duration + slides[1].duration / 2 })
  expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThan(12)
})
