import { expect, test, type Locator } from '@playwright/test'
import axe from 'axe-core'
import { writeFile } from 'node:fs/promises'

async function focusEvidence(control: Locator) {
  await control.focus()
  return control.evaluate((element) => {
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const ancestors: Element[] = []
    for (let node = element.parentElement; node; node = node.parentElement) ancestors.unshift(node)
    for (const node of ancestors) { ctx.fillStyle = getComputedStyle(node).backgroundColor; ctx.fillRect(0, 0, 1, 1) }
    const bg = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.outlineColor; ctx.fillRect(0, 0, 1, 1)
    const fg = Array.from(ctx.getImageData(0, 0, 1, 1).data)
    const luminance = (rgb: number[]) => rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const a = luminance(fg.slice(0, 3)), b = luminance(bg)
    const measurable = style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) > 0 && fg[3] === 255 && Number.isFinite(a) && Number.isFinite(b)
    return { tag: element.tagName, name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 70) || element.getAttribute('type') || '', focusVisible: element.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, outlineOffset: style.outlineOffset, boxShadow: style.boxShadow, accentColor: style.accentColor, appearance: style.appearance, foreground: fg, background: bg, ratio: measurable ? (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) : null }
  })
}

for (const width of [390, 1440]) {
  test(`contraste residual, foco e fallback em ${width}px`, async ({ page }, info) => {
    test.setTimeout(90000)
    await page.addInitScript(() => {
      const original = AudioContext.prototype.decodeAudioData
      const gate = { armed: false, ready: false, release: null as (() => void) | null }
      ;(window as typeof window & { residualGate: typeof gate }).residualGate = gate
      AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer) {
        const result = original.call(this, data)
        if (!gate.armed) return result
        return result.then(async (buffer) => { gate.ready = true; await new Promise<void>((resolve) => { gate.release = resolve }); return buffer })
      }
    })
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: width === 390 ? 'light' : 'dark' })
    await page.goto('/lab/video-editor')
    await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
    if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
    const photos = await Promise.all(['red', 'green', 'blue'].map(async (color, index) => ({
      name: `${index + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((fill) => {
        const c = document.createElement('canvas'); c.width = 90; c.height = 160
        const ctx = c.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 90, 160)
        return c.toDataURL().split(',')[1]
      }, color), 'base64'),
    })))
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(photos)
    const sidebar = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
    await sidebar.getByRole('button', { name: 'Áudio', exact: true }).click()
    const rate = 16000, wav = Buffer.alloc(44 + rate * 6 * 2)
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
    await page.getByRole('region', { name: 'Biblioteca de áudio local' }).getByLabel('Importar para biblioteca').setInputFiles({ name: 'silencio.wav', mimeType: 'audio/wav', buffer: wav })
    await expect(page.getByTestId('local-audio-asset')).toHaveCount(1)
    await sidebar.getByRole('button', { name: 'Mídia', exact: true }).click()
    await page.getByText('AutoReels', { exact: true }).click()
    const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
    for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).check()
    await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
    await panel.getByLabel('Duração total (s)').fill('6')
    await panel.getByLabel('Música da biblioteca').selectOption({ label: 'silencio.wav' })
    await page.addScriptTag({ content: axe.source })
    await page.keyboard.press('Tab')
    const controls = panel.locator('button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled])')
    const beforeFocus = []
    for (const control of await controls.all()) { await control.scrollIntoViewIfNeeded(); beforeFocus.push(await focusEvidence(control)) }
    const summaryFocus = await focusEvidence(page.locator('summary').filter({ hasText: 'AutoReels' }))
    await page.screenshot({ path: info.outputPath(`focus-summary-${width}.png`) })
    await page.evaluate(() => { (window as typeof window & { residualGate: { armed: boolean } }).residualGate.armed = true })
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    await expect.poll(() => page.evaluate(() => (window as typeof window & { residualGate: { ready: boolean } }).residualGate.ready)).toBe(true)
    await expect(panel.getByRole('status')).toContainText('Preparando os arquivos')
    await page.keyboard.press('Tab')
    const cancelFocus = await focusEvidence(panel.getByRole('button', { name: 'Cancelar análise' }))
    await panel.getByRole('button', { name: 'Cancelar análise' }).click()
    await expect(panel.getByRole('status')).toContainText('Análise cancelada')
    await page.evaluate(() => { const g = (window as typeof window & { residualGate: { armed: boolean; release: () => void } }).residualGate; g.armed = false; g.release() })
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('Alternativa regular, sem sincronização musical')
    await alert.scrollIntoViewIfNeeded()
    const fallback = await alert.evaluate(async (element) => {
      const a = (window as typeof window & { axe: typeof axe }).axe
      const result = await a.run(element, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return { violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), incomplete: result.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })), passes: result.passes.flatMap((v) => v.nodes.map((n) => n.any[0]?.data)) }
    })
    const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
    await page.keyboard.press('Tab')
    const confirmFocus = await focusEvidence(proposal.getByRole('button', { name: 'Confirmar alternativa regular e inserir ao final' }))
    await page.screenshot({ path: info.outputPath(`focus-confirm-${width}.png`) })
    const cancelProposalFocus = await focusEvidence(proposal.getByRole('button', { name: 'Cancelar proposta' }))
    const evidence = { width, preferredColorScheme: width === 390 ? 'light' : 'dark', fallback, summaryFocus, beforeFocus, cancelFocus, confirmFocus, cancelProposalFocus }
    console.log(`RESIDUAL ${width}: ${JSON.stringify(evidence)}`)
    await writeFile(info.outputPath(`residual-${width}.json`), JSON.stringify(evidence, null, 2))
    expect(fallback.violations).toEqual([])
    expect(fallback.incomplete).toEqual([])
    expect(fallback.passes.some((item) => item?.contrastRatio >= 4.5)).toBe(true)
    for (const item of [summaryFocus, ...beforeFocus, cancelFocus, confirmFocus, cancelProposalFocus]) {
      expect(item.focusVisible, item.name).toBe(true)
      if (item.ratio !== null) expect(item.ratio, item.name).toBeGreaterThanOrEqual(3)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}
