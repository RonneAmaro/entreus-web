import { expect, test } from '@playwright/test'

function wav() {
  const samples = 16000, data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  return data
}

for (const width of [1440, 390]) test(`fontes e importação manual em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  if (width === 390) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await library.getByText('Encontrar músicas e efeitos gratuitos').click()
  for (const [name, url] of [['Pixabay Music', 'https://pixabay.com/music/'], ['Pixabay Sound Effects', 'https://pixabay.com/sound-effects/']]) {
    const link = library.getByRole('link', { name })
    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await expect(library.getByText(/confira a licença e as restrições/)).toBeVisible()
  await library.getByLabel('Importar para biblioteca').setInputFiles({ name: 'teste.wav', mimeType: 'audio/wav', buffer: wav() })
  const asset = library.getByTestId('local-audio-asset')
  await expect(asset).toHaveCount(1)
  await asset.getByText('Origem e licença (opcional)').click()
  await asset.getByLabel('Fonte do áudio').fill('Pixabay')
  await asset.getByLabel('Autor ou criador').fill('Criador')
  await asset.getByLabel('Link original').fill('https://pixabay.com/music/example/')
  await asset.getByLabel('Licença ou observação').fill('Conferir restrições')
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)!).audioLibrary?.[0]?.licenseInfo : null
  })).toEqual({ source: 'Pixabay', creator: 'Criador', originalUrl: 'https://pixabay.com/music/example/', license: 'Conferir restrições' })
  const bounds = await library.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  await page.reload()
  if (width === 390) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await asset.getByText('Origem e licença (opcional)').click()
  await expect(asset.getByLabel('Autor ou criador')).toHaveValue('Criador')
})
