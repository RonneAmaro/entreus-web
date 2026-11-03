import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

async function videoFixture(page: Page): Promise<Buffer> {
  return Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!
    const paint = () => { ctx.fillStyle = '#181020'; ctx.fillRect(0, 0, 160, 90) }
    paint()
    const context = new AudioContext()
    const destination = context.createMediaStreamDestination()
    const oscillator = context.createOscillator(); oscillator.frequency.value = 440
    const gain = context.createGain(); gain.gain.value = 0.2
    oscillator.connect(gain).connect(destination); oscillator.start()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    clearInterval(timer); recorder.stop()
    const blob = await finished
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await context.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
}

function wavFixture(): Buffer {
  const rate = 16000, samples = rate * 3
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 1000 * i / rate) * 9000), 44 + i * 2)
  return data
}

test('áudio: posição, reprodução, pausa, silêncio, persistência e MP4', async ({ page }, testInfo) => {
  test.setTimeout(240000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  const video = await videoFixture(page)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: video })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.locator('input[type="file"][accept^="audio/"]').setInputFiles({ name: 'som.wav', mimeType: 'audio/wav', buffer: wavFixture() })
  await expect(page.getByText('Música salva neste navegador.')).toBeVisible()
  await page.getByRole('slider', { name: 'Volume do vídeo' }).fill('0.3')
  await page.getByTestId('timeline-music-clip').click()
  const props = page.getByLabel('Propriedades contextuais')
  await props.getByLabel('Início da música').fill('0.3')
  await props.getByLabel('Volume da música nas propriedades').fill('0.4')
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const music = JSON.parse(localStorage.getItem(key)!).music
    return [music.startTime, music.volume]
  })).toEqual([0.3, 0.4])
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await timeline.fill('0.7')
  const audio = page.locator('audio').first()
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(0.4, 2)
  await page.getByRole('button', { name: 'Silenciar música' }).click()
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.volume)).toBe(0)
  await page.getByRole('button', { name: 'Ativar música' }).click()
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(0.4, 2)
  await page.getByRole('button', { name: 'Reproduzir vídeo' }).click()
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false)
  await page.getByRole('button', { name: 'Pausar vídeo' }).click()
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
  await timeline.fill('1.2')
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeCloseTo(0.9, 1)
  await page.reload()
  await page.getByLabel('Reassociar base.webm').setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: video })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.getByTestId('timeline-music-clip').click()
  await expect(page.getByLabel('Volume da música nas propriedades')).toHaveValue('0.4')
  await expect(page.getByLabel('Início da música')).toHaveValue('0.3')
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.getByRole('button', { name: 'Silenciar música' }).click()
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 180000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const path = testInfo.outputPath('audio-silenciado.mp4')
  await (await download).saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const measurements = await page.evaluate(async (base64) => {
    const context = new AudioContext()
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const decoded = await context.decodeAudioData(bytes.buffer)
    const samples = decoded.getChannelData(0), rate = decoded.sampleRate
    const tone = (frequency: number) => {
      let re = 0, im = 0
      const start = Math.floor(0.9 * rate), count = Math.floor(0.2 * rate)
      for (let i = 0; i < count; i++) {
        const angle = 2 * Math.PI * frequency * i / rate
        re += samples[start + i] * Math.cos(angle); im += samples[start + i] * Math.sin(angle)
      }
      return 2 * Math.hypot(re, im) / count
    }
    const result = { duration: decoded.duration, original: tone(440), mutedMusic: tone(1000) }
    await context.close()
    return result
  }, bytes.toString('base64'))
  console.log('MIXAGEM_SILENCIADA', measurements)
  expect(measurements.duration).toBeGreaterThan(2.5)
  expect(measurements.original).toBeGreaterThan(0.02)
  expect(measurements.mutedMusic).toBeLessThan(measurements.original * 0.1)
})
