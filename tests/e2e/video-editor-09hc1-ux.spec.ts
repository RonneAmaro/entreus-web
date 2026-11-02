import { expect, test } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`AutoReels anuncia resultado e preserva foco após cancelamento em ${width}px`, async ({ page }, info) => {
    await page.addInitScript(() => {
      const original = AudioContext.prototype.decodeAudioData
      const gate = { armed: false, ready: false, release: null as (() => void) | null }
      ;(window as typeof window & { uxDecodeGate: typeof gate }).uxDecodeGate = gate
      AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer) {
        const result = original.call(this, data)
        if (!gate.armed) return result
        return result.then(async (buffer) => {
          gate.ready = true
          await new Promise<void>((resolve) => { gate.release = resolve })
          return buffer
        })
      }
    })
    await page.setViewportSize({ width, height: 900 })
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
    await expect(page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByText('1.png', { exact: true }).first()).toBeVisible()
    const sidebar = page.getByRole('complementary', { name: 'Biblioteca de mídia' })
    await sidebar.getByRole('button', { name: 'Áudio', exact: true }).click()
    const rate = 16000, wav = Buffer.alloc(44 + rate * 6 * 2)
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
    for (const time of [1.5, 3.5, 5]) for (let i = 0; i < 160; i++) wav.writeInt16LE(25000, 44 + (time * rate + i) * 2)
    await page.getByRole('region', { name: 'Biblioteca de áudio local' }).getByLabel('Importar para biblioteca').setInputFiles({ name: 'ritmo.wav', mimeType: 'audio/wav', buffer: wav })
    await expect(page.getByTestId('local-audio-asset')).toHaveCount(1)
    await sidebar.getByRole('button', { name: 'Mídia', exact: true }).click()
    await page.getByText('AutoReels', { exact: true }).click()
    const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
    await expect(panel.getByText('Selecione ao menos uma foto ou vídeo para gerar a proposta.')).toBeVisible()
    const first = panel.getByRole('checkbox', { name: '1.png' })
    await first.focus(); await page.keyboard.press('Space'); await expect(first).toBeChecked()
    const second = panel.getByRole('checkbox', { name: '2.png' })
    await page.keyboard.press('Tab'); await expect(panel.getByRole('button', { name: 'Remover 1.png da seleção', exact: true })).toBeFocused()
    await page.keyboard.press('Tab'); await expect(second).toBeFocused(); await page.keyboard.press('Space'); await expect(second).toBeChecked()
    const third = panel.getByRole('checkbox', { name: '3.png' })
    await page.keyboard.press('Tab'); await expect(panel.getByRole('button', { name: 'Remover 2.png da seleção', exact: true })).toBeFocused()
    await page.keyboard.press('Tab'); await expect(third).toBeFocused(); await page.keyboard.press('Space'); await expect(third).toBeChecked()
    await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
    await expect(panel.getByText('Selecione uma música da biblioteca para analisar o ritmo.')).toBeVisible()
    await panel.getByLabel('Duração total (s)').fill('6')
    await panel.getByLabel('Música da biblioteca').selectOption({ label: 'ritmo.wav' })
    await page.evaluate(() => { (window as typeof window & { uxDecodeGate: { armed: boolean } }).uxDecodeGate.armed = true })
    const generate = panel.getByRole('button', { name: 'Analisar música e gerar proposta' })
    await generate.focus(); await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => (window as typeof window & { uxDecodeGate: { ready: boolean } }).uxDecodeGate.ready)).toBe(true)
    await expect(panel.getByRole('status')).toContainText(/analisando|preparando/i)
    const cancel = panel.getByRole('button', { name: 'Cancelar análise' })
    await expect(cancel).toBeVisible(); await cancel.focus(); await page.keyboard.press('Enter')
    await expect(panel.getByRole('status')).toContainText('Análise cancelada')
    await expect(generate).toBeFocused()
    await page.evaluate(() => {
      const gate = (window as typeof window & { uxDecodeGate: { armed: boolean; release: () => void } }).uxDecodeGate
      gate.armed = false; gate.release()
    })
    await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toHaveCount(0)
    await generate.press('Enter')
    const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
    await expect(proposal).toContainText('Proposta sincronizada')
    await expect(panel.getByRole('status')).toContainText('Proposta pronta para revisão')
    await expect(proposal.getByRole('button', { name: 'Confirmar e inserir ao final' })).toBeVisible()
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath(`autoreels-${width}.png`) })
    const cancelProposal = proposal.getByRole('button', { name: 'Cancelar proposta' })
    await cancelProposal.focus(); await page.keyboard.press('Enter')
    await expect(panel.getByRole('status')).toContainText('Proposta cancelada')
    await expect(generate).toBeFocused()
    await expect(proposal).toHaveCount(0)
  })
}
