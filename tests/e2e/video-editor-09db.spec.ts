import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(480_000)

async function makeVideo(page: Page, color: string, withAudio: boolean) {
  return Buffer.from(await page.evaluate(async ({ color, withAudio }) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = color; context.fillRect(0, 0, 160, 90) }
    paint()
    const audio = withAudio ? new AudioContext() : null
    const oscillator = audio?.createOscillator()
    const destination = audio?.createMediaStreamDestination()
    if (oscillator && destination) { oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start() }
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...(destination?.stream.getAudioTracks() || [])])
    const recorder = new MediaRecorder(stream, { mimeType: withAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2100))
    clearInterval(timer); recorder.stop(); const blob = await done
    oscillator?.stop(); stream.getTracks().forEach((track) => track.stop()); await audio?.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { color, withAudio }))
}

async function sampleMp4(page: Page, bytes: Buffer, time: number) {
  return page.evaluate(async ({ base64, time }) => {
    const source = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([source], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve() })
      video.currentTime = time
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      const pixel = Array.from(context.getImageData(80, 45, 1, 1).data).slice(0, 3)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let yellow = 0; let yellowMinY = canvas.height; let yellowMaxY = 0; let guideColors = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 90 && data[i] < 170 && data[i + 1] > 170 && data[i + 1] < 235 && data[i + 2] > 220) guideColors++
        if (data[i] > 140 && data[i + 1] > 140 && data[i + 2] < 100) {
          yellow++; const y = Math.floor(i / 4 / canvas.width); yellowMinY = Math.min(yellowMinY, y); yellowMaxY = Math.max(yellowMaxY, y)
        }
      }
      return { width: canvas.width, height: canvas.height, pixel, yellow, yellowHeight: yellow ? yellowMaxY - yellowMinY + 1 : 0, guideColors, duration: video.duration }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), time })
}

