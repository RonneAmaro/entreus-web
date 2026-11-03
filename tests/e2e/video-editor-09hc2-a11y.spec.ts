import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { writeFile } from 'node:fs/promises'

for (const width of [390, 1440]) {
  test(`AutoReels: nomes, descrições e contraste em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/lab/video-editor')
    await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
    if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
    const image = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 60
      c.getContext('2d')!.fillRect(0, 0, 40, 60)
      return c.toDataURL().split(',')[1]
    }), 'base64')
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: image })
    await page.getByText('AutoReels', { exact: true }).click()
    const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
    await expect(panel.getByRole('checkbox', { name: 'foto.png' })).toBeVisible()
    await expect(panel.getByRole('checkbox', { name: 'foto.png' })).toHaveAccessibleName('foto.png (Foto)')
    await panel.getByRole('checkbox', { name: 'foto.png' }).check()
    await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
    await page.addScriptTag({ content: axe.source })
    const audit = await panel.evaluate(async (element) => {
      const a = (window as typeof window & { axe: typeof axe }).axe
      const result = await a.run(element, { runOnly: { type: 'rule', values: ['color-contrast', 'button-name', 'label', 'aria-required-attr', 'aria-valid-attr-value'] } })
      return { violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })) })), incomplete: result.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })), passed: result.passes.map((v) => v.id), contrast: result.passes.find((v) => v.id === 'color-contrast')?.nodes.map((n) => ({ text: n.html.replace(/<[^>]*>/g, '').slice(0, 80), data: n.any[0]?.data })) }
    })
    await info.attach(`axe-${width}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' })
    console.log(`AXE ${width}: ${JSON.stringify(audit)}`)
    expect(audit.violations).toEqual([])
    const music = panel.getByLabel('Música da biblioteca')
    await expect(music).toHaveAttribute('aria-required', 'true')
    await expect(music).toHaveAccessibleDescription(/música da biblioteca para analisar o ritmo/i)
    await expect(panel.getByLabel('Duração total (s)')).toHaveAccessibleDescription(/eventos rítmicos aproximados/i)
    await expect(panel.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).uncheck()
    await expect(music).not.toHaveAttribute('aria-required', 'true')
    await panel.getByLabel('Definir duração').selectOption('per-photo')
    await expect(panel.getByLabel('Duração por imagem (s)')).toHaveAccessibleDescription(/1 a 8 segundos por foto/i)
    const generate = panel.getByRole('button', { name: 'Gerar proposta' })
    await generate.focus()
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
    await expect(generate).toBeFocused()
    const focus = await generate.evaluate((element) => {
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const ancestry: Element[] = []
      for (let node = element.parentElement; node; node = node.parentElement) ancestry.unshift(node)
      for (const node of ancestry) { ctx.fillStyle = getComputedStyle(node).backgroundColor; ctx.fillRect(0, 0, 1, 1) }
      const bg = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
      const style = getComputedStyle(element)
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.outlineColor; ctx.fillRect(0, 0, 1, 1)
      const fg = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
      const luminance = (rgb: number[]) => rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
      const a = luminance(fg), b = luminance(bg)
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, foreground: fg, background: bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
    })
    expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2)
    expect(focus.style).toBe('solid')
    expect(focus.ratio).toBeGreaterThanOrEqual(3)
    await generate.press('Enter')
    await expect(panel.getByRole('status')).toContainText('Proposta pronta para revisão')
    await expect(generate).toBeFocused()
    const resultAudit = await panel.evaluate(async (element) => {
      const a = (window as typeof window & { axe: typeof axe }).axe
      const result = await a.run(element, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return { violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), incomplete: result.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })), contrast: result.passes.find((v) => v.id === 'color-contrast')?.nodes.map((n) => ({ text: n.html.replace(/<[^>]*>/g, '').slice(0, 80), data: n.any[0]?.data })) }
    })
    expect(resultAudit.violations).toEqual([])
    await panel.getByLabel('Duração por imagem (s)').fill('0')
    await generate.press('Enter')
    await expect(panel.getByRole('status')).toContainText('Configuração de montagem inválida')
    await panel.getByRole('status').scrollIntoViewIfNeeded()
    const errorAudit = await panel.evaluate(async (element) => {
      const a = (window as typeof window & { axe: typeof axe }).axe
      const result = await a.run(element, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return { violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), incomplete: result.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })), contrast: result.passes.find((v) => v.id === 'color-contrast')?.nodes.map((n) => ({ text: n.html.replace(/<[^>]*>/g, '').slice(0, 80), data: n.any[0]?.data })) }
    })
    expect(errorAudit.violations).toEqual([])
    console.log(`CONTRASTE ${width}: ${JSON.stringify({ focus, resultAudit, errorAudit })}`)
    await writeFile(info.outputPath(`contrast-${width}.json`), JSON.stringify({ initial: audit, focus, result: resultAudit, error: errorAudit }, null, 2))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}
