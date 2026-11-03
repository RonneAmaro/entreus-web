import { expect, test, type Page } from '@playwright/test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { serveAuditedFfmpegForLocalTest } from './ffmpeg-local-fixture'

function wav(frequency: number) {
  const rate = 16000, samples = rate * 4, data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * 9000), 44 + i * 2)
  return data
}

async function setup(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/lab/video-editor')
  await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
  const buffer = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!, audio = new AudioContext(), dest = audio.createMediaStreamDestination()
    const oscillator = audio.createOscillator(), gain = audio.createGain()
    oscillator.frequency.value = 440; gain.gain.value = 0.2; oscillator.connect(gain).connect(dest); oscillator.start()
    const paint = () => { ctx.fillStyle = '#181020'; ctx.fillRect(0, 0, 160, 90) }; paint()
    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }), chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(); const timer = setInterval(paint, 40)
    await new Promise((resolve) => setTimeout(resolve, 4200))
    clearInterval(timer); recorder.stop(); const blob = await finished
    oscillator.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  const file = { name: 'multi-base.webm', mimeType: 'video/webm', buffer }
  await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles(file)
  await expect(page.locator('canvas[width="160"][height="90"]')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  return file
}

test('exclusão e troca de projeto encerram fontes com fades', async ({ page }) => {
  await setup(page)
  await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles([
    { name: 'remover.wav', mimeType: 'audio/wav', buffer: wav(880) },
    { name: 'manter.wav', mimeType: 'audio/wav', buffer: wav(1320) },
  ])
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  await page.getByRole('button', { name: 'Selecionar áudio remover.wav', exact: true }).click()
  await page.getByLabel('Fade-in do áudio remover.wav').fill('1')
  await page.getByRole('slider', { name: 'Linha do tempo do video' }).fill('0.5')
  await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
  const audio = page.locator('audio[data-audio-clip-id]')
  const removed = (await audio.nth(0).elementHandle())!, remaining = (await audio.nth(1).elementHandle())!
  await expect.poll(() => removed.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false)
  await page.getByRole('button', { name: 'Excluir áudio remover.wav', exact: true }).click()
  await expect.poll(() => removed.evaluate((a: HTMLAudioElement) => [a.paused, a.hasAttribute('src')])).toEqual([true, false])
  await expect(audio).toHaveCount(1)
  await expect.poll(() => remaining.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  await expect(audio).toHaveCount(0)
  await expect.poll(() => remaining.evaluate((a: HTMLAudioElement) => [a.paused, a.hasAttribute('src')])).toEqual([true, false])
})

for (const mode of ['vídeo', 'fotos vertical', 'sequência'] as const) {
  test(`fades: ${mode}, prévia, persistência e MP4 medido`, async ({ page }, testInfo) => {
    test.setTimeout(300000)
    let video: Awaited<ReturnType<typeof setup>> | undefined
    if (mode !== 'fotos vertical') {
      video = await setup(page)
      if (mode === 'sequência') {
        await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ ...video, name: 'second.webm' })
        await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max'))).toBeGreaterThan(7)
      }
    } else {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto('/lab/video-editor')
      await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible()
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#181020'; ctx.fillRect(0, 0, 90, 160)
        return canvas.toDataURL('image/png').split(',')[1]
      })
      await page.locator('input[type="file"][accept="image/png,image/jpeg,.png,.jpg,.jpeg"]').first().setInputFiles({ name: 'vertical.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
      await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('original')
      await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
    }
    const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
    const duration = Number(await seek.getAttribute('max'))
    if (mode === 'sequência') expect(duration).toBeGreaterThan(7)
    await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles([
      { name: 'entrada.wav', mimeType: 'audio/wav', buffer: wav(880) },
      { name: 'saida.wav', mimeType: 'audio/wav', buffer: wav(1320) },
      { name: 'mudo.wav', mimeType: 'audio/wav', buffer: wav(1760) },
    ])
    await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(3)
    await page.getByRole('button', { name: 'Selecionar áudio entrada.wav', exact: true }).click()
    await page.getByLabel('Início do áudio entrada.wav').fill('0.4')
    await page.getByLabel('Duração do áudio entrada.wav').fill('3.5')
    await page.getByLabel('Volume do áudio entrada.wav').fill('0.4')
    await page.getByLabel('Fade-in do áudio entrada.wav').fill('1.2')
    await page.getByLabel('Fade-out do áudio entrada.wav').fill('1.2')
    const length = Math.min(3.5, duration - 0.4)
    await page.getByRole('button', { name: 'Selecionar áudio saida.wav', exact: true }).click()
    await page.getByLabel('Início do áudio saida.wav').fill('0.7')
    await page.getByLabel('Duração do áudio saida.wav').fill('2')
    await page.getByLabel('Volume do áudio saida.wav').fill('0.2')
    await page.getByLabel('Fade-in do áudio saida.wav').fill('0.3')
    await page.getByLabel('Fade-out do áudio saida.wav').fill('0.8')
    await page.getByRole('button', { name: 'Silenciar áudio mudo.wav', exact: true }).click()
    if (mode !== 'fotos vertical') await page.getByRole('slider', { name: 'Volume do vídeo' }).fill('0.25')
    const audios = page.locator('audio[data-audio-clip-id]')
    await seek.fill('1')
    await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.2, 2)
    await expect.poll(() => audios.nth(1).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.2, 2)
    await expect.poll(() => audios.nth(2).evaluate((a: HTMLAudioElement) => a.volume)).toBe(0)
    await page.getByRole('button', { name: 'Reproduzir vídeo', exact: true }).click()
    const observations = await page.evaluate(async () => {
      const rows: Array<{ time: number; volumes: number[]; playing: boolean[] }> = []
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const audio = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-audio-clip-id]'))
          rows.push({ time: Number(document.querySelector<HTMLInputElement>('[aria-label="Linha do tempo do video"]')!.value), volumes: audio.map((a) => a.volume), playing: audio.map((a) => !a.paused) })
        }, 40)
        setTimeout(() => { clearInterval(timer); resolve() }, 500)
      })
      return rows
    })
    expect(observations.some((row) => row.playing[0] && row.playing[1] && row.volumes[0] > 0.2)).toBe(true)
    await page.getByRole('button', { name: 'Pausar vídeo', exact: true }).click()
    await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
    await seek.fill(String(0.4 + length - 0.3))
    await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.1, 2)
    await testInfo.attach('previa-fades', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' })
    if (mode === 'vídeo') {
      await expect.poll(() => page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('entreus-studio-project-v1:'))!
        return JSON.parse(localStorage.getItem(key)!).audioClips?.[0]?.fadeOut
      })).toBe(1.2)
      await page.reload()
      await page.getByLabel('Reassociar multi-base.webm').setInputFiles(video!)
      await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
      await page.getByRole('button', { name: 'Selecionar áudio entrada.wav', exact: true }).click()
      await expect(page.getByLabel('Fade-in do áudio entrada.wav')).toHaveValue('1.2')
      await expect(page.getByLabel('Fade-out do áudio entrada.wav')).toHaveValue('1.2')
      await page.getByLabel('Fade-in do áudio entrada.wav').press('ArrowUp')
      await expect(page.getByLabel('Fade-in do áudio entrada.wav')).toHaveValue('1.3')
      await page.getByLabel('Fade-in do áudio entrada.wav').fill('0')
      await seek.fill('1')
      await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.4, 2)
      await page.getByLabel('Fade-in do áudio entrada.wav').fill('1.2')
      await page.getByRole('button', { name: 'Silenciar áudio entrada.wav', exact: true }).click()
      await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.volume)).toBe(0)
      await page.getByRole('button', { name: 'Ativar áudio entrada.wav', exact: true }).click()
      await expect.poll(() => audios.nth(0).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.2, 2)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Abrir biblioteca', exact: true }).click()
      await page.getByLabel('Fade-in do áudio entrada.wav').scrollIntoViewIfNeeded()
      const bounds = await page.getByLabel('Fade-in do áudio entrada.wav').boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
      await page.screenshot({ path: testInfo.outputPath('fades-mobile.png') })
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
    await page.getByRole('button', { name: 'Adicionar figurinha Confirmado', exact: true }).click()
    await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
    await page.getByRole('button', { name: 'Adicionar legenda' }).click()
    await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('FADE ÁUDIO')
    await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0.2')
    await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('1.6')
    await serveAuditedFfmpegForLocalTest(page)
    await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
    const download = page.waitForEvent('download', { timeout: 180000 })
    await page.getByRole('button', { name: 'Baixar video' }).click()
    const path = testInfo.outputPath('fades.mp4'); await (await download).saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
    expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
    const measured = await page.evaluate(async ({ base64, length }) => {
      const context = new AudioContext(), data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const decoded = await context.decodeAudioData(data.buffer), pcm = decoded.getChannelData(0), rate = decoded.sampleRate
      const tone = (hz: number, center: number) => {
        const n = Math.floor(rate * 0.08), start = Math.floor(rate * (center - 0.04)); let re = 0, im = 0
        for (let i = 0; i < n; i++) { re += pcm[start + i] * Math.cos(2 * Math.PI * hz * i / rate); im += pcm[start + i] * Math.sin(2 * Math.PI * hz * i / rate) }
        return 2 * Math.hypot(re, im) / n
      }
      const times = [0.55, 0.85, 1.2, 1.7, 0.4 + length - 0.7, 0.4 + length - 0.3]
      const result = { duration: decoded.duration, times, first: times.map((t) => tone(880, t)), second: [0.78, 1.15, 1.7, 2.15, 2.55].map((t) => tone(1320, t)), original: [1.1, 2.2].map((t) => tone(440, t)), muted: tone(1760, 1.4) }
      await context.close(); return result
    }, { base64: bytes.toString('base64'), length })
    console.log('FADE_MP4', mode, JSON.stringify(measured))
    await testInfo.attach('medicoes-fades', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' })
    expect(measured.first[0]).toBeLessThan(measured.first[1])
    expect(measured.first[1]).toBeLessThan(measured.first[2])
    expect(measured.first[2]).toBeLessThan(measured.first[3])
    expect(measured.first[3]).toBeGreaterThan(0.05)
    expect(measured.first[4]).toBeGreaterThan(measured.first[5] * 1.5)
    expect(measured.first[5] / measured.first[3]).toBeGreaterThan(0.12)
    expect(measured.first[5] / measured.first[3]).toBeLessThan(0.4)
    expect(measured.second[0]).toBeLessThan(measured.second[1] * 0.6)
    expect(measured.second[2]).toBeGreaterThan(measured.second[3])
    expect(measured.second[3]).toBeGreaterThan(measured.second[4] * 2)
    expect(measured.muted).toBeLessThan(0.003)
    if (mode !== 'fotos vertical') for (const original of measured.original) expect(original).toBeGreaterThan(0.025)
  })
}

