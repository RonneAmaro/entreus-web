import { expect, test, type Page } from '@playwright/test'
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


test('referência compartilhada sobrevive remoção, desfazer, refazer e recarga', async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = [], revoked: string[] = []
    const originalCreate = URL.createObjectURL.bind(URL), originalRevoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => { const url = originalCreate(blob); if (blob instanceof Blob && blob.type === 'image/png') created.push(url); return url }
    URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url) }
    Object.assign(window, { stickerUrlAudit: { created, revoked } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  const video = await importVideo(page, 160, 90)
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
    canvas.getContext('2d')!.fillRect(8, 8, 16, 16)
    return Array.from(new Uint8Array(await (await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))).arrayBuffer()))
  }))
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await page.getByLabel('Importar sticker').setInputFiles({ name: 'compartilhado.png', mimeType: 'image/png', buffer: bytes })
  await page.getByRole('button', { name: 'Adicionar sticker' }).click()
  await expect(page.getByRole('button', { name: 'Selecionar figurinha compartilhado.png' })).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!).stickers.length : 0
  })).toBe(1)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  const ids = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    project.stickers.push({ ...project.stickers[0], id: crypto.randomUUID(), x: project.stickers[0].x + 10 })
    localStorage.setItem(key, JSON.stringify(project))
    return { project: project.id, asset: project.stickers[0].customAssetId }
  })
  await page.reload()
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  const layers = page.getByRole('button', { name: 'Selecionar figurinha compartilhado.png' })
  await expect(layers).toHaveCount(2)
  await layers.first().click()
  await page.getByRole('button', { name: 'Remover figurinha selecionada' }).click()
  await expect(layers).toHaveCount(1)
  const countAsset = () => page.evaluate(async ({ project, asset }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('entreus-studio-stickers-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const found = await new Promise<boolean>((resolve, reject) => { const r = db.transaction('assets').objectStore('assets').get([project, asset]); r.onsuccess = () => resolve(!!r.result); r.onerror = () => reject(r.error) })
    db.close(); return found
  }, ids)
  expect(await countAsset()).toBe(true)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(layers).toHaveCount(2)
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect(layers).toHaveCount(1)
  expect(await countAsset()).toBe(true)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(layers).toHaveCount(2)
  await layers.first().click(); await page.getByRole('button', { name: 'Remover figurinha selecionada' }).click()
  await layers.first().click(); await page.getByRole('button', { name: 'Remover figurinha selecionada' }).click()
  await expect(layers).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const audit = (window as unknown as { stickerUrlAudit: { created: string[]; revoked: string[] } }).stickerUrlAudit
    return audit.created.filter((url) => !audit.revoked.includes(url)).length
  })).toBe(0)
  expect(await countAsset()).toBe(true)
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(layers).toHaveCount(1)
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await page.reload()
  await page.getByLabel('Reassociar 160x90.webm').setInputFiles({ name: '160x90.webm', mimeType: 'video/webm', buffer: video })
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await expect(layers).toHaveCount(1)
  await expect(page.getByText(/Sticker local ausente/)).toHaveCount(0)
  expect(await countAsset()).toBe(true)
})
test('trocar de projeto cancela prévia em preparação e limpa histórico', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await importVideo(page, 160, 90)
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
    canvas.getContext('2d')!.fillRect(0, 0, 20, 20)
    return Array.from(new Uint8Array(await (await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))).arrayBuffer()))
  }))
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await page.getByLabel('Importar sticker').setInputFiles({ name: 'anterior.png', mimeType: 'image/png', buffer: bytes })
  await page.getByRole('button', { name: 'Adicionar sticker' }).click()
  await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador')
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      return original.call(this, (blob) => { Object.assign(window, { releaseStickerPreview: () => callback(blob) }) }, ...args)
    }
  })
  await page.getByLabel('Importar sticker').setInputFiles({ name: 'pendente.png', mimeType: 'image/png', buffer: bytes })
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseStickerPreview?: unknown }).releaseStickerPreview)).toBe('function')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await page.evaluate(() => (window as unknown as { releaseStickerPreview: () => void }).releaseStickerPreview())
  await expect(page.getByRole('button', { name: 'Desfazer alteração visual' })).toBeDisabled()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
  await expect(page.getByAltText('Prévia do sticker')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Selecionar figurinha anterior.png' })).toHaveCount(0)
})
