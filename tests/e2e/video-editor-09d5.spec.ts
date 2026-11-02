import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(240_000)

async function makeVideo(page: Page, overlay: boolean, withAudio = false) {
  return page.evaluate(async ({ overlay, withAudio }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => {
      context.fillStyle = '#1643c7'; context.fillRect(0, 0, 160, 90)
      if (overlay) { context.fillStyle = '#ff2020'; context.fillRect(0, 0, 80, 90); context.fillStyle = '#20ff20'; context.fillRect(80, 0, 80, 90) }
    }
    paint()
    const audio = withAudio ? new AudioContext() : null
    const destination = audio?.createMediaStreamDestination()
    const oscillator = audio?.createOscillator()
    if (oscillator && destination && audio) {
      const gain = audio.createGain(); gain.gain.value = 0.25
      oscillator.frequency.value = 440
      oscillator.connect(gain).connect(destination)
      oscillator.start()
    }
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...(destination?.stream.getAudioTracks() || [])])
    const recorder = new MediaRecorder(stream, { mimeType: withAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2200))
    clearInterval(timer)
    recorder.stop()
    const result = await finished
    oscillator?.stop()
    stream.getTracks().forEach((track) => track.stop())
    await audio?.close()
    return Array.from(new Uint8Array(await result.arrayBuffer()))
  }, { overlay, withAudio })
}

