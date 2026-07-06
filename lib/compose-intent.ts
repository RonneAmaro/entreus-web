export const COMPOSE_ACTION_EVENT = 'entreus:compose-action'

export const composeIntents = ['text', 'photo', 'video'] as const

export type ComposeIntent = (typeof composeIntents)[number]

export function resolveComposeIntent(value: string | string[] | null | undefined): ComposeIntent | null {
  const rawValue = Array.isArray(value) ? value[0] : value

  if (!rawValue) return null

  const normalizedValue = rawValue.trim().toLowerCase()

  if (normalizedValue === '1' || normalizedValue === 'text' || normalizedValue === 'post' || normalizedValue === 'publish') {
    return 'text'
  }

  if (normalizedValue === 'photo' || normalizedValue === 'foto' || normalizedValue === 'image' || normalizedValue === 'imagem') {
    return 'photo'
  }

  if (normalizedValue === 'video' || normalizedValue === 'vídeo') {
    return 'video'
  }

  return null
}

export function getComposeHref(intent: ComposeIntent = 'text') {
  const value = intent === 'text' ? '1' : intent

  return `/feed?compose=${value}`
}
