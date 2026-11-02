import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(420_000)

test('09E-A: duas legendas persistem e são gravadas nos quadros do MP4', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  page.on('console', (message) => { if (message.text().includes('[VideoEditor] FFmpeg:')) console.log(message.text()) })
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#201020'; context.fillRect(0, 0, 640, 360) }
    paint()
    const audio = new AudioContext()
    const destination = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 600
    const gain = audio.createGain(); gain.gain.value = 0.25
    oscillator.connect(gain).connect(destination); oscillator.start()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 3400))
    clearInterval(timer); recorder.stop(); const blob = await finished
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'legendas.webm', mimeType: 'video/webm', buffer: bytes })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('Olá, EntreUS!')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0.4')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('1.2')
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('Até amanhã')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('1.6')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('2.4')
  await page.getByRole('combobox', { name: 'Preset da legenda' }).selectOption('high-contrast')
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(2)
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key) || '{}').subtitles?.length as number | undefined
  })).toBe(2)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(2)
  await page.getByLabel('Reassociar legendas.webm').setInputFiles({ name: 'legendas.webm', mimeType: 'video/webm', buffer: bytes })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  const ruler = page.getByRole('slider', { name: 'Régua temporal' })
  await ruler.focus()
  await ruler.press('Home')
  await expect(page.getByTestId('subtitle-preview')).toHaveCount(0)
  await page.getByRole('button', { name: /Legenda 1:/ }).click()
  for (let index = 0; index < 4; index++) await ruler.press('ArrowRight')
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('aria-label', 'Olá, EntreUS!')
  const previewWhite = await page.getByTestId('subtitle-preview').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 170 && pixels[index + 1] > 170 && pixels[index + 2] > 170 && pixels[index + 3] > 170) count++
    return count
  })
  await page.getByRole('button', { name: /Legenda 2:/ }).click()
  for (let index = 0; index < 4; index++) await ruler.press('ArrowRight')
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('aria-label', 'Até amanhã')
  const previewYellow = await page.getByTestId('subtitle-preview').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 170 && pixels[index + 1] > 170 && pixels[index + 2] < 110 && pixels[index + 3] > 170) count++
    return count
  })
  expect(previewWhite).toBeGreaterThan(40)
  expect(previewYellow).toBeGreaterThan(40)
  await serveAuditedFfmpegForLocalTest(page)
  await expect(page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first()).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = testInfo.outputPath('09ea-horizontal.mp4')
  await (await download).saveAs(file)
  const mp4 = await readFile(file)
  expect(mp4.length).toBeGreaterThan(5_000)
  const frames = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      const results = []
      for (const time of [0.1, 0.8, 1.8, 2.8]) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let white = 0; let yellow = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] > 170) white++
          if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] < 110) yellow++
        }
        results.push({ time, white, yellow, width: canvas.width, height: canvas.height })
      }
      return results
    } finally { URL.revokeObjectURL(url) }
  }, mp4.toString('base64'))
  expect(frames[0].white).toBeLessThan(20)
  expect(frames[1].white).toBeGreaterThan(40)
  expect(frames[2].yellow).toBeGreaterThan(40)
  expect(frames[1].white).toBeGreaterThan(previewWhite * 0.5)
  expect(frames[1].white).toBeLessThan(previewWhite * 1.5)
  expect(frames[2].yellow).toBeGreaterThan(previewYellow * 0.5)
  expect(frames[2].yellow).toBeLessThan(previewYellow * 1.5)
  expect(frames[3].white).toBeLessThan(20)
  expect(frames[3].yellow).toBeLessThan(20)
  const audioPower = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const context = new AudioContext()
    try {
      const decoded = await context.decodeAudioData(data.buffer)
      const samples = decoded.getChannelData(0)
      let sum = 0; let count = 0
      for (let index = Math.floor(decoded.sampleRate * 0.5); index < Math.min(samples.length, decoded.sampleRate * 1.5); index++) { sum += samples[index] * samples[index]; count++ }
      return { duration: decoded.duration, rms: Math.sqrt(sum / count) }
    } finally { await context.close() }
  }, mp4.toString('base64'))
  expect(audioPower.duration).toBeGreaterThan(2.5)
  expect(audioPower.rms).toBeGreaterThan(0.01)
})

test('09E-A: projeto de fotografia incorpora legenda temporizada no MP4', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const context = canvas.getContext('2d')!; context.fillStyle = '#201020'; context.fillRect(0, 0, 640, 360)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto-legenda.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.locator('[data-media-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('Foto com legenda')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0.4')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('1.2')
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('9:16')
  await page.getByRole('button', { name: /Legenda 1: Foto com legenda/ }).click()
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('width', '720')
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('height', '1280')
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = testInfo.outputPath('09ea-photo-vertical.mp4')
  await (await download).saveAs(file)
  const mp4 = await readFile(file)
  const white = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 de foto inválido')) })
      const results: number[] = []
      for (const time of [0.1, 0.8, 1.8]) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let count = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] > 170) count++
        results.push(count)
      }
      return { results, width: video.videoWidth, height: video.videoHeight }
    } finally { URL.revokeObjectURL(url) }
  }, mp4.toString('base64'))
  expect(white.height).toBeGreaterThan(white.width)
  expect(white.width / white.height).toBeCloseTo(9 / 16, 2)
  expect(white.results[0]).toBeLessThan(20)
  expect(white.results[1]).toBeGreaterThan(40)
  expect(white.results[2]).toBeLessThan(20)
})

test('09E-A: importa, divide, reordena e exclui segmentos sem substituir os existentes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const context = canvas.getContext('2d')!; context.fillStyle = '#201020'; context.fillRect(0, 0, 640, 360)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('Legenda manual')
  await page.locator('input[accept^=".srt"]').setInputFiles({ name: 'entrada.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,400 --> 00:00:01,400\nOlá de novo\n\n2\n00:00:01,600 --> 00:00:02,400\nAté logo', 'utf8') })
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(3)
  await page.getByRole('button', { name: /Legenda 2: Olá de novo/ }).click()
  const ruler = page.getByRole('slider', { name: 'Régua temporal' })
  await ruler.focus()
  for (let index = 0; index < 4; index++) await ruler.press('ArrowRight')
  await page.getByRole('button', { name: 'Dividir no playhead' }).click()
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(4)
  await page.getByRole('button', { name: 'Subir ordem' }).click()
  await page.getByRole('button', { name: 'Excluir legenda' }).click()
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(3)
  await page.locator('input[accept^=".srt"]').setInputFiles({ name: 'extra.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00:02.500 --> 00:00:03.000\nWebVTT seguro', 'utf8') })
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(4)
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key) || '{}').subtitles?.length as number | undefined
  })).toBe(4)
})
