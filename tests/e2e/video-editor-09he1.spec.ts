import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, width = 1366, height = 768) {
  await page.setViewportSize({ width, height })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60000 })
  if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  const files = await page.evaluate(() => ['#086fb8', '#1b8873', '#9554a8'].map((color, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 180)
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px sans-serif'; ctx.fillText(`EntreUS · ${index + 1}`, 24, 100)
    return { name: `cena-${index + 1}.png`, data: canvas.toDataURL().split(',')[1] }
  }))
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'image/png', buffer: Buffer.from(f.data, 'base64') })))
  await expect(page.locator('[data-clip-id]')).toHaveCount(3)
  const library = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  await library.getByText('AutoReels', { exact: true }).click()
  return { library, panel: page.getByRole('region', { name: 'Montagem AutoReels' }), files }
}

test('09H-E.1 galeria, ordenação por arraste e teclado, limpeza e montagem real', async ({ page }) => {
  const { panel } = await setup(page)
  const generate = panel.getByRole('button', { name: 'Gerar proposta', exact: true })
  await expect(generate).toBeDisabled()
  await expect(generate).toHaveAccessibleDescription(/Selecione ao menos/)
  for (const name of ['cena-2.png', 'cena-1.png', 'cena-3.png']) await panel.getByRole('checkbox', { name }).check()
  await expect(panel.locator('img')).toHaveCount(3)
  const order = panel.getByRole('list', { name: 'Ordem da montagem' })
  await expect(order.getByRole('listitem').first()).toContainText('cena-2.png')
  const cards = panel.locator('[data-autoreels-media]')
  await cards.nth(1).dragTo(cards.nth(0))
  await expect(order.getByRole('listitem').first()).toContainText('cena-1.png')
  await panel.getByRole('button', { name: 'Subir foto 3' }).focus(); await page.keyboard.press('Enter')
  await expect(order.getByRole('listitem').nth(1)).toContainText('cena-3.png')
  await panel.getByRole('button', { name: 'Remover cena-2.png da seleção', exact: true }).click()
  await expect(panel.getByRole('checkbox', { name: 'cena-2.png' })).not.toBeChecked()
  await panel.getByRole('button', { name: 'Limpar seleção' }).click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(3)
  await expect(panel.getByRole('checkbox', { checked: true })).toHaveCount(0)
  await panel.getByRole('checkbox', { name: 'cena-1.png' }).check()
  await panel.getByRole('switch').check()
  await expect(panel.getByRole('button', { name: 'Analisar música e gerar proposta' })).toBeDisabled()
  await expect(panel.getByText('Selecione uma música da biblioteca para analisar o ritmo.')).toBeVisible()
  await panel.getByRole('switch').uncheck()
  await generate.click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toBeVisible()
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true }).click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(4)
  await page.getByRole('button', { name: 'Mover clipe para esquerda', exact: true }).last().click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(4)
})

test('09H-E.1 arraste real da biblioteca, reinserção e alternativa por teclado sem duplicação', async ({ page }) => {
  const { library } = await setup(page)
  await library.getByText('AutoReels', { exact: true }).click()
  const sources = library.locator('button[data-media-id]')
  const ids = await sources.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.mediaId!))
  const widths = await page.locator('[data-clip-id]').evaluateAll((els) => Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.clipId, (el as HTMLElement).style.width])))
  await sources.nth(0).dragTo(page.locator(`[data-clip-id="${ids[2]}"]`))
  await expect(page.locator('[data-clip-id]').first()).toHaveAttribute('data-clip-id', ids[1])
  await expect(page.locator('[data-clip-id]').nth(1)).toHaveAttribute('data-clip-id', ids[0])
  await expect(page.locator('[data-clip-id]')).toHaveCount(3)
  await library.getByRole('button', { name: 'Adicionar à timeline: cena-1.png' }).focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-clip-id]').last()).toHaveAttribute('data-clip-id', ids[0])
  await page.getByRole('button', { name: 'Remover clipe da timeline', exact: true }).last().click()
  await expect(page.locator('[data-clip-id]')).toHaveCount(2)
  await sources.nth(0).dragTo(page.locator(`[data-clip-id="${ids[1]}"]`))
  await expect(page.locator('[data-clip-id]')).toHaveCount(3)
  await expect(page.locator('[data-clip-id]').first()).toHaveAttribute('data-clip-id', ids[0])
  await page.locator('[data-editor-timeline]').dispatchEvent('drop')
  await expect(page.locator('[data-clip-id]')).toHaveCount(3)
  expect(await page.locator('[data-clip-id]').evaluateAll((els) => Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.clipId, (el as HTMLElement).style.width])))).toEqual(widths)
  await expect(page.locator('[data-editor-timeline]').getByRole('status')).toContainText('sem duplicação')
})