test('recarga, nova página, reassociação e MP4 real preservam a composição PiP', async ({ page, context }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer FFmpeg auditado local.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const base = Buffer.from(await makeVideo(page, false, true))
  const upper = Buffer.from(await makeVideo(page, true))
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 30; canvas.height = 12
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 30, 12)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const picture = Buffer.from(imageBase64, 'base64')
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: base })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'superior.webm', mimeType: 'video/webm', buffer: upper })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Rotação do vídeo sobreposto').fill('45')
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.3')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.5')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'amarelo.png', mimeType: 'image/png', buffer: picture })
  const canvas = page.locator('canvas[width="160"][height="90"]')
  const canvasPoint = async (x: number, y: number) => {
    const box = (await canvas.boundingBox())!
    return { x: box.x + x * box.width / 160, y: box.y + y * box.height / 90 }
  }
  await expect(properties.getByLabel('Largura da imagem')).toBeVisible()
  await properties.getByLabel('Largura da imagem').fill('70')
  await properties.getByLabel('Entrada da imagem').fill('0.2')
  await properties.getByLabel('Saída da imagem').fill('1.7')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.8')
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays.length as number
  })).toBe(1)
  const initialPhoto = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0] as { x: number; y: number; width: number; height: number; rotation: number }
  })
  const photoCenter = { x: initialPhoto.x + initialPhoto.width / 2, y: initialPhoto.y + initialPhoto.height / 2 }
  const dragStart = await canvasPoint(photoCenter.x, photoCenter.y)
  const dragEnd = await canvasPoint(photoCenter.x + 12, photoCenter.y + 10)
  await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down()
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 6 }); await page.mouse.up()
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0]?.x as number
  })).toBeGreaterThan(initialPhoto.x + 8)
  const movedPhoto = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0] as { x: number; y: number; width: number; height: number; rotation: number }
  })
  expect(movedPhoto.x - initialPhoto.x).toBeGreaterThan(8)
  expect(movedPhoto.y - initialPhoto.y).toBeGreaterThan(6)
  const movedCenter = { x: movedPhoto.x + movedPhoto.width / 2, y: movedPhoto.y + movedPhoto.height / 2 }
  const rotateStart = await canvasPoint(movedCenter.x, movedCenter.y - movedPhoto.height / 2 - 18)
  const rotateEnd = await canvasPoint(movedCenter.x + 24, movedCenter.y - 24)
  await page.mouse.move(rotateStart.x, rotateStart.y); await page.mouse.down()
  await page.mouse.move(rotateEnd.x, rotateEnd.y, { steps: 6 }); await page.mouse.up()
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0].rotation as number
  })).toBeGreaterThan(20)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Texto' }).click()
  await properties.getByLabel('Conteúdo do texto selecionado').fill('Projeto salvo')
  await properties.getByLabel('Ângulo do texto selecionado').fill('-20')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!)
  })
  expect(stored.videoOverlays[0]).toMatchObject({ rotation: 45, startTime: 0.3, endTime: 1.5 })
  expect(stored.texts[0]).toMatchObject({ text: 'Projeto salvo', rotation: -20 })
  expect(stored.imageOverlays).toHaveLength(1)
  const photo = stored.imageOverlays[0] as { x: number; y: number; width: number; height: number; rotation: number; startTime: number; endTime: number }
  expect(photo.width).toBeCloseTo(70, 0)
  expect(photo.height).toBeCloseTo(28, 0)
  expect(photo.rotation).toBeGreaterThan(20)
  expect(photo.startTime).toBeCloseTo(0.2, 1)
  expect(photo.endTime).toBeCloseTo(1.7, 1)
  expect(JSON.stringify(stored)).not.toContain('blob:')

  await page.reload()
  await expect(page.getByTestId('missing-project-media')).toContainText('3 arquivo(s)')
  await expect(page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first()).toBeDisabled()
  await page.close()
  const reopened = await context.newPage()
  await reopened.setViewportSize({ width: 1440, height: 900 })
  await reopened.goto('/lab/video-editor')
  await expect(reopened.getByTestId('missing-project-media')).toContainText('3 arquivo(s)')
  const restoredPhoto = await reopened.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).imageOverlays[0] as { x: number; y: number; width: number; height: number; rotation: number; startTime: number; endTime: number }
  })
  for (const field of ['x', 'y', 'width', 'height', 'rotation', 'startTime', 'endTime'] as const) {
    expect(Math.abs(restoredPhoto[field] - photo[field])).toBeLessThanOrEqual(0.01)
  }
  await reopened.getByLabel('Reassociar base.webm').setInputFiles({ name: 'base.webm', mimeType: 'video/webm', buffer: base })
  await reopened.getByLabel('Reassociar superior.webm').setInputFiles({ name: 'superior.webm', mimeType: 'video/webm', buffer: upper })
  await expect(reopened.getByTestId('missing-project-media')).toContainText('1 arquivo(s)')
  await reopened.getByLabel('Reassociar amarelo.png').setInputFiles({ name: 'outro.png', mimeType: 'image/png', buffer: picture })
  await expect(reopened.getByTestId('missing-project-media')).toContainText('1 arquivo(s)')
  await expect(reopened.getByText(/não conferem/)).toBeVisible()
  await reopened.getByLabel('Reassociar amarelo.png').setInputFiles({ name: 'amarelo.png', mimeType: 'image/png', buffer: picture })
  await expect(reopened.getByTestId('missing-project-media')).toHaveCount(0)
  await reopened.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.8')
  await expect(reopened.locator('video.pointer-events-none.absolute')).toHaveCSS('transform', /matrix/)
  await expect(reopened.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first()).toBeEnabled()
  await reopened.getByRole('button', { name: 'Renomear projeto: base' }).click()
  await reopened.getByRole('textbox', { name: 'Nome do projeto' }).fill('Projeto reaberto')
  await reopened.getByRole('textbox', { name: 'Nome do projeto' }).press('Enter')
  await expect(reopened.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await serveAuditedFfmpegForLocalTest(reopened)
  const renderPaths: string[] = []
  reopened.on('console', (message) => { if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text()) })
  await reopened.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = reopened.waitForEvent('download', { timeout: 180_000 })
  await reopened.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const output = testInfo.outputPath('09d5-restored.mp4')
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  expect(renderPaths).toHaveLength(1)
  const decoded = await reopened.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
    const video = document.createElement('video')
    video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve() })
      video.currentTime = 0.8
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let green = 0, yellow = 0, yellowX = 0, yellowY = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 1] > 140 && pixels[index] < 100) green++
        if (pixels[index] > 150 && pixels[index + 1] > 150 && pixels[index + 2] < 110) {
          yellow++; yellowX += (index / 4) % canvas.width; yellowY += Math.floor(index / 4 / canvas.width)
        }
      }
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, green, yellow, yellowCenter: { x: yellowX / yellow, y: yellowY / yellow } }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  expect(decoded).toMatchObject({ width: 160, height: 90 })
  expect(decoded.duration).toBeGreaterThan(1.8)
  expect(decoded.green).toBeGreaterThan(100)
  expect(decoded.yellow).toBeGreaterThan(30)
  expect(Math.abs(decoded.yellowCenter.x - (photo.x + photo.width / 2))).toBeLessThanOrEqual(8)
  expect(Math.abs(decoded.yellowCenter.y - (photo.y + photo.height / 2))).toBeLessThanOrEqual(8)
  await writeFile(testInfo.outputPath('09d5-restored-measurements.json'), JSON.stringify({ ...decoded, renderPaths, photo }, null, 2))
  await reopened.reload()
  await expect(reopened.getByRole('button', { name: 'Renomear projeto: Projeto reaberto' })).toBeVisible()
  await expect(reopened.getByTestId('missing-project-media')).toContainText('3 arquivo(s)')
})

