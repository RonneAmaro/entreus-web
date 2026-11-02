import { analyzeRhythm, type RhythmOptions, type RhythmResult } from './rhythm-analysis'

export type RhythmWorkerRequest = { id: number; channels: ArrayBuffer[]; sampleRate: number; options: RhythmOptions }
export type RhythmWorkerResponse = { id: number; result: RhythmResult } | { id: number; error: string }

// This module runs in a dedicated worker, not in the window.
const scope = self as unknown as { onmessage: ((event: MessageEvent<RhythmWorkerRequest>) => void) | null; postMessage: (message: RhythmWorkerResponse) => void }
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ id: data.id, result: analyzeRhythm(data.channels.map((buffer) => new Float32Array(buffer)), data.sampleRate, data.options) }) }
  catch (error) { scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Falha na análise.' }) }
}
