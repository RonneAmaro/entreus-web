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
async function photos(page: Page) {
  const colors = ['#ee1010', '#10ee10', '#1010ee']
  return Promise.all(colors.map(async (color, i) => ({ name: `${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((color) => {
    const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 90, 160)
    return canvas.toDataURL().split(',')[1]
  }, color), 'base64') })))
}
function wav() {
  const data = Buffer.alloc(44 + 16000 * 4 * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  for (let i = 0; i < 64000; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 8000), 44 + i * 2)
  return data
}
async function setup(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  await expect(panel.getByRole('button', { name: 'Gerar proposta' })).toBeDisabled()
  const files = await photos(page)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files)
  await expect(panel.getByRole('checkbox')).toHaveCount(3)
  await expect.poll(async () => (await saved(page))?.photoSlides.length).toBe(3)
  await expect.poll(async () => (await saved(page))?.photoSlides.every((slide) => Boolean(slide.assetId))).toBe(true)
  return { panel, files }
}

test('09G-A.1 cancela, insere com música, preserva clipes, reproduz, persiste e exporta MP4', async ({ page }, testInfo) => {
  test.setTimeout(360000)
  const { panel } = await setup(page)
  const tools = page.getByRole('toolbar', { name: 'Ferramentas de edição' })
  await tools.getByRole('button', { name: 'Áudio', exact: true }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await library.getByLabel('Importar para biblioteca').setInputFiles({ name: 'trilha.wav', mimeType: 'audio/wav', buffer: wav() })
  await library.getByRole('button', { name: 'Adicionar à timeline trilha.wav' }).click()
  await page.getByRole('button', { name: 'Selecionar áudio trilha.wav', exact: true }).click()
  await page.getByLabel('Volume do áudio trilha.wav').fill('0.2')
  await page.getByLabel('Fade-in do áudio trilha.wav').fill('0.5')
  await tools.getByRole('button', { name: 'Mídia', exact: true }).click()
  await page.getByText('AutoReels', { exact: true }).click()
  await panel.getByRole('checkbox', { name: '3.png' }).check()
  await panel.getByRole('checkbox', { name: '1.png' }).check()
  await panel.getByRole('checkbox', { name: '2.png' }).check()
  await panel.getByLabel('Formato AutoReels').selectOption('9:16')
  await panel.getByLabel('Definir duração').selectOption('total')
  await panel.getByLabel('Duração total (s)').fill('3')
  await panel.getByLabel('Música da biblioteca').selectOption({ label: 'trilha.wav' })
  await expect.poll(async () => (await saved(page)).audioClips?.[0].volume).toBe(0.2)
  const before = await saved(page)
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('3 clipes · 3.00 s · 9:16')
  await panel.getByRole('button', { name: 'Cancelar proposta' }).click()
  const afterCancel = await saved(page)
  for (const key of ['photoSlides', 'sequenceOrder', 'aspectPreset', 'canvasSize', 'audioClips', 'texts', 'stickers', 'subtitles'] as const) expect(afterCancel[key]).toEqual(before[key])
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final' }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved(page)).photoSlides.length).toBe(6)
  const after = await saved(page)
  expect(after.photoSlides.slice(0, 3)).toEqual(before.photoSlides)
  expect(after.sequenceOrder.slice(0, 3)).toEqual(before.sequenceOrder)
  expect(after.photoSlides.slice(3).map((slide) => slide.media.name)).toEqual(['3.png', '1.png', '2.png'])
  expect(after.audioClips?.[0]).toEqual(before.audioClips?.[0])
  expect(after.audioClips?.[1]).toMatchObject({ assetId: after.audioLibrary![0].assetId, startTime: 9, trimEnd: 3, fadeIn: 0, fadeOut: 0 })
  expect(after.aspectPreset).toBe('9:16')
  const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await expect(seek).toHaveAttribute('max', '12')
  await seek.fill('9.2')
  await expect(page.getByTestId('editor-preview').getByRole('img', { name: '3.png', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(9.5)
  await page.getByRole('button', { name: 'Pausar vídeo', exact: true }).click()
  const assetsCount = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result) })
    const records = await new Promise<Array<{ assetId: string }>>((resolve) => { const request = db.transaction('assets').objectStore('assets').getAll(); request.onsuccess = () => resolve(request.result) })
    db.close(); return records.filter((record) => !record.assetId.startsWith('photo-sha256-')).length
  })
  expect(assetsCount).toBe(1)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  await expect(seek).toHaveAttribute('max', '12')
  await seek.fill('10.2')
  await expect(page.getByTestId('editor-preview').getByRole('img', { name: '1.png', exact: true })).toBeVisible()
  expect((await saved(page)).audioClips).toEqual(after.audioClips)
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 240000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise, output = testInfo.outputPath('09ga1-autoreels.mp4')
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.length).toBeGreaterThan(1000)
  const probe = await page.evaluate(async (base64) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }))
    const video = document.createElement('video'); video.src = url; video.muted = true
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = 9.3
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0)
      return { width: canvas.width, height: canvas.height, duration: video.duration, pixel: Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data) }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  expect(probe).toMatchObject({ width: 720, height: 1280 })
  expect(probe.duration).toBeCloseTo(12, 0)
  expect(probe.pixel[2]).toBeGreaterThan(probe.pixel[0] + 100)
})

test('09G-A.1 mobile: ordem, formato horizontal e proposta obsoleta', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  const { panel } = await setup(page, 390)
  await panel.getByRole('checkbox', { name: '1.png' }).check()
  await panel.getByRole('checkbox', { name: '2.png' }).check()
  await panel.getByRole('button', { name: 'Subir foto 2' }).click()
  await expect(panel.getByRole('list', { name: 'Ordem da montagem' }).getByRole('listitem').first()).toContainText('2.png')
  await panel.getByLabel('Formato AutoReels').selectOption('16:9')
  await panel.getByLabel('Duração por imagem (s)').fill('2')
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  // Editing the project outside AutoReels makes the proposal stale.
  await page.getByRole('button', { name: 'Recolher biblioteca', exact: true }).click()
  await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('1:1')
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await expect(panel.getByRole('button', { name: 'Confirmar e inserir ao final' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Gerar proposta' }).click()
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final' }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved(page)).photoSlides.length).toBe(5)
  const project = await saved(page)
  expect(project.photoSlides.slice(3).map((slide) => [slide.media.name, slide.duration])).toEqual([['2.png', 2], ['1.png', 2]])
  expect(project.canvasSize).toEqual({ width: 1280, height: 720 })
  const bounds = await panel.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('09ga1-mobile.png') })
})
