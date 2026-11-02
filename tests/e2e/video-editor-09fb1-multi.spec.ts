import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
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

test('múltiplos áudios: timeline, prévia, mute persistido, exclusão e MP4 real', async ({ page }, testInfo) => {
  test.setTimeout(300000)
  const video = await setup(page)
  const input = page.getByLabel('Adicionar faixas de áudio', { exact: true })
  await input.setInputFiles([
    { name: 'primeiro.wav', mimeType: 'audio/wav', buffer: wav(880) },
    { name: 'segundo.wav', mimeType: 'audio/wav', buffer: wav(1320) },
    { name: 'excluir.wav', mimeType: 'audio/wav', buffer: wav(1760) },
  ])
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(3)
  await expect(page.getByText('3 faixa(s) salva(s) neste navegador.')).toBeVisible()
  await page.getByRole('button', { name: 'Excluir áudio excluir.wav', exact: true }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  await page.getByRole('button', { name: 'Selecionar áudio primeiro.wav' }).click()
  await expect(page.getByRole('button', { name: 'Selecionar áudio primeiro.wav' })).toHaveAttribute('aria-pressed', 'true')
  const block = page.getByRole('button', { name: 'Selecionar áudio primeiro.wav' }), box = (await block.boundingBox())!
  await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down(); await page.mouse.move(box.x + 45, box.y + 8, { steps: 5 }); await page.mouse.up()
  await expect.poll(() => page.getByLabel('Início do áudio primeiro.wav').inputValue()).not.toBe('0')
  await page.getByLabel('Início do áudio primeiro.wav').fill('0.2')
  await page.getByLabel('Duração do áudio primeiro.wav').fill('1.8')
  await page.getByLabel('Volume do áudio primeiro.wav').fill('0.4')
  await page.getByLabel('Início do áudio segundo.wav').fill('1')
  await page.getByLabel('Duração do áudio segundo.wav').fill('2')
  await page.getByLabel('Volume do áudio segundo.wav').fill('0.2')
  await page.getByRole('slider', { name: 'Volume do vídeo' }).fill('0.25')
  await input.setInputFiles({ name: 'invalido.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Áudio inválido ou não suportado (máximo de 10 minutos).')).toBeVisible()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  const ids = await page.getByTestId('timeline-audio-clip').evaluateAll((els) => els.map((el) => el.getAttribute('data-audio-id')!))
  const first = page.locator(`audio[data-audio-clip-id="${ids[0]}"]`), second = page.locator(`audio[data-audio-clip-id="${ids[1]}"]`)
  const seek = page.getByRole('slider', { name: 'Linha do tempo do video' })
  await seek.fill('0.5')
  await expect.poll(() => page.locator('video').first().evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(0.5, 1)
  await page.getByRole('button', { name: 'Reproduzir vídeo' }).click()
  const observations = await page.evaluate(async () => {
    const states: Array<{ timeline: number; audio: Array<{ paused: boolean; time: number; ready: number; error?: string }> }> = []
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => states.push({ timeline: Number(document.querySelector<HTMLInputElement>('[aria-label="Linha do tempo do video"]')!.value), audio: Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-audio-clip-id]')).map((el) => ({ paused: el.paused, time: el.currentTime, ready: el.readyState, error: el.dataset.playError })) }), 40)
      setTimeout(() => { clearInterval(timer); resolve() }, 1200)
    })
    return states
  })
  console.log('MULTI_PREVIEW', JSON.stringify(observations))
  await testInfo.attach('previa', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' })
  expect(observations.some((state) => !state.audio[0].paused && state.audio[1].paused)).toBe(true)
  expect(observations.some((state) => !state.audio[0].paused && !state.audio[1].paused)).toBe(true)
  await page.getByRole('button', { name: 'Pausar vídeo' }).click()
  await expect.poll(() => first.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
  await expect.poll(() => second.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
  await seek.fill('2.5')
  await expect.poll(() => second.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeCloseTo(1.5, 1)
  await page.getByRole('button', { name: 'Silenciar áudio primeiro.wav', exact: true }).click()
  await expect.poll(() => first.evaluate((el: HTMLAudioElement) => el.volume)).toBe(0)
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
    return JSON.parse(localStorage.getItem(key)!).audioClips?.[0]?.muted
  })).toBe(true)
  await page.reload()
  await page.getByLabel('Reassociar multi-base.webm').setInputFiles(video)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  await expect(page.getByLabel('Volume do áudio primeiro.wav')).toHaveValue('0.4')
  await page.getByRole('button', { name: 'Ativar áudio primeiro.wav', exact: true }).click()
  await seek.fill('1.3')
  await expect.poll(() => first.evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(0.4, 2)
  await expect.poll(() => second.evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(0.2, 2)
  await page.screenshot({ path: testInfo.outputPath('multi-audio-editor.png') })
  await serveAuditedFfmpegForLocalTest(page)
  await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
  const download = page.waitForEvent('download', { timeout: 180000 })
  await page.getByRole('button', { name: 'Baixar video' }).click()
  const path = testInfo.outputPath('duas-faixas-e-original.mp4'); await (await download).saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true); expect(bytes.includes(Buffer.from('mp4a'))).toBe(true)
  const measurements = await page.evaluate(async (base64) => {
    const context = new AudioContext(), bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const decoded = await context.decodeAudioData(bytes.buffer), data = decoded.getChannelData(0), rate = decoded.sampleRate
    const tone = (hz: number, time: number) => { let re = 0, im = 0; const start = Math.floor(time * rate), n = Math.floor(0.12 * rate)
      for (let i = 0; i < n; i++) { re += data[start + i] * Math.cos(2 * Math.PI * hz * i / rate); im += data[start + i] * Math.sin(2 * Math.PI * hz * i / rate) }
      return 2 * Math.hypot(re, im) / n }
    const result = { duration: decoded.duration, original: tone(440, 1.3), firstBefore: tone(880, 0.02), firstOnly: tone(880, 0.5), firstBoth: tone(880, 1.3), firstAfter: tone(880, 2.5), secondBefore: tone(1320, 0.5), secondBoth: tone(1320, 1.3), secondOnly: tone(1320, 2.5), secondAfter: tone(1320, 3.5) }
    await context.close(); return result
  }, bytes.toString('base64'))
  console.log('MULTI_AUDIO_MP4', measurements)
  await testInfo.attach('medicoes', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' })
  expect(measurements.duration).toBeGreaterThan(3.8); expect(measurements.duration).toBeLessThan(4.6)
  expect(measurements.original).toBeGreaterThan(0.025)
  expect(measurements.firstOnly).toBeGreaterThan(0.075); expect(measurements.firstBoth).toBeGreaterThan(0.075)
  expect(measurements.secondBoth).toBeGreaterThan(0.035); expect(measurements.secondOnly).toBeGreaterThan(0.035)
  expect(measurements.firstBoth / measurements.secondBoth).toBeGreaterThan(1.7)
  expect(measurements.firstBoth / measurements.secondBoth).toBeLessThan(2.3)
  expect(measurements.firstBefore).toBeLessThan(0.01); expect(measurements.firstAfter).toBeLessThan(0.01)
  expect(measurements.secondBefore).toBeLessThan(0.01); expect(measurements.secondAfter).toBeLessThan(0.01)
})

test('música legada recupera o ganho anterior após salvar em mute', async ({ page }) => {
  test.setTimeout(120000)
  const video = await setup(page)
  await page.locator('input[type="file"][accept^="audio/"]').setInputFiles({ name: 'legada.wav', mimeType: 'audio/wav', buffer: wav(880) })
  await expect(page.getByText('Música salva neste navegador.')).toBeVisible()
  await page.getByTestId('timeline-music-clip').click()
  await page.getByLabel('Volume da música nas propriedades').fill('0.35')
  await page.getByRole('button', { name: 'Silenciar música', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
    const music = JSON.parse(localStorage.getItem(key)!).music
    return [music.volume, music.previousVolume]
  })).toEqual([0, 0.35])
  await page.reload()
  await page.getByLabel('Reassociar multi-base.webm').setInputFiles(video)
  await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
  await page.getByRole('button', { name: 'Ativar música', exact: true }).click()
  await expect(page.getByLabel('Volume da música nas propriedades')).toHaveValue('0.35')
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(0)
})

test('Delete exclui somente o áudio selecionado e mantém vídeo e outra faixa', async ({ page }) => {
  test.setTimeout(120000)
  await setup(page)
  await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles([
    { name: 'manter.wav', mimeType: 'audio/wav', buffer: wav(880) },
    { name: 'remover.wav', mimeType: 'audio/wav', buffer: wav(1320) },
  ])
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
  const selected = page.getByRole('button', { name: 'Selecionar áudio remover.wav', exact: true })
  await selected.click()
  await selected.press('Delete')
  await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Selecionar áudio manter.wav', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
    const project = JSON.parse(localStorage.getItem(key)!)
    return [project.audioClips?.length, project.excludedClipIds?.length, project.baseVideo?.name]
  })).toEqual([1, 0, 'multi-base.webm'])
})