test('09D-B: faixas, ordem visual, recarga e quadros MP4 antes e depois da troca', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const base = await makeVideo(page, '#1643c7', true)
  const pip = await makeVideo(page, '#f02020', false)
  const yellow = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 50; canvas.height = 22
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 50, 22)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base-09db.webm', mimeType: 'video/webm', buffer: base })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'pip-09db.webm', mimeType: 'video/webm', buffer: pip })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.3')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.5')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'foto-09db.png', mimeType: 'image/png', buffer: yellow })
  await properties.getByLabel('Entrada da imagem').fill('0.7')
  await properties.getByLabel('Saída da imagem').fill('1.8')
  await page.getByText('Rotacao', { exact: true }).locator('..').locator('input[type="range"]').fill('15')
  console.log('[09DB] image rotation passed')
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Texto' }).click()
  await properties.getByLabel('Conteúdo do texto selecionado').fill('A')
  await properties.getByLabel('Entrada do texto').fill('0.4')
  await properties.getByLabel('Saída do texto').fill('1.7')
  await page.getByRole('button', { name: 'Mostrar camadas' }).click()
  await expect(page.getByLabel('Faixa de vídeos sobrepostos')).toBeVisible()
  await expect(page.getByTestId('timeline-text-layer')).toHaveCount(1)
  const readProject = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!) as { imageOverlays: Array<{ id: string; startTime: number; endTime: number }>; videoOverlays: Array<{ id: string }>; texts: Array<{ id: string }>; visualLayerOrder: string[] }
  })
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const stored = await readProject()
  expect(stored.imageOverlays[0]).toMatchObject({ startTime: 0.7, endTime: 1.8, rotation: 15 })
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.95')
  const previewPixel = () => page.locator('canvas[width="160"][height="90"]').evaluate((element: HTMLCanvasElement) => Array.from(element.getContext('2d')!.getImageData(80, 45, 1, 1).data).slice(0, 3))
  await expect.poll(async () => (await previewPixel())[1]).toBeGreaterThan(150)
  console.log('[09DB] preview photo front passed')
  await serveAuditedFfmpegForLocalTest(page)
  const exportMp4 = async (name: string) => {
    await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
    const downloadPromise = page.waitForEvent('download', { timeout: 240_000 })
    await page.getByRole('button', { name: 'Baixar video' }).click()
    const download = await downloadPromise
    const output = testInfo.outputPath(name)
    await download.saveAs(output)
    await page.getByRole('button', { name: 'Voltar para edicao' }).click({ timeout: 10_000 })
    return readFile(output)
  }
  const first = await exportMp4('09db-photo-front.mp4')
  expect(first.includes(Buffer.from('mp4a'))).toBe(true)
  const before = await sampleMp4(page, first, 0.95)
  expect(before.pixel[0]).toBeGreaterThan(150)
  expect(before.pixel[1]).toBeGreaterThan(150)
  expect(before.yellow).toBeGreaterThan(100)
  expect(before.yellowHeight).toBeGreaterThan(28)
  expect(before.guideColors).toBeLessThan(15)
  const beforeStart = await sampleMp4(page, first, 0.15)
  expect(beforeStart.pixel[2]).toBeGreaterThan(beforeStart.pixel[0])

  await page.getByRole('button', { name: `Vídeo sobreposto pip-09db.webm` }).click({ timeout: 10_000 })
  await properties.getByRole('button', { name: 'Trazer ao topo' }).click({ timeout: 10_000 })
  await expect.poll(async () => (await previewPixel())[1]).toBeLessThan(110)
  await expect.poll(async () => (await readProject()).visualLayerOrder.at(-1)).toBe(stored.videoOverlays[0].id)
  const second = await exportMp4('09db-pip-front.mp4')
  expect(second.includes(Buffer.from('mp4a'))).toBe(true)
  const after = await sampleMp4(page, second, 0.95)
  expect(after.pixel[0]).toBeGreaterThan(140)
  expect(after.pixel[1]).toBeLessThan(110)
  expect(after.guideColors).toBeLessThan(15)
  const afterEnd = await sampleMp4(page, second, 1.7)
  expect(afterEnd.pixel[1]).toBeGreaterThan(140)
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('1:1')
  await page.getByRole('button', { name: 'Enquadramento Fill' }).click()
  const square = await exportMp4('09d11-square-layers-audio.mp4')
  expect(square.includes(Buffer.from('mp4a'))).toBe(true)
  const squareEarly = await sampleMp4(page, square, 0.15)
  const squareLate = await sampleMp4(page, square, 1.7)
  expect(squareEarly).toMatchObject({ width: 1080, height: 1080 })
  expect(squareEarly.pixel[2]).toBeGreaterThan(squareEarly.pixel[0])
  expect(squareLate.yellow).toBeGreaterThan(100)
  expect(squareLate.guideColors).toBeLessThan(100)
  expect((await readProject()).visualLayerOrder.at(-1)).toBe(stored.videoOverlays[0].id)
  await writeFile(testInfo.outputPath('09db-measurements.json'), JSON.stringify({ before, beforeStart, after, afterEnd, squareEarly, squareLate }, null, 2))
  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('3 arquivo(s)')
  expect((await readProject()).visualLayerOrder.at(-1)).toBe(stored.videoOverlays[0].id)
  await expect(page.getByRole('combobox', { name: 'Proporção do projeto' })).toHaveValue('1:1')
  await expect(page.getByRole('button', { name: 'Enquadramento Fill' })).toHaveAttribute('aria-pressed', 'true')
})