test('09H-E.1 vídeo mantém proporção e oferece miniatura real e duração', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const paint = () => { const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#086fb8'; ctx.fillRect(0, 0, 160, 90) }; paint()
    const stream = canvas.captureStream(15), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 1800)); clearInterval(timer); recorder.stop()
    const blob = await done; stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles({ name: 'paisagem.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  const frame = await page.getByTestId('editor-preview').locator('[style*="aspect-ratio"]').first().boundingBox()
  expect(frame!.width / frame!.height).toBeCloseTo(160 / 90, 1)
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  await expect(panel.getByRole('checkbox', { name: /paisagem.webm.*Vídeo/ })).toBeVisible()
  await expect.poll(() => panel.locator('video').evaluate((el) => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
})

test('09H-E.1 mídia ausente é explicada e exige reassociação do original', async ({ page }) => {
  const { library, panel, files } = await setup(page)
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key && JSON.parse(localStorage.getItem(key)!).photoSlides.every((slide: { assetId?: string }) => Boolean(slide.assetId))
  })).toBe(true)
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entreus-studio-music-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([project.id, project.photoSlides[0].assetId]); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) } finally { db.close() }
  })
  await page.reload(); await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await library.getByText('AutoReels', { exact: true }).click()
  await expect(panel.getByText(/Arquivos indisponíveis para a montagem: cena-1.png/)).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: 'cena-1.png' })).toHaveCount(0)
  await expect(page.getByLabel('Reassociar cena-1.png')).toHaveCount(1)
  const file = files[0]
  await page.getByLabel('Reassociar cena-1.png').setInputFiles({ name: file.name, mimeType: 'image/png', buffer: Buffer.from(file.data, 'base64') })
  await expect(panel.getByRole('checkbox', { name: 'cena-1.png' })).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
})

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [390, 844]]) {
  test(`09H-E.1 layout ${width}x${height} a 100%`, async ({ page }, info) => {
    const { panel, library } = await setup(page, width, height)
    await panel.getByRole('checkbox', { name: 'cena-1.png' }).check()
    await panel.getByRole('checkbox', { name: 'cena-2.png' }).check()
    await expect(panel.locator('img').first()).toBeVisible()
    await expect(library.getByRole('button', { name: 'Legendas', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1)
    if (width >= 1280) {
      const preview = await page.getByTestId('editor-preview').boundingBox()
      const timeline = await page.locator('[data-editor-timeline]').boundingBox()
      expect(preview!.height).toBeGreaterThan(120); expect(preview!.width).toBeGreaterThan(300)
      const frame = await page.getByTestId('editor-preview').locator('[style*="aspect-ratio"]').first().boundingBox()
      expect(frame!.width / frame!.height).toBeCloseTo(320 / 180, 1)
      expect(timeline!.height).toBeGreaterThan(100)
      expect(timeline!.y + timeline!.height).toBeLessThanOrEqual(height)
      await library.locator('div.overflow-y-auto').evaluate((el) => { el.scrollTop = 0 })
    }
    await page.screenshot({ path: info.outputPath(`editor-${width}x${height}-100pct.png`), fullPage: true })
  })
}
