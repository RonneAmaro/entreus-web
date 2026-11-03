import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(480_000)

async function coloredVideo(page: Page, color: string) {
  return Buffer.from(await page.evaluate(async (fill) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(15)
    const audio = new AudioContext()
    await audio.resume()
    const oscillator = audio.createOscillator()
    const destination = audio.createMediaStreamDestination()
    oscillator.frequency.value = fill === '#ff0000' ? 440 : 660
    oscillator.connect(destination)
    oscillator.start()
    const recordingStream = new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(recordingStream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    const paint = () => { context.fillStyle = fill; context.fillRect(0, 0, 160, 90) }
    paint(); recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1600))
    clearInterval(timer); recorder.stop(); const blob = await done
    oscillator.stop(); recordingStream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, color))
}

async function exportMp4(page: Page, testInfo: TestInfo, name: string) {
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 240_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = testInfo.outputPath(name)
  await (await download).saveAs(file)
  await page.getByRole('button', { name: 'Voltar para edicao' }).click()
  return readFile(file)
}

async function frame(page: Page, bytes: Buffer, time: number) {
  return page.evaluate(async ({ base64, time }) => {
    const source = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([source], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = time
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return { width: canvas.width, height: canvas.height, duration: video.duration, rgb: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data).slice(0, 3) }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), time })
}

test('09D.2-A: junção real dissolve, passa pelo preto e persiste', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const input = page.locator('input[type="file"][accept^="video/"]').first()
  await input.setInputFiles({ name: 'vermelho.webm', mimeType: 'video/webm', buffer: await coloredVideo(page, '#ff0000') })
  await input.setInputFiles({ name: 'azul.webm', mimeType: 'video/webm', buffer: await coloredVideo(page, '#0000ff') })
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).extraVideos.length as number
  })).toBe(1)
  const secondId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).extraVideos[0].id as string
  })
  await page.locator(`[data-media-id="${secondId}"]`).click()
  await page.getByRole('button', { name: /Transições/ }).first().click()
  await page.getByRole('button', { name: 'Dissolver' }).click()
  const durationInput = page.getByLabel('Duração da transição')
  await durationInput.fill('0.6')
  await expect(page.getByRole('button', { name: 'Dissolver' })).toHaveAttribute('aria-pressed', 'true')
  const saved = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!) as { baseTrim: { trimStart: number; trimEnd: number }; junctionTransitions: Record<string, { fromId: string; type: string; duration: number }> }
  })
  await expect.poll(async () => (await saved()).junctionTransitions[secondId]?.duration).toBe(0.6)
  const cut = (await saved()).baseTrim.trimEnd - (await saved()).baseTrim.trimStart
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill((Math.round((cut - 0.3) / 0.05) * 0.05).toFixed(2))
  await expect(page.locator('video[src]')).toHaveCount(2)
  const previewOpacity = await page.locator('video[src]').last().evaluate((element) => Number(getComputedStyle(element).opacity))
  expect(previewOpacity).toBeGreaterThan(0.3)
  expect(previewOpacity).toBeLessThan(0.7)
  await serveAuditedFfmpegForLocalTest(page)
  const mp4 = await exportMp4(page, testInfo, '09d2a-dissolve.mp4')
  expect(mp4.includes(Buffer.from('mp4a'))).toBe(true)
  const audioEnergy = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const context = new AudioContext()
    try {
      const decoded = await context.decodeAudioData(bytes.buffer)
      const samples = decoded.getChannelData(0)
      const energy = (start: number, end: number) => {
        let total = 0
        let count = 0
        for (let i = Math.floor(start * decoded.sampleRate); i < Math.min(Math.floor(end * decoded.sampleRate), samples.length); i += 16) { total += samples[i] * samples[i]; count++ }
        return Math.sqrt(total / Math.max(count, 1))
      }
      return [energy(0.2, 0.5), energy(0.9, 1.2), energy(1.8, 2.1)]
    } finally { await context.close() }
  }, mp4.toString('base64'))
  expect(audioEnergy.every((value) => value > 0.005)).toBe(true)
  const before = await frame(page, mp4, 0.3)
  const middle = await frame(page, mp4, cut - 0.3)
  const after = await frame(page, mp4, before.duration - 0.3)
  expect(before.rgb[0]).toBeGreaterThan(before.rgb[2] + 80)
  expect(middle.rgb[0]).toBeGreaterThan(30)
  expect(middle.rgb[2]).toBeGreaterThan(30)
  expect(after.rgb[2]).toBeGreaterThan(after.rgb[0] + 80)
  await page.getByRole('button', { name: 'Pelo preto' }).click()
  const dark = await exportMp4(page, testInfo, '09d2a-dip-black.mp4')
  expect((await frame(page, dark, cut - 0.3)).rgb.every((channel) => channel < 55)).toBe(true)
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('9:16')
  const vertical = await exportMp4(page, testInfo, '09d2a-dip-black-vertical.mp4')
  expect(await frame(page, vertical, cut - 0.3)).toMatchObject({ width: 720, height: 1280 })
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 20
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 40, 20)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'camada-amarela.png', mimeType: 'image/png', buffer: picture })
  const layered = await exportMp4(page, testInfo, '09d2a-layered.mp4')
  const layeredFrame = await frame(page, layered, cut - 0.3)
  expect(layeredFrame.rgb[0]).toBeGreaterThan(140)
  expect(layeredFrame.rgb[1]).toBeGreaterThan(140)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  expect((await saved()).junctionTransitions[secondId]).toMatchObject({ type: 'dip-black', duration: 0.6 })
})