test('falha de armazenamento mostra erro e mantém o último projeto válido', async ({ page }) => {
  await page.goto('/lab/video-editor')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const previous = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const value = localStorage.getItem(key)!
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, next) {
      if (name === key) throw new Error('QuotaExceededError')
      return original.call(this, name, next)
    }
    return value
  })
  await page.getByRole('button', { name: 'Renomear projeto: Novo vídeo' }).click()
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill('Falha simulada')
  await page.getByRole('textbox', { name: 'Nome do projeto' }).press('Enter')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Erro ao salvar')
  expect(await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return localStorage.getItem(key)
  })).toBe(previous)
})

test('novo projeto exige confirmação antes de substituir o documento salvo', async ({ page }) => {
  await page.goto('/lab/video-editor')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const read = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!) as { id: string; name: string }
  })
  const original = await read()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  expect(await read()).toEqual(original)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await expect.poll(async () => (await read()).id).not.toBe(original.id)
  expect((await read()).name).toBe('Novo vídeo')
})

test('importação de gravação local não substitui projeto recuperado sem confirmação', async ({ page }) => {
  await page.goto('/lab/video-editor')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await page.getByRole('button', { name: 'Renomear projeto: Novo vídeo' }).click()
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill('Edição anterior')
  await page.getByRole('textbox', { name: 'Nome do projeto' }).press('Enter')
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await page.evaluate(async () => {
    const request = indexedDB.open('entreus-lab-video-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' })
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm' })
    const transaction = db.transaction('drafts', 'readwrite')
    transaction.objectStore('drafts').put({ id: 'lab-video-draft:screen-recorder', source: 'screen-recorder', name: 'gravacao.webm', type: 'video/webm', size: blob.size, updatedAt: Date.now(), blob })
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    db.close()
  })
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.goto('/lab/video-editor?source=screen-recorder')
  await expect(page.getByText('A edição anterior foi mantida.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Renomear projeto: Edição anterior' })).toBeVisible()
  const preserved = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const request = indexedDB.open('entreus-lab-video-drafts', 1)
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result) })
    const get = db.transaction('drafts', 'readonly').objectStore('drafts').get('lab-video-draft:screen-recorder')
    const record = await new Promise<unknown>((resolve) => { get.onsuccess = () => resolve(get.result) })
    db.close()
    return { name: JSON.parse(localStorage.getItem(key)!).name, draft: Boolean(record) }
  })
  expect(preserved).toEqual({ name: 'Edição anterior', draft: true })
})
