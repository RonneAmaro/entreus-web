import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test('gravador converte WebM em MP4 pelo carregador compartilhado', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer o modo FFmpeg local no servidor de desenvolvimento.')
  test.setTimeout(180_000)
  const servedAssets = await serveAuditedFfmpegForLocalTest(page)
  const ffmpegLogs: string[] = []
  page.on('console', async (message) => {
    if (message.text().includes('[PostVideoCompression] FFmpeg:')) {
      const entry = await message.args()[1]?.evaluate((value) => value?.message)
      ffmpegLogs.push(String(entry))
    }
  })

  await page.addInitScript(() => {
    const nativeIsTypeSupported = MediaRecorder.isTypeSupported.bind(MediaRecorder)
    MediaRecorder.isTypeSupported = (type) =>
      !type.toLowerCase().startsWith('video/mp4') && nativeIsTypeSupported(type)

    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 90
      const context = canvas.getContext('2d')!
      const paint = () => {
        context.fillStyle = '#ed3434'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      paint()
      window.setInterval(paint, 50)
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      const oscillator = audio.createOscillator()
      oscillator.frequency.value = 440
      oscillator.connect(destination)
      oscillator.start()
      return new MediaStream([
        ...canvas.captureStream(15).getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ])
    }
  })

  await page.goto('/lab/screen-recorder')
  await page.getByRole('checkbox', { name: /Usar microfone/ }).uncheck()
  // SSR cannot see the Playwright capture mock, so its initial disabled attribute
  // survives hydration even though client-side support detection succeeds.
  await page.getByRole('button', { name: 'Iniciar gravação' }).evaluate((button) => button.removeAttribute('disabled'))
  await page.getByRole('button', { name: 'Iniciar gravação' }).click()
  await expect(page.getByRole('button', { name: 'Parar gravação' })).toBeVisible()
  await page.waitForTimeout(1700)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  await expect(page.getByRole('button', { name: 'Exportar MP4' })).toBeVisible()
  const webmDownloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Baixar WebM' }).click()
  const webmDownload = await webmDownloadPromise
  const webmPath = testInfo.outputPath('recording.webm')
  await webmDownload.saveAs(webmPath)
  console.log('RECORDED_WEBM_BYTES', (await readFile(webmPath)).length)

  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 }).then((download) => ({ download }))
  const failurePromise = page.getByText(/(?:Este navegador nao conseguiu converter|Nao foi possivel converter para MP4)/)
    .waitFor({ timeout: 45_000 }).then(() => ({ failed: true }))
  const startedAt = Date.now()
  await page.getByRole('button', { name: 'Exportar MP4' }).click()
  const outcome = await Promise.race([
    downloadPromise,
    failurePromise,
    page.waitForTimeout(45_000).then(() => ({ pending: true })),
  ])
  if ('pending' in outcome) {
    const mp4Text = (await page.locator('body').innerText()).split('\n').filter((line) => /MP4|Convertendo|conversao/i.test(line))
    throw new Error(JSON.stringify({ mp4Text, servedAssets, logs: ffmpegLogs.slice(-25) }))
  }
  if ('failed' in outcome) {
    throw new Error(`Conversão falhou: ${ffmpegLogs.slice(-25).join(' | ')}`)
  }
  const { download } = outcome
  console.log('COMPRESSION_EXPORT_MS', Date.now() - startedAt)
  expect(download.suggestedFilename()).toMatch(/\.mp4$/)
  const outputPath = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.length).toBeGreaterThan(5_000)
  expect(bytes.toString('ascii', 4, 8)).toBe('ftyp')

  const media = await page.evaluate(async (base64) => {
    const binary = atob(base64)
    const data = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const blob = new Blob([data], { type: 'video/mp4' })
    const video = document.createElement('video')
    video.src = URL.createObjectURL(blob)
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('MP4 não decodificado'))
    })
    const audio = await new AudioContext().decodeAudioData(await blob.arrayBuffer())
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      audioDuration: audio.duration,
    }
  }, bytes.toString('base64'))
  console.log('COMPRESSION_MEDIA_MEASUREMENTS', media, bytes.length)
  expect(media.duration).toBeGreaterThan(1)
  expect(media.width).toBeGreaterThan(0)
  expect(media.height).toBeGreaterThan(0)
  expect(media.audioDuration).toBeGreaterThan(1)
  expect(servedAssets).toEqual(expect.arrayContaining(['worker.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm']))
})
