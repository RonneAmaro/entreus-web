import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

test.setTimeout(240_000)

type Color = 'red' | 'green' | 'yellow'
type Mark = { x: number; y: number; count: number; slope: number; minX: number; maxX: number; minY: number; maxY: number } | null

function scan(pixels: number[], width: number, height: number, color: Color): Mark {
  const points: { x: number; y: number }[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const [r, g, b] = pixels.slice(i, i + 3)
    const hit = color === 'red' ? r > 160 && r > g * 1.6 && r > b * 1.6
      : color === 'green' ? g > 160 && g > r * 1.6 && g > b * 1.6
        : r > 160 && g > 160 && b < 110
    if (hit) points.push({ x, y })
  }
  if (!points.length) return null
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const xx = points.reduce((sum, point) => sum + (point.x - x) ** 2, 0)
  const xy = points.reduce((sum, point) => sum + (point.x - x) * (point.y - y), 0)
  return {
    x, y, count: points.length, slope: xy / Math.max(xx, 1),
    minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)), maxY: Math.max(...points.map((point) => point.y)),
  }
}

async function makeVideo(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const context = canvas.getContext('2d')!
    const paint = () => { context.fillStyle = '#1643c7'; context.fillRect(0, 0, 160, 90) }
    paint()
    const stream = canvas.captureStream(15)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    clearInterval(timer)
    recorder.stop()
    const result = await finished
    stream.getTracks().forEach((track) => track.stop())
    return Array.from(new Uint8Array(await result.arrayBuffer()))
  })
}

async function openEditor(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  const video = await makeVideo(page)
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ name: 'text-base.webm', mimeType: 'video/webm', buffer: Buffer.from(video) })
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Texto' }).click()
}

async function point(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas[width="160"][height="90"]').boundingBox())!
  return { x: box.x + x * box.width / 160, y: box.y + y * box.height / 90 }
}

async function previewMark(page: Page, color: Color): Promise<Mark> {
  const data = await page.locator('canvas[width="160"][height="90"]').evaluate((canvas: HTMLCanvasElement) => ({
    pixels: Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height,
  }))
  return scan(data.pixels, data.width, data.height, color)
}

async function addText(page: Page, color: string, angle: number, start: number, end: number, x: number, y: number, createNew = false) {
  if (createNew) await page.getByRole('button', { name: 'Novo texto', exact: true }).click()
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Conteúdo do texto selecionado').fill('—')
  await properties.getByLabel('Tamanho do texto selecionado').fill('36')
  await properties.getByLabel('Cor do texto nas propriedades').fill(color)
  await properties.getByLabel('Posição X do texto').fill(String(x))
  await properties.getByLabel('Posição Y do texto').fill(String(y))
  await properties.getByLabel('Ângulo do texto selecionado').fill(String(angle))
  await properties.getByLabel('Saída do texto').fill(String(end))
  await properties.getByLabel('Entrada do texto').fill(String(start))
}

test('texto gira com mouse, redimensiona após rotação, arrasta, cancela por toque e preserva histórico', async ({ page }) => {
  await openEditor(page)
  await addText(page, '#ff3030', 0, 0, 2.2, 60, 35)
  const properties = page.getByLabel('Propriedades contextuais')
  const angle = properties.getByLabel('Ângulo do texto selecionado')
  await expect(angle).toHaveValue('0')
  const boxWidth = Number(await properties.getByLabel('Largura da caixa de texto').inputValue())
  const boxHeight = Number(await properties.getByLabel('Altura da caixa de texto').inputValue())
  const center = { x: 60 - 12 + boxWidth / 2, y: 35 - 12 + boxHeight / 2 }
  const start = await point(page, center.x, center.y - boxHeight / 2 - 10.8)
  const finish = await point(page, center.x + 20, center.y - 20)
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(finish.x, finish.y, { steps: 8 }); await page.mouse.up()
  await expect.poll(async () => Number(await angle.inputValue())).toBeGreaterThan(20)
  const rotated = Number(await angle.inputValue())
  await page.getByRole('button', { name: 'Desfazer alteração visual' }).click()
  await expect(angle).toHaveValue('0')
  await page.getByRole('button', { name: 'Refazer alteração visual' }).click()
  await expect.poll(async () => Number(await angle.inputValue())).toBeCloseTo(rotated, 0)
  const mark = await previewMark(page, 'red')
  expect(mark).not.toBeNull()
  const dragStart = await point(page, mark!.x, mark!.y)
  const dragEnd = await point(page, mark!.x + 12, mark!.y + 5)
  await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down()
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 5 }); await page.mouse.up()
  expect(Number(await properties.getByLabel('Posição X do texto').inputValue())).toBeGreaterThan(68)
  await properties.getByLabel('Posição X do texto').fill('50')
  await properties.getByLabel('Posição Y do texto').fill('10')
  await properties.getByLabel('Largura da caixa de texto').fill('70')
  await properties.getByLabel('Altura da caixa de texto').fill('55')
  const fontBefore = Number(await properties.getByLabel('Tamanho do texto selecionado').inputValue())
  const widthBefore = Number(await properties.getByLabel('Largura da caixa de texto').inputValue())
  const radians = Number(await angle.inputValue()) * Math.PI / 180
  const halfWidth = widthBefore / 2
  const halfHeight = 55 / 2
  const corner = { x: 50 - 12 + halfWidth + halfWidth * Math.cos(radians) - halfHeight * Math.sin(radians), y: 10 - 12 + halfHeight + halfWidth * Math.sin(radians) + halfHeight * Math.cos(radians) }
  const resizeStart = await point(page, corner.x, corner.y)
  const resizeFinish = await point(page, corner.x + 12 * Math.cos(radians) - 8 * Math.sin(radians), corner.y + 12 * Math.sin(radians) + 8 * Math.cos(radians))
  await page.mouse.move(resizeStart.x, resizeStart.y); await page.mouse.down()
  await page.mouse.move(resizeFinish.x, resizeFinish.y, { steps: 5 }); await page.mouse.up()
  await expect.poll(async () => Number(await properties.getByLabel('Largura da caixa de texto').inputValue())).toBeGreaterThan(widthBefore)
  await expect(properties.getByLabel('Tamanho do texto selecionado')).toHaveValue(String(fontBefore))
  const beforeCancel = await properties.getByLabel('Posição X do texto').inputValue()
  const markAfterResize = await previewMark(page, 'red')
  expect(markAfterResize).not.toBeNull()
  const cancelStart = await point(page, markAfterResize!.x, markAfterResize!.y)
  const cancelEnd = await point(page, markAfterResize!.x + 10, markAfterResize!.y)
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelStart.x, y: cancelStart.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelEnd.x, y: cancelEnd.y, id: 1 }] })
  await expect.poll(async () => properties.getByLabel('Posição X do texto').inputValue()).not.toBe(beforeCancel)
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect(properties.getByLabel('Posição X do texto')).toHaveValue(beforeCancel)
  await session.detach()
})

