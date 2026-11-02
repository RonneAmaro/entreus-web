import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

async function makeVideo(page: Page, color = '#1643c7') {
  return Buffer.from(await page.evaluate(async (fill) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = fill; context.fillRect(0, 0, 160, 90) }
    paint()
    const stream = canvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2100))
    clearInterval(timer); recorder.stop(); const blob = await done
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, color))
}

async function addBase(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'base-atalhos.webm', mimeType: 'video/webm', buffer: await makeVideo(page) })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
}

async function readProject(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!) as {
      imageOverlays: Array<{ id: string; x: number; y: number; startTime: number; endTime: number }>;
      videoOverlays: Array<{ id: string; x: number; y: number }>;
      texts: Array<{ id: string; text: string; x: number; y: number }>;
      extraVideos: Array<{ id: string }>;
      excludedClipIds: string[];
    }
  })
}

test('09D-B.1: ajuda, foco, navegação e ajuste preciso de foto, texto e PiP', async ({ page }) => {
  await addBase(page)
  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 32, 18)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'foto-atalhos.png', mimeType: 'image/png', buffer: picture })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Entrada da imagem').fill('0.2')
  await properties.getByLabel('Saída da imagem').fill('1.9')
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Texto' }).click()
  const textField = properties.getByLabel('Conteúdo do texto selecionado')
  await textField.fill('Camada A')
  await properties.getByLabel('Entrada do texto').fill('0.2')
  await properties.getByLabel('Saída do texto').fill('1.9')
  await page.getByRole('button', { name: 'Adicionar mídia' }).click()
  await page.getByLabel('Adicionar vídeo sobreposto').setInputFiles({ name: 'pip-atalhos.webm', mimeType: 'video/webm', buffer: await makeVideo(page, '#f02020') })
  await properties.getByLabel('Entrada do vídeo sobreposto').fill('0.2')
  await properties.getByLabel('Saída do vídeo sobreposto').fill('1.9')
  await page.getByRole('button', { name: 'Mostrar camadas' }).click()

  const helpButton = page.getByRole('button', { name: 'Ajuda de atalhos' })
  await helpButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Atalhos do Studio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fechar ajuda de atalhos' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Atalhos do Studio' })).toHaveCount(0)
  await expect(helpButton).toBeFocused()
  const timeline = page.getByRole('region', { name: /Timeline do vídeo/ })
  await timeline.focus()
  await expect(timeline).toBeFocused()
  await page.keyboard.press('Shift+/')
  await expect(page.getByRole('dialog', { name: 'Atalhos do Studio' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(timeline).toBeFocused()

  await page.getByTestId('timeline-text-layer').click()
  await textField.focus()
  await textField.press('End')
  await textField.press('s')
  await textField.press('Backspace')
  await textField.press('?')
  await expect(page.getByRole('dialog', { name: 'Atalhos do Studio' })).toHaveCount(0)
  expect((await readProject(page)).texts).toHaveLength(1)
  expect((await readProject(page)).extraVideos).toHaveLength(0)
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.8')
  await timeline.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toHaveValue('0.9')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toHaveValue('1.9')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('slider', { name: 'Linha do tempo do video' })).toHaveValue('1.8')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowUp')
  const selected = page.locator('[data-editor-layer-id][aria-pressed="true"]')
  await expect(selected).toHaveCount(1)
  await expect(properties).toContainText('pip-atalhos.webm')
  await page.keyboard.press('ArrowUp')
  await expect(selected).toHaveCount(1)
  await expect(properties).toContainText('foto-atalhos.png')

  const canvas = page.locator('canvas[data-editor-preview-surface]')
  await canvas.focus()
  await expect(canvas).toBeFocused()
  const before = (await readProject(page)).imageOverlays[0]
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readProject(page)).imageOverlays[0].x).toBe(before.x + 1)
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => (await readProject(page)).imageOverlays[0].x).toBe(before.x + 11)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await readProject(page)).imageOverlays[0].y).toBe(before.y + 1)
  await timeline.focus()
  await page.keyboard.press('ArrowDown')
  await expect(properties).toContainText('pip-atalhos.webm')
  const beforePip = (await readProject(page)).videoOverlays[0]
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readProject(page)).videoOverlays[0].x).toBe(beforePip.x + 1)
  await page.getByTestId('timeline-text-layer').click()
  const beforeText = (await readProject(page)).texts[0]
  await canvas.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await readProject(page)).texts[0].y).toBe(beforeText.y + 1)
  await page.reload()
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  expect((await readProject(page)).imageOverlays[0]).toMatchObject({ id: before.id, x: before.x + 11, y: before.y + 1 })
  expect((await readProject(page)).videoOverlays[0]).toMatchObject({ id: beforePip.id, x: beforePip.x + 1 })
  expect((await readProject(page)).texts[0]).toMatchObject({ id: beforeText.id, y: beforeText.y + 1 })
})

test('09D-B.1: Espaço, S e Delete respeitam a seleção e o campo editável', async ({ page }) => {
  await addBase(page)
  const canvas = page.locator('canvas[data-editor-preview-surface]')
  await canvas.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pausar vídeo' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Reproduzir vídeo' })).toBeVisible()
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.8')
  await canvas.focus()
  await page.keyboard.press('s')
  await expect.poll(async () => (await readProject(page)).extraVideos.length).toBe(1)
  expect((await readProject(page)).excludedClipIds).toHaveLength(0)
  const trimHandle = page.getByRole('slider', { name: 'Aparar início do clipe' })
  const initialTrim = await trimHandle.getAttribute('aria-valuenow')
  const trimBox = (await trimHandle.boundingBox())!
  await page.mouse.move(trimBox.x + trimBox.width / 2, trimBox.y + trimBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(trimBox.x + trimBox.width / 2 + 12, trimBox.y + trimBox.height / 2, { steps: 4 })
  await expect(trimHandle).not.toHaveAttribute('aria-valuenow', initialTrim!)
  await page.keyboard.press('Escape')
  await expect(trimHandle).toHaveAttribute('aria-valuenow', initialTrim!)
  await page.mouse.up()
  const playhead = page.getByRole('slider', { name: 'Linha do tempo do video' })
  const initialTime = await playhead.inputValue()
  const ruler = page.getByRole('slider', { name: 'Régua temporal' })
  const rulerBox = (await ruler.boundingBox())!
  await page.mouse.move(rulerBox.x + 15, rulerBox.y + rulerBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rulerBox.x + 75, rulerBox.y + rulerBox.height / 2, { steps: 4 })
  await expect(playhead).not.toHaveValue(initialTime)
  await page.keyboard.press('Escape')
  await expect(playhead).toHaveValue(initialTime)
  await page.mouse.up()

  const picture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 30; canvas.height = 15
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffff00'; context.fillRect(0, 0, 30, 15)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  await page.locator('input[accept="image/*,.png,.jpg,.jpeg,.webp"]').last().setInputFiles({ name: 'excluir-atalhos.png', mimeType: 'image/png', buffer: picture })
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Entrada da imagem').fill('0.1')
  await properties.getByLabel('Saída da imagem').fill('1.9')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('1.1')
  await canvas.focus()
  await page.keyboard.press('s')
  expect((await readProject(page)).extraVideos).toHaveLength(1)
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await readProject(page)).imageOverlays.length).toBe(0)
  expect((await readProject(page)).extraVideos).toHaveLength(1)
  expect((await readProject(page)).excludedClipIds).toHaveLength(0)
})
