import { expect, type Page } from '@playwright/test'

export type ExportFixture = {
  mode: string; width: number; height: number; start: number; montageDuration: number; total: number
  clips: { name: string; start: number; end: number; rgb: number[]; hz: number }[]
  pulseTimes: number[]; silent: boolean; fades: boolean
}

/** Reusable against the already-exported bytes: failed measurements never require a new render. */
export async function probeExport(page: Page, bytes: Buffer, fixture: ExportFixture) {
  return page.evaluate(async ({ base64, f }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const context = new AudioContext()
    let audioDuration = 0, rate = 0
    const tones: Record<string, number> = {}, pulses: { expected: number; measured: number; amplitude: number }[] = []
    try {
      const decoded = await context.decodeAudioData(bytes.buffer.slice(0))
      const pcm = decoded.getChannelData(0); rate = decoded.sampleRate; audioDuration = decoded.duration
      function tone(hz: number, center: number, span = 0.08) {
        const n = Math.floor(rate * span), start = Math.floor(rate * (center - span / 2)); let re = 0, im = 0
        for (let i = 0; i < n; i++) { const v = pcm[start + i] || 0; re += v * Math.cos(2 * Math.PI * hz * i / rate); im += v * Math.sin(2 * Math.PI * hz * i / rate) }
        return 2 * Math.hypot(re, im) / n
      }
      tones.musicBefore = tone(880, f.start - 0.3)
      tones.musicSteady = tone(880, f.start + 0.7)
      tones.musicAfter = tone(880, f.start + f.montageDuration + 0.4)
      tones.musicFadeIn = tone(880, f.start + 0.15)
      tones.musicFadeOut = tone(880, f.start + f.montageDuration - 0.15)
      tones.muted = tone(1760, f.start + 0.7)
      tones.extra = tone(1320, f.start + 0.8)
      for (const [i, clip] of f.clips.entries()) {
        const center = (clip.start + clip.end) / 2
        tones[`original440-${i}`] = tone(440, center)
        tones[`original660-${i}`] = tone(660, center)
      }
      for (const relative of f.pulseTimes) {
        const expected = f.start + relative + 0.01
        let measured = expected, amplitude = 0
        for (let i = -16; i <= 16; i++) {
          const time = expected + i * 0.005, value = tone(3000, time, 0.01)
          if (value > amplitude) { amplitude = value; measured = time }
        }
        pulses.push({ expected, measured, amplitude })
      }
    } finally { await context.close() }
    const video = document.createElement('video'), url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
    try {
      video.muted = true
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('MP4 não decodificável')); video.src = url })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      async function frame(time: number) {
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = time })
        ctx.drawImage(video, 0, 0)
        return Array.from(ctx.getImageData(Math.floor(canvas.width * 0.1), Math.floor(canvas.height * 0.15), 1, 1).data).slice(0, 3)
      }
      function distance(pixel: number[], rgb: number[]) {
        const a = Math.max(...pixel), b = Math.max(...rgb)
        return pixel.reduce((sum, v, i) => sum + (v / a - rgb[i] / b) ** 2, 0)
      }
      const centers = []
      for (const clip of f.clips) centers.push({ time: (clip.start + clip.end) / 2, rgb: await frame((clip.start + clip.end) / 2) })
      const cuts = []
      for (let i = 1; i < f.clips.length; i++) {
        const expected = f.clips[i].start, old = f.clips[i - 1].rgb, next = f.clips[i].rgb
        const samples = []
        // Offset 5 ms from exact boundaries. The first new-color frame brackets the cut.
        for (let k = -3; k <= 3; k++) {
          const time = expected + k / 30 + 0.005, rgb = await frame(time)
          samples.push({ time, isNext: Math.max(...rgb) < 8 ? null : distance(rgb, next) < distance(rgb, old) })
        }
        cuts.push({ expected, measured: samples.find((sample) => sample.isNext)?.time ?? null, samples })
      }
      const hardCutPhotoEdges = []
      for (const clip of f.clips.filter((clip) => clip.hz === 0 && clip.name !== 'tail.png' && clip.start >= f.start - 1e-6)) {
        hardCutPhotoEdges.push({ name: clip.name, expected: clip.rgb, afterStart: await frame(clip.start + 0.12), beforeEnd: await frame(clip.end - 0.12) })
      }
      const bright = async (time: number) => {
        await frame(time); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let count = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] > 180) count++
        return count
      }
      const legacyPhotoFade = f.clips[0].hz === 0 ? await frame(0.12) : null
      return { width: canvas.width, height: canvas.height, videoDuration: video.duration, audioDuration, rate, tones, pulses, centers, cuts, hardCutPhotoEdges, legacyPhotoFade,
        sticker: await bright(f.start + 0.15), stickerAndSubtitle: await bright(f.start + 0.7), thumbnail: canvas.toDataURL('image/png') }
    } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
  }, { base64: bytes.toString('base64'), f: fixture })
}

