import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(600_000)

async function createVideo(page: Page, width: number, height: number, durationMs: number) {
  return Buffer.from(await page.evaluate(async ({ width, height, durationMs }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#201020'; context.fillRect(0, 0, width, height) }
    paint()
    const audio = new AudioContext()
    const destination = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 523.25
    const gain = audio.createGain(); gain.gain.value = 0.22
    oscillator.connect(gain).connect(destination); oscillator.start()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, durationMs))
    clearInterval(timer); recorder.stop(); const blob = await finished
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { width, height, durationMs }))
}

async function seek(page: Page, time: number) {
  const timeline = page.getByRole('slider', { name: 'Régua temporal' })
  const tenths = Math.round(time * 10)
  await timeline.press('Home')
  for (let second = 0; second < Math.floor(tenths / 10); second++) await timeline.press('Shift+ArrowRight')
  for (let tenth = 0; tenth < tenths % 10; tenth++) await timeline.press('ArrowRight')
}

async function inspectMp4(page: Page, bytes: Buffer, times: number[]) {
  return page.evaluate(async ({ base64, times }) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 animado inválido')) })
      const frames = []
      for (const time of times) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let bright = 0; let cyan = 0
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] > 120 && pixels[index + 1] > 120 && pixels[index + 2] > 120) bright++
          if (pixels[index] < 180 && pixels[index + 1] > 150 && pixels[index + 2] > 150) cyan++
        }
        frames.push({ time, bright, cyan })
      }
      const audio = new AudioContext()
      const decoded = await audio.decodeAudioData(data.buffer.slice(0))
      const samples = decoded.getChannelData(0)
      let squareSum = 0
      for (const sample of samples) squareSum += sample * sample
      await audio.close()
      return { frames, width: video.videoWidth, height: video.videoHeight, duration: video.duration, rms: Math.sqrt(squareSum / samples.length) }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), times })
}

test('09E-C: Pop e karaokê por segmento persistem e animam o MP4 horizontal', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Exportação requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const videoBytes = await createVideo(page, 640, 360, 4_000)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: '09ec-horizontal.webm', mimeType: 'video/webm', buffer: videoBytes })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()

  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('POP ENTREUS')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('3.5')
  await page.getByRole('combobox', { name: 'Preset da legenda' }).selectOption('pop')
  await page.getByText('Animação', { exact: true }).click()
  await page.getByRole('slider', { name: 'Intensidade da animação' }).fill('80')

  await page.getByRole('button', { name: /Legenda 1: POP ENTREUS/ }).click()
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('data-subtitle-animation', 'pop')
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('data-subtitle-animation-opacity', '0.000')
  await seek(page, 0.2)
  await expect.poll(async () => Number(await page.getByTestId('subtitle-preview').getAttribute('data-subtitle-animation-scale'))).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Reproduzir vídeo' }).click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: 'Pausar vídeo' }).click()
  const pausedScale = await page.getByTestId('subtitle-preview').getAttribute('data-subtitle-animation-scale')
  await page.waitForTimeout(250)
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('data-subtitle-animation-scale', pausedScale!)

  await seek(page, 1.5)
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('KARAOKÊ POR SEGMENTO')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('1.5')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('3.5')
  await page.getByRole('combobox', { name: 'Preset da legenda' }).selectOption('karaoke')
  await page.getByLabel('Cor de destaque da legenda').fill('#00ffff')
  await expect(page.getByText(/Não representa sincronização exata por palavra/)).toBeVisible()
  await seek(page, 2.5)
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('data-subtitle-karaoke-progress', '0.500')

  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const saved = JSON.parse(localStorage.getItem(key) || '{}')
    return [saved.subtitles?.[0]?.style?.preset, saved.subtitles?.[1]?.style?.karaokeMode, saved.subtitles?.[1]?.style?.highlightColor]
  })).toEqual(['pop', 'segment', '#00ffff'])

  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Reassociar 09ec-horizontal.webm').setInputFiles({ name: '09ec-horizontal.webm', mimeType: 'video/webm', buffer: videoBytes })
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(2)
  await page.getByRole('button', { name: /Legenda 2: KARAOKÊ POR SEGMENTO/ }).click()
  await expect(page.getByRole('combobox', { name: 'Preset da legenda' })).toHaveValue('karaoke')
  await expect(page.getByLabel('Cor de destaque da legenda')).toHaveValue('#00ffff')

  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 420_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const output = testInfo.outputPath('09ec-horizontal-animated.mp4')
  await (await download).saveAs(output)
  const mp4 = await readFile(output)
  expect(mp4.length).toBeGreaterThan(10_000)
  const inspection = await inspectMp4(page, mp4, [0.03, 0.6, 1.55, 2.5, 3.3])
  expect(inspection.width).toBeGreaterThan(inspection.height)
  expect(inspection.frames[1].bright).toBeGreaterThan(inspection.frames[0].bright + 30)
  expect(inspection.frames[3].cyan).toBeGreaterThan(inspection.frames[2].cyan + 20)
  expect(inspection.frames[4].cyan).toBeGreaterThan(inspection.frames[3].cyan)
  expect(inspection.rms).toBeGreaterThan(0.01)
})

test('09E-C: Slide vertical aplica estilo à trilha com confirmação e exporta áudio', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Exportação requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  const videoBytes = await createVideo(page, 360, 640, 2_800)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: '09ec-vertical.webm', mimeType: 'video/webm', buffer: videoBytes })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('9:16')
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('SLIDE VERTICAL')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('1.3')
  await page.getByRole('combobox', { name: 'Preset da legenda' }).selectOption('modern')
  await seek(page, 1.4)
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('MESMO ESTILO')
  await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('1.4')
  await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('2.5')
  await page.getByRole('button', { name: /Legenda 1: SLIDE VERTICAL/ }).click()
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('2 legendas'); await dialog.accept() })
  await page.getByRole('button', { name: 'Aplicar a todas' }).click()
  await expect(page.getByText(/Estilo aplicado a 2 legendas/)).toBeVisible()
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key) || '{}').subtitles?.map((item: { style: { animation: string } }) => item.style.animation)
  })).toEqual(['slide', 'slide'])

  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 420_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const output = testInfo.outputPath('09ec-vertical-animated.mp4')
  await (await download).saveAs(output)
  const mp4 = await readFile(output)
  const inspection = await inspectMp4(page, mp4, [0.03, 0.55, 1.45, 2])
  expect(inspection.height).toBeGreaterThan(inspection.width)
  expect(inspection.width / inspection.height).toBeCloseTo(9 / 16, 2)
  expect(inspection.frames[1].bright).toBeGreaterThan(inspection.frames[0].bright + 30)
  expect(inspection.frames[3].bright).toBeGreaterThan(inspection.frames[2].bright + 20)
  expect(inspection.rms).toBeGreaterThan(0.01)
})
