import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

const assetPattern = '**/__entreus_ffmpeg_local/**'

async function observeWorkers(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const counts = { created: 0, terminated: 0 }
    Object.defineProperty(window, '__ffmpegWorkerCounts', { value: counts })
    window.Worker = class extends NativeWorker {
      private isFfmpeg: boolean
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        this.isFfmpeg = String(url).includes('/__entreus_ffmpeg_local/worker.js')
        if (this.isFfmpeg) counts.created++
      }
      terminate() {
        if (this.isFfmpeg) counts.terminated++
        super.terminate()
      }
    }
  })
}

async function workerCounts(page: Page) {
  return page.evaluate(() => (window as unknown as Window & {
    __ffmpegWorkerCounts: { created: number; terminated: number }
  }).__ffmpegWorkerCounts)
}

async function prepareShortVideo(page: Page, navigate = true) {
  if (navigate) await page.goto('/lab/video-editor')
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')!
    context.fillStyle = '#df2935'
    context.fillRect(0, 0, 160, 90)
    const stream = canvas.captureStream(12)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const completed = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    recorder.stop()
    const blob = await completed
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({
    name: 'failure-probe.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes),
  })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  await expect(page.getByRole('button', { name: 'Baixar video' })).toBeEnabled()
}

async function startExport(page: Page) {
  await page.getByRole('button', { name: 'Baixar video' }).click()
}