export function assertExport(probe: Awaited<ReturnType<typeof probeExport>>, f: ExportFixture) {
  expect([probe.width, probe.height]).toEqual([f.width, f.height])
  // Two 30-fps frames plus encoder/decimal rounding; AAC may add a small padding tail.
  expect(Math.abs(probe.videoDuration - f.total)).toBeLessThan(0.075)
  expect(Math.abs(probe.audioDuration - f.total)).toBeLessThan(0.10)
  expect(Math.abs(probe.videoDuration - probe.audioDuration)).toBeLessThan(0.10)
  probe.centers.forEach((sample, i) => sample.rgb.forEach((v, c) => expect(Math.abs(v - f.clips[i].rgb[c])).toBeLessThan(45)))
  for (const cut of probe.cuts) {
    expect(cut.measured).not.toBeNull()
    expect(Math.abs(cut.measured! - cut.expected)).toBeLessThan(0.075)
    expect(cut.samples[0].isNext).toBe(false); expect(cut.samples.at(-1)!.isNext).toBe(true)
  }
  for (const edge of probe.hardCutPhotoEdges) for (const pixel of [edge.afterStart, edge.beforeEnd]) pixel.forEach((v, c) => expect(Math.abs(v - edge.expected[c])).toBeLessThan(45))
  if (probe.legacyPhotoFade) { expect(Math.max(...probe.legacyPhotoFade)).toBeGreaterThan(20); expect(Math.max(...probe.legacyPhotoFade)).toBeLessThan(160) }
  for (const pulse of probe.pulses) {
    expect(Math.abs(pulse.measured - pulse.expected)).toBeLessThan(0.06)
    expect(pulse.amplitude).toBeGreaterThan(0.05)
    const matchingCut = probe.cuts.find((cut) => Math.abs(cut.expected - (pulse.expected - 0.01)) < 0.025)
    if (matchingCut) expect(Math.abs(matchingCut.measured! - (pulse.measured - 0.01))).toBeLessThan(0.085)
  }
  expect(probe.tones.musicBefore).toBeLessThan(0.003)
  expect(probe.tones.musicAfter).toBeLessThan(0.003) // Deliberate manual tail proves no looping.
  expect(probe.tones.muted).toBeLessThan(0.003)
  if (f.silent) expect(probe.tones.musicSteady).toBeLessThan(0.003)
  else { expect(probe.tones.musicSteady).toBeGreaterThan(0.022); expect(probe.tones.musicSteady).toBeLessThan(0.035) } // Mono → stereo: ~0.1 × 0.4 / sqrt(2). A duplicate would be ~0.0566.
  for (const [i, clip] of f.clips.entries()) for (const hz of [440, 660]) {
    const amplitude = probe.tones[`original${hz}-${i}`]
    if (clip.hz === hz) { expect(amplitude).toBeGreaterThan(0.033); expect(amplitude).toBeLessThan(0.070) } // source ~0.2 × volume 0.25
    else expect(amplitude).toBeLessThan(0.004)
  }
  if (f.fades) {
    expect(probe.tones.musicFadeIn / probe.tones.musicSteady).toBeGreaterThan(0.12)
    expect(probe.tones.musicFadeIn / probe.tones.musicSteady).toBeLessThan(0.6)
    expect(probe.tones.musicFadeOut / probe.tones.musicSteady).toBeGreaterThan(0.12)
    expect(probe.tones.musicFadeOut / probe.tones.musicSteady).toBeLessThan(0.6)
    expect(probe.tones.extra).toBeGreaterThan(0.017); expect(probe.tones.extra).toBeLessThan(0.027)
  }
  expect(probe.sticker).toBeGreaterThan(10)
  expect(probe.stickerAndSubtitle).toBeGreaterThan(probe.sticker + 20)
}
