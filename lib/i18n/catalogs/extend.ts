import { en } from './en'
import type { TranslationKey } from './pt-BR'

export function extendEnglishCatalog(overrides: Partial<Record<TranslationKey, string>>) {
  return { ...en, ...overrides } satisfies Record<TranslationKey, string>
}