test('09D-B: arraste, alças, encaixe, guias e seleção de sobrepostos', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const base = await makeVideo(page, '#1643c7', false)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base-gestos.webm', mimeType: 'video/webm', buffer: base })
  const yellow = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 50; canvas.height = 22
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 50, 22)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'foto-gestos.png', mimeType: 'image/png', buffer: yellow })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Saída da imagem').fill('1')
  await page.getByRole('button', { name: 'Mostrar camadas' }).click()
  const imageClip = page.getByTestId('timeline-image-layer')
  const read = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    return { image: project.imageOverlays[0] as { id: string; x: number; y: number; width: number; height: number; startTime: number; endTime: number }, duration: project.baseTrim.trimEnd as number }
  })
  const drag = async (from: { x: number; y: number }, deltaX: number, deltaY = 0) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down()
    await page.mouse.move(from.x + deltaX, from.y + deltaY, { steps: 5 }); await page.mouse.up()
  }
  const first = (await imageClip.boundingBox())!
  await drag({ x: first.x + first.width / 2, y: first.y + first.height / 2 }, 30)
  await expect.poll(async () => (await read()).image.startTime).toBeCloseTo(0.5, 1)
  expect((await read()).image.endTime - (await read()).image.startTime).toBeCloseTo(1, 1)

  const second = (await imageClip.boundingBox())!
  await drag({ x: second.x + second.width / 2, y: second.y + second.height / 2 }, 30)
  await expect.poll(async () => (await read()).image.endTime).toBeCloseTo((await read()).duration, 1)
  console.log('[09DB] move and snap passed')
  const startHandle = imageClip.locator('button[aria-label="Ajustar entrada de foto-gestos.png"]')
  const startBox = (await startHandle.boundingBox())!
  await drag({ x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 }, 15)
  await expect.poll(async () => (await read()).image.startTime).toBeGreaterThan(1.2)
  const endHandle = imageClip.locator('button[aria-label="Ajustar saida de foto-gestos.png"]')
  const endBox = (await endHandle.boundingBox())!
  await drag({ x: endBox.x + endBox.width / 2, y: endBox.y + endBox.height / 2 }, -15)
  await expect.poll(async () => (await read()).image.endTime).toBeLessThan((await read()).duration - 0.1)
  console.log('[09DB] trim handles passed')
  const beforeCancel = await imageClip.evaluate((element: HTMLElement) => Number.parseFloat(element.style.left))
  for (const cancelMode of ['pointercancel', 'lostcapture'] as const) {
    const clipBox = (await imageClip.boundingBox())!
    await page.mouse.move(clipBox.x + clipBox.width / 2, clipBox.y + clipBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(clipBox.x + clipBox.width / 2 + 12, clipBox.y + clipBox.height / 2, { steps: 4 })
    await expect.poll(async () => imageClip.evaluate((element: HTMLElement) => Number.parseFloat(element.style.left))).toBeGreaterThan(beforeCancel + 5)
    await imageClip.evaluate((element: HTMLElement, mode) => {
      if (mode === 'pointercancel') element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, cancelable: true }))
      else element.releasePointerCapture(1)
    }, cancelMode)
    await page.mouse.up()
    await expect.poll(async () => imageClip.evaluate((element: HTMLElement) => Number.parseFloat(element.style.left))).toBeCloseTo(beforeCancel, 1)
  }
  console.log('[09DB] pointer cancellation passed')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('1.5')
  const canvas = page.locator('canvas[width="160"][height="90"]')
  const image = (await read()).image
  const box = (await canvas.boundingBox())!
  const center = { x: box.x + (image.x + image.width / 2) * box.width / 160, y: box.y + (image.y + image.height / 2) * box.height / 90 }
  await page.mouse.move(center.x, center.y); await page.mouse.down()
  await page.mouse.move(center.x + 1, center.y + 1, { steps: 3 })
  await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.getContext('2d')!.getImageData(80, 0, 1, 1).data[3])).toBeGreaterThan(0)
  await page.mouse.up()
  await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.getContext('2d')!.getImageData(80, 0, 1, 1).data[3])).toBe(0)
  console.log('[09DB] alignment guide passed')
  await expect(properties.getByLabel('Largura da imagem')).toBeVisible()

  const pip = await makeVideo(page, '#f02020', false)
  await page.getByRole('button', { name: 'Adicionar mídia' }).click()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'pip-gestos.webm', mimeType: 'video/webm', buffer: pip })
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('1.55')
  await page.mouse.click(center.x, center.y)
  await expect(properties.getByLabel('Largura da imagem')).toBeVisible()
  await page.getByRole('button', { name: 'Vídeo sobreposto pip-gestos.webm' }).click({ timeout: 10_000 })
  await properties.getByRole('button', { name: 'Trazer ao topo' }).click({ timeout: 10_000 })
  await page.mouse.click(center.x, center.y)
  await expect(properties.getByLabel('Entrada do vídeo sobreposto')).toBeVisible()
})

test('09D-B: duas fotos simultâneas ocupam subfaixas selecionáveis', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const base = await makeVideo(page, '#1643c7', false)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base-subfaixas.webm', mimeType: 'video/webm', buffer: base })
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 30; canvas.height = 15
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 30, 15)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  const importImage = page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last()
  await importImage.setInputFiles({ name: 'foto-a.png', mimeType: 'image/png', buffer: picture })
  await importImage.setInputFiles({ name: 'foto-b.png', mimeType: 'image/png', buffer: picture })
  await page.getByRole('button', { name: 'Mostrar camadas' }).click()
  const clips = page.getByTestId('timeline-image-layer')
  await expect(clips).toHaveCount(2)
  const first = (await clips.nth(0).boundingBox())!
  const second = (await clips.nth(1).boundingBox())!
  expect(second.y - first.y).toBeGreaterThan(25)
  const properties = page.getByLabel('Propriedades contextuais')
  await clips.nth(0).click()
  await expect(properties).toContainText('foto-a.png')
  await clips.nth(1).click()
  await expect(properties).toContainText('foto-b.png')
})