test('verificação dos quadros dos MP4s já exportados', async ({ page }, testInfo) => {
  const root = '.local-cache/09fb3a-results'
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('fades.mp4'))
  expect(files).toHaveLength(3)
  await page.goto('/lab/video-editor')
  const results = []
  for (const file of files) {
    const bytes = await readFile(join(root, file))
    const measured = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const video = document.createElement('video'), url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
      try {
        video.muted = true
        await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')); video.src = url })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')!
        const bright = async (time: number) => {
          await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = time })
          ctx.drawImage(video, 0, 0)
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let count = 0
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] > 180) count++
          return count
        }
        return { width: video.videoWidth, height: video.videoHeight, beforeSubtitle: await bright(0.05), subtitle: await bright(1) }
      } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
    }, bytes.toString('base64'))
    results.push({ file, ...measured })
    expect(measured.beforeSubtitle).toBeGreaterThan(0)
    expect(measured.subtitle).toBeGreaterThan(measured.beforeSubtitle + 20)
  }
  expect(results.filter((r) => r.height > r.width)).toHaveLength(1)
  expect(results.filter((r) => r.width > r.height)).toHaveLength(2)
  console.log('FADE_VIDEO_FRAMES', JSON.stringify(results))
  await testInfo.attach('quadros-mp4', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
})
