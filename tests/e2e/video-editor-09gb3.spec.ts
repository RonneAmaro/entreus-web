import { expect, test, type Page } from '@playwright/test'
import type { SavedProject } from '@/lib/video-editor/project-persistence'

async function saved(page: Page): Promise<SavedProject> {
  return page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!)!))
}
function wav(silence = false) {
  const rate = 16000, data = Buffer.alloc(44 + rate * 6 * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  if (!silence) for (const time of [1.5, 3.5, 5]) for (let i = 0; i < 160; i++) data.writeInt16LE(25000, 44 + (time * rate + i) * 2)
  return { name: 'pulsos.wav', mimeType: 'audio/wav', buffer: data }
}
async function openPanel(page: Page, width = 1440) {
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name: 'Mídia', exact: true }).click()
  if (width < 1280 && !await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByText('AutoReels', { exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByText('AutoReels', { exact: true }).click()
  return page.getByRole('region', { name: 'Montagem AutoReels' })
}
async function setup(page: Page, width = 1440, silence = false, mixed = false) {
  test.setTimeout(180000)
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60000 })
  if (width < 1280) await page.getByRole('button', { name: 'Abrir biblioteca' }).click()
  if (mixed) {
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
      const paint = () => { const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'purple'; ctx.fillRect(0, 0, 160, 90) }; paint()
      const stream = canvas.captureStream(15), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks: Blob[] = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
      recorder.start(); const timer = setInterval(paint, 40)
      await new Promise((resolve) => setTimeout(resolve, 1800)); clearInterval(timer); recorder.stop()
      const blob = await done; stream.getTracks().forEach((track) => track.stop())
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    })
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles({ name: 'trecho.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
    await expect.poll(async () => (await saved(page))?.baseVideoDuration).toBeGreaterThan(1.5)
  }
  const files = await Promise.all(['red', 'green', 'blue'].map(async (fill, i) => ({
    name: `${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((color) => {
      const c = document.createElement('canvas'); c.width = 90; c.height = 160
      const ctx = c.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 90, 160)
      return c.toDataURL().split(',')[1]
    }, fill), 'base64'),
  })))
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(files)
  await expect.poll(async () => (await saved(page))?.photoSlides.length).toBe(3)
  await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name: 'Áudio', exact: true }).click()
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  await library.getByLabel('Importar para biblioteca').setInputFiles(wav(silence))
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(1)
  await expect.poll(async () => (await saved(page))?.audioLibrary?.some((asset) => asset.media.name === 'pulsos.wav' && Boolean(asset.assetId))).toBe(true)
  const panel = await openPanel(page, width)
  for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).check()
  await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
  await panel.getByLabel('Duração total (s)').fill('6')
  await panel.getByLabel('Música da biblioteca').selectOption({ label: 'pulsos.wav' })
  return panel
}

test('09G-B.3 worker Next real: pulsos, inserção única, reprodução e recuperação', async ({ page }, info) => {
  const panel = await setup(page)
  const before = await saved(page)
  const workerPromise = page.waitForEvent('worker', { timeout: 20000 })
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  const worker = await workerPromise
  expect(worker.url()).toContain('/_next/')
  const response = await page.request.get(worker.url())
  expect(response.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  await info.attach('worker-url', { body: worker.url(), contentType: 'text/plain' })
  const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
  await expect(proposal).toContainText('Proposta sincronizada', { timeout: 30000 })
  await expect(proposal.getByLabel('Tempos da montagem')).toContainText('1.png: 0.000–1.500')
  // Dispatch twice in the same turn; the editor's synchronous lock must win.
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved(page)).photoSlides.length).toBe(6)
  const after = await saved(page)
  expect(after.photoSlides.slice(0, 3)).toEqual(before.photoSlides)
  expect(after.photoSlides.slice(3).map((p) => p.duration)).toEqual([1.5, 2, 2.5])
  expect(after.audioClips).toHaveLength(1)
  expect(after.audioClips![0]).toMatchObject({ startTime: 9, trimEnd: 6, volume: 0.45, muted: false, fadeIn: 0, fadeOut: 0 })
  const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await seek.fill('9.2'); await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(9.4)
  await page.getByRole('button', { name: 'Pausar vídeo', exact: true }).click()
  await page.reload(); await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  expect((await saved(page)).photoSlides.slice(3).map((p) => p.duration)).toEqual([1.5, 2, 2.5])
})

test('09G-B.3 sequência mista preserva recorte canônico do vídeo', async ({ page }) => {
  const panel = await setup(page, 1440, false, true)
  for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).uncheck()
  await panel.getByRole('checkbox', { name: 'trecho.webm' }).check()
  await panel.getByRole('checkbox', { name: '1.png' }).check()
  await panel.getByRole('checkbox', { name: '2.png' }).check()
  await panel.getByLabel('Duração total (s)').fill('5.5')
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('recorte 0.000–1.500')
  await panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => (await saved(page)).extraVideos.length).toBe(1)
  const project = await saved(page)
  expect(project.extraVideos[0]).toMatchObject({ trimStart: 0, trimEnd: 1.5 })
  expect(project.photoSlides.slice(3).map((p) => p.duration)).toEqual([2, 2])
  await page.reload(); await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  expect((await saved(page)).extraVideos[0].trimEnd).toBe(1.5)
})

test('09G-B.3 mobile: silêncio oferece alternativa regular explícita', async ({ page }, info) => {
  const panel = await setup(page, 390, true)
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('Alternativa regular, sem sincronização musical')
  expect((await saved(page)).photoSlides).toHaveLength(3)
  const bounds = await panel.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('rhythm-mobile.png') })
  await panel.getByRole('button', { name: 'Confirmar alternativa regular e inserir ao final' }).click()
  await expect.poll(async () => (await saved(page)).photoSlides.length).toBe(6)
  expect((await saved(page)).photoSlides.slice(3).map((p) => p.duration)).toEqual([2, 2, 2])
})

test('09G-B.3 cancelamento após resposta do worker, resultado tardio e revisão obsoleta', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const state = { received: false, terminated: false, worker: null as Worker | null, data: null as unknown }
    ;(window as typeof window & { rhythmGate: typeof state }).rhythmGate = state
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (options?.name === 'entreus-rhythm') {
          state.worker = this
          this.addEventListener('message', (event) => {
            if (!state.received) { state.received = true; state.data = event.data; event.stopImmediatePropagation() }
          }, true)
        }
      }
      terminate() { if (state.worker === this) state.terminated = true; return super.terminate() }
    }
  })
  const panel = await setup(page)
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { rhythmGate: { received: boolean } }).rhythmGate.received)).toBe(true)
  await panel.getByRole('button', { name: 'Cancelar análise' }).click()
  await expect(panel.getByRole('status')).toContainText('Análise cancelada')
  expect(await page.evaluate(() => (window as typeof window & { rhythmGate: { terminated: boolean } }).rhythmGate.terminated)).toBe(true)
  await page.evaluate(() => {
    const gate = (window as typeof window & { rhythmGate: { worker: Worker; data: unknown } }).rhythmGate
    gate.worker.dispatchEvent(new MessageEvent('message', { data: gate.data }))
  })
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toHaveCount(0)
  expect((await saved(page)).photoSlides).toHaveLength(3)
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('Proposta sincronizada')
  const format = page.getByLabel('Proporção do projeto')
  await format.selectOption(await format.inputValue() === '16:9' ? '9:16' : '16:9')
  await expect(panel.getByRole('button', { name: 'Confirmar e inserir ao final', exact: true })).toBeDisabled()
  await expect(panel).toContainText('O projeto mudou')
  expect((await saved(page)).photoSlides).toHaveLength(3)
})

test.describe('cancelamento antes de iniciar o worker', () => {
  test('09G-B.3 cancela durante a decodificação e permite nova análise', async ({ page }) => {
    await page.addInitScript(() => {
      const original = AudioContext.prototype.decodeAudioData
      const state = { armed: false, received: false, release: null as (() => void) | null }
      ;(window as typeof window & { decodeGate: typeof state }).decodeGate = state
      AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer) {
        const result = original.call(this, data)
        if (!state.armed) return result
        return result.then(async (decoded) => {
          state.received = true
          await new Promise<void>((resolve) => { state.release = resolve })
          return decoded
        })
      }
    })
    const panel = await setup(page)
    await page.evaluate(() => { (window as typeof window & { decodeGate: { armed: boolean } }).decodeGate.armed = true })
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    await expect.poll(() => page.evaluate(() => (window as typeof window & { decodeGate: { received: boolean } }).decodeGate.received)).toBe(true)
    await panel.getByRole('button', { name: 'Cancelar análise' }).click()
    await expect(panel.getByRole('status')).toContainText('Análise cancelada')
    await page.evaluate(() => {
      const gate = (window as typeof window & { decodeGate: { armed: boolean; release: () => void } }).decodeGate
      gate.armed = false; gate.release()
    })
    await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toHaveCount(0)
    expect((await saved(page)).photoSlides).toHaveLength(3)
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    await expect(panel.getByRole('region', { name: 'Proposta AutoReels' })).toContainText('Proposta sincronizada')
  })
})

test('09G-B.3 arquivo ausente ou inválido e limites de duração/tamanho', async ({ page }) => {
  let panel = await setup(page)
  const original = await saved(page)
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete([project.id, project.audioLibrary![0].assetId]); tx.oncomplete = () => resolve() }); db.close()
  }, original)
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('status')).toContainText('ausente ou alterado')
  // Restore the same IndexedDB key with corrupt bytes; verification must reject it.
  await page.evaluate(async (project) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put({ projectId: project.id, assetId: project.audioLibrary![0].assetId, file: new File(['bad'], 'pulsos.wav', { type: 'audio/wav' }) }); tx.oncomplete = () => resolve() }); db.close()
  }, original)
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  await expect(panel.getByRole('status')).toContainText('ausente ou alterado')
  for (const limit of ['duration', 'size']) {
    await page.evaluate(({ project, limit }) => {
      if (limit === 'duration') project.audioLibrary![0].duration = 61
      else project.audioLibrary![0].media.size = 11 * 1024 * 1024
      localStorage.setItem(Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!, JSON.stringify(project))
    }, { project: structuredClone(original), limit })
    // Add a valid stored file so restoration offers the music in the selector.
    const payload = wav()
    await page.evaluate(async ({ project, bytes, limit }) => {
      const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('entreus-studio-music-v1'); r.onsuccess = () => resolve(r.result) })
      await new Promise<void>((resolve) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put({ projectId: project.id, assetId: project.audioLibrary![0].assetId, file: new File([limit === 'size' ? new Uint8Array(11 * 1024 * 1024) : new Uint8Array(bytes)], 'pulsos.wav', { type: 'audio/wav' }) }); tx.oncomplete = () => resolve() }); db.close()
    }, { project: original, bytes: Array.from(payload.buffer), limit })
    await page.reload(); await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
    panel = await openPanel(page)
    for (const name of ['1.png', '2.png', '3.png']) await panel.getByRole('checkbox', { name }).check()
    await panel.getByRole('switch').check(); await panel.getByLabel('Duração total (s)').fill('6')
    await panel.getByLabel('Música da biblioteca').selectOption({ label: 'pulsos.wav' })
    await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
    await expect(panel.getByRole('status')).toContainText('60 segundos e 10 MiB')
  }
})
