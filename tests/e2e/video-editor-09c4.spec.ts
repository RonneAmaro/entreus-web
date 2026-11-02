import { expect, test, type Page } from '@playwright/test'
test.setTimeout(90_000)

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

async function ready(page: Page) {
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
}

async function addPhoto(page: Page) {
  if (await page.getByLabel('Reassociar foto.png').count()) {
    await page.getByLabel('Reassociar foto.png').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  } else {
    await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  }
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  await page.locator('img[alt="foto.png"]').first().evaluate(async (image: HTMLImageElement) => {
    if (!image.complete) await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom }
    }
    return {
      viewport: innerHeight,
      editor: box('main > section'),
      header: box('main header'),
      library: box('aside[aria-label="Biblioteca de mídia"]'),
      properties: box('aside[aria-label="Propriedades contextuais"]'),
      controls: box('[aria-label="Controles da prévia"]'),
      divider: box('[aria-label="Redimensionar timeline"]'),
      timeline: box('[aria-label="Redimensionar timeline"] + div'),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }
  })
}

test('workspace ocupa a altura útil e timeline ocupa toda a largura em três viewports', async ({ page }, testInfo) => {
  for (const [width, height] of [[1366, 768], [1440, 900], [1280, 620]]) {
    await page.setViewportSize({ width, height })
    await ready(page)
    await addPhoto(page)
    await expect.poll(async () => { const g = await geometry(page); return g.controls!.bottom - g.divider!.y }).toBeLessThanOrEqual(1)
    const measured = await geometry(page)
    console.log(`09C.4 geometry ${width}x${height}`, measured)
    expect(measured.editor!.bottom).toBeGreaterThan(height - 12)
    expect(measured.editor!.bottom).toBeLessThanOrEqual(height)
    expect(measured.header!.height).toBeGreaterThanOrEqual(36)
    expect(measured.library!.bottom).toBeLessThanOrEqual(measured.divider!.y + 1)
    expect(measured.properties!.bottom).toBeLessThanOrEqual(measured.divider!.y + 1)
    expect(measured.timeline!.width).toBeGreaterThan(measured.editor!.width - 3)
    expect(measured.controls!.bottom).toBeLessThanOrEqual(measured.divider!.y + 1)
    expect(measured.timeline!.height).toBeGreaterThan(140)
    expect(measured.divider!.y - measured.header!.bottom).toBeGreaterThan(180)
    expect(measured.documentWidth).toBeLessThanOrEqual(measured.viewportWidth + 2)
    if (height === 768) await page.screenshot({ path: testInfo.outputPath('workspace-1366x768.png') })
  }
})

test('divisória, modos de foco e persistência preservam prévia e timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await ready(page)
  await addPhoto(page)
  const divider = page.getByRole('separator', { name: 'Redimensionar timeline' })
  const timeline = divider.locator('xpath=following-sibling::div[1]')
  const initial = (await timeline.boundingBox())!.height
  const handle = (await divider.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 90, { steps: 8 })
  await page.mouse.up()
  const expanded = (await timeline.boundingBox())!.height
  expect(expanded).toBeGreaterThan(initial + 50)
  const secondHandle = (await divider.boundingBox())!
  await page.mouse.move(secondHandle.x + secondHandle.width / 2, secondHandle.y + secondHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondHandle.x + secondHandle.width / 2, secondHandle.y + 70, { steps: 8 })
  await page.mouse.up()
  expect((await timeline.boundingBox())!.height).toBeLessThan(expanded - 40)
  const beforeFocus = (await timeline.boundingBox())!.height
  await page.getByRole('button', { name: 'Ampliar prévia' }).click()
  expect((await timeline.boundingBox())!.height).toBeLessThan(beforeFocus)
  await page.getByRole('button', { name: 'Ampliar prévia' }).click()
  expect((await timeline.boundingBox())!.height).toBeCloseTo(beforeFocus, 0)
  await page.getByRole('button', { name: 'Ampliar timeline' }).click()
  expect((await timeline.boundingBox())!.height).toBeGreaterThan(beforeFocus + 80)
  await page.getByRole('button', { name: 'Ampliar timeline' }).click()
  expect((await timeline.boundingBox())!.height).toBeCloseTo(beforeFocus, 0)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await addPhoto(page)
  expect((await timeline.boundingBox())!.height).toBeCloseTo(beforeFocus, 0)
  await page.getByRole('button', { name: 'Restaurar layout padrão' }).click()
  expect((await timeline.boundingBox())!.height).toBeCloseTo(initial, 0)
})

