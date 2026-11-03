import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const CACHE_DIR = process.env.ENTREUS_WHISPER_CACHE
  || path.join(tmpdir(), 'entreus-whisper-09eb1')
const RESULT_PATH = process.env.ENTREUS_WHISPER_RESULT
  || path.join(CACHE_DIR, `result-${process.env.ENTREUS_WHISPER_BROWSER || 'chromium'}.json`)
const BROWSER_CHANNEL = process.env.ENTREUS_WHISPER_BROWSER_CHANNEL || undefined
const BROWSER_NAME = process.env.ENTREUS_WHISPER_BROWSER || BROWSER_CHANNEL || 'chromium'
const EXPECTED = {
  'index.html': '3e184abb5c52084e83702c74ce4a43cb1a3bcd660198df35f83374adb9e95ed5',
  'helpers.js': '5371c69265551a7f7d48a7953d118e6503d8a5d480710966dfb9c2a52981a4d8',
  'main.js': '11ffd6ca6345033d319c14855309ece7aa21d59b02fad70f9eab4c2311e08b9f',
  'ggml-tiny.bin': 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
}
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function verifyArtifacts() {
  const verified = {}
  for (const [name, expectedHash] of Object.entries(EXPECTED)) {
    const filePath = path.join(CACHE_DIR, name)
    const [fileStat, actualHash] = await Promise.all([stat(filePath), sha256(filePath)])
    if (actualHash !== expectedHash) {
      throw new Error(`${name}: SHA-256 divergente (${actualHash}).`)
    }
    verified[name] = { bytes: fileStat.size, sha256: actualHash }
  }
  return verified
}

function startServer() {
  const server = createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Cache-Control', 'no-store')
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    const name = pathname === '/' ? 'index.html' : pathname.slice(1)
    if (!['index.html', 'helpers.js', 'main.js'].includes(name)) {
      response.writeHead(404).end('Not found')
      return
    }
    try {
      const bytes = await readFile(path.join(CACHE_DIR, name))
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(name)] || 'application/octet-stream' })
      response.end(bytes)
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error))
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Endereço local indisponível.'))
      resolve({ server, url: `http://127.0.0.1:${address.port}/` })
    })
  })
}

async function pageMemory(page) {
  return page.evaluate(() => ({
    jsHeapLimitBytes: performance.memory?.jsHeapSizeLimit ?? null,
    jsHeapTotalBytes: performance.memory?.totalJSHeapSize ?? null,
    jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    wasmHeapBytes: globalThis.Module?.HEAPU8?.buffer?.byteLength ?? null,
  }))
}

async function outputValue(page) {
  return page.locator('#output').inputValue()
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length
}

function parseSegments(output) {
  const pattern = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+([^\r\n]+)/g
  return [...output.matchAll(pattern)].map((match) => ({
    start: match[1],
    end: match[2],
    text: match[3].trim(),
  }))
}

function recognizedText(segments) {
  return segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim()
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordErrorRate(expected, recognized) {
  const expectedWords = normalizeText(expected).split(' ').filter(Boolean)
  const recognizedWords = normalizeText(recognized).split(' ').filter(Boolean)
  const rows = Array.from({ length: expectedWords.length + 1 }, () => Array(recognizedWords.length + 1).fill(0))
  for (let i = 0; i <= expectedWords.length; i += 1) rows[i][0] = i
  for (let j = 0; j <= recognizedWords.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= expectedWords.length; i += 1) {
    for (let j = 1; j <= recognizedWords.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (expectedWords[i - 1] === recognizedWords[j - 1] ? 0 : 1),
      )
    }
  }
  return {
    edits: rows[expectedWords.length][recognizedWords.length],
    expectedWords: expectedWords.length,
    recognizedWords: recognizedWords.length,
    rate: expectedWords.length ? rows[expectedWords.length][recognizedWords.length] / expectedWords.length : null,
  }
}

