import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(420_000)
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
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  console.log('[09fa] workspace ready')
  const video = await makeVideo(page, width, height)
  console.log(`[09fa] fixture video ready (${video.length} bytes)`)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: `${width}x${height}.webm`, mimeType: 'video/webm', buffer: video })
  console.log('[09fa] fixture video assigned')
  await expect(page.locator(`canvas[width="${width}"][height="${height}"]`)).toBeVisible()
  console.log('[09fa] fixture metadata loaded')
  return video
}


for (const { width, height } of [{ width: 160, height: 90 }, { width: 90, height: 160 }]) {
test(`stickers importados persistem e exportam com alfa e áudio ${width}x${height}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, width, height)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  const pictures = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(10, 10, 20, 20)
    const encode = async (type: string) => Array.from(new Uint8Array(await (await new Promise<Blob>((resolve) => c.toBlob((blob) => resolve(blob!), type))).arrayBuffer()))
    return { png: await encode('image/png'), webp: await encode('image/webp') }
  })
  for (const [kind, bytes] of Object.entries(pictures)) {
    await page.getByLabel('Importar sticker').setInputFiles({ name: `custom.${kind}`, mimeType: `image/${kind}`, buffer: Buffer.from(bytes) })
    await expect(page.getByAltText('Prévia do sticker')).toBeVisible()
    await page.getByRole('button', { name: 'Adicionar sticker' }).click()
    await expect(page.getByText('Sticker salvo neste navegador.')).toBeVisible()
    const props = page.getByLabel('Propriedades contextuais')
    await props.getByLabel('Tamanho da figurinha').fill('44')
    await props.getByLabel('Rotacao da figurinha').fill('32')
    await props.getByLabel('Opacidade da figurinha nas propriedades').fill('0.65')
    await props.getByLabel('Entrada da figurinha').fill(kind === 'png' ? '0.25' : '1.4')
    await props.getByLabel('Saída da figurinha').fill(kind === 'png' ? '1.3' : '1.8')
  }
  await expect(page.locator('[data-editor-layer-id]')).toHaveCount(2)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('1 arquivo(s)')
  await page.getByLabel(`Reassociar ${width}x${height}.webm`).setInputFiles({ name: `${width}x${height}.webm`, mimeType: 'video/webm', buffer: video })
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await expect(page.getByRole('button', { name: 'Selecionar figurinha custom.png' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Selecionar figurinha custom.webp' })).toBeVisible()
  await expect(page.getByText(/Sticker local ausente/)).toHaveCount(0)
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 360_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const file = await download
  const output = testInfo.outputPath(`custom-stickers-${width}x${height}.mp4`)
  await file.saveAs(output)
  const bytes = await (await import('node:fs/promises')).readFile(output)
  expect(bytes.includes(Buffer.from('avc1'))).toBeTruthy(); expect(bytes.includes(Buffer.from('mp4a'))).toBeTruthy()
  const measured = await page.evaluate(async (base64) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob); const v = document.createElement('video'); v.src = url; v.muted = true
    await new Promise<void>((resolve) => { v.onloadedmetadata = () => resolve() })
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const ctx = c.getContext('2d')!
    const frame = async (time: number) => {
      const seeked = new Promise<void>((resolve) => { v.onseeked = () => resolve() })
      v.currentTime = time; await seeked; ctx.drawImage(v, 0, 0)
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data
      let red = 0, maxRed = 0, minX = c.width, minY = c.height, maxX = 0, maxY = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 120 && pixels[i + 1] < 90 && pixels[i + 2] < 90) {
          red++; maxRed = Math.max(maxRed, pixels[i])
          const x = (i / 4) % c.width, y = Math.floor(i / 4 / c.width)
          minX = Math.min(minX, x); maxX = Math.max(maxX, x)
          minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
      }
      return { red, maxRed, minX, minY, maxX, maxY }
    }
    const before = await frame(0.1), png = await frame(0.7), webp = await frame(1.6), after = await frame(2)
    await frame(0.7)
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data; let red = 0, background = 0
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] > 150 && pixels[i+1] < 90 && pixels[i+2] < 90) red++; if (pixels[i] < 60 && pixels[i+1] < 60 && pixels[i+2] < 80) background++ }
    const audio = new AudioContext(); const decoded = await audio.decodeAudioData(await blob.arrayBuffer()); const samples = decoded.getChannelData(0); let sum = 0
    for (const sample of samples) sum += sample * sample
    await audio.close(); URL.revokeObjectURL(url); return { width: v.videoWidth, height: v.videoHeight, before, png, webp, after, red, background, rms: Math.sqrt(sum / samples.length) }
  }, bytes.toString('base64'))
  console.log('09fa2a measurements', measured)
  expect(measured.red).toBeGreaterThan(20); expect(measured.background).toBeGreaterThan(100); expect(measured.rms).toBeGreaterThan(0.005)
  expect(measured).toMatchObject({ width, height })
  expect(measured.before.red).toBe(0); expect(measured.after.red).toBe(0)
  for (const frame of [measured.png, measured.webp]) {
    expect(frame.red).toBeGreaterThan(300); expect(frame.red).toBeLessThan(600)
    expect(frame.maxRed).toBeGreaterThan(140); expect(frame.maxRed).toBeLessThan(210)
    // A 22px opaque square rotated by 32° spans about 30px, centered on the layer.
    expect(frame.maxX - frame.minX).toBeGreaterThan(24); expect(frame.maxX - frame.minX).toBeLessThan(34)
    expect(frame.maxY - frame.minY).toBeGreaterThan(24); expect(frame.maxY - frame.minY).toBeLessThan(34)
    expect(Math.abs((frame.minX + frame.maxX) / 2 - width / 2)).toBeLessThan(3)
    expect(Math.abs((frame.minY + frame.maxY) / 2 - height / 2)).toBeLessThan(3)
  }
})
}
test('armazenamento isolado, alfa, controles e recuperação de referência ausente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  const bytes = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32
    c.getContext('2d')!.fillRect(8, 8, 16, 16)
    return Array.from(new Uint8Array(await (await new Promise<Blob>((resolve) => c.toBlob((blob) => resolve(blob!)))).arrayBuffer()))
  }))
  await page.getByLabel('Importar sticker').setInputFiles({ name: 'alfa.png', mimeType: 'image/png', buffer: bytes })
  await page.getByRole('button', { name: 'Adicionar sticker' }).click()
  const props = page.getByLabel('Propriedades contextuais')
  await props.getByLabel('Tamanho da figurinha').fill('44')
  await props.getByLabel('Rotacao da figurinha').fill('32')
  await props.getByLabel('Opacidade da figurinha nas propriedades').fill('0.65')
  const canvas = page.locator('canvas[data-editor-preview-surface]')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.58, { steps: 5 })
  await page.mouse.up()
  await props.getByLabel('Entrada da figurinha').fill('0.2')
  await props.getByLabel('Saída da figurinha').fill('1.4')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const stored = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('entreus-studio-stickers-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const read = (projectId: string) => new Promise<{blob: Blob} | undefined>((resolve) => { const r = db.transaction('assets').objectStore('assets').get([projectId, project.stickers[0].customAssetId]); r.onsuccess = () => resolve(r.result) })
    const asset = await read(project.id); const other = await read('another-project')
    const bitmap = await createImageBitmap(asset!.blob); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0)
    const alpha = [ctx.getImageData(0, 0, 1, 1).data[3], ctx.getImageData(16, 16, 1, 1).data[3]]
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([project.id, project.stickers[0].customAssetId]); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); db.close(); bitmap.close()
    return { sticker: project.stickers[0], other: !!other, alpha }
  })
  expect(stored.other).toBe(false); expect(stored.alpha).toEqual([0, 255])
  expect(stored.sticker).toMatchObject({ size: 44, rotation: 32, opacity: 0.65, startTime: 0.2, endTime: 1.4 })
  expect(stored.sticker.x).toBeGreaterThan(80)
  expect(stored.sticker.y).toBeGreaterThan(45)
  await page.reload()
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await expect(page.getByText(/Sticker local ausente/)).toBeVisible()
  await page.getByLabel('Importar sticker').setInputFiles({ name: 'alfa.png', mimeType: 'image/png', buffer: bytes })
  await page.getByRole('button', { name: /^Reassociar / }).click()
  await expect(page.getByText(/Sticker local ausente/)).toHaveCount(0)
})

test('importação rejeita formatos inválidos, animação e limites excedidos sem inserir camada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await importVideo(page, 160, 90)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  const input = page.getByLabel('Importar sticker')
  for (const buffer of [Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
    await input.setInputFiles({ name: 'limit.png', mimeType: 'image/png', buffer })
    await expect(page.getByText('Use uma imagem de até 5 MB.')).toBeVisible()
  }
  const animatedWebp = Buffer.from([82,73,70,70,14,0,0,0,87,69,66,80,86,80,56,88,1,0,0,0,2,0])
  for (const file of [
    { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg></svg>') },
    { name: 'animated.webp', mimeType: 'image/webp', buffer: animatedWebp },
  ]) {
    await input.setInputFiles(file)
    await expect(page.getByText('Use PNG ou WebP estático válido.')).toBeVisible()
  }
  const oversized = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 4097; canvas.height = 1
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await input.setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(oversized) })
  await expect(page.getByText('Dimensões máximas: 4096 × 4096 pixels.')).toBeVisible()
  await expect(page.getByAltText('Prévia do sticker')).toHaveCount(0)
  await expect(page.locator('[data-editor-layer-id]')).toHaveCount(0)
})
