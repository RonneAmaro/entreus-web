export type ProfileContentMode = 'general' | 'adult' | 'mixed'

export const PROFILE_CONTENT_MODES: ProfileContentMode[] = ['general', 'adult', 'mixed']

export const DEFAULT_PROFILE_CONTENT_MODE: ProfileContentMode = 'general'

export type ProfileContentModeOption = {
  value: ProfileContentMode
  label: string
  description: string
}

export const PROFILE_CONTENT_MODE_OPTIONS: ProfileContentModeOption[] = [
  {
    value: 'general',
    label: 'Perfil geral',
    description: 'Para rotina, comunidades, conteudos comuns e publicacoes premium nao adultas.',
  },
  {
    value: 'adult',
    label: 'Perfil adulto',
    description: 'Para criadores cuja atividade principal inclui conteudo 18+. Sua identidade publica ainda deve seguir as regras de seguranca do EntreUS.',
  },
  {
    value: 'mixed',
    label: 'Perfil misto',
    description: 'Para compartilhar rotina e bastidores publicamente, mantendo conteudo adulto em uma area exclusiva e protegida.',
  },
]

export const PROFILE_CONTENT_MODE_ADULT_NOTICE =
  'Avatar, capa, nome e biografia aparecem na area publica e devem ser adequados para visualizacao geral. Nudez explicita e conteudo sexual devem ser publicados somente em posts classificados como 18+.'

export const PROFILE_CONTENT_MODE_NO_AUTO_ADULT_NOTICE =
  'Selecionar este modo nao ativa automaticamente o acesso 18+ e nao transforma todas as publicacoes em conteudo adulto.'

export function isProfileContentMode(value: unknown): value is ProfileContentMode {
  return value === 'general' || value === 'adult' || value === 'mixed'
}

export function getSafeProfileContentMode(value: unknown): ProfileContentMode {
  return isProfileContentMode(value) ? value : DEFAULT_PROFILE_CONTENT_MODE
}

export function profileContentModeRequiresConfirmation(value: unknown) {
  return value === 'adult' || value === 'mixed'
}

export function canSaveProfileContentMode(value: unknown, confirmed: boolean) {
  return isProfileContentMode(value) && (!profileContentModeRequiresConfirmation(value) || confirmed)
}

export function getComposerProfileContentModeGuidance(value: unknown) {
  const mode = getSafeProfileContentMode(value)

  if (mode === 'adult') {
    return 'Seu perfil esta configurado como adulto. O Composer continua seguro por padrao; marque 18+ somente quando esta publicacao exigir.'
  }

  if (mode === 'mixed') {
    return 'Seu perfil e misto. Confirme se esta publicacao e publica ou 18+ antes de publicar.'
  }

  return null
}

export function buildProfileContentModeUpdate(value: unknown) {
  const mode = getSafeProfileContentMode(value)

  return {
    profile_content_mode: mode,
    updated_at: new Date().toISOString(),
  }
}
