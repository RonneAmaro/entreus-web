import { expect, test } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

function wav(frequency: number) {
  const rate = 16000, samples = rate * 3, data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * 9000), 44 + i * 2)
  return data
}

test.describe('biblioteca local com fixture FFmpeg', () => {
test.use({ serviceWorkers: 'block' })
test('biblioteca local classifica, busca, prévia, reutiliza, persiste e recupera áudio', async ({ page }) => {
  test.setTimeout(240000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  const video = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!, paint = () => { ctx.fillStyle = '#181020'; ctx.fillRect(0, 0, 160, 90) }
    paint(); const stream = canvas.captureStream(15), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40); await new Promise((resolve) => setTimeout(resolve, 2400))
    clearInterval(timer); recorder.stop(); const result = await done; stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await result.arrayBuffer()))
  }))
  const baseVideo = { name: 'base-library.webm', mimeType: 'video/webm', buffer: video }
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles(baseVideo)
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await expect(library.getByText('Nenhum arquivo nesta categoria. Importe um áudio para começar.')).toBeVisible()
  const input = library.getByLabel('Importar para biblioteca')
  await input.setInputFiles({ name: 'quebrado.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Áudio inválido ou não suportado (máximo de 10 minutos).')).toBeVisible()
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(0)
  const music = { name: 'Trilha Solar.wav', mimeType: 'audio/wav', buffer: wav(880) }
  await input.setInputFiles(music)
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(1)
  await expect(library.getByText('0:03')).toBeVisible()
  const search = library.getByLabel('Buscar áudio na biblioteca')
  await search.fill('SOLAR'); await expect(library.getByText('Trilha Solar.wav')).toBeVisible()
  await search.fill('inexistente'); await expect(library.getByText('Nenhum áudio encontrado para esta busca.')).toBeVisible()
  await search.fill('')
  await library.getByRole('button', { name: 'Ouvir prévia Trilha Solar.wav' }).click()
  await expect(library.getByRole('button', { name: 'Pausar prévia Trilha Solar.wav' })).toBeVisible()
  await library.getByRole('button', { name: 'Pausar prévia Trilha Solar.wav' }).click()
  await library.getByRole('button', { name: 'Adicionar à timeline Trilha Solar.wav' }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(1)
  await expect(library.getByRole('button', { name: 'Adicionar à timeline Trilha Solar.wav' })).toBeEnabled()
  await library.getByRole('button', { name: 'Adicionar à timeline Trilha Solar.wav' }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  await page.getByLabel('Volume do áudio Trilha Solar.wav').first().fill('0.2')
  await page.getByLabel('Volume do áudio Trilha Solar.wav').nth(1).fill('0.7')
  await input.setInputFiles(music)
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Efeitos sonoros' }).click()
  await expect(library.getByText('Nenhum arquivo nesta categoria. Importe um áudio para começar.')).toBeVisible()
  await serveAuditedFfmpegForLocalTest(page)
  await page.route('**/__music_wrapper/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() || ''
    if (!['classes.js', 'const.js', 'utils.js', 'errors.js'].includes(name)) return route.fulfill({ status: 404 })
    const bytes = await (await import('node:fs/promises')).readFile(`node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`)
    await route.fulfill({ status: 200, body: bytes, contentType: 'text/javascript' })
  })
  const mp3 = Buffer.from(await page.evaluate(async (source) => {
    const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ FFmpeg: new () => { load: (options: object) => Promise<void>; writeFile: (name: string, data: Uint8Array) => Promise<void>; exec: (args: string[]) => Promise<number>; readFile: (name: string) => Promise<Uint8Array>; terminate: () => void } }>
    const { FFmpeg } = await dynamicImport('/__music_wrapper/classes.js'), ffmpeg = new FFmpeg()
    await ffmpeg.load({ classWorkerURL: '/__entreus_ffmpeg_local/worker.js', coreURL: '/__entreus_ffmpeg_local/ffmpeg-core.js', wasmURL: '/__entreus_ffmpeg_local/ffmpeg-core.wasm' })
    await ffmpeg.writeFile('source.wav', Uint8Array.from(source))
    if (await ffmpeg.exec(['-i', 'source.wav', '-codec:a', 'libmp3lame', 'effect.mp3']) !== 0) throw new Error('Falha ao gerar MP3')
    const data = await ffmpeg.readFile('effect.mp3'); ffmpeg.terminate(); return Array.from(data)
  }, Array.from(wav(1320))))
  await input.setInputFiles({ name: 'Sinal.mp3', mimeType: 'audio/mpeg', buffer: mp3 })
  await expect(library.getByText('Sinal.mp3')).toBeVisible()
  await expect(library.getByText('Trilha Solar.wav')).toHaveCount(0)
  await library.getByRole('button', { name: 'Ouvir prévia Sinal.mp3' }).click()
  await expect(library.getByRole('button', { name: 'Pausar prévia Sinal.mp3' })).toBeVisible()
  await library.getByRole('button', { name: 'Adicionar à timeline Sinal.mp3' }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(3)
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const saved = JSON.parse(localStorage.getItem(key)!)
    return [saved.audioLibrary?.length, saved.audioClips?.length, new Set(saved.audioClips?.map((clip: { id: string }) => clip.id)).size, saved.audioClips?.[0]?.assetId === saved.audioClips?.[1]?.assetId]
  })).toEqual([2, 3, 3, true])
  const assetsCount = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const items = await new Promise<unknown[]>((resolve, reject) => { const tx = db.transaction('assets', 'readonly'), request = tx.objectStore('assets').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    db.close(); return items.length
  })
  expect(assetsCount).toBe(2)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.getByLabel('Reassociar base-library.webm').setInputFiles(baseVideo, { timeout: 10000 })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(3)
  await expect(library.getByText('Trilha Solar.wav')).toBeVisible()
  await expect(page.getByLabel('Volume do áudio Trilha Solar.wav').first()).toHaveValue('0.2')
  await expect(page.getByLabel('Volume do áudio Trilha Solar.wav').nth(1)).toHaveValue('0.7')
  await page.getByLabel('Excluir áudio Trilha Solar.wav').first().click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  await expect(library.getByText('Trilha Solar.wav')).toBeVisible()
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const saved = JSON.parse(localStorage.getItem(key)!), asset = saved.audioLibrary.find((item: { category: string }) => item.category === 'music')
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([saved.id, asset.assetId]); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close()
  })
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  // The first manual reassociation stores this legacy video for subsequent reloads.
  await expect(page.getByLabel('Reassociar base-library.webm')).toHaveCount(0)
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await expect(library.getByLabel('Reassociar biblioteca Trilha Solar.wav')).toBeVisible()
  await library.getByLabel('Reassociar biblioteca Trilha Solar.wav').setInputFiles(music)
  await expect(page.getByText('Áudio reassociado.')).toBeVisible()
  await expect(library.getByRole('button', { name: 'Adicionar à timeline Trilha Solar.wav' })).toBeEnabled()
  await expect(page.getByLabel('Reassociar áudio Trilha Solar.wav')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Efeitos sonoros' }).click()
  await expect(library.getByText('Sinal.mp3')).toBeVisible()
})
})

test('biblioteca local funciona na largura de celular', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await expect(library).toBeVisible()
  await library.getByRole('tab', { name: 'Efeitos sonoros' }).click()
  await library.getByLabel('Importar para biblioteca').setInputFiles({ name: 'Efeito.wav', mimeType: 'audio/wav', buffer: wav(660) })
  await expect(library.getByText('Efeito.wav')).toBeVisible()
  await library.getByLabel('Buscar áudio na biblioteca').fill('efeito')
  await expect(library.getByRole('button', { name: 'Adicionar à timeline Efeito.wav' })).toBeVisible()
  const bounds = await library.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('biblioteca-mobile.png') })
})