test('ferramentas vivem na biblioteca e painel direito acompanha seleção', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await ready(page)
  await addPhoto(page)
  const library = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  const properties = page.getByRole('complementary', { name: 'Propriedades contextuais' })
  await expect(library.getByRole('toolbar', { name: 'Ferramentas de edição' })).toBeVisible()
  await page.locator('[data-clip-id]').first().locator('button').first().click()
  await expect(properties.getByText('Foto selecionada')).toBeVisible()
  await library.getByRole('button', { name: 'Áudio' }).click()
  await expect(library.getByText('Pulso de verão')).toBeVisible()
  await library.getByRole('button', { name: 'Mídia' }).click()
  await page.locator('[data-clip-id]').first().locator('button').first().click()
  await properties.getByRole('button', { name: 'Sem' }).click()
  await properties.getByRole('button', { name: 'Fade' }).click()
  await expect(properties.getByRole('button', { name: 'Fade' })).toHaveAttribute('aria-pressed', 'true')
  const before = (await page.locator('[data-clip-id]').first().boundingBox())!.width
  await page.getByRole('slider', { name: 'Zoom horizontal da timeline' }).fill('2')
  expect((await page.locator('[data-clip-id]').first().boundingBox())!.width).toBeGreaterThan(before * 1.7)
  await page.getByRole('button', { name: 'Recolher biblioteca' }).click()
  await expect(library).toBeHidden()
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await expect(library).toBeVisible()
  await page.getByRole('button', { name: 'Recolher propriedades' }).click()
  await expect(properties).toBeHidden()
  await page.getByRole('button', { name: 'Abrir propriedades' }).click()
  await expect(properties).toBeVisible()
})

test('mobile mantém controles e timeline sem comprimir três colunas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await addPhoto(page)
  await page.getByRole('button', { name: 'Recolher biblioteca' }).click()
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toBeVisible()
  await expect(page.getByRole('separator', { name: 'Redimensionar timeline' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar MP4' })).toBeEnabled()
  const measured = await geometry(page)
  expect(measured.documentWidth).toBeLessThanOrEqual(392)
  expect(measured.timeline!.height).toBeGreaterThan(120)
  expect(measured.editor!.bottom).toBeGreaterThan(832)
})

test('vídeo carregado com texto mantém prévia, contexto e faixa de vídeo', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await ready(page)
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    for (let frame = 0; frame < 16; frame++) {
      context.fillStyle = frame < 8 ? '#2563eb' : '#ef4444'
      context.fillRect(0, 0, 160, 90)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    recorder.stop()
    const blob = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[accept^="video/"]').setInputFiles({ name: 'filme.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name: 'Texto' }).click()
  const properties = page.getByRole('complementary', { name: 'Propriedades contextuais' })
  await expect(properties.getByText('Texto selecionado')).toBeVisible()
  await properties.getByRole('textbox', { name: 'Conteúdo do texto selecionado' }).fill('Texto 09C.4')
  await expect(page.locator('[data-timeline-track]').first()).toContainText('Texto 09C.4')
  await expect.poll(async () => { const g = await geometry(page); return g.controls!.bottom - g.divider!.y }).toBeLessThanOrEqual(1)
  const measured = await geometry(page)
  expect(measured.timeline!.width).toBeGreaterThan(1340)
  expect(measured.controls!.bottom).toBeLessThanOrEqual(measured.divider!.y + 1)
  expect(measured.timeline!.height).toBeGreaterThan(140)
})
