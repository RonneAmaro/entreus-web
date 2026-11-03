import { expect, test } from '@playwright/test'
import { expectPhotoRecoveryAfterReload } from './video-editor-photo-recovery'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

async function timelineHeight(page: import('@playwright/test').Page) {
  return page.getByRole('separator', { name: 'Redimensionar timeline' }).evaluate((divider) => {
    const panel = divider.nextElementSibling as HTMLElement
    return {
      height: panel.getBoundingClientRect().height,
      saved: Number(divider.getAttribute('aria-valuenow')),
      cssHeight: getComputedStyle(panel).height,
      maxHeight: getComputedStyle(panel).maxHeight,
    }
  })
}

test('divisória altera a altura real da timeline no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  const divider = page.getByRole('separator', { name: 'Redimensionar timeline' })
  await divider.evaluate((element) => {
    const counts = { down: 0, move: 0, up: 0 }
    ;(window as typeof window & { timelinePointerCounts?: typeof counts }).timelinePointerCounts = counts
    element.addEventListener('pointerdown', () => counts.down++)
    element.addEventListener('pointermove', () => counts.move++)
    element.addEventListener('pointerup', () => counts.up++)
  })
  const before = await timelineHeight(page)
  const box = (await divider.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 90, { steps: 8 })
  await page.mouse.up()
  const after = await timelineHeight(page)
  const pointerCounts = await page.evaluate(() => (window as typeof window & { timelinePointerCounts?: { down: number; move: number; up: number } }).timelinePointerCounts)
  expect(pointerCounts?.down).toBe(1)
  expect(pointerCounts?.move).toBeGreaterThan(0)
  expect(pointerCounts?.up).toBe(1)
  console.log('desktop timeline resize', before, after, pointerCounts)
  expect(after.height).toBeGreaterThan(before.height + 40)
  await expectPhotoRecoveryAfterReload(page, ['foto.png'])
  expect((await timelineHeight(page)).height).toBeCloseTo(after.height, 0)
})

test('cabeçalho ocupa toda a largura e a timeline cresce e diminui com painéis abertos ou fechados', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })

  const header = page.locator('header').first()
  const library = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
  const properties = page.locator('aside').last()
  const headerBox = (await header.boundingBox())!
  const libraryBox = (await library.boundingBox())!
  const propertiesBox = (await properties.boundingBox())!
  expect(headerBox.height).toBeGreaterThanOrEqual(36)
  expect(headerBox.height).toBeLessThanOrEqual(44)
  expect(headerBox.width).toBeGreaterThan(1300)
  expect(libraryBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)
  expect(propertiesBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)

  const divider = page.getByRole('separator', { name: 'Redimensionar timeline' })
  const drag = async (deltaY: number) => {
    const box = (await divider.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + deltaY, { steps: 8 })
    await page.mouse.up()
  }
  const before = await timelineHeight(page)
  await drag(-85)
  const taller = await timelineHeight(page)
  expect(taller.height).toBeGreaterThan(before.height + 15)
  expect(await divider.evaluate((element) => element.previousElementSibling?.getBoundingClientRect().height || 0)).toBeGreaterThan(100)
  await drag(65)
  const shorter = await timelineHeight(page)
  expect(shorter.height).toBeLessThan(taller.height - 40)

  await page.getByRole('button', { name: 'Recolher biblioteca' }).click()
  await page.getByRole('button', { name: 'Recolher propriedades' }).click()
  const closedBefore = await timelineHeight(page)
  await drag(-40)
  expect((await timelineHeight(page)).height).toBeGreaterThan(closedBefore.height + 20)

  await divider.focus()
  const keyboardBefore = await timelineHeight(page)
  await page.keyboard.press('ArrowDown')
  expect((await timelineHeight(page)).height).toBeLessThan(keyboardBefore.height - 5)
  await page.keyboard.press('ArrowUp')
  expect((await timelineHeight(page)).height).toBeCloseTo(keyboardBefore.height, 0)
})

test('divisória altera a altura real da timeline por toque', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('aside[aria-label="Biblioteca de mídia"] input[multiple][accept^="image/png"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pixel })
  const divider = page.getByRole('separator', { name: 'Redimensionar timeline' })
  const before = await timelineHeight(page)
  const box = (await divider.boundingBox())!
  const session = await page.context().newCDPSession(page)
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 55 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const taller = await timelineHeight(page)
  expect(taller.height).toBeGreaterThan(before.height + 35)
  const moved = (await divider.boundingBox())!
  const movedY = Math.round(moved.y + moved.height / 2)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: movedY }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: movedY + 90 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const shorter = await timelineHeight(page)
  console.log('compact timeline resize', before, taller, shorter)
  expect(shorter.height).toBeLessThan(taller.height - 50)
  await expectPhotoRecoveryAfterReload(page, ['foto.png'])
  expect((await timelineHeight(page)).height).toBeCloseTo(shorter.height, 0)
})