test('toque gira o texto e seleção posterior conserva o ângulo', async ({ page }) => {
  await openEditor(page)
  await addText(page, '#ff3030', 0, 0, 2.2, 50, 10)
  const properties = page.getByLabel('Propriedades contextuais')
  const angle = properties.getByLabel('Ângulo do texto selecionado')
  const boxWidth = Number(await properties.getByLabel('Largura da caixa de texto').inputValue())
  const boxHeight = Number(await properties.getByLabel('Altura da caixa de texto').inputValue())
  const center = { x: 50 - 12 + boxWidth / 2, y: 10 - 12 + boxHeight / 2 }
  const start = await point(page, center.x, center.y + boxHeight / 2 + 10.8)
  const finish = await point(page, center.x - 30 - 10.8, center.y)
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: finish.x, y: finish.y, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => Number(await angle.inputValue())).toBeGreaterThan(80)
  const rotated = Number(await angle.inputValue())
  await session.detach()
  const empty = await point(page, 5, 5)
  await page.mouse.click(empty.x, empty.y)
  const mark = await previewMark(page, 'red')
  expect(mark).not.toBeNull()
  const selection = await point(page, mark!.x, mark!.y)
  await page.mouse.click(selection.x, selection.y)
  await expect.poll(async () => Number(await angle.inputValue())).toBeCloseTo(rotated, 0)
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.5')
  await expect.poll(async () => Number(await angle.inputValue())).toBeCloseTo(rotated, 0)
})

