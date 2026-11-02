import { expect, test, type Locator, type Page } from '@playwright/test'
import axe from 'axe-core'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

async function renderedFocus(page: Page, control: Locator, label: string) {
  await page.keyboard.press('Tab')
  await control.scrollIntoViewIfNeeded()
  const rect = (await control.boundingBox())!
  const viewport = page.viewportSize()!
  const x = Math.max(0, Math.floor(rect.x) - 4), y = Math.max(0, Math.floor(rect.y) - 4)
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width) + 4)
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height) + 4)
  const clip = { x, y, width: right - x, height: bottom - y }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  const before = await page.screenshot({ clip, animations: 'disabled' })
  await control.focus()
  const focusVisible = await control.evaluate((el) => el.matches(':focus-visible'))
  const after = await page.screenshot({ clip, animations: 'disabled' })
  const a = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const b = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const luminance = (rgb: number[]) => rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const pairs = new Map<string, { focused: number[]; unfocused: number[]; count: number; edges: Set<string>; ratio: number }>()
  for (let py = 0; py < a.info.height; py++) for (let px = 0; px < a.info.width; px++) {
    const ax = x + px + 0.5, ay = y + py + 0.5
    const edges = [ax < rect.x ? 'left' : '', ax >= rect.x + rect.width ? 'right' : '', ay < rect.y ? 'top' : '', ay >= rect.y + rect.height ? 'bottom' : ''].filter(Boolean)
    if (!edges.length) continue
    const index = (py * a.info.width + px) * 4
    const plain = Array.from(a.data.subarray(index, index + 3)), focused = Array.from(b.data.subarray(index, index + 3))
    if (plain.every((v, i) => v === focused[i])) continue
    const edge = edges[0], nx = px + (edge === 'left' ? -1 : edge === 'right' ? 1 : 0), ny = py + (edge === 'top' ? -1 : edge === 'bottom' ? 1 : 0)
    if (nx < 0 || ny < 0 || nx >= b.info.width || ny >= b.info.height) continue
    const neighborIndex = (ny * b.info.width + nx) * 4
    const adjacent = Array.from(b.data.subarray(neighborIndex, neighborIndex + 3))
    const l1 = luminance(adjacent), l2 = luminance(focused), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const key = `${focused.join(',')}|${adjacent.join(',')}`
    const entry = pairs.get(key) || { focused, unfocused: adjacent, count: 0, edges: new Set<string>(), ratio }
    entry.count++; edges.forEach((edge) => entry.edges.add(edge)); pairs.set(key, entry)
  }
  const candidates = [...pairs.values()].filter((item) => item.count >= 5 && item.edges.size >= 2 && item.ratio >= 3).sort((l, r) => r.count - l.count)
  const best = candidates[0]
  return { label, focusVisible, sampledOutsidePixels: pairs.size, measurement: best ? { focused: best.focused, adjacent: best.unfocused, ratio: Number(best.ratio.toFixed(2)), pixels: best.count, edges: [...best.edges] } : null }
}

for (const width of [390, 1440]) {
  test(`09H-C.3-FINAL amostras renderizadas em ${width}px`, async ({ page }, info) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/lab/video-editor')
    await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
    if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
    const photos = await Promise.all(['red', 'green'].map(async (color, index) => ({
      name: `${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((fill) => {
        const c = document.createElement('canvas'); c.width = 90; c.height = 160
        const ctx = c.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 90, 160)
        return c.toDataURL().split(',')[1]
      }, color), 'base64'),
    })))
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(photos)
    const sidebar = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
    await sidebar.getByRole('button', { name: 'Áudio', exact: true }).click()
    const rate = 16000, wav = Buffer.alloc(44 + rate * 4 * 2)
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
    await page.getByRole('region', { name: 'Biblioteca de áudio local' }).getByLabel('Importar para biblioteca').setInputFiles({ name: 'silencio.wav', mimeType: 'audio/wav', buffer: wav })
    await expect(page.getByTestId('local-audio-asset')).toHaveCount(1)
    await sidebar.getByRole('button', { name: 'Mídia', exact: true }).click()
    const summary = page.locator('summary').filter({ hasText: 'AutoReels' })
    await summary.click()
    const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
    for (const name of ['1.png', '2.png']) await panel.getByRole('checkbox', { name }).check()
    await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
    await panel.getByLabel('Duração total (s)').fill('4')
    const music = panel.getByLabel('Música da biblioteca')
    await music.selectOption({ label: 'silencio.wav' })
    await page.addScriptTag({ content: axe.source })
    await music.scrollIntoViewIfNeeded()
    const musicContrast = await music.evaluate(async (element) => {
      const a = (window as typeof window & { axe: typeof axe }).axe
      const result = await a.run(element, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return { violations: result.violations.map((v) => v.id), incomplete: result.incomplete.map((v) => v.id), passes: result.passes.flatMap((v) => v.nodes.map((n) => n.any[0]?.data)) }
    })
    const items: Array<[string, Locator]> = [
      ['resumo', summary], ['foto selecionada', panel.getByRole('checkbox', { name: '1.png' })],
      ['reordenar', panel.getByRole('button', { name: 'Descer foto 1' })], ['formato', panel.getByLabel('Formato AutoReels')],
      ['sincronização', panel.getByRole('switch', { name: 'Sincronizar cortes com a música' })],
      ['duração', panel.getByLabel('Duração total (s)')], ['música', music],
    ]
    const focus = []
    for (const [name, control] of items) focus.push(await renderedFocus(page, control, name))
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
    await expect(proposal).toContainText('Alternativa regular, sem sincronização musical')
    focus.push(await renderedFocus(page, proposal.getByRole('button', { name: 'Confirmar alternativa regular e inserir ao final' }), 'confirmar fallback'))
    focus.push(await renderedFocus(page, proposal.getByRole('button', { name: 'Cancelar proposta' }), 'cancelar proposta'))
    const evidence = { width, musicContrast, focus }
    console.log(`AMOSTRAS ${width}: ${JSON.stringify(evidence)}`)
    await writeFile(info.outputPath(`focus-pixels-${width}.json`), JSON.stringify(evidence, null, 2))
    expect(musicContrast.violations).toEqual([])
    for (const item of focus) expect(item.focusVisible, item.label).toBe(true)
  })
}
