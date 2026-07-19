export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'pt-BR'
export const LOCALE_COOKIE = 'entreus-locale'
export const LEGACY_LOCALE_STORAGE_KEY = 'entreus-language'

export const localeOptions: ReadonlyArray<{
  code: Locale
  nativeName: string
}> = [
  { code: 'pt-BR', nativeName: 'Português (Brasil)' },
  { code: 'en', nativeName: 'English' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'id', nativeName: 'Bahasa Indonesia' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'zh-CN', nativeName: '简体中文' },
]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value
  if (typeof value !== 'string') return DEFAULT_LOCALE

  const normalized = value.trim().toLowerCase()
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es'
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr'
  if (normalized === 'id' || normalized.startsWith('id-')) return 'id'
  if (normalized === 'ko' || normalized.startsWith('ko-')) return 'ko'
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja'
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN'
  return DEFAULT_LOCALE
}

export function localeFromAcceptLanguage(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE
  for (const entry of value.split(',')) {
    const candidate = entry.split(';')[0]?.trim()
    if (!candidate) continue
    const locale = normalizeLocale(candidate)
    if (locale !== DEFAULT_LOCALE || candidate.toLowerCase().startsWith('pt')) return locale
  }
  return DEFAULT_LOCALE
}
