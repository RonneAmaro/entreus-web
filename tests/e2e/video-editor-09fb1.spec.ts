import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'
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
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  console.log('[09fa] workspace ready')
  const video = await makeVideo(page, width, height)
  console.log(`[09fa] fixture video ready (${video.length} bytes)`)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: `${width}x${height}.webm`, mimeType: 'video/webm', buffer: video })
  console.log('[09fa] fixture video assigned')
  await expect(page.locator(`canvas[width="${width}"][height="${height}"]`)).toBeVisible()
  console.log('[09fa] fixture metadata loaded')
  return video
}


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

test('música persistente com prévia e mixagem MP4 real', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.locator('input[type="file"][accept^="audio/"]').setInputFiles({ name: 'tom.wav', mimeType: 'audio/wav', buffer: sineWaveWav(3, 1000) })
  await expect(page.getByText('Música salva neste navegador.')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('timeline-music-clip').click()
  const props = page.getByLabel('Propriedades contextuais')
  await props.getByLabel('Início da música').fill('0.3')
  await props.getByLabel('Início do trecho musical').fill('0.4')
  await props.getByLabel('Volume da música nas propriedades').fill('0.5')
  await page.getByLabel('Fim do trecho da música').fill('1.9')
  await page.getByLabel('Fade-in da música').fill('0.4')
  await page.getByLabel('Fade-out da música').fill('0.4')
  await page.getByRole('slider', { name: 'Volume do vídeo' }).fill('0.5')
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).music.fadeOut
  })).toBe(0.4)
  await page.reload()
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await expect(page.getByLabel('Fade-in da música')).toHaveValue('0.4')
  await expect(page.getByLabel('Fade-out da música')).toHaveValue('0.4')
  await expect(page.getByTestId('timeline-music-clip')).toBeVisible()
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await timeline.fill('0.5')
  await expect.poll(() => page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(0.25, 1)
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const bytes = await (await import('node:fs/promises')).readFile(await (await download).path() as string)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true); expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const measured = await page.evaluate(async (base64) => {
    const context = new AudioContext(); const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const buffer = await context.decodeAudioData(bytes.buffer); const data = buffer.getChannelData(0), rate = buffer.sampleRate
    const power = (hz: number, time: number) => { let a = 0, b = 0; const start = Math.floor(time * rate), count = Math.floor(0.12 * rate)
      for (let i=0; i<count; i++) { const angle = 2 * Math.PI * hz * i / rate; a += data[start+i] * Math.cos(angle); b += data[start+i] * Math.sin(angle) }
      return 2 * Math.hypot(a, b) / count }
    const result = { original: power(440, 0.9), before: power(1000, 0.05), early: power(1000, 0.35), middle: power(1000, 0.9), late: power(1000, 1.65), after: power(1000, 1.95) }
    await context.close(); return result
  }, bytes.toString('base64'))
  console.log('MIXAGEM_09FB1', measured)
  expect(measured.original).toBeGreaterThan(0.02); expect(measured.middle).toBeGreaterThan(0.06)
  expect(measured.early).toBeLessThan(measured.middle * 0.65); expect(measured.late).toBeLessThan(measured.middle * 0.65)
  expect(measured.before).toBeLessThan(measured.middle * 0.2); expect(measured.after).toBeLessThan(measured.middle * 0.2)
})
test('áudio inválido não substitui música e arquivo ausente pode ser reassociado', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  const wav = sineWaveWav(3, 1000)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  const input = page.locator('input[type="file"][accept^="audio/"]')
  await input.setInputFiles({ name: 'original.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByText('Música salva neste navegador.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).music.assetId || ''
  })).not.toBe('')
  await input.setInputFiles({ name: 'invalido.wav', mimeType: 'audio/wav', buffer: Buffer.from('audio corrompido') })
  await expect(page.getByText('Áudio inválido ou não suportado.')).toBeVisible()
  await expect(page.getByText('original.wav').first()).toBeVisible()
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([project.id, project.music.assetId]); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close()
  })
  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('2 arquivo(s)')
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await page.getByLabel('Reassociar original.wav').setInputFiles({ name: 'original.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('1 arquivo(s)')
  await expect(page.getByLabel('Reassociar original.wav')).toHaveCount(0)
})
test('MP3 sintético é importado e recuperado', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  await serveAuditedFfmpegForLocalTest(page)
  await page.route('**/__music_wrapper/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || ''
    if (!['classes.js', 'const.js', 'utils.js', 'errors.js'].includes(name)) return route.fulfill({ status: 404 })
    const data = await (await import('node:fs/promises')).readFile(`node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`)
    await route.fulfill({ status: 200, body: data, contentType: 'text/javascript' })
  })
  const mp3 = Buffer.from(await page.evaluate(async (wav) => {
    const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ FFmpeg: new () => { load: (options: object) => Promise<void>; writeFile: (name: string, data: Uint8Array) => Promise<void>; exec: (args: string[]) => Promise<number>; readFile: (name: string) => Promise<Uint8Array>; terminate: () => void } }>
    const { FFmpeg } = await dynamicImport('/__music_wrapper/classes.js')
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({ classWorkerURL: '/__entreus_ffmpeg_local/worker.js', coreURL: '/__entreus_ffmpeg_local/ffmpeg-core.js', wasmURL: '/__entreus_ffmpeg_local/ffmpeg-core.wasm' })
    await ffmpeg.writeFile('source.wav', Uint8Array.from(wav))
    const status = await ffmpeg.exec(['-i', 'source.wav', '-codec:a', 'libmp3lame', 'fixture.mp3'])
    if (status !== 0) throw new Error(`MP3 encode failed: ${status}`)
    const encoded = await ffmpeg.readFile('fixture.mp3'); ffmpeg.terminate()
    return Array.from(encoded)
  }, Array.from(sineWaveWav(1, 1000))))
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.locator('input[type="file"][accept^="audio/"]').setInputFiles({ name: 'sintetico.mp3', mimeType: 'audio/mpeg', buffer: mp3 })
  await expect(page.getByText('Música salva neste navegador.')).toBeVisible({ timeout: 30000 })
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).music.assetId || ''
  })).not.toBe('')
  await page.reload()
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await expect(page.getByText('sintetico.mp3').first()).toBeVisible()
})
