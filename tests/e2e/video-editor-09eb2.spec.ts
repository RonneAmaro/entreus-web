import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'
import { serveAuditedWhisperForLocalTest, WHISPER_TEST_HASHES } from './whisper-local-fixture'

test.setTimeout(720_000)

test('09E-B.2: Whisper local cancela, falha com segurança, persiste e exporta a legenda revisada', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const referenceWav = await serveAuditedWhisperForLocalTest(page)
  const response = await page.goto('/lab/video-editor')
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin')
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true)

  await page.evaluate(({ runtimeHash, modelHash }) => {
    window.__ENTREUS_WHISPER_TEST_ASSETS__ = {
      runtimeUrl: `${location.origin}/__entreus_whisper_local/main.js`,
      runtimeSha256: runtimeHash,
      modelUrl: `${location.origin}/__entreus_whisper_local/ggml-tiny.bin`,
      modelSha256: modelHash,
    }
  }, { runtimeHash: WHISPER_TEST_HASHES.runtime, modelHash: WHISPER_TEST_HASHES.model })

  const videoBytes = Buffer.from(await page.evaluate(async (wavBase64) => {
    const wav = Uint8Array.from(atob(wavBase64), (character) => character.charCodeAt(0))
    const audio = new AudioContext()
    const decoded = await audio.decodeAudioData(wav.buffer)
    const source = audio.createBufferSource()
    source.buffer = decoded
    const destination = audio.createMediaStreamDestination()
    source.connect(destination)

    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')!
    const paint = () => {
      context.fillStyle = '#201020'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    paint()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    source.start()
    const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    clearInterval(timer)
    recorder.stop()
    const blob = await finished
    source.stop()
    stream.getTracks().forEach((track) => track.stop())
    await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, referenceWav.toString('base64')))

  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({
    name: 'fala-whisper.webm',
    mimeType: 'video/webm',
    buffer: videoBytes,
  })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()

  const generate = page.getByRole('button', { name: 'Gerar legendas automaticamente' })
  await expect(generate).toBeEnabled()
  await generate.click()
  await expect(page.getByText(/Nada é enviado para uma API/)).toBeVisible()
  await page.getByRole('button', { name: 'Baixar e continuar' }).click()
  await expect(page.getByText('Transcrevendo no seu dispositivo…')).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByText(/Transcrição cancelada/)).toBeVisible()
  await page.getByRole('button', { name: 'Tentar novamente' }).click()

  await page.evaluate(() => {
    window.__ENTREUS_WHISPER_TEST_ASSETS__!.modelSha256 = '0'.repeat(64)
  })
  await generate.click()
  await page.getByRole('button', { name: 'Baixar e continuar' }).click()
  await expect(page.getByRole('region', { name: 'Legendas automáticas locais' }).getByRole('alert')).toContainText('integridade', { timeout: 60_000 })
  await page.evaluate((modelHash) => {
    window.__ENTREUS_WHISPER_TEST_ASSETS__!.modelSha256 = modelHash
  }, WHISPER_TEST_HASHES.model)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()

  await generate.click()
  await page.getByRole('button', { name: 'Baixar e continuar' }).click()
  await expect(page.getByTestId('whisper-review')).toBeVisible({ timeout: 180_000 })
  const firstTranscript = page.getByRole('textbox', { name: 'Texto da transcrição 1' })
  await expect(firstTranscript).not.toHaveValue('')
  const transcriptCount = await page.getByRole('textbox', { name: /^Texto da transcrição/ }).count()
  for (let index = transcriptCount; index >= 2; index -= 1) {
    await page.getByRole('button', { name: `Remover transcrição ${index}` }).click()
  }
  await firstTranscript.fill('Legenda automática revisada')
  await page.getByRole('button', { name: 'Confirmar e adicionar' }).click()
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(1)
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key) || '{}').subtitles?.[0]?.text as string | undefined
  })).toBe('Legenda automática revisada')

  const browserContext = page.context()
  await page.close()
  page = await browserContext.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Reassociar fala-whisper.webm').setInputFiles({ name: 'fala-whisper.webm', mimeType: 'video/webm', buffer: videoBytes })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(1)
  await page.getByRole('button', { name: /Legenda 1: Legenda automática revisada/ }).click()
  await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('aria-label', 'Legenda automática revisada')

  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 360_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const output = testInfo.outputPath('09eb2-whisper-local.mp4')
  await (await download).saveAs(output)
  const mp4 = await readFile(output)
  expect(mp4.length).toBeGreaterThan(10_000)

  const rendered = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('MP4 inválido'))
      })
      video.currentTime = 1
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!
      context.drawImage(video, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let white = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 170 && pixels[index + 1] > 170 && pixels[index + 2] > 170) white += 1
      }
      const audio = new AudioContext()
      const decoded = await audio.decodeAudioData(bytes.buffer.slice(0))
      const samples = decoded.getChannelData(0)
      let squareSum = 0
      for (const sample of samples) squareSum += sample * sample
      await audio.close()
      return { white, duration: video.duration, rms: Math.sqrt(squareSum / samples.length) }
    } finally {
      URL.revokeObjectURL(url)
    }
  }, mp4.toString('base64'))
  expect(rendered.duration).toBeGreaterThan(3.5)
  expect(rendered.white).toBeGreaterThan(40)
  expect(rendered.rms).toBeGreaterThan(0.001)
})

test('09E-B.2: ausência de mídia bloqueia o início e silêncio não cria legendas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let externalWhisperRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('ggml.ai/whisper') || request.url().includes('huggingface.co/ggerganov/whisper.cpp')) {
      externalWhisperRequests += 1
    }
  })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  const generate = page.getByRole('button', { name: 'Gerar legendas automaticamente' })
  await expect(generate).toBeDisabled()
  await expect(page.getByText('Adicione uma mídia com áudio à timeline.')).toBeVisible()

  const silentVideo = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!; context.fillStyle = '#111827'; context.fillRect(0, 0, 160, 90)
    const audio = new AudioContext(); const destination = audio.createMediaStreamDestination()
    const silence = audio.createConstantSource(); silence.offset.value = 0; silence.connect(destination); silence.start()
    const stream = new MediaStream([...canvas.captureStream(10).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }); const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); await new Promise((resolve) => setTimeout(resolve, 1_500)); recorder.stop(); const blob = await finished
    silence.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'silencio.webm', mimeType: 'video/webm', buffer: silentVideo })
  await expect(page.locator('[data-media-id="base-video"]')).toBeVisible()
  await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
  await expect(generate).toBeEnabled()
  await generate.click()
  await page.getByRole('button', { name: 'Baixar e continuar' }).click()
  await expect(page.getByText('Nenhuma fala audível foi encontrada. Nenhuma legenda foi criada.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('subtitle-segment')).toHaveCount(0)
  expect(externalWhisperRequests).toBe(0)
})
