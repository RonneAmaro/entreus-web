import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { SavedProject } from '@/lib/video-editor/project-persistence'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

async function saved(page: Page): Promise<SavedProject> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!)
  })
}
async function ready(page: Page) {
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
}
async function source(page: Page, color: string, hz: number, index: number) {
  const buffer = Buffer.from(await page.evaluate(async ({ color, hz }) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!, audio = new AudioContext(), dest = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator(), gain = audio.createGain()
    oscillator.frequency.value = hz; gain.gain.value = 0.2; oscillator.connect(gain).connect(dest); oscillator.start()
    const paint = () => { ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 90) }; paint()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }), chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1800))
    clearInterval(timer); recorder.stop(); const blob = await done
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { color, hz }))
  return { name: `clip-${index}.webm`, mimeType: 'video/webm', buffer }
}
async function photos(page: Page) {
  return Promise.all(['#ee1010', '#1010ee'].map(async (color, i) => ({ name: `foto-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((color) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 90)
    return canvas.toDataURL().split(',')[1]
  }, color), 'base64') })))
}
function wav() {
  const rate = 16000, count = rate * 4, bytes = Buffer.alloc(44 + count * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 880 * i / rate) * 6553), 44 + i * 2)
  return { name: 'trilha.wav', mimeType: 'audio/wav', buffer: bytes }
}

for (const mode of ['mista horizontal', 'dois vídeos vertical'] as const) test(`09G-A.3 ${mode}: prévia, persistência e MP4 medido`, async ({ page }, testInfo) => {
  test.setTimeout(360000)
  page.setDefaultTimeout(15000)
  const mixed = mode === 'mista horizontal', format = mixed ? '16:9' : '9:16'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/lab/video-editor'); await ready(page)
  const files = [await source(page, '#10ee10', 440, 1)]
  if (!mixed) files.push(await source(page, '#1010ee', 660, 2))
  for (const file of files) await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(file)
  if (mixed) await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(await photos(page))
  await expect.poll(async () => (await saved(page))?.baseVideoDuration).toBeGreaterThan(1.5)
  if (mixed) await expect.poll(async () => (await saved(page))?.photoSlides.filter((slide) => slide.assetId).length).toBe(2)
  else await expect.poll(async () => (await saved(page))?.extraVideos.length).toBe(1)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  // Use the existing saved-project model to prepare known trims and short photos.
  await page.evaluate(({ format, mixed }) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
    const value = JSON.parse(localStorage.getItem(key)!)
    value.baseTrim = { trimStart: 0.2, trimEnd: 1.2 }
    value.extraVideos = value.extraVideos.map((clip: object) => ({ ...clip, trimStart: 0.2, trimEnd: 1.2 }))
    value.photoSlides = value.photoSlides.map((slide: object) => ({ ...slide, duration: 1 }))
    value.aspectPreset = format; value.canvasSize = mixed ? { width: 1280, height: 720 } : { width: 720, height: 1280 }
    value.videoVolume = 0.4; value.currentTime = 0
    localStorage.setItem(key, JSON.stringify(value))
  }, { format, mixed })
  await page.reload(); await ready(page)
  for (const file of files) await page.getByLabel(`Reassociar ${file.name}`, { exact: true }).setInputFiles(file)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  const tools = page.getByRole('toolbar', { name: 'Ferramentas de edição' })
  await tools.getByRole('button', { name: 'Stickers', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar figurinha Confirmado', exact: true }).click()
  await tools.getByRole('button', { name: 'Legendas', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar legenda' }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('AUTOREELS')
  await page.getByLabel('Início da legenda', { exact: true }).fill('0.2')
  await page.getByLabel('Fim da legenda', { exact: true }).fill('0.8')
  if (mixed) {
    await tools.getByRole('button', { name: 'Áudio', exact: true }).click()
    const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
    await library.getByLabel('Importar para biblioteca').setInputFiles(wav())
    await library.getByRole('button', { name: 'Adicionar à timeline trilha.wav' }).click()
    await page.getByRole('button', { name: 'Selecionar áudio trilha.wav', exact: true }).click()
    await page.getByLabel('Fade-in do áudio trilha.wav').fill('0.2')
    await page.getByRole('button', { name: 'Silenciar áudio trilha.wav', exact: true }).click()
  }
  await tools.getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  for (const name of mixed ? ['foto-0.png', 'clip-1.webm', 'foto-1.png'] : ['clip-2.webm', 'clip-1.webm']) await panel.getByRole('checkbox', { name, exact: true }).check()
  await panel.getByLabel('Formato AutoReels').selectOption(format)
  await panel.getByLabel('Duração por imagem (s)').fill('1')
  if (mixed) await panel.getByLabel('Música da biblioteca').selectOption({ label: 'trilha.wav' })
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const before = await saved(page), originalCount = before.sequenceOrder.length, montageStart = mixed ? 3 : 2
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText(mixed ? '2 foto(s) e 1 vídeo(s)' : '0 foto(s) e 2 vídeo(s)')
  await panel.getByRole('button', { name: 'Cancelar proposta' }).click()
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  expect(await saved(page)).toEqual(before)
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final' }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved(page)).sequenceOrder.length).toBe(originalCount * 2)
  const after = await saved(page), additions = after.sequenceOrder.slice(originalCount)
  expect(after.sequenceOrder.slice(0, originalCount)).toEqual(before.sequenceOrder)
  expect(after.baseTrim).toEqual(before.baseTrim)
  expect(after.subtitles).toEqual(before.subtitles); expect(after.stickers).toEqual(before.stickers)
  expect(after.extraVideos.slice(before.extraVideos.length).map((clip) => [clip.trimStart, clip.trimEnd])).toEqual(mixed ? [[0.2, 1.2]] : [[0.2, 1.2], [0.2, 1.2]])
  if (mixed) expect(after.audioClips![0]).toEqual(before.audioClips![0])
  expect(after.baseVideo!.assetId).toBeTruthy()
  const videoAssets = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
    const records = await new Promise<Array<{ assetId: string }>>((resolve) => { const r = db.transaction('assets').objectStore('assets').getAll(); r.onsuccess = () => resolve(r.result) })
    db.close(); return records.filter((record) => record.assetId.startsWith('video-sha256-')).length
  })
  expect(videoAssets).toBe(files.length)
  const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await expect(seek).toHaveAttribute('max', mixed ? '6' : '4')
  const videoTime = montageStart + (mixed ? 1.3 : 0.3)
  await seek.fill(String(videoTime))
  const previewVideo = page.getByTestId('editor-preview').locator('video').first()
  await expect.poll(() => previewVideo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(0.5, 1)
  await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
  await expect.poll(() => previewVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  expect(await page.getByTestId('editor-preview').locator('video').evaluateAll((videos) => videos.filter((v) => !(v as HTMLVideoElement).paused).length)).toBe(1)
  await page.getByRole('button', { name: 'Pausar vídeo', exact: true }).click()
  await expect.poll(() => previewVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await page.reload(); await ready(page)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  expect((await saved(page)).sequenceOrder).toEqual(after.sequenceOrder)
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 240000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const output = testInfo.outputPath('autoreels-mixed.mp4'); await (await download).saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true); expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const probe = await page.evaluate(async ({ base64, mixed, start }) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), audio = new AudioContext()
    const decoded = await audio.decodeAudioData(data.buffer.slice(0)), pcm = decoded.getChannelData(0), rate = decoded.sampleRate
    const tone = (hz: number, time: number) => {
      const n = Math.floor(rate * 0.08), offset = Math.floor(rate * (time - 0.04)); let re = 0, im = 0
      for (let i = 0; i < n; i++) { re += pcm[offset + i] * Math.cos(2 * Math.PI * hz * i / rate); im += pcm[offset + i] * Math.sin(2 * Math.PI * hz * i / rate) }
      return 2 * Math.hypot(re, im) / n
    }
    const tones = { original: tone(440, 0.5), inserted: tone(mixed ? 440 : 660, start + (mixed ? 1.5 : 0.5)), photoSilence: tone(440, start + 0.5), musicBefore: tone(880, 0.5), musicAfter: tone(880, start + 0.5) }
    await audio.close()
    const video = document.createElement('video'), url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    try {
      video.muted = true
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')); video.src = url })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      const frame = async (time: number) => {
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = time })
        ctx.drawImage(video, 0, 0)
        return Array.from(ctx.getImageData(canvas.width * 0.2, canvas.height * 0.5, 1, 1).data)
      }
      const pixels = []
      for (const time of mixed ? [start + 0.5, start + 1.5, start + 2.5] : [start + 0.5, start + 1.5]) pixels.push(await frame(time))
      await frame(0.5)
      const pixelsWithCaption = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let bright = 0
      for (let i = 0; i < pixelsWithCaption.length; i += 4) if (pixelsWithCaption[i] > 180 && pixelsWithCaption[i + 1] > 180 && pixelsWithCaption[i + 2] > 180) bright++
      return { width: canvas.width, height: canvas.height, duration: video.duration, tones, pixels, bright }
    } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), mixed, start: montageStart })
  console.log('AUTOREELS_MP4', mode, JSON.stringify(probe))
  await testInfo.attach('mp4-probe', { body: JSON.stringify(probe, null, 2), contentType: 'application/json' })
  expect(probe).toMatchObject(mixed ? { width: 1280, height: 720 } : { width: 720, height: 1280 })
  expect(probe.duration).toBeCloseTo(mixed ? 6 : 4, 0)
  expect(probe.tones.original).toBeGreaterThan(0.04); expect(probe.tones.original).toBeLessThan(0.12)
  expect(probe.tones.inserted).toBeGreaterThan(0.04); expect(probe.tones.inserted).toBeLessThan(0.12)
  const channels = mixed ? [0, 1, 2] : [2, 1]
  probe.pixels.forEach((pixel, index) => { expect(pixel[channels[index]]).toBeGreaterThan(160); expect(pixel[(channels[index] + 1) % 3]).toBeLessThan(90) })
  expect(probe.bright).toBeGreaterThan(10)
  if (mixed) {
    expect(probe.tones.photoSilence).toBeLessThan(0.004)
    expect(probe.tones.musicBefore).toBeLessThan(0.004)
    expect(probe.tones.musicAfter).toBeGreaterThan(0.05); expect(probe.tones.musicAfter).toBeLessThan(0.13)
  }
  // Remove the inserted video through the existing properties while it is playing.
  await page.getByRole('button', { name: 'Voltar para edicao', exact: true }).click()
  const insertedVideo = mixed ? additions[1] : additions[0]
  await seek.fill(String(videoTime))
  await page.locator(`[data-clip-id="${insertedVideo}"]`).click()
  await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
  await page.getByRole('button', { name: 'Remover clipe da timeline', exact: true }).click()
  await expect.poll(() => page.getByTestId('editor-preview').locator('video').evaluateAll((videos) => videos.every((v) => (v as HTMLVideoElement).paused))).toBe(true)
})

test('09G-A.3 cota, reassociação de vídeo ausente e painel mobile', async ({ page }) => {
  test.setTimeout(120000)
  page.setDefaultTimeout(15000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/lab/video-editor'); await ready(page)
  const file = await source(page, '#10ee10', 440, 1)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(file)
  await expect.poll(async () => (await saved(page))?.baseVideoDuration).toBeGreaterThan(1.5)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (String(value?.assetId).startsWith('video-sha256-')) throw new DOMException('quota', 'QuotaExceededError')
      return put.call(this, value, ...args)
    }
  })
  await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  await panel.getByRole('checkbox', { name: file.name, exact: true }).check()
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final' }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect(page.getByRole('alert').filter({ hasText: 'um vídeo não pôde ser guardado' })).toBeVisible()
  await expect.poll(async () => (await saved(page)).extraVideos.length).toBe(1)
  expect((await saved(page)).extraVideos[0].media.assetId).toBeUndefined()
  await page.reload(); await ready(page)
  await expect(page.getByLabel(`Reassociar ${file.name}`, { exact: true })).toHaveCount(2)
  await page.getByLabel(`Reassociar ${file.name}`, { exact: true }).first().setInputFiles(file)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await expect.poll(async () => Boolean((await saved(page)).extraVideos[0].media.assetId)).toBe(true)
  const project = await saved(page)
  expect(project.baseVideo!.assetId).toBe(project.extraVideos[0].media.assetId)
  await page.evaluate(async ({ id, assetId }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([id, assetId]); tx.oncomplete = () => resolve() }); db.close()
  }, { id: project.id, assetId: project.baseVideo!.assetId! })
  await page.reload(); await ready(page)
  await expect(page.getByLabel(`Reassociar ${file.name}`, { exact: true })).toHaveCount(2)
  await page.getByLabel(`Reassociar ${file.name}`, { exact: true }).first().setInputFiles(file)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.locator('[data-clip-id="base-video"]').click()
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.9')
  await page.getByRole('button', { name: 'Dividir clipe no playhead', exact: true }).click()
  await expect.poll(async () => (await saved(page)).extraVideos.length).toBe(2)
  const split = await saved(page)
  expect(split.extraVideos.every((clip) => clip.media.assetId === split.baseVideo!.assetId)).toBe(true)
  await page.reload(); await ready(page)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.getByRole('button', { name: 'Abrir biblioteca', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir biblioteca', exact: true }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  await expect(panel).toContainText('Vídeo')
  const bounds = await panel.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
})