test('MP4 real preserva 45°, -45°, 0°, transparência e três janelas temporais', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
  const served = await serveAuditedFfmpegForLocalTest(page)
  await openEditor(page)
  await addText(page, '#ff3030', 45, 0.2, 0.7, 57, 31)
  await addText(page, '#30ff30', -45, 0.9, 1.4, 57, 31, true)
  await addText(page, '#ffff30', 0, 1.6, 2.1, 57, 31, true)
  const timeline = page.getByRole('slider', { name: 'Linha do tempo do video' })
  const samples = [0.1, 0.45, 1.1, 1.8, 2.3]
  const colors: Color[] = ['red', 'green', 'yellow']
  const expected: (Mark | null)[] = []
  for (const [index, time] of samples.entries()) {
    await timeline.fill(String(time))
    expected.push(index > 0 && index < 4 ? await previewMark(page, colors[index - 1]) : null)
  }
  expect(expected.slice(1, 4).every(Boolean)).toBe(true)
  const logs: string[] = []
  const renderPaths: string[] = []
  page.on('console', async (message) => {
    if (message.text().includes('[VideoEditor] Base audio stream:') || message.text().includes('[VideoEditor] Render path:')) {
      console.log(`[render-diagnostic] ${message.text()}`)
      if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text())
    }
    if (!message.text().includes('[VideoEditor] FFmpeg:')) return
    const entry = await message.args()[1]?.evaluate((value) => value?.message)
    logs.push(String(entry))
  })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  expect(renderPaths).toEqual(expect.arrayContaining([expect.stringContaining('primary')]))
  const outputPath = testInfo.outputPath('09d3-three-angles.mp4')
  await download.saveAs(outputPath)
  const bytes = await readFile(outputPath)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(served).toContain('ffmpeg-core.wasm')
  const actual = await page.evaluate(async ({ base64, samples }) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    try {
      const video = document.createElement('video')
      video.muted = true; video.src = url
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!
      const frames = []
      for (const time of samples) {
        video.currentTime = time
        await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
        context.drawImage(video, 0, 0)
        frames.push(Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data))
      }
      return { width: canvas.width, height: canvas.height, frames }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), samples })
  await testInfo.attach('ffmpeg-log', { body: logs.join('\n'), contentType: 'text/plain' })
  expect(actual.width).toBe(160); expect(actual.height).toBe(90)
  for (const color of colors) {
    expect(scan(actual.frames[0], actual.width, actual.height, color)).toBeNull()
    expect(scan(actual.frames[4], actual.width, actual.height, color)).toBeNull()
  }
  const observed = [1, 2, 3].map((index) => scan(actual.frames[index], actual.width, actual.height, colors[index - 1]))
  expect(observed.every(Boolean)).toBe(true)
  await writeFile(testInfo.outputPath('preview-mp4-measurements.json'), JSON.stringify({ expected, observed, logs }, null, 2))
  for (const [index, mark] of observed.entries()) {
    expect(Math.abs(mark!.x - expected[index + 1]!.x)).toBeLessThanOrEqual(3)
    expect(Math.abs(mark!.y - expected[index + 1]!.y)).toBeLessThanOrEqual(3)
  }
  expect(observed[0]!.slope).toBeGreaterThan(0.2)
  expect(observed[1]!.slope).toBeLessThan(-0.2)
  expect(Math.abs(observed[2]!.slope)).toBeLessThan(0.2)
  const corner = (5 * actual.width + 5) * 4
  expect(actual.frames[2][corner + 2]).toBeGreaterThan(actual.frames[2][corner] * 1.5)
})

test('largura quebra duas linhas na prévia e preserva a mesma geometria no MP4 principal', async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ENTREUS_LOCAL_FFMPEG !== '1', 'Requer fixture FFmpeg local auditada.')
  await serveAuditedFfmpegForLocalTest(page)
  await openEditor(page)
  const properties = page.getByLabel('Propriedades contextuais')
  await properties.getByLabel('Conteúdo do texto selecionado').fill('SOL LUA')
  await properties.getByLabel('Tamanho do texto selecionado').fill('20')
  await properties.getByLabel('Cor do texto nas propriedades').fill('#ff3030')
  await properties.getByLabel('Posição X do texto').fill('30')
  await properties.getByLabel('Posição Y do texto').fill('10')
  await properties.getByLabel('Largura da caixa de texto').fill('65')
  await properties.getByLabel('Altura da caixa de texto').fill('70')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.7')
  await expect.poll(async () => (await previewMark(page, 'red'))?.count || 0).toBeGreaterThan(40)
  const narrow = (await previewMark(page, 'red'))!
  await properties.getByLabel('Largura da caixa de texto').fill('120')
  const wide = (await previewMark(page, 'red'))!
  expect(narrow.maxY - narrow.minY).toBeGreaterThan(wide.maxY - wide.minY + 12)
  await properties.getByLabel('Largura da caixa de texto').fill('65')
  const preview = (await previewMark(page, 'red'))!
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('entreus-studio-project-v1:'))!
    const text = JSON.parse(localStorage.getItem(key)!).texts[0]
    return { text: text?.text, width: text?.width, height: text?.height, fontSize: text?.fontSize }
  })).toEqual({ text: 'SOL LUA', width: 65, height: 70, fontSize: 20 })
  const renderPaths: string[] = []
  page.on('console', (message) => { if (message.text().includes('[VideoEditor] Render path:')) renderPaths.push(message.text()) })
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const download = await downloadPromise
  const output = testInfo.outputPath('09d3-wrapped-text.mp4')
  await download.saveAs(output)
  const bytes = await readFile(output)
  expect(bytes.includes(Buffer.from('ftyp'))).toBe(true)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  expect(renderPaths).toEqual(expect.arrayContaining([expect.stringContaining('primary')]))
  const frame = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    try {
      const video = document.createElement('video'); video.muted = true; video.src = url
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')) })
      video.currentTime = 0.7
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0)
      return { width: canvas.width, height: canvas.height, pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) }
    } finally { URL.revokeObjectURL(url) }
  }, bytes.toString('base64'))
  const exported = scan(frame.pixels, frame.width, frame.height, 'red')
  expect(exported).not.toBeNull()
  expect(Math.abs(exported!.minX - preview.minX)).toBeLessThanOrEqual(3)
  expect(Math.abs(exported!.maxX - preview.maxX)).toBeLessThanOrEqual(3)
  expect(Math.abs(exported!.minY - preview.minY)).toBeLessThanOrEqual(3)
  expect(Math.abs(exported!.maxY - preview.maxY)).toBeLessThanOrEqual(3)
  await writeFile(testInfo.outputPath('09d3-wrapped-text-measurements.json'), JSON.stringify({ narrow, wide, preview, exported, renderPaths }, null, 2))
})
