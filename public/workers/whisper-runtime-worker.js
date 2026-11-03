/*
 * EntreUS Whisper Worker template.
 * The verified whisper.cpp runtime replaces the marker below in the browser so
 * Emscripten pthreads reload this same top-level Blob URL.
 */
;(function prepareEntreusWhisperRuntime() {
  if (self.name === 'em-pthread') return

  let resolveRuntime
  let rejectRuntime
  self.__entreusRuntimeReady = new Promise((resolve, reject) => {
    resolveRuntime = resolve
    rejectRuntime = reject
  })
  self.__entreusOutput = { lines: [], onLine: null }
  self.Module = {
    print(value) {
      const line = String(value)
      self.__entreusOutput.lines.push(line)
      self.__entreusOutput.onLine?.(line)
    },
    printErr(value) {
      const line = String(value)
      self.__entreusOutput.lines.push(line)
      self.__entreusOutput.onLine?.(line)
    },
    onRuntimeInitialized() { resolveRuntime() },
    onAbort(reason) { rejectRuntime(new Error(`Runtime Whisper interrompido: ${String(reason)}`)) },
  }
})()

/*__ENTREUS_WHISPER_RUNTIME__*/

;(function startEntreusWhisperWorker() {
  if (self.name === 'em-pthread') return

  const CACHE_NAME = 'entreus-whisper-tiny-v1'
  const TIMESTAMP_PATTERN = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+([^\r\n]+)/g

  function post(message) {
    self.postMessage(message)
  }

  function readableError(error) {
    if (error instanceof Error) return error.message
    return String(error || 'Falha desconhecida no motor de transcrição.')
  }

  function parseTime(value) {
    const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value)
    if (!match) throw new Error(`Timestamp Whisper inválido: ${value}`)
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
  }

  function parseSegments(output) {
    return [...output.matchAll(TIMESTAMP_PATTERN)].map((match) => ({
      startTime: parseTime(match[1]),
      endTime: parseTime(match[2]),
      text: match[3].trim(),
    }))
  }

  async function sha256(bytes) {
    const digest = await self.crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  }

  async function fetchVerified(url, expectedHash) {
    const cache = 'caches' in self ? await self.caches.open(CACHE_NAME) : null
    let response = cache ? await cache.match(url) : null
    const cacheHit = Boolean(response)
    if (!response) response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
    if (!response.ok) throw new Error(`Falha ao carregar o modelo Whisper (HTTP ${response.status}).`)
    const bytes = await response.arrayBuffer()
    const actualHash = await sha256(bytes)
    if (actualHash !== expectedHash) {
      if (cache) await cache.delete(url)
      throw new Error('A verificação de integridade do modelo Whisper falhou.')
    }
    if (!cacheHit && cache) await cache.put(url, new Response(bytes))
    return { bytes, cacheHit }
  }

  async function transcribe(message) {
    const { taskId, assets } = message
    const output = self.__entreusOutput
    let instance = 0
    const startedAt = performance.now()
    try {
      if (!self.crossOriginIsolated || typeof SharedArrayBuffer !== 'function') {
        throw new Error('O navegador não ativou o isolamento necessário para o Whisper local.')
      }

      post({ type: 'stage', taskId, stage: 'loading-runtime' })
      await self.__entreusRuntimeReady
      post({
        type: 'stage', taskId, stage: 'loading-runtime', cacheHit: message.runtimeCacheHit,
        wasmHeapBytes: self.Module.HEAPU8?.buffer?.byteLength ?? null,
      })

      post({ type: 'stage', taskId, stage: 'loading-model' })
      let model = await fetchVerified(assets.modelUrl, assets.modelSha256)
      post({
        type: 'stage', taskId, stage: 'loading-model', cacheHit: model.cacheHit,
        wasmHeapBytes: self.Module.HEAPU8?.buffer?.byteLength ?? null,
      })
      self.Module.FS_createDataFile('/', 'whisper.bin', new Uint8Array(model.bytes), true, true)
      model = null

      post({ type: 'stage', taskId, stage: 'initializing-model' })
      instance = self.Module.init('whisper.bin')
      if (!instance) throw new Error('O modelo Whisper Tiny não pôde ser inicializado.')

      post({
        type: 'stage', taskId, stage: 'transcribing',
        wasmHeapBytes: self.Module.HEAPU8?.buffer?.byteLength ?? null,
      })
      const pcm = new Float32Array(message.pcm, 0, message.sampleCount)
      let resolveInference
      const inferenceFinished = new Promise((resolve) => { resolveInference = resolve })
      output.onLine = (line) => {
        if (/whisper_print_timings:\s+total time/.test(line)) resolveInference()
      }
      const result = self.Module.full_default(instance, pcm, message.language, message.threads, false)
      if (result) throw new Error(`O Whisper encerrou com código ${result}.`)

      let timer
      try {
        await Promise.race([
          inferenceFinished,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('A transcrição excedeu o limite de tempo.')), 600_000)
          }),
        ])
      } finally {
        clearTimeout(timer)
        output.onLine = null
      }

      const rawOutput = output.lines.join('\n')
      post({
        type: 'result', taskId, segments: parseSegments(rawOutput),
        elapsedMs: performance.now() - startedAt,
        wasmHeapBytes: self.Module.HEAPU8?.buffer?.byteLength ?? null,
        rawOutput,
      })
    } catch (error) {
      post({ type: 'error', taskId, message: readableError(error) })
    } finally {
      post({
        type: 'stage', taskId, stage: 'cleaning-up',
        wasmHeapBytes: self.Module?.HEAPU8?.buffer?.byteLength ?? null,
      })
      try { if (instance) self.Module.free(instance) } catch {}
      try { self.Module?.FS_unlink('/whisper.bin') } catch {}
      setTimeout(() => self.close(), 0)
    }
  }

  self.onmessage = (event) => {
    if (event.data?.type !== 'start') return
    void transcribe(event.data)
  }
})()
