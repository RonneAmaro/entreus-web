import { en } from './catalogs/en'
import { es } from './catalogs/es'
import { fr } from './catalogs/fr'
import { id } from './catalogs/id'
import { ja } from './catalogs/ja'
import { ko } from './catalogs/ko'
import { ptBR, type TranslationKey } from './catalogs/pt-BR'
import { zhCN } from './catalogs/zh-CN'
import { DEFAULT_LOCALE, type Locale } from './config'

export * from './config'
export * from './locale-flow'
export type { TranslationKey } from './catalogs/pt-BR'

export const catalogs: Readonly<Record<Locale, Readonly<Record<TranslationKey, string>>>> = {
  'pt-BR': ptBR,
  en,
  es,
  fr,
  id,
  ko,
  ja,
  'zh-CN': zhCN,
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: Record<string, string | number>,
) {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key]
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  )
}

export function hasTranslationKey(key: string): key is TranslationKey {
  return key in ptBR
}

export function formatDateTime(locale: Locale, value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value))
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatCurrency(locale: Locale, value: number, currency: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
}
