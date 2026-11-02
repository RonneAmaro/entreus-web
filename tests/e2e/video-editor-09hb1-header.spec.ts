import { expect, test, type Locator } from '@playwright/test'

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5
}

for (const width of [320, 360, 390, 430, 768, 1440]) {
  test(`cabeçalho responsivo e novo projeto em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: width === 360 ? 'light' : 'dark' })
    await page.goto('/lab/video-editor')
    await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60000 })
    const header = page.locator('section[data-workspace-ready] > header')
    const brand = header.locator(':scope > div').first()
    const status = header.getByRole('status', { name: 'Estado do salvamento' })
    const rename = header.getByRole('button', { name: /^Renomear projeto:/ })
    const newProject = header.getByRole('button', { name: 'Novo projeto' })
    await expect(newProject).toBeEnabled()
    await rename.click()
    await header.getByLabel('Nome do projeto').fill('Projeto de teste responsivo com nome comprido')
    await header.getByLabel('Nome do projeto').press('Enter')
    await expect(status).toContainText(/Salvo neste navegador|Alterações pendentes|Salvando/)
    await page.screenshot({ path: info.outputPath(`header-${width}.png`) })
    const controls = header.locator('button:visible')
    const boxes = await Promise.all((await controls.all()).map(bounds))
    const statusBox = await bounds(status)
    const brandBox = await bounds(brand)
    const headerBox = await bounds(header)
    expect(intersects(brandBox, statusBox), 'marca e estado de salvamento').toBe(false)
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
      expect(box.x).toBeGreaterThanOrEqual(headerBox.x - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1)
      expect(intersects(box, statusBox), `controle ${i} e estado de salvamento`).toBe(false)
      for (let j = 0; j < i; j++) expect(intersects(box, boxes[j]), `controles ${j} e ${i}`).toBe(false)
    }
    expect(statusBox.x).toBeGreaterThanOrEqual(headerBox.x)
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width)
    expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)
    expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    page.once('dialog', (dialog) => dialog.accept())
    await newProject.click()
    await expect(header.getByRole('button', { name: 'Renomear projeto: Novo vídeo' })).toBeVisible()
  })
}
