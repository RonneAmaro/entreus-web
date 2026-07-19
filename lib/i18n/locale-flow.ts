import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromAcceptLanguage,
  type Locale,
} from './config'

type ResolveLocalePreferenceInput = {
  explicitLocale?: unknown
  profileLocale?: unknown
  cookieLocale?: unknown
  acceptLanguage?: string | null
  authenticated: boolean
}

export function resolveLocalePreference({
  explicitLocale,
  profileLocale,
  cookieLocale,
  acceptLanguage,
  authenticated,
}: ResolveLocalePreferenceInput): Locale {
  if (isLocale(explicitLocale)) return explicitLocale
  if (authenticated && isLocale(profileLocale)) return profileLocale
  if (isLocale(cookieLocale)) return cookieLocale
  return localeFromAcceptLanguage(acceptLanguage) || DEFAULT_LOCALE
}

export function shouldApplyResolvedLocale(
  resolutionStartedAtRevision: number,
  currentRevision: number,
) {
  return resolutionStartedAtRevision === currentRevision
}

type PersistLocaleSelectionInput = {
  locale: Locale
  countryCode?: string | null
  accessToken?: string | null
  request: (input: {
    locale: Locale
    countryCode?: string | null
    accessToken: string
  }) => Promise<LocaleRemoteSyncResult>
  refresh: () => void
}

export type LocaleSyncReason =
  | 'local_only'
  | 'migration_missing'
  | 'not_authenticated'
  | 'remote_unavailable'
  | 'unexpected_error'

export type LocaleRemoteSyncResult =
  | { synced: true }
  | { synced: false; reason: LocaleSyncReason }

export type LocaleSaveResult =
  | { ok: true; locale: Locale; synced: boolean; reason?: LocaleSyncReason }
  | { ok: false; locale: Locale; synced: false; reason: 'invalid_locale' | 'local_persistence_failed' }

type LocaleLocalPersistenceTarget = {
  setStorage: (locale: Locale) => void
  setCookie: (locale: Locale) => void
  setDocumentLanguage: (locale: Locale) => void
}

export function persistLocaleLocally(locale: Locale, target: LocaleLocalPersistenceTarget) {
  try {
    target.setStorage(locale)
    target.setCookie(locale)
    target.setDocumentLanguage(locale)
    return true
  } catch {
    return false
  }
}

export async function persistLocaleSelection({
  locale,
  countryCode,
  accessToken,
  request,
  refresh,
}: PersistLocaleSelectionInput) {
  if (accessToken) {
    const remote = await request({ locale, countryCode, accessToken })
    refresh()
    return {
      ok: true,
      locale,
      synced: remote.synced,
      ...(!remote.synced ? { reason: remote.reason } : {}),
    } satisfies LocaleSaveResult
  }

  refresh()
  return { ok: true, locale, synced: false, reason: 'local_only' } satisfies LocaleSaveResult
}
