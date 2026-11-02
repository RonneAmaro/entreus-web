import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

function sineWaveWav(seconds: number, frequency: number) {
  const rate = 16_000
  const samples = Math.round(seconds * rate)
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let sample = 0; sample < samples; sample++) {
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * sample / rate) * 9000), 44 + sample * 2)
  }
  return wav
}

test('MP4 final preserva cortes, ordem, quadros e audio da timeline', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer o modo FFmpeg local no servidor de desenvolvimento.')
  test.setTimeout(240_000)
  const resolution = process.env.ENTREUS_EXPORT_TEST_720P === '1'
    ? { width: 1280, height: 720 }
    : { width: 160, height: 90 }
  const servedAssets = await serveAuditedFfmpegForLocalTest(page)
  page.on('pageerror', (error) => console.log('PAGE_ERROR', error.message))
  page.on('requestfailed', (request) => console.log('REQUEST_FAILED', request.url(), request.failure()?.errorText))
  const coreCdnRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('unpkg.com/@ffmpeg/core')) coreCdnRequests.push(request.url())
  })
  const ffmpegLogs: string[] = []
  const renderContexts: string[] = []
  let ffmpegLoadStartedAt = 0
  let ffmpegLoadMs: number | null = null
  page.on('console', async (message) => {
    if (message.text().includes('[VideoEditor] Render stage: ffmpeg_loading')) ffmpegLoadStartedAt = Date.now()
    if (message.text().includes('[VideoEditor] Render context:')) {
      const stage = await message.args()[1]?.evaluate((value) => value?.stage)
      if (typeof stage === 'string') renderContexts.push(stage)
      if (stage === 'ffmpeg_loaded' && ffmpegLoadStartedAt) ffmpegLoadMs = Date.now() - ffmpegLoadStartedAt
    }
    if (message.type() === 'error') console.log('BROWSER_ERROR', message.text())
    if (message.text().includes('[VideoEditor] FFmpeg:')) {
      const entry = await message.args()[1]?.evaluate((value) => value?.message)
      ffmpegLogs.push(String(entry))
    }
    if (!message.text().includes('Sequence render failed')) return
    const detail = await message.args()[1]?.evaluate((value) => ({
      stage: value?.stage,
      name: value?.error?.name,
      message: value?.error?.message,
      stack: value?.error?.stack,
    }))
    console.log('SEQUENCE_ERROR_DETAIL', detail)
    console.log('SERVED_ASSETS_AT_FAILURE', servedAssets)
    console.log('FFMPEG_LAST_LOGS', ffmpegLogs.slice(-20))
  })
  await page.goto('/lab/video-editor')

  const recorded = await page.evaluate(async ({ width, height }) => {
    async function clip(color: string, frequency: number) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      const paint = () => {
        context.fillStyle = color
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      paint()
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.frequency.value = frequency
      gain.gain.value = 0.25
      oscillator.connect(gain).connect(destination)
      oscillator.start()
      const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      const finished = new Promise<Blob>((resolve) => recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })))
      recorder.start()
      const painting = window.setInterval(paint, 50)
      await new Promise((resolve) => setTimeout(resolve, 2200))
      window.clearInterval(painting)
      recorder.stop()
      const blob = await finished
      oscillator.stop()
      stream.getTracks().forEach((track) => track.stop())
      await audio.close()
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    }
    return { red: await clip('#e52222', 440), green: await clip('#22d933', 660) }
  }, resolution)

  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles([
    { name: 'red.webm', mimeType: 'video/webm', buffer: Buffer.from(recorded.red) },
    { name: 'green.webm', mimeType: 'video/webm', buffer: Buffer.from(recorded.green) },
  ])
  await page.getByRole('button', { name: 'Renomear projeto: red' }).click()
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill('Viagem Azul')
  await page.getByRole('textbox', { name: 'Nome do projeto' }).press('Enter')
  const track = page.locator('[data-timeline-track]').filter({ has: page.locator('button:has(span:text-is("Video"))') }).first()
  const clips = track.locator('button').filter({ hasText: 'Video' })
  await expect(clips).toHaveCount(2)

  await clips.first().click()
  const start = page.locator('input[aria-label="Início do corte"]:visible').first()
  const end = page.locator('input[aria-label="Fim do corte"]:visible').first()
  await expect.poll(async () => Number(await end.getAttribute('max'))).toBeGreaterThan(2)
  await start.fill('0.4')
  await end.fill('1.6')
  await expect(start).toHaveValue('0.4')
  await expect(end).toHaveValue('1.6')

  await clips.nth(1).click()
  await expect.poll(async () => Number(await end.getAttribute('max'))).toBeGreaterThan(2)
  await start.fill('0.2')
  await end.fill('1.7')
  await expect(start).toHaveValue('0.2')
  await expect(end).toHaveValue('1.7')
  await page.getByRole('button', { name: 'Mover clipe para esquerda' }).click()

  await clips.nth(1).click()
  await page.getByRole('button', { name: 'Fade', exact: true }).click()
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await expect.poll(async () => Number(await timeline.getAttribute('max'))).toBeCloseTo(2.7, 1)
  await timeline.fill('2.1')
  await page.getByRole('button', { name: 'Dividir clipe no playhead' }).click()
  await expect(clips).toHaveCount(3)
  await page.getByRole('slider', { name: 'Volume do vídeo' }).fill('0.5')

  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.locator('input[type="file"][accept^="audio/"]').setInputFiles({
    name: 'music-1000hz.wav', mimeType: 'audio/wav', buffer: sineWaveWav(3, 1000),
  })
  await expect(page.getByText('music-1000hz.wav').first()).toBeVisible()
  await page.getByTestId('timeline-music-clip').click()
  await page.getByLabel('Propriedades contextuais').getByLabel('Volume da música nas propriedades').fill('0.75')

  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 }).then((download) => ({ download }))
  const renderErrorPromise = page.getByText('Nao foi possivel', { exact: false }).first().waitFor({ timeout: 180_000 }).then(() => ({ error: true }))
  const exportStartedAt = Date.now()
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const outcome = await Promise.race([downloadPromise, renderErrorPromise])
  if ('error' in outcome) throw new Error('Render falhou antes do download')
  console.log('REAL_EXPORT_MS', Date.now() - exportStartedAt)
  console.log('FFMPEG_LOAD_MS', ffmpegLoadMs)
  const { download } = outcome
  expect(download.suggestedFilename()).toBe('Viagem Azul.mp4')
  const outputPath = testInfo.outputPath('Viagem Azul.mp4')
  await download.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.length).toBeGreaterThan(10_000)

  const media = await page.evaluate(async (base64) => {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.muted = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('MP4 não decodificado pelo Chromium'))
    })
    async function pixelAt(time: number) {
      video.currentTime = time
      await new Promise<void>((resolve) => video.onseeked = () => resolve())
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')!
      context.drawImage(video, video.videoWidth / 2, video.videoHeight / 2, 1, 1, 0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const first = await pixelAt(0.8)
    const transition = await pixelAt(1.62)
    const second = await pixelAt(2.2)
    const audio = new AudioContext()
    const decoded = await audio.decodeAudioData(await blob.arrayBuffer())
    const samples = decoded.getChannelData(0)
    function power(frequency: number, time: number) {
      const count = 8192
      const start = Math.floor(time * decoded.sampleRate)
      let real = 0
      let imaginary = 0
      for (let index = 0; index < count; index++) {
        const sample = samples[start + index] || 0
        const phase = 2 * Math.PI * frequency * index / decoded.sampleRate
        real += sample * Math.cos(phase)
        imaginary += sample * Math.sin(phase)
      }
      return Math.hypot(real, imaginary) / count
    }
    const audioPowers = {
      first660: power(660, 0.65), first440: power(440, 0.65),
      second440: power(440, 2.0), second660: power(660, 2.0),
      musicStart: power(1000, 0.65), musicEnd: power(1000, 2.0),
    }
    await audio.close()
    URL.revokeObjectURL(url)
    return {
      duration: video.duration, width: video.videoWidth, height: video.videoHeight,
      first, transition, second, audioDuration: decoded.duration, audioPowers,
    }
  }, bytes.toString('base64'))

  console.log('EXPORTED_MEDIA_MEASUREMENTS', media)
  expect(media.duration).toBeGreaterThan(2.5)
  expect(media.duration).toBeLessThan(3.0)
  expect(media.width).toBe(resolution.width)
  expect(media.height).toBe(resolution.height)
  expect(media.first[1]).toBeGreaterThan(media.first[0] * 2)
  expect(media.second[0]).toBeGreaterThan(media.second[1] * 2)
  expect(media.transition[0]).toBeGreaterThan(media.transition[1])
  expect(media.transition[0]).toBeLessThan(media.second[0] * 0.75)
  expect(media.audioDuration).toBeGreaterThan(2.5)
  expect(media.audioPowers.first660).toBeGreaterThan(media.audioPowers.first440 * 2)
  expect(media.audioPowers.first660).toBeGreaterThan(0.02)
  expect(media.audioPowers.first660).toBeLessThan(0.045)
  expect(media.audioPowers.second440).toBeGreaterThan(media.audioPowers.second660 * 2)
  expect(media.audioPowers.musicStart).toBeGreaterThan(0.025)
  expect(media.audioPowers.musicEnd).toBeGreaterThan(0.025)
  expect(servedAssets).toEqual(expect.arrayContaining(['worker.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm']))
  expect(coreCdnRequests).toEqual([])
  if (process.env.ENTREUS_EXPORT_TEST_REPEAT === '1') {
    const secondDownloadPromise = page.waitForEvent('download', { timeout: 180_000 })
    const secondStartedAt = Date.now()
    await page.getByRole('button', { name: 'Baixar video' }).click()
    const secondDownload = await secondDownloadPromise
    console.log('SECOND_EXPORT_MS', Date.now() - secondStartedAt)
    expect(secondDownload.suggestedFilename()).toBe('Viagem Azul.mp4')
    expect(renderContexts).toContain('ffmpeg_already_loaded')
  }
})
