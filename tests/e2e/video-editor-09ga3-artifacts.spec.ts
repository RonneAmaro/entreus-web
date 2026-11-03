import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('09G-A.3 stickers e legendas nos dois MP4s já exportados', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  const root = '.local-cache/09ga3-final-20261031-results'
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('autoreels-mixed.mp4'))
  expect(files).toHaveLength(2)
  await page.goto('/lab/video-editor')
  for (const file of files) {
    const bytes = await readFile(join(root, file))
    const result = await page.evaluate(async (base64) => {
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), video = document.createElement('video')
      const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
      try {
        video.muted = true
        await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('MP4 inválido')); video.src = url })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')!
        const bright = async (time: number) => {
          await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = time })
          ctx.drawImage(video, 0, 0)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let count = 0
          for (let i = 0; i < data.length; i += 4) if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) count++
          return count
        }
        return { width: canvas.width, height: canvas.height, sticker: await bright(0.05), stickerAndCaption: await bright(0.5) }
      } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
    }, bytes.toString('base64'))
    console.log('AUTOREELS_OVERLAYS', JSON.stringify(result))
    expect(result.sticker).toBeGreaterThan(10)
    expect(result.stickerAndCaption).toBeGreaterThan(result.sticker + 20)
    await testInfo.attach(`overlays-${result.width}x${result.height}`, { body: JSON.stringify(result), contentType: 'application/json' })
  }
})