for (const mode of ['fotos', 'sequência'] as const) {
  test(`exportação ${mode}: duas faixas, mute, sticker e legenda`, async ({ page }, testInfo) => {
    test.setTimeout(300000)
    if (mode === 'sequência') {
      const video = await setup(page)
      await page.locator('input[type="file"][accept^="video/"]').first().setInputFiles({ ...video, name: 'segundo-video.webm' })
      await expect.poll(() => page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.startsWith('entreus-studio-project-v1:'))!
        return JSON.parse(localStorage.getItem(key)!).extraVideos.length
      })).toBe(1)
    } else {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto('/lab/video-editor')
      await expect(page.locator('[data-workspace-ready="true"]')).toBeVisible({ timeout: 30000 })
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#181020'; ctx.fillRect(0, 0, 160, 90)
        return canvas.toDataURL('image/png').split(',')[1]
      })
      await page.locator('input[type="file"][accept="image/png,image/jpeg,.png,.jpg,.jpeg"]').first().setInputFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
      // Keep the real photo export path inexpensive for a synthetic fixture.
      await page.getByRole('combobox', { name: 'Proporção do projeto' }).selectOption('original')
    }
    const expectedDuration = Number(await page.getByRole('slider', { name: 'Linha do tempo do video' }).getAttribute('max'))
    expect(expectedDuration).toBeGreaterThan(1)
    await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Áudio' }).click()
    await page.getByLabel('Adicionar faixas de áudio', { exact: true }).setInputFiles([
      { name: 'audivel.wav', mimeType: 'audio/wav', buffer: wav(880) },
      { name: 'mudo.wav', mimeType: 'audio/wav', buffer: wav(1320) },
    ])
    await expect(page.getByTestId('timeline-audio-clip')).toHaveCount(2)
    await page.getByLabel('Volume do áudio audivel.wav').fill('0.3')
    await page.getByLabel('Volume do áudio mudo.wav').fill('0.2')
    await page.getByRole('button', { name: 'Silenciar áudio mudo.wav', exact: true }).click()
    await page.getByRole('toolbar', { name: 'Ferramentas de edição' }).getByRole('button', { name: 'Stickers' }).click()
    await page.getByRole('button', { name: 'Adicionar figurinha Confirmado', exact: true }).click()
    await page.getByRole('button', { name: 'Legendas', exact: true }).first().click()
    await page.getByRole('button', { name: 'Adicionar legenda' }).click()
    await page.getByRole('textbox', { name: 'Texto da legenda' }).fill('ÁUDIO MULTI')
    await page.getByRole('spinbutton', { name: 'Início da legenda' }).fill('0.2')
    await page.getByRole('spinbutton', { name: 'Fim da legenda' }).fill('1.6')
    await serveAuditedFfmpegForLocalTest(page)
    await page.getByRole('button', { name: /^Exportar(?: MP4)?$/ }).first().click()
    const download = page.waitForEvent('download', { timeout: 180000 })
    await page.getByRole('button', { name: 'Baixar video' }).click()
    const path = testInfo.outputPath(`audio-${mode}.mp4`); await (await download).saveAs(path)
    const bytes = await readFile(path)
    const measured = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), context = new AudioContext()
      const decoded = await context.decodeAudioData(bytes.buffer.slice(0)), data = decoded.getChannelData(0), rate = decoded.sampleRate
      const tone = (hz: number) => { let re = 0, im = 0; const start = Math.floor(rate), n = Math.floor(0.15 * rate)
        for (let i = 0; i < n; i++) { re += data[start + i] * Math.cos(2 * Math.PI * hz * i / rate); im += data[start + i] * Math.sin(2 * Math.PI * hz * i / rate) }
        return 2 * Math.hypot(re, im) / n }
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
        return { duration: decoded.duration, original: tone(440), audible: tone(880), muted: tone(1320), beforeSubtitle: await bright(0.05), subtitle: await bright(1) }
      } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); await context.close() }
    }, bytes.toString('base64'))
    console.log(`MULTI_${mode}`, measured)
    await testInfo.attach('medicoes', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' })
    expect(measured.duration).toBeCloseTo(expectedDuration, 0)
    expect(measured.audible).toBeGreaterThan(0.025)
    expect(measured.muted).toBeLessThan(0.005)
    if (mode === 'sequência') expect(measured.original).toBeGreaterThan(0.02)
    expect(measured.beforeSubtitle).toBeGreaterThan(0) // white pixels from the native sticker
    expect(measured.subtitle).toBeGreaterThan(measured.beforeSubtitle + 20)
  })
}
