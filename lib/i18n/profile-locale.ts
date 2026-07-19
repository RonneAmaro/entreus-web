import { isLocale, type Locale } from './config'

export function normalizeCountryCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

export function buildLocaleProfileUpdate(interfaceLocale: Locale, countryCode?: string | null) {
  return {
    interface_locale: interfaceLocale,
    ...(countryCode !== undefined ? { country_code: normalizeCountryCode(countryCode) } : {}),
    updated_at: new Date().toISOString(),
  }
}

export function isLocaleProfileInput(value: unknown): value is {
  interfaceLocale: Locale
  countryCode?: string | null
} {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (!isLocale(input.interfaceLocale)) return false
  return input.countryCode === undefined ||
    input.countryCode === null ||
    (typeof input.countryCode === 'string' && /^[A-Za-z]{2}$/.test(input.countryCode.trim()))
}