async function expectRecoverableFailure(page: Page) {
  await expect(page.getByText('Nao foi possivel', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Baixar video' })).toBeEnabled()
}

async function retryAndDownload(page: Page) {
  const download = page.waitForEvent('download', { timeout: 120_000 })
  await startExport(page)
  const output = await download
  expect(output.suggestedFilename()).toMatch(/\.mp4$/)
}

test.beforeEach(async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer a fixture FFmpeg local.')
  test.setTimeout(180_000)
  await observeWorkers(page)
})

test('falha de rede do WASM mostra erro e permite nova exportacao', async ({ page }) => {
  const served = await serveAuditedFfmpegForLocalTest(page)
  let failOnce = true
  await page.context().route(assetPattern, async (route) => {
    if (failOnce && route.request().url().endsWith('/ffmpeg-core.wasm')) {
      failOnce = false
      await route.abort('failed')
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  await startExport(page)
  await expectRecoverableFailure(page)
  expect(failOnce).toBe(false)
  const afterFailure = await workerCounts(page)
  expect(afterFailure).toEqual({ created: 1, terminated: 1 })
  await retryAndDownload(page)
  const afterRetry = await workerCounts(page)
  console.log('WASM_NETWORK_WORKERS', { afterFailure, afterRetry, served })
  expect(afterRetry.created).toBe(2)
  expect(afterRetry.terminated).toBe(1)
  expect(served).toContain('ffmpeg-core.wasm')
})

test('resposta HTTP invalida do core ESM permite nova tentativa', async ({ page }) => {
  const served = await serveAuditedFfmpegForLocalTest(page)
  let failOnce = true
  await page.context().route(assetPattern, async (route) => {
    if (failOnce && route.request().url().endsWith('/ffmpeg-core.js')) {
      failOnce = false
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'local test HTTP 503' })
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  await startExport(page)
  await expectRecoverableFailure(page)
  expect(failOnce).toBe(false)
  expect(await workerCounts(page)).toEqual({ created: 1, terminated: 1 })
  await retryAndDownload(page)
  const counts = await workerCounts(page)
  console.log('CORE_HTTP_WORKERS', { counts, served })
  expect(counts).toEqual({ created: 2, terminated: 1 })
  expect(served).toContain('ffmpeg-core.js')
})

test('worker que nao inicializa atinge timeout e permite nova tentativa', async ({ page }) => {
  await serveAuditedFfmpegForLocalTest(page)
  let failOnce = true
  await page.context().route(assetPattern, async (route) => {
    if (failOnce && route.request().url().endsWith('/worker.js')) {
      failOnce = false
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("local test worker startup failure")' })
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  await startExport(page)
  await expect.poll(async () => (await workerCounts(page)).created).toBe(1)
  await expect(page.getByText('O motor de video demorou para carregar.', { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Baixar video' })).toBeEnabled()
  expect(await workerCounts(page)).toEqual({ created: 1, terminated: 1 })
  await retryAndDownload(page)
  expect(await workerCounts(page)).toEqual({ created: 2, terminated: 1 })
})

test('cancelar carregamento pendente encerra Worker e libera nova tentativa', async ({ page }) => {
  await serveAuditedFfmpegForLocalTest(page)
  let failOnce = true
  await page.context().route(assetPattern, async (route) => {
    if (failOnce && route.request().url().endsWith('/worker.js')) {
      failOnce = false
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("local test worker startup failure")' })
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  await startExport(page)
  await expect.poll(async () => (await workerCounts(page)).created).toBe(1)
  await page.getByRole('button', { name: 'Cancelar exportação' }).click()
  await expect(page.getByText('Exportação cancelada.')).toBeVisible()
  await expect.poll(async () => (await workerCounts(page)).terminated).toBe(1)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  await retryAndDownload(page)
  expect(await workerCounts(page)).toEqual({ created: 2, terminated: 1 })
})

test('falha de execucao libera interface e a tentativa seguinte usa a mesma instancia', async ({ page }) => {
  const workerPath = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js')
  const originalWorker = await readFile(workerPath, 'utf8')
  const marker = 'case FFMessageType.EXEC:\n                data = exec(_data);'
  expect(originalWorker).toContain(marker)
  const failingWorker = originalWorker
    .replace('let ffmpeg;', 'let ffmpeg;\nlet failuresRemaining = 2;')
    .replace(marker, "case FFMessageType.EXEC:\n                data = _data.args.includes('0:a:0') ? exec(_data) : failuresRemaining > 0 ? (failuresRemaining--, 1) : exec(_data);")
  await serveAuditedFfmpegForLocalTest(page)
  await page.context().route(assetPattern, async (route) => {
    if (route.request().url().endsWith('/worker.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: failingWorker })
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  await startExport(page)
  await expectRecoverableFailure(page)
  const beforeRetry = await workerCounts(page)
  await retryAndDownload(page)
  const afterRetry = await workerCounts(page)
  console.log('EXEC_FAILURE_WORKERS', { beforeRetry, afterRetry })
  expect(afterRetry.created).toBe(1)
})

test('falha pontual no render primário produz MP4 pelo fallback identificado', async ({ page }, testInfo) => {
  const workerPath = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js')
  const originalWorker = await readFile(workerPath, 'utf8')
  const marker = 'case FFMessageType.EXEC:\n                data = exec(_data);'
  expect(originalWorker).toContain(marker)
  const failingWorker = originalWorker
    .replace('let ffmpeg;', 'let ffmpeg;\nlet failuresRemaining = 1;')
    .replace(marker, "case FFMessageType.EXEC:\n                data = _data.args.includes('0:a:0') ? exec(_data) : failuresRemaining > 0 ? (failuresRemaining--, 1) : exec(_data);")
  await serveAuditedFfmpegForLocalTest(page)
  await page.context().route(assetPattern, async (route) => {
    if (route.request().url().endsWith('/worker.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: failingWorker })
      return
    }
    await route.fallback()
  })
  await prepareShortVideo(page)
  const renderPaths: string[] = []
  page.on('console', (message) => { if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text()) })
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await startExport(page)
  const download = await downloadPromise
  const outputPath = testInfo.outputPath('09c68-audio-fallback.mp4')
  await download.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(renderPaths).toEqual([expect.stringContaining('audio_fallback')])
  const frame = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    try {
      const video = document.createElement('video'); video.src = url; video.muted = true
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = Math.min(0.2, video.duration / 2)
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return { width: canvas.width, height: canvas.height, center: Array.from(context.getImageData(80, 45, 1, 1).data) }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  expect(frame.width).toBe(160); expect(frame.height).toBe(90)
  expect(frame.center[0]).toBeGreaterThan(frame.center[1] * 1.5)
  expect(await workerCounts(page)).toEqual({ created: 1, terminated: 0 })
})

test('cancelar execucao impede download antigo e permite exportar novamente', async ({ page }) => {
  const workerPath = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js')
  const originalWorker = await readFile(workerPath, 'utf8')
  const marker = 'case FFMessageType.EXEC:\n                data = exec(_data);'
  expect(originalWorker).toContain(marker)
  const stalledWorker = originalWorker.replace(marker, "case FFMessageType.EXEC:\n                if (!_data.args.includes('0:a:0')) return;\n                data = exec(_data);")
  await serveAuditedFfmpegForLocalTest(page)
  let stall = true
  await page.context().route(assetPattern, async (route) => {
    if (stall && route.request().url().endsWith('/worker.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: stalledWorker })
      return
    }
    await route.fallback()
  })
  let downloads = 0
  page.on('download', () => downloads++)
  await prepareShortVideo(page)
  await startExport(page)
  await expect(page.getByRole('button', { name: 'Cancelar exportação' })).toBeVisible()
  await expect.poll(async () => (await workerCounts(page)).created).toBe(1)
  await expect(page.getByText('Renderizando versao final...', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar exportação' }).click()
  await expect(page.getByText('Exportação cancelada.')).toBeVisible()
  expect(downloads).toBe(0)
  expect(await workerCounts(page)).toEqual({ created: 1, terminated: 1 })
  stall = false
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  await retryAndDownload(page)
  expect(downloads).toBe(1)
  expect(await workerCounts(page)).toEqual({ created: 2, terminated: 1 })
  await expect(page.getByText('Download iniciado.', { exact: false })).toBeVisible()
})

test('saida interna durante execucao encerra o Worker', async ({ page }) => {
  const workerPath = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js')
  const originalWorker = await readFile(workerPath, 'utf8')
  const marker = 'case FFMessageType.EXEC:\n                data = exec(_data);'
  expect(originalWorker).toContain(marker)
  const stalledWorker = originalWorker.replace(marker, "case FFMessageType.EXEC:\n                if (!_data.args.includes('0:a:0')) return;\n                data = exec(_data);")
  await serveAuditedFfmpegForLocalTest(page)
  await page.context().route(assetPattern, async (route) => {
    if (route.request().url().endsWith('/worker.js')) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: stalledWorker })
      return
    }
    await route.fallback()
  })
  await page.goto('/lab')
  await page.locator('a[href="/lab/video-editor"]').click()
  await prepareShortVideo(page, false)
  await startExport(page)
  await expect.poll(async () => (await workerCounts(page)).created).toBe(1)
  await expect(page.getByText('Renderizando versao final...', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /Renderizando/ }).last()).toBeDisabled()
  await page.evaluate(() => window.history.back())
  await expect(page).toHaveURL(/\/lab$/)
  const counts = await workerCounts(page)
  console.log('ENCODING_UNLOAD_WORKERS', counts)
  expect(counts).toEqual({ created: 1, terminated: 1 })
})

test('gravador recupera conversao MP4 depois de falha no core ESM', async ({ page }, testInfo) => {
  await serveAuditedFfmpegForLocalTest(page)
  let failOnce = true
  await page.context().route(assetPattern, async (route) => {
    if (failOnce && route.request().url().endsWith('/ffmpeg-core.js')) {
      failOnce = false
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'local test HTTP 503' })
      return
    }
    await route.fallback()
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
      context.fillStyle = '#df2935'
      context.fillRect(0, 0, 160, 90)
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
  await page.getByRole('button', { name: 'Iniciar gravação' }).evaluate((button) => button.removeAttribute('disabled'))
  await page.getByRole('button', { name: 'Iniciar gravação' }).click()
  await page.waitForTimeout(1300)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  const exportButton = page.getByRole('button', { name: 'Exportar MP4' })
  await expect(exportButton).toBeVisible()
  await exportButton.click()
  await expect(page.getByText('Nao foi possivel carregar o motor de video.', { exact: false })).toBeVisible()
  await expect(exportButton).toBeEnabled()
  expect(await workerCounts(page)).toEqual({ created: 1, terminated: 1 })
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await exportButton.click()
  const output = await download
  const outputPath = testInfo.outputPath('retry-recorder.mp4')
  await output.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.length).toBeGreaterThan(5_000)
  expect(bytes.toString('ascii', 4, 8)).toBe('ftyp')
  expect(await workerCounts(page)).toEqual({ created: 2, terminated: 1 })
})
