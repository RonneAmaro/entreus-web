'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { translations as legacyTranslations } from '@/lib/translations'
import {
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_COOKIE,
  hasTranslationKey,
  isLocale,
  localeOptions,
  normalizeLocale,
  persistLocaleLocally,
  persistLocaleSelection,
  shouldApplyResolvedLocale,
  translate,
  type Locale,
  type LocaleRemoteSyncResult,
  type LocaleSaveResult,
} from '@/lib/i18n'

type LanguageContextValue = {
  language: Locale
  languages: typeof localeOptions
  setLanguage: (language: Locale, countryCode?: string | null) => Promise<LocaleSaveResult>
  t: (key: string, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const missingKeys = new Set<string>()
const LOCALE_SYNC_PENDING_KEY = 'entreus-locale-sync-pending'

function getNestedValue(dictionary: unknown, key: string) {
  let current = dictionary
  for (const part of key.split('.')) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return null
    }
  }
  return typeof current === 'string' ? current : null
}

function writeLocalePreference(locale: Locale) {
  return persistLocaleLocally(locale, {
    setStorage: (nextLocale) => window.localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, nextLocale),
    setCookie: (nextLocale) => {
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(nextLocale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    },
    setDocumentLanguage: (nextLocale) => {
      document.documentElement.lang = nextLocale
    },
  })
}

function markLocaleSyncPending(locale: Locale, pending: boolean) {
  if (pending) window.localStorage.setItem(LOCALE_SYNC_PENDING_KEY, locale)
  else window.localStorage.removeItem(LOCALE_SYNC_PENDING_KEY)
}

export function LanguageProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  initialLocale: Locale
}) {
  const router = useRouter()
  const [language, setLanguageState] = useState<Locale>(initialLocale)
  const languageRef = useRef<Locale>(initialLocale)
  const changeRevisionRef = useRef(0)

  const applyLocale = useCallback((locale: Locale) => {
    if (!writeLocalePreference(locale)) return false
    languageRef.current = locale
    setLanguageState(locale)
    return true
  }, [])

  useEffect(() => {
    document.documentElement.dataset.localeReady = 'true'
    return () => {
      delete document.documentElement.dataset.localeReady
    }
  }, [])

  useEffect(() => {
    const legacy = window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
    if (!document.cookie.includes(`${LOCALE_COOKIE}=`) && legacy) {
      window.queueMicrotask(() => applyLocale(normalizeLocale(legacy)))
    } else {
      writeLocalePreference(language)
    }
  }, [applyLocale, language])

  useEffect(() => {
    let active = true
    const resolutionStartedAtRevision = changeRevisionRef.current
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session?.user.id) return
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('interface_locale')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (
        !active ||
        error ||
        !isLocale(profile?.interface_locale) ||
        !shouldApplyResolvedLocale(resolutionStartedAtRevision, changeRevisionRef.current)
      ) return
      const pendingLocale = window.localStorage.getItem(LOCALE_SYNC_PENDING_KEY)
      if (pendingLocale === languageRef.current) return
      const localeChanged = languageRef.current !== profile.interface_locale
      const applied = applyLocale(profile.interface_locale)
      if (localeChanged && applied) router.refresh()
    })
    return () => {
      active = false
    }
  }, [applyLocale, router])

  const setLanguage = useCallback(async (
    nextLanguage: Locale,
    countryCode?: string | null,
  ): Promise<LocaleSaveResult> => {
    if (!isLocale(nextLanguage)) {
      return { ok: false, locale: languageRef.current, synced: false, reason: 'invalid_locale' }
    }
    ++changeRevisionRef.current
    try {
      if (!applyLocale(nextLanguage)) {
        return { ok: false, locale: languageRef.current, synced: false, reason: 'local_persistence_failed' }
      }
    } catch {
      return { ok: false, locale: languageRef.current, synced: false, reason: 'local_persistence_failed' }
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const saved = await persistLocaleSelection({
      locale: nextLanguage,
      countryCode,
      accessToken: session?.access_token,
      request: async ({ locale, countryCode: nextCountryCode, accessToken }): Promise<LocaleRemoteSyncResult> => {
        try {
          const response = await fetch('/api/profile/locale', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
              interfaceLocale: locale,
              ...(nextCountryCode !== undefined ? { countryCode: nextCountryCode } : {}),
            }),
          })
          const payload = await response.json().catch(() => null) as {
            ok?: boolean
            locale?: unknown
            synced?: boolean
            reason?: unknown
            error?: { code?: unknown }
          } | null
          if (payload?.ok === true && payload.locale === locale) {
            if (payload.synced === true) return { synced: true }
            if (payload.synced === false && payload.reason === 'migration_missing') {
              return { synced: false, reason: 'migration_missing' }
            }
          }
          if (response.status === 401 || payload?.error?.code === 'not_authenticated') {
            return { synced: false, reason: 'not_authenticated' }
          }
          return {
            synced: false,
            reason: response.status >= 500 ? 'remote_unavailable' : 'unexpected_error',
          }
        } catch {
          return { synced: false, reason: 'remote_unavailable' }
        }
      },
      refresh: router.refresh,
    })

    markLocaleSyncPending(nextLanguage, !saved.synced)
    return saved
  }, [applyLocale, router])

  const value = useMemo<LanguageContextValue>(() => {
    function t(key: string, values?: Record<string, string | number>) {
      if (hasTranslationKey(key)) return translate(language, key, values)

      const legacyLocale = language === 'pt-BR' ? 'pt' : 'en'
      const legacy =
        getNestedValue(legacyTranslations[legacyLocale], key) ??
        getNestedValue(legacyTranslations.pt, key)
      if (legacy) {
        return Object.entries(values ?? {}).reduce(
          (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
          legacy,
        )
      }

      if (process.env.NODE_ENV !== 'production' && !missingKeys.has(key)) {
        missingKeys.add(key)
        console.warn(`[i18n] Missing translation key: ${key}`)
      }
      return process.env.NODE_ENV === 'production' ? '' : `⟦${key}⟧`
    }

    return { language, languages: localeOptions, setLanguage, t }
  }, [language, setLanguage])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage precisa ser usado dentro de LanguageProvider.')
  return context
}
