import { expect, test } from '@playwright/test'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64')

test('biblioteca distingue arquivo pronto, formato recusado e falha de decodificação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })

  await page.getByLabel('Importar mídias').setInputFiles([
    { name: 'boa.png', mimeType: 'image/png', buffer: pixel },
    { name: 'corrompida.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    { name: 'recusado.txt', mimeType: 'text/plain', buffer: Buffer.from('unsupported') },
  ])

  await expect(page.locator('[data-media-id]').filter({ hasText: 'boa.png' })).toContainText('Pronto')
  await expect(page.locator('[data-import-status="unsupported"]')).toContainText('recusado.txt')
  await expect(page.locator('[data-import-status="error"]')).toContainText('corrompida.png')
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  await expect(page.locator('[data-media-id]').filter({ hasText: 'corrompida.png' })).toHaveCount(0)
})

test('campos numéricos de texto limitam X/Y e ignoram entrada vazia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Importar mídias').setInputFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: pixel })
  await expect(page.locator('[data-clip-id]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Texto', exact: true }).first().click()

  const properties = page.getByLabel('Propriedades contextuais')
  const x = properties.getByLabel('Posição X do texto')
  const y = properties.getByLabel('Posição Y do texto')
  const xMax = Number(await x.getAttribute('max'))
  await x.fill('99999')
  await expect(x).toHaveValue(String(xMax))
  await y.fill('-20')
  await expect(y).toHaveValue('0')
  await x.fill('')
  await x.blur()
  await expect(x).toHaveValue(String(xMax))
  await expect(properties.getByLabel('Conteúdo do texto selecionado')).toBeVisible()
})

test('cancelamento de ponteiro limpa o alvo visual do arraste', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Importar mídias').setInputFiles([
    { name: 'primeira.png', mimeType: 'image/png', buffer: pixel },
    { name: 'segunda.png', mimeType: 'image/png', buffer: pixel },
  ])
  const clips = page.locator('[data-clip-id]')
  await expect(clips).toHaveCount(2)
  const first = (await clips.nth(0).boundingBox())!
  const second = (await clips.nth(1).boundingBox())!
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 8 })
  await expect(clips.nth(1)).toHaveClass(/z-20/)
  await clips.nth(0).dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })
  await expect(clips.nth(1)).not.toHaveClass(/z-20/)
  await page.mouse.up()
})
