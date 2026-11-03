import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { SavedProject } from '@/lib/video-editor/project-persistence'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'
import { assertExport, probeExport, type ExportFixture } from './video-editor-09gb4-probe'

const palette: Record<string, number[]> = { 'red.png': [224, 16, 16], 'green.png': [16, 224, 16], 'blue.png': [16, 16, 224], 'green.webm': [16, 224, 16], 'yellow.webm': [224, 224, 16], 'tail.png': [64, 16, 64] }
const colors = (name: string) => `rgb(${palette[name].join(',')})`
async function saved(page: Page): Promise<SavedProject> {
  return page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!)!))
}
async function ready(page: Page) { await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 60000 }) }
async function flush(page: Page) { await expect(page.getByRole('status', { name: 'Estado do salvamento' })).toHaveText('Salvo neste navegador') }
async function tool(page: Page, name: string) { await page.getByRole('complementary', { name: 'Biblioteca de mídia' }).getByRole('button', { name, exact: true }).click() }
function wav(name: string, seconds: number, hz: number, pulses: number[] = []) {
  const rate = 16000, count = Math.round(seconds * rate), data = Buffer.alloc(44 + count * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) {
    const time = i / rate
    const pulse = pulses.some((p) => time >= p && time < p + 0.02) ? 0.7 * Math.sin(2 * Math.PI * 3000 * time) : 0
    data.writeInt16LE(Math.round(32767 * ((hz ? 0.1 * Math.sin(2 * Math.PI * hz * time) : 0) + pulse)), 44 + i * 2)
  }
  return { name, mimeType: 'audio/wav', buffer: data }
}
async function photo(page: Page, name: string, width: number, height: number) {
  const base64 = await page.evaluate(({ fill, width, height }) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height
    const ctx = c.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height)
    return c.toDataURL().split(',')[1]
  }, { fill: colors(name), width, height })
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
}
async function source(page: Page, name: string, hz: number, width: number, height: number) {
  const bytes = await page.evaluate(async ({ fill, hz, width, height }) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height
    const paint = () => { const ctx = c.getContext('2d')!; ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height) }; paint()
    const audio = new AudioContext(), dest = audio.createMediaStreamDestination(), osc = audio.createOscillator(), gain = audio.createGain()
    osc.frequency.value = hz; gain.gain.value = 0.2; osc.connect(gain).connect(dest); osc.start()
    const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }), chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 25)
    await new Promise((resolve) => setTimeout(resolve, 2100)); clearInterval(timer); recorder.stop()
    const blob = await done; osc.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { fill: colors(name), hz, width, height })
  return { name, mimeType: 'video/webm', buffer: Buffer.from(bytes) }
}
function timeline(project: SavedProject): ExportFixture['clips'] {
  const entries = [
    ...(project.baseVideo ? [{ id: 'base-video', name: project.baseVideo.name, duration: project.baseTrim.trimEnd - project.baseTrim.trimStart }] : []),
    ...project.extraVideos.map((v) => ({ id: v.id, name: v.media.name, duration: v.trimEnd - v.trimStart })),
    ...[...project.photoSlides].sort((a, b) => a.order - b.order).map((p) => ({ id: p.id, name: p.media.name, duration: p.duration })),
  ].filter((clip) => !project.excludedClipIds.includes(clip.id))
  const ordered = [...project.sequenceOrder.map((id) => entries.find((clip) => clip.id === id)).filter((clip) => clip !== undefined), ...entries.filter((clip) => !project.sequenceOrder.includes(clip.id))]
  let cursor = 0
  return ordered.map((clip) => { const start = cursor; cursor += clip.duration; return { name: clip.name, start, end: cursor, rgb: palette[clip.name], hz: clip.name === 'green.webm' ? 440 : clip.name === 'yellow.webm' ? 660 : 0 } })
}

