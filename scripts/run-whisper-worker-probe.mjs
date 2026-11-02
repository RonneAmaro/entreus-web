import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const cacheDir = process.env.ENTREUS_WHISPER_CACHE || path.join(tmpdir(), 'entreus-whisper-09eb1')
const workerPath = path.join(process.cwd(), 'public', 'workers', 'whisper-runtime-worker.js')
const files = new Map([
  ['/runtime.js', { body: await readFile(path.join(cacheDir, 'main.js')), type: 'text/javascript' }],
  ['/model.bin', { body: await readFile(path.join(cacheDir, 'ggml-tiny.bin')), type: 'application/octet-stream' }],
  ['/audio.wav', { body: await readFile(path.join(cacheDir, 'referencia-pt-br.wav')), type: 'audio/wav' }],
  ['/worker-template.js', { body: await readFile(workerPath), type: 'text/javascript' }],
])
const html = Buffer.from('<!doctype html><meta charset="utf-8"><title>EntreUS Whisper Worker Probe</title>', 'utf8')

const server = createServer((request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Cache-Control', 'no-store')
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
  const entry = pathname === '/' ? { body: html, type: 'text/html; charset=utf-8' } : files.get(pathname)
  if (!entry) return response.writeHead(404).end('Not found')
  response.writeHead(200, { 'Content-Type': entry.type, 'Content-Length': entry.body.length })
  response.end(entry.body)
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Servidor local indisponível.')
const baseUrl = `http://127.0.0.1:${address.port}`
const assets = {
  runtimeUrl: `${baseUrl}/runtime.js`,
  runtimeSha256: '11ffd6ca6345033d319c14855309ece7aa21d59b02fad70f9eab4c2311e08b9f',
  modelUrl: `${baseUrl}/model.bin`,
  modelSha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
}

let browser
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'load' })
  const result = await page.evaluate(async ({ assets }) => {
    const audioContext = new AudioContext({ sampleRate: 16_000 })
    const decoded = await audioContext.decodeAudioData(await (await fetch('/audio.wav')).arrayBuffer())
    const source = decoded.getChannelData(0)
    const [template, runtime] = await Promise.all([
      fetch('/worker-template.js').then((response) => response.text()),
      fetch('/runtime.js').then((response) => response.arrayBuffer()),
    ])
    const marker = '/*__ENTREUS_WHISPER_RUNTIME__*/'
    if (!template.includes(marker)) throw new Error('Marcador do template não encontrado.')
    const markerIndex = template.indexOf(marker)
    const workerUrl = URL.createObjectURL(new Blob([
      template.slice(0, markerIndex),
      runtime,
      template.slice(markerIndex + marker.length),
    ], { type: 'text/javascript' }))
    const run = (cancelAtTranscribing) => new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl, { name: cancelAtTranscribing ? 'cancel-probe' : 'result-probe' })
      const taskId = crypto.randomUUID()
      const stages = []
      let settled = false
      const timeout = setTimeout(() => {
        worker.terminate()
        reject(new Error('Tempo limite do Worker excedido.'))
      }, 300_000)
      worker.onerror = (event) => {
        clearTimeout(timeout)
        worker.terminate()
        reject(new Error(event.message))
      }
      worker.onmessage = (event) => {
        if (event.data.taskId !== taskId) return
        if (event.data.type === 'stage') {
          stages.push(event.data)
          if (cancelAtTranscribing && event.data.stage === 'transcribing') {
            worker.terminate()
            clearTimeout(timeout)
            setTimeout(() => resolve({ cancelled: true, stages, lateResult: settled }), 750)
          }
          return
        }
        if (event.data.type === 'error') {
          clearTimeout(timeout)
          worker.terminate()
          reject(new Error(event.data.message))
          return
        }
        if (event.data.type === 'result') {
          settled = true
          clearTimeout(timeout)
          worker.terminate()
          resolve({ cancelled: false, stages, result: event.data })
        }
      }
      const pcm = source.slice()
      worker.postMessage({
        type: 'start', taskId, pcm: pcm.buffer, sampleCount: pcm.length,
        language: 'pt', threads: 1,
        assets, runtimeCacheHit: false,
      }, [pcm.buffer])
    })
    try {
      return {
        crossOriginIsolated,
        sampleRate: decoded.sampleRate,
        samples: source.length,
        cancelled: await run(true),
        completed: await run(false),
      }
    } finally {
      URL.revokeObjectURL(workerUrl)
      await audioContext.close()
    }
  }, { assets })
  const resultPath = path.join(cacheDir, 'result-worker-probe.json')
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ resultPath, ...result }, null, 2))
  if (!result.crossOriginIsolated || !result.completed.result?.segments?.length || !result.cancelled.cancelled || result.cancelled.lateResult) {
    process.exitCode = 1
  }
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