const expectedText = 'Olá, este é um teste de transcrição automática do EntreUS Studio. Hoje é um bom dia para criar vídeos, revisar legendas e compartilhar histórias. Depois de uma pequena pausa, continuamos com clareza, atenção e segurança.'
const invalidAudioPath = path.join(CACHE_DIR, 'invalid-audio.txt')
const audioPath = path.join(CACHE_DIR, 'referencia-pt-br.wav')
const modelPath = path.join(CACHE_DIR, 'ggml-tiny.bin')

const verifiedArtifacts = await verifyArtifacts()
await writeFile(invalidAudioPath, 'isto não é um arquivo de áudio', 'utf8')
const { server, url } = await startServer()
let browser

try {
  browser = await chromium.launch({
    channel: BROWSER_CHANNEL,
    headless: true,
    args: ['--enable-precise-memory-info'],
  })
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const runtimeStartedAt = performance.now()
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForFunction(() => typeof globalThis.Module?.init === 'function', null, { timeout: 120_000 })
  const runtimeLoadMs = performance.now() - runtimeStartedAt
  const capabilities = await page.evaluate(async () => {
    const simdModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
      3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ])
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
      wasmSimd: WebAssembly.validate(simdModule),
    }
  })
  const memoryAfterRuntime = await pageMemory(page)

  const missingModelResult = await page.evaluate(() => globalThis.Module.init('modelo-ausente.bin'))

  await page.locator('#input_file input[type=file]').setInputFiles(invalidAudioPath)
  await page.waitForFunction(() => document.querySelector('#output')?.value.includes('error decoding audio'), null, { timeout: 30_000 })
  const invalidAudioHandled = (await outputValue(page)).includes('js: error decoding audio:')

  const modelStartedAt = performance.now()
  await page.locator('#whisper-file').setInputFiles(modelPath)
  await page.waitForFunction(() => document.querySelector('#output')?.value.includes('storeFS: stored model:'), null, { timeout: 180_000 })
  const modelFileLoadMs = performance.now() - modelStartedAt
  const memoryAfterModelFile = await pageMemory(page)

  const initStartedAt = performance.now()
  await page.evaluate(() => globalThis.onProcess(false))
  await page.waitForFunction(() => document.querySelector('#output')?.value.includes('js: no audio data'), null, { timeout: 180_000 })
  const modelInitMs = performance.now() - initStartedAt
  const noAudioHandled = (await outputValue(page)).includes('js: no audio data')
  const memoryAfterModelInit = await pageMemory(page)

  const audioStartedAt = performance.now()
  await page.locator('#input_file input[type=file]').setInputFiles(audioPath)
  await page.waitForFunction(() => document.querySelector('#output')?.value.includes('js: audio loaded, size:'), null, { timeout: 60_000 })
  const audioPreparationMs = performance.now() - audioStartedAt
  const preparedAudio = await page.evaluate(() => ({
    samples: globalThis.audio?.length ?? 0,
    sampleRate: globalThis.context?.sampleRate ?? null,
    channels: globalThis.audio ? 1 : null,
    durationSeconds: globalThis.audio && globalThis.context ? globalThis.audio.length / globalThis.context.sampleRate : null,
    peak: globalThis.audio ? globalThis.audio.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0) : null,
    rms: globalThis.audio ? Math.sqrt(globalThis.audio.reduce((sum, sample) => sum + sample * sample, 0) / globalThis.audio.length) : null,
  }))
  await page.locator('#language').selectOption('pt')
  const threads = Math.max(1, Math.min(8, capabilities.hardwareConcurrency || 1))
  await page.locator('#threads').fill(String(threads))
  await page.evaluate((value) => globalThis.changeThreads(value), String(threads))

  const outputBeforeInference = await outputValue(page)
  const timingCountBefore = countMatches(outputBeforeInference, /whisper_print_timings:\s+total time/g)
  const inferenceStartedAt = performance.now()
  await page.evaluate(() => globalThis.onProcess(false))
  await page.waitForFunction(
    (minimumCount) => [...document.querySelector('#output').value.matchAll(/whisper_print_timings:\s+total time/g)].length > minimumCount,
    timingCountBefore,
    { timeout: 600_000 },
  )
  const inferenceWallMs = performance.now() - inferenceStartedAt
  const inferenceOutput = (await outputValue(page)).slice(outputBeforeInference.length)
  const segments = parseSegments(inferenceOutput)
  const text = recognizedText(segments)
  const memoryAfterInference = await pageMemory(page)

  const timingCountBeforeSilence = countMatches(await outputValue(page), /whisper_print_timings:\s+total time/g)
  const silenceStartedAt = performance.now()
  await page.evaluate(() => {
    globalThis.__entreusOriginalAudio = globalThis.audio
    globalThis.audio = new Float32Array(2 * 16_000)
    globalThis.printTextarea('POC:SILENCE_START')
    globalThis.onProcess(false)
  })
  await page.waitForFunction(
    (minimumCount) => [...document.querySelector('#output').value.matchAll(/whisper_print_timings:\s+total time/g)].length > minimumCount,
    timingCountBeforeSilence,
    { timeout: 300_000 },
  )
  const silenceWallMs = performance.now() - silenceStartedAt
  const fullOutput = await outputValue(page)
  const silenceOutput = fullOutput.slice(fullOutput.lastIndexOf('POC:SILENCE_START'))
  const silenceSegments = parseSegments(silenceOutput)
  const memoryAfterSilence = await pageMemory(page)

  const cleanup = await page.evaluate(() => {
    const priorInstance = globalThis.instance
    if (priorInstance) globalThis.Module.free(priorInstance)
    globalThis.instance = null
    globalThis.audio = null
    globalThis.__entreusOriginalAudio = null
    try { globalThis.Module.FS_unlink('/whisper.bin') } catch {}
    return {
      releasedInstance: Boolean(priorInstance),
      instanceAfter: globalThis.instance,
      audioAfter: globalThis.audio,
    }
  })
  const memoryAfterCleanup = await pageMemory(page)

  const result = {
    schemaVersion: 1,
    status: segments.length > 0 && text ? 'passed' : 'failed',
    executedAt: new Date().toISOString(),
    browser: BROWSER_NAME,
    browserChannel: BROWSER_CHANNEL ?? null,
    source: {
      runtimeUrl: 'https://ggml.ai/whisper.cpp/',
      runtimeCommit: '231638a0',
      runtimeBuildTime: 'Mon Oct 19 14:14:00 2026',
      modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin',
      modelRepositoryCommit: '5359861c739e955e79d9a303bcbc70fb988958b1',
      artifacts: verifiedArtifacts,
    },
    capabilities,
    input: {
      expectedText,
      audioBytes: (await stat(audioPath)).size,
      audioSha256: await sha256(audioPath),
      preparedAudio,
    },
    negativeTests: {
      missingModelReturn: missingModelResult,
      missingModelHandled: missingModelResult === 0,
      invalidAudioHandled,
      noAudioHandled,
      cancellation: {
        tested: false,
        reason: 'O binding full_default é síncrono e não expõe cancelamento cooperativo.',
      },
    },
    timings: {
      runtimeLoadMs,
      modelFileLoadMs,
      modelInitMs,
      audioPreparationMs,
      inferenceWallMs,
      realtimeFactor: preparedAudio.durationSeconds ? inferenceWallMs / 1000 / preparedAudio.durationSeconds : null,
      silenceWallMs,
    },
    transcription: {
      language: 'pt',
      threads,
      segments,
      recognizedText: text,
      wordErrorRate: wordErrorRate(expectedText, text),
      rawOutput: inferenceOutput,
    },
    silence: {
      durationSeconds: 2,
      segments: silenceSegments,
      recognizedText: recognizedText(silenceSegments),
      rawOutput: silenceOutput,
    },
    memory: {
      afterRuntime: memoryAfterRuntime,
      afterModelFile: memoryAfterModelFile,
      afterModelInit: memoryAfterModelInit,
      afterInference: memoryAfterInference,
      afterSilence: memoryAfterSilence,
      afterCleanup: memoryAfterCleanup,
    },
    cleanup,
    diagnostics: { consoleErrors, pageErrors },
  }
  await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ resultPath: RESULT_PATH, status: result.status, timings: result.timings, transcription: result.transcription, silence: result.silence, diagnostics: result.diagnostics }, null, 2))
  if (result.status !== 'passed') process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