for (const mode of ['A-horizontal', 'B-vertical', 'C-mista', 'D-fallback'] as const) test(`09G-B.4 ${mode}: MP4 real, cortes, áudio e recarga`, async ({ page }, info) => {
  test.setTimeout(360000); page.setDefaultTimeout(15000)
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
  })
  page.on('console', (message) => { if (message.type() === 'error') console.log('EXPORT_BROWSER_ERROR', message.text()) })
  const mixed = mode === 'B-vertical' || mode === 'C-mista', twoVideos = mode === 'C-mista', silent = mode === 'D-fallback'
  const width = mode === 'B-vertical' ? 90 : 160, height = mode === 'B-vertical' ? 160 : 90
  const format = mode === 'B-vertical' ? '9:16' : '16:9'
  const montageDuration = mode === 'B-vertical' ? 3.5 : 4
  const pulseTimes = silent ? [] : twoVideos ? [1, 1.7, 2.8] : mixed ? [1.2, 2.2, 3] : [1.2, 2.8, 3.6]
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab/video-editor'); await ready(page)
  const videos = []
  if (mixed) videos.push(await source(page, 'green.webm', 440, width, height))
  if (twoVideos) videos.push(await source(page, 'yellow.webm', 660, width, height))
  for (const video of videos) {
    await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(video)
    await writeFile(info.outputPath(video.name), video.buffer)
  }
  const names = mixed ? ['red.png', 'blue.png'] : ['red.png', 'green.png', 'blue.png']
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(await Promise.all(names.map((name) => photo(page, name, width, height))))
  await expect.poll(async () => (await saved(page))?.photoSlides.filter((p) => p.assetId).length).toBe(names.length)
  await flush(page)
  // Existing project fixture pattern: shorten originals to limit render work.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!, project = JSON.parse(localStorage.getItem(key)!)
    if (project.baseVideo) project.baseTrim = { trimStart: 0.2, trimEnd: 1.6 }
    project.extraVideos = project.extraVideos.map((v: object) => ({ ...v, trimStart: 0.2, trimEnd: 1.6 }))
    project.photoSlides = project.photoSlides.map((p: object) => ({ ...p, duration: 1 }))
    project.videoVolume = 0.25
    localStorage.setItem(key, JSON.stringify(project))
  })
  await page.reload(); await ready(page)
  for (const video of videos) await page.getByLabel(`Reassociar ${video.name}`, { exact: true }).setInputFiles(video)
  await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  const start = Number(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max'))
  await tool(page, 'Áudio')
  const library = page.getByRole('region', { name: 'Biblioteca de áudio local' })
  const music = wav('ritmo.wav', montageDuration, silent ? 0 : 880, pulseTimes)
  await writeFile(info.outputPath('source-music.wav'), music.buffer)
  await library.getByLabel('Importar para biblioteca').setInputFiles(music)
  await expect(library.getByTestId('local-audio-asset')).toHaveCount(1)
  await tool(page, 'Mídia'); await page.getByText('AutoReels', { exact: true }).click()
  const panel = page.getByRole('region', { name: 'Montagem AutoReels' })
  const selected = mixed ? twoVideos ? ['red.png', 'green.webm', 'yellow.webm', 'blue.png'] : ['red.png', 'green.webm', 'blue.png'] : names
  for (const name of selected) await panel.getByRole('checkbox', { name }).check()
  await panel.getByLabel('Formato AutoReels').selectOption(format)
  await panel.getByRole('switch', { name: 'Sincronizar cortes com a música' }).check()
  await panel.getByLabel('Duração total (s)').fill(String(montageDuration))
  await panel.getByLabel('Música da biblioteca').selectOption({ label: 'ritmo.wav' })
  await panel.getByRole('button', { name: 'Analisar música e gerar proposta' }).click()
  const proposal = panel.getByRole('region', { name: 'Proposta AutoReels' })
  await expect(proposal).toContainText(silent ? 'Alternativa regular, sem sincronização musical' : 'Proposta sincronizada')
  await info.attach('proposal', { body: await proposal.innerText(), contentType: 'text/plain' })
  await panel.getByRole('button', { name: silent ? 'Confirmar alternativa regular e inserir ao final' : 'Confirmar e inserir ao final', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('Montagem inserida')
  await expect.poll(async () => timeline(await saved(page)).length).toBe(names.length + videos.length + selected.length)
  await flush(page)
  const applied = await saved(page)
  const added = timeline(applied).filter((clip) => clip.start >= start - 1e-6)
  expect(added.map((clip) => clip.name)).toEqual(selected)
  expect(added.at(-1)!.end - start).toBeCloseTo(montageDuration, 6)
  if (mixed) applied.extraVideos.slice(twoVideos ? 1 : 0).forEach((v, i) => expect(v.trimEnd - v.trimStart).toBeCloseTo(twoVideos ? [0.7, 1.1][i] : 1, 6))
  const tail = await photo(page, 'tail.png', width, height)
  await page.getByLabel('Importar mídias', { exact: true }).setInputFiles(tail)
  await expect.poll(async () => (await saved(page)).photoSlides.length).toBe(applied.photoSlides.length + 1)
  await tool(page, 'Áudio')
  await page.getByRole('button', { name: 'Selecionar áudio ritmo.wav', exact: true }).click()
  await page.getByLabel('Volume do áudio ritmo.wav', { exact: true }).fill('0.4')
  if (twoVideos) {
    await page.getByLabel('Fade-in do áudio ritmo.wav', { exact: true }).fill('0.5')
    await page.getByLabel('Fade-out do áudio ritmo.wav', { exact: true }).fill('0.5')
  }
  await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles(wav('mudo.wav', 4, 1760))
  await page.getByRole('button', { name: 'Selecionar áudio mudo.wav', exact: true }).click()
  await page.getByLabel('Início do áudio mudo.wav', { exact: true }).fill(String(start))
  await page.getByRole('button', { name: 'Silenciar áudio mudo.wav', exact: true }).click()
  if (twoVideos) {
    await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles(wav('extra.wav', 1, 1320))
    await page.getByRole('button', { name: 'Selecionar áudio extra.wav', exact: true }).click()
    await page.getByLabel('Início do áudio extra.wav', { exact: true }).fill(String(start + 0.3))
    await page.getByLabel('Volume do áudio extra.wav', { exact: true }).fill('0.3') // 0.1 × 0.3 = 0.03
    await page.getByLabel('Fade-in do áudio extra.wav', { exact: true }).fill('0.2')
    await page.getByLabel('Fade-out do áudio extra.wav', { exact: true }).fill('0.2')
  }
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill(String(Math.round(start * 20) / 20))
  await tool(page, 'Stickers'); await page.getByRole('button', { name: 'Adicionar figurinha Confirmado', exact: true }).click()
  await tool(page, 'Legendas'); await page.getByRole('button', { name: 'Adicionar legenda', exact: true }).click()
  await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('OK')
  await page.getByLabel('Início da legenda', { exact: true }).fill(String(start + 0.4))
  await page.getByLabel('Fim da legenda', { exact: true }).fill(String(start + 1))
  await expect.poll(async () => {
    const value = await saved(page)
    return [value.stickers.length, value.subtitles?.[0]?.text, value.subtitles?.[0]?.endTime, value.audioClips?.length,
      value.audioClips?.[0]?.volume, value.audioClips?.[1]?.muted]
  }).toEqual([1, 'OK', start + 1, twoVideos ? 3 : 2, 0.4, true])
  await flush(page)
  // One-second manual tail tests editing after AutoReels and absence of music looping.
  await page.evaluate(({ width, height }) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!, project = JSON.parse(localStorage.getItem(key)!)
    project.photoSlides.find((p: { media: { name: string } }) => p.media.name === 'tail.png').duration = 1
    // The photo editor's "original" preset retains its initial project size.
    // Use the established saved-project fixture to request a small render, without changing timings.
    project.canvasSize = { width, height }; project.originalCanvasSize = { width, height }; project.aspectPreset = 'original'
    project.stickers = project.stickers.map((s: object) => ({ ...s, x: width / 2, y: height / 2, size: 24 }))
    project.subtitles = project.subtitles.map((s: { style: object }) => ({ ...s, style: { ...s.style, size: 16, outline: 1, animation: 'none' } }))
    localStorage.setItem(key, JSON.stringify(project))
  }, { width, height })
  const beforeReload = await saved(page)
  await page.reload(); await ready(page); await expect(page.getByTestId('missing-project-media')).toHaveCount(0)
  const project = await saved(page)
  for (const key of ['photoSlides', 'extraVideos', 'baseTrim', 'sequenceOrder', 'audioClips', 'subtitles', 'stickers'] as const) expect(project[key]).toEqual(beforeReload[key])
  expect(project.canvasSize).toEqual({ width, height })
  const clips = timeline(project), total = clips.at(-1)!.end
  const fixture: ExportFixture = { mode, width, height, start, montageDuration, total, clips, pulseTimes: silent ? [] : added.slice(0, -1).map((clip) => clip.end - start), silent, fades: twoVideos }
  await writeFile(info.outputPath('fixture.json'), JSON.stringify({ fixture, project, applied }, null, 2))
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 240000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const path = info.outputPath(`${mode}.mp4`); await (await download).saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true); expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const probe = await probeExport(page, bytes, fixture)
  const evidence = { file: path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), fixture, probe }
  await writeFile(info.outputPath('measurements.json'), JSON.stringify(evidence, null, 2))
  console.log('AUTOREELS_09GB4', JSON.stringify(evidence))
  await info.attach('measurements', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
  assertExport(probe, fixture)
})
