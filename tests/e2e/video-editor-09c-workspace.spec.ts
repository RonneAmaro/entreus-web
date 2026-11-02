import { expect, test } from '@playwright/test'
import { expectPhotoRecoveryAfterReload } from './video-editor-photo-recovery'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

test('workspace desktop redimensiona, recolhe e restaura o layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles([
    { name: 'primeira.png', mimeType: 'image/png', buffer: pixel },
    { name: 'segunda.png', mimeType: 'image/png', buffer: pixel },
  ])

  const library = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  const properties = page.locator('aside').last()
  const left = page.getByRole('separator', { name: 'Redimensionar biblioteca' })
  const right = page.getByRole('separator', { name: 'Redimensionar propriedades' })
  const timeline = page.getByRole('separator', { name: 'Redimensionar timeline' })
  await expect(right).toBeVisible()
  const initialLibrary = (await library.boundingBox())!.width
  const initialProperties = (await properties.boundingBox())!.width
  const initialTimeline = (await timeline.boundingBox())!.y
  const preview = page.getByTestId('editor-preview').locator('img[alt="primeira.png"]').first().locator('..')
  const previewBox = (await preview.boundingBox())!
  await expect(page.getByLabel('Proporção do projeto')).toHaveValue('original')
  expect(previewBox.width / previewBox.height).toBeCloseTo(1, 1)

  const leftBox = (await left.boundingBox())!
  await page.mouse.move(leftBox.x + 4, leftBox.y + 100)
  await page.mouse.down()
  await page.mouse.move(leftBox.x + 84, leftBox.y + 100, { steps: 5 })
  await page.mouse.up()
  expect((await library.boundingBox())!.width).toBeGreaterThan(initialLibrary + 60)
  expect((await properties.boundingBox())!.width).toBeCloseTo(initialProperties, 0)

  const rightBox = (await right.boundingBox())!
  await page.mouse.move(rightBox.x + 4, rightBox.y + 100)
  await page.mouse.down()
  await page.mouse.move(rightBox.x - 60, rightBox.y + 100, { steps: 5 })
  await page.mouse.up()
  expect((await properties.boundingBox())!.width).toBeGreaterThan(initialProperties + 40)
  const propertiesBox = (await properties.boundingBox())!
  const centerBox = (await page.getByRole('navigation', { name: 'Layout do workspace' }).boundingBox())!
  expect(centerBox.x + centerBox.width).toBeLessThanOrEqual(propertiesBox.x + 10)

  const timelineBox = (await timeline.boundingBox())!
  await page.mouse.move(timelineBox.x + 100, timelineBox.y + 4)
  await page.mouse.down()
  await page.mouse.move(timelineBox.x + 100, timelineBox.y - 75, { steps: 5 })
  await page.mouse.up()
  expect((await timeline.boundingBox())!.y).toBeLessThan(initialTimeline - 50)

  const timelineAfterResize = (await timeline.boundingBox())!.y
  const clip = page.locator('[data-clip-id]').first()
  const clipWidth = (await clip.boundingBox())!.width
  await page.getByRole('slider', { name: 'Zoom horizontal da timeline' }).fill('2')
  expect((await timeline.boundingBox())!.y).toBeCloseTo(timelineAfterResize, 0)
  expect((await clip.boundingBox())!.width).toBeGreaterThan(clipWidth * 1.8)

  await left.focus()
  const widthBeforeKeyboard = (await library.boundingBox())!.width
  await page.keyboard.press('ArrowRight')
  expect((await library.boundingBox())!.width).toBeGreaterThan(widthBeforeKeyboard)

  await page.getByRole('button', { name: 'Recolher biblioteca' }).first().click()
  await expect(library).toBeHidden()
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await expect(library).toBeVisible()
  await page.getByRole('button', { name: 'Recolher propriedades' }).click()
  await expect(properties).toBeHidden()
  await page.getByRole('button', { name: 'Abrir propriedades' }).click()
  await expect(properties).toBeVisible()
  await page.getByRole('button', { name: 'Recolher timeline' }).click()
  await expect(timeline).toBeHidden()
  await page.getByRole('button', { name: 'Abrir timeline' }).click()
  await expect(timeline).toBeVisible()
  await page.getByRole('button', { name: 'Recolher prévia' }).click()
  await page.getByRole('button', { name: 'Abrir prévia' }).click()
  await expectPhotoRecoveryAfterReload(page, ['primeira.png', 'segunda.png'])
  await expect(left).toBeVisible()
  expect((await library.boundingBox())!.width).toBeGreaterThan(initialLibrary + 60)
  await expect(right).toBeVisible()
  expect((await properties.boundingBox())!.width).toBeGreaterThan(initialProperties + 40)
  await page.getByRole('button', { name: 'Restaurar layout padrão' }).click()
  expect((await library.boundingBox())!.width).toBeCloseTo(initialLibrary, 0)
  expect((await properties.boundingBox())!.width).toBeCloseTo(initialProperties, 0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
})

test('workspace mobile abre biblioteca sem comprimir a prévia', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  const library = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  await expect(library).toBeVisible()
  await library.locator('input[accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  await page.getByRole('button', { name: 'Recolher biblioteca' }).click()
  await expect(library).toBeHidden()
  await expect(page.getByRole('button', { name: 'Exportar MP4' })).toBeEnabled()
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toBeVisible()
  const divider = page.getByRole('separator', { name: 'Redimensionar timeline' })
  const dividerBox = (await divider.boundingBox())!
  const touch = await page.context().newCDPSession(page)
  const x = Math.round(dividerBox.x + dividerBox.width / 2)
  const y = Math.round(dividerBox.y + dividerBox.height / 2)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 50 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(280)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
})

test('preferências de tela larga se adaptam em desktop estreito', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('entreus-studio-workspace-v1', JSON.stringify({
      libraryWidth: 480, propertiesWidth: 560, timelineHeight: 650, timelineCustomized: true,
      libraryOpen: true, previewOpen: true, propertiesOpen: true, timelineOpen: true,
    }))
  })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[accept^="image/png"]').setInputFiles({ name: 'estreito.png', mimeType: 'image/png', buffer: pixel })
  await expect(page.getByRole('button', { name: 'Abrir biblioteca' })).toBeVisible()
  await expect(page.getByRole('separator', { name: 'Redimensionar biblioteca' })).toBeHidden()
  const preview = (await page.getByTestId('editor-preview').locator('img[alt="estreito.png"]').first().locator('..').boundingBox())!
  expect(preview.height).toBeGreaterThan(100)
  await expect(page.getByLabel('Proporção do projeto')).toHaveValue('original')
  expect(preview.width / preview.height).toBeCloseTo(1, 1)
  const brand = (await page.locator('header img').first().locator('..').boundingBox())!
  const title = (await page.getByText('Fotos em vídeo', { exact: true }).boundingBox())!
  const exportButton = (await page.getByRole('button', { name: 'Exportar MP4' }).boundingBox())!
  expect(brand.x + brand.width).toBeLessThan(title.x + 2)
  expect(title.x + title.width).toBeLessThan(exportButton.x + 2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
})
