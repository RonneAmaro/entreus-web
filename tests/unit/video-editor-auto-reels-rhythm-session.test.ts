import { expect, it, vi } from 'vitest'
import { createAutoReelsRhythmSession } from '@/lib/video-editor/auto-reels-rhythm-session'
import type { LocalLibraryAsset } from '@/lib/video-editor/audio-library'

function setup(events = [1.5, 3.5]) {
  let file: File | null = new File(['music'], 'track.wav', { type: 'audio/wav' })
  const music: LocalLibraryAsset = { source: 'local', category: 'music', assetId: 'legacy', duration: 6, file,
    media: { id: 'legacy', name: file.name, type: file.type, size: file.size, lastModified: file.lastModified } }
  const context = { projectId: 'p', revision: 'r', music, media: [1, 2, 3].map((i) => ({ id: String(i), name: `${i}.png`, previewUrl: `blob:${i}` })) }
  const analyzer = { analyze: vi.fn(async () => ({ status: 'detected' as const, events })), cancel: vi.fn() }
  const session = createAutoReelsRhythmSession({ analyzer, load: async () => file, hash: async (f) => f.text() })
  const prepare = () => session.prepare(context, '9:16', 6, new AbortController().signal)
  return { session, context, prepare, analyzer, setFile: (next: File | null) => { file = next } }
}
it('confirma cópia canônica e consome o token uma única vez', async () => {
  const { session, context, prepare } = setup(); const draft = await prepare()
  const canonical = await session.confirm(draft.token, draft.result.proposal, context)
  expect(canonical).toEqual(draft.result.proposal); expect(canonical).not.toBe(draft.result.proposal)
  await expect(session.confirm(draft.token, draft.result.proposal, context)).rejects.toThrow('obsoleta')
})
it('recusa proposta adulterada e recusa tentar novamente com token consumido', async () => {
  const { session, context, prepare } = setup(); const draft = await prepare()
  draft.result.proposal.clips[0].duration = 8
  await expect(session.confirm(draft.token, draft.result.proposal, context)).rejects.toThrow('diverge')
  await expect(session.confirm(draft.token, draft.result.proposal, context)).rejects.toThrow('obsoleta')
})
it('não permite reordenar clipes adulterando apenas a proposta submetida', async () => {
  const { session, context, prepare } = setup(); const draft = await prepare()
  draft.result.proposal.clips.reverse()
  await expect(session.confirm(draft.token, draft.result.proposal, context)).rejects.toThrow()
})
it('recusa projeto ou música alterados e música removida do IndexedDB', async () => {
  for (const change of ['revision', 'duration', 'missing', 'changed'] as const) {
    const { session, context, prepare, setFile } = setup(); const draft = await prepare()
    if (change === 'revision') context.revision = 'new'
    if (change === 'duration') context.music = { ...context.music, duration: 5 }
    if (change === 'missing') setFile(null)
    if (change === 'changed') setFile(new File(['other'], 'track.wav', { type: 'audio/wav' }))
    await expect(session.confirm(draft.token, draft.result.proposal, context)).rejects.toThrow()
  }
})
it('prepara e confirma fallback explicitamente identificado', async () => {
  const { session, context, prepare } = setup([]); const draft = await prepare()
  expect(draft.result.kind).toBe('fallback')
  expect(await session.confirm(draft.token, draft.result.proposal, context)).not.toHaveProperty('synchronization')
})
it('rejeita ausência e limites antes de chamar o analisador', async () => {
  const { prepare, context, analyzer, setFile } = setup()
  setFile(null); await expect(prepare()).rejects.toThrow('ausente')
  context.music.duration = 61; await expect(prepare()).rejects.toThrow('60 segundos')
  context.music.duration = 6; context.music.media.size = 11 * 1024 * 1024
  await expect(prepare()).rejects.toThrow('10 MiB'); expect(analyzer.analyze).not.toHaveBeenCalled()
})
it('descarta resultado cancelado e resultado de análise substituída', async () => {
  const { session, context, analyzer } = setup()
  let finish!: () => void
  analyzer.analyze.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ status: 'detected', events: [1.5, 3.5] }) }))
  const controller = new AbortController()
  const old = session.prepare(context, '9:16', 6, controller.signal)
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0))
  controller.abort(); session.cancel(); finish()
  await expect(old).rejects.toThrow('cancelada')
  const fresh = await session.prepare(context, '9:16', 6, new AbortController().signal)
  expect((await session.confirm(fresh.token, fresh.result.proposal, context)).duration).toBe(6)
})
