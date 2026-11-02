import { describe, expect, it } from 'vitest'
import { mp4DownloadName } from '@/lib/video-editor/project-name'

describe('nome do MP4 exportado', () => {
  it('usa o título do projeto sem tocar no nome da mídia de origem', () => {
    expect(mp4DownloadName('Minha viagem')).toBe('Minha viagem.mp4')
  })

  it('remove caracteres inválidos e evita nome vazio ou reservado', () => {
    expect(mp4DownloadName('  viagem: praia / 2026.  ')).toBe('viagem- praia - 2026.mp4')
    expect(mp4DownloadName('  ')).toBe('entreus-video.mp4')
    expect(mp4DownloadName('CON')).toBe('EntreUS-CON.mp4')
  })
})
