import type { AutoReelsMedia, AutoReelsOptions, AutoReelsProposal } from './auto-reels'
import { generateRhythmicAutoReels, validateSynchronizedAutoReels, type RhythmicAutoReelsRequest } from './auto-reels-rhythm'
import { audioFileHash, verifyLibraryFile, type LocalLibraryAsset } from './audio-library'
import { loadMusicAsset } from './music-storage'
import { createRhythmAnalyzer, RHYTHM_MAX_FILE_BYTES } from './rhythm-local'

export type RhythmPreparation = { token: string; result: Exclude<ReturnType<typeof generateRhythmicAutoReels>, { kind: 'error' }> }
type Context = { projectId: string; revision: string; media: AutoReelsMedia[]; music: LocalLibraryAsset }

/** Owns analysis evidence outside the mutable UI proposal. Each token is single-use. */
export function createAutoReelsRhythmSession(deps = { analyzer: createRhythmAnalyzer(), load: loadMusicAsset, hash: audioFileHash }) {
  let run = 0
  let pending: { token: string; revision: string; projectId: string; mediaIds: string[]; request: RhythmicAutoReelsRequest; digest: string } | null = null
  function cancel() { run++; pending = null; deps.analyzer.cancel() }
  async function identity(context: Context): Promise<string> {
    const { music } = context
    if (!music.file || music.category !== 'music') throw new Error('Reassocie a música antes de analisar ou confirmar.')
    if (music.file.size > RHYTHM_MAX_FILE_BYTES || music.media.size > RHYTHM_MAX_FILE_BYTES || music.duration > 60) throw new Error('Para analisar, use música de até 60 segundos e 10 MiB.')
    const stored = await deps.load(context.projectId, music.assetId)
    if (stored && stored.size > RHYTHM_MAX_FILE_BYTES) throw new Error('Para analisar, use música de até 60 segundos e 10 MiB.')
    if (!stored || !await verifyLibraryFile({ ...music, file: stored })) throw new Error('Arquivo de música ausente ou alterado. Reassocie o áudio.')
    const digest = await deps.hash(stored)
    if (digest !== await deps.hash(music.file)) throw new Error('A música local mudou. Reassocie o áudio e gere outra proposta.')
    return digest
  }
  async function prepare(context: Context, format: AutoReelsOptions['format'], totalSeconds: number, signal: AbortSignal): Promise<RhythmPreparation> {
    cancel(); const current = run
    const check = () => { if (signal.aborted || current !== run) throw new Error('Análise cancelada ou substituída.') }
    check()
    const digest = await identity(context); check()
    const analysis = await deps.analyzer.analyze(context.projectId, context.music, {}, signal); check()
    if (digest !== await identity(context)) throw new Error('A música mudou durante a análise.')
    check()
    const request: RhythmicAutoReelsRequest = { format, totalSeconds, music: { assetId: context.music.assetId, duration: context.music.duration }, analysis: structuredClone(analysis) }
    const result = generateRhythmicAutoReels(context.media, request)
    if (result.kind === 'error') throw new Error(result.message)
    const token = crypto.randomUUID()
    pending = { token, revision: context.revision, projectId: context.projectId, mediaIds: context.media.map((item) => item.id), request, digest }
    return { token, result }
  }
  async function confirm(token: string, proposal: AutoReelsProposal, context: Context): Promise<AutoReelsProposal> {
    const saved = pending
    pending = null // Consume before any await, including failed attempts.
    if (!saved || saved.token !== token || saved.revision !== context.revision || saved.projectId !== context.projectId
      || saved.request.music.assetId !== context.music.assetId || saved.request.music.duration !== context.music.duration) throw new Error('Proposta musical obsoleta. Gere outra proposta.')
    const current = run
    const media = saved.mediaIds.map((id) => context.media.find((item) => item.id === id))
    if (media.some((item) => !item)) throw new Error('Uma mídia ficou indisponível.')
    if (await identity(context) !== saved.digest || current !== run) throw new Error('A música ou a solicitação mudou. Gere outra proposta.')
    const selected = media as AutoReelsMedia[]
    const regenerated = generateRhythmicAutoReels(selected, saved.request)
    if (regenerated.kind === 'synchronized') {
      const checked = validateSynchronizedAutoReels(proposal, selected, saved.request)
      if (!checked.valid) throw new Error(checked.reason)
      return checked.proposal
    }
    if (regenerated.kind !== 'fallback' || JSON.stringify(proposal) !== JSON.stringify(regenerated.proposal)) throw new Error('A alternativa regular diverge da proposta revisada.')
    return regenerated.proposal
  }
  return { prepare, confirm, cancel }
}
