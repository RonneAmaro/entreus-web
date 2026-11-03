import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'

it('executa o núcleo no worker real do Chromium local', async () => {
  const core = readFileSync('lib/video-editor/rhythm-analysis.ts', 'utf8').replace(/export /g, '')
  const worker = readFileSync('lib/video-editor/rhythm-worker.ts', 'utf8').replace(/^import .*\n/gm, '').replace(/^export type .*\n/gm, '')
  const js = ts.transpileModule(`${core}\n${worker}`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const result = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      const worker = new Worker(url)
      try {
        const data = new Float32Array(8000 * 4); data.fill(0.8, 4000, 4080); data.fill(0.8, 12000, 12080)
        const started = performance.now()
        const result = await new Promise<{ events: number[]; elapsed: number }>((resolve, reject) => {
          worker.onerror = (event) => reject(new Error(event.message))
          worker.onmessage = (event) => event.data.error ? reject(new Error(event.data.error)) : resolve({ events: event.data.result.events, elapsed: performance.now() - started })
          worker.postMessage({ id: 1, channels: [data.buffer], sampleRate: 8000, options: {} }, [data.buffer])
        })
        worker.terminate()
        const cancelled = new Worker(url); let late = false
        cancelled.onmessage = () => { late = true }
        const large = new Float32Array(96000 * 10)
        cancelled.postMessage({ id: 2, channels: [large.buffer], sampleRate: 96000, options: {} }, [large.buffer])
        cancelled.terminate()
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { ...result, late }
      } finally { worker.terminate(); URL.revokeObjectURL(url) }
    }, js)
    expect(result.events).toEqual([0.5, 1.5])
    expect(result.late).toBe(false)
    expect(result.elapsed).toBeLessThan(15000)
    console.log(`Worker Chromium: ${result.elapsed.toFixed(1)} ms, 4 s mono a 8 kHz`)
  } finally { await browser.close() }
}, 30000)
