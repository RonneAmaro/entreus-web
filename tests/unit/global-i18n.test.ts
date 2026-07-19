import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  localeOptions,
  localeFromAcceptLanguage,
  normalizeLocale,
  persistLocaleSelection,
  persistLocaleLocally,
  resolveLocalePreference,
  shouldApplyResolvedLocale,
  translate,
} from '../../lib/i18n'
import { countryOptions, suggestedLocaleForCountry } from '../../lib/i18n/countries'
import { detectContentLocale } from '../../lib/i18n/content-language'
import {
  buildLocaleProfileUpdate,
  isLocaleProfileInput,
  normalizeCountryCode,
} from '../../lib/i18n/profile-locale'
import { localizeNavigationItems } from '../../lib/i18n/navigation'
import { HUB_ITEMS } from '../../lib/navigation/navigation-items'

describe('global interface internationalization', () => {
  it('supports the initial locales and falls back safely to Brazilian Portuguese', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN'])
    expect(localeOptions.map(({ code }) => code)).toEqual(SUPPORTED_LOCALES)
    expect(DEFAULT_LOCALE).toBe('pt-BR')
    expect(normalizeLocale('pt')).toBe('pt-BR')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('es-MX')).toBe('es')
    expect(normalizeLocale('fr-CA')).toBe('fr')
    expect(normalizeLocale('id-ID')).toBe('id')
    expect(normalizeLocale('ko-KR')).toBe('ko')
    expect(normalizeLocale('ja-JP')).toBe('ja')
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN')
    expect(normalizeLocale('zh-TW')).toBe('zh-CN')
    expect(normalizeLocale('de-DE')).toBe('pt-BR')
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,es;q=0.8')).toBe('es')
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9')).toBe('pt-BR')
  })

  it('provides translated priority surfaces for all eight locale catalogs', () => {
    const expectedPrompts = {
      'pt-BR': 'O que você quer compartilhar hoje?',
      en: 'What would you like to share today?',
      es: '¿Qué quieres compartir hoy?',
      fr: 'Que souhaitez-vous partager aujourd’hui ?',
      id: 'Apa yang ingin Anda bagikan hari ini?',
      ko: '오늘 무엇을 공유하고 싶으신가요?',
      ja: '今日は何を共有しますか？',
      'zh-CN': '今天想分享些什么？',
    } as const

    for (const locale of SUPPORTED_LOCALES) {
      expect(translate(locale, 'composer.placeholder')).toBe(expectedPrompts[locale])
      for (const key of [
        'common.loading',
        'nav.home',
        'hub.searchLabel',
        'feed.communitiesTitle',
        'post.actions.comment',
        'post.menu.label',
        'post.comments.label',
        'lab.openLab',
        'meet.create',
        'settings.title',
        'auth.login.title',
        'auth.signup.title',
        'loading.opening',
      ] as const) {
        expect(translate(locale, key)).not.toBe('')
      }
    }
  })

  it('defines every priority key directly in each new locale catalog', () => {
    const source = readFileSync('lib/i18n/catalogs/pt-BR.ts', 'utf8')
    const allKeys = [...source.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1])
    const prefixes = [
      'common.', 'language.', 'country.', 'auth.', 'nav.', 'hub.', 'feed.', 'composer.',
      'post.', 'communities.', 'lab.', 'meet.', 'settings.', 'loading.', 'translate.',
    ]
    const priorityKeys = allKeys.filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))

    for (const locale of ['fr', 'id', 'ko', 'ja', 'zh-CN']) {
      const catalog = readFileSync(`lib/i18n/catalogs/${locale}.ts`, 'utf8')
      const directKeys = new Set([...catalog.matchAll(/'([^']+)':/g)].map((match) => match[1]))
      expect(priorityKeys.filter((key) => !directKeys.has(key)), locale).toEqual([])
    }
  })

  it('translates stable typed keys in English and Spanish with interpolation', () => {
    expect(translate('en', 'auth.login.title')).toBe('Sign in')
    expect(translate('es', 'settings.languageTitle')).toBe('Idioma de la plataforma')
    expect(translate('es', 'loading.opening', { title: 'EntreUS Meet' }))
      .toBe('Abriendo EntreUS Meet…')
  })

  it('contains the priority Feed, composer, post, community, and Lab keys in all catalogs', () => {
    const expectations = [
      ['composer.placeholder', 'What would you like to share today?', '¿Qué quieres compartir hoy?'],
      ['composer.publish', 'Publish', 'Publicar'],
      ['communities.general', 'General', 'General'],
      ['feed.communitiesTitle', 'Communities', 'Comunidades'],
      ['feed.labButton', 'Open Lab', 'Abrir laboratorio'],
      ['post.comments.empty', 'Be the first person to comment.', 'Sé la primera persona en comentar.'],
      ['post.menu.label', 'Post options', 'Opciones de la publicación'],
      ['lab.openLab', 'Open Lab', 'Abrir laboratorio'],
    ] as const

    for (const [key, english, spanish] of expectations) {
      expect(translate('en', key)).toBe(english)
      expect(translate('es', key)).toBe(spanish)
      expect(translate('pt-BR', key)).not.toMatch(/^⟦|^$/)
    }
  })

  it('does not leave the reported Portuguese hardcodes in priority rendering surfaces', () => {
    const composer = readFileSync('app/components/PostComposer.tsx', 'utf8')
    const feedComponent = readFileSync('app/feed/page.tsx', 'utf8').split('function FeedContent()')[1]
    const postCard = readFileSync('app/components/PostCard.tsx', 'utf8')
    const surfaces = `${composer}\n${feedComponent}\n${postCard}`

    for (const hardcoded of [
      'O que voce quer compartilhar hoje?',
      '>Publicar<',
      '>Comunidades<',
      'Geral mostra apenas posts seguros.',
      '>Abrir laboratório<',
      '>Publicação restrita<',
    ]) {
      expect(surfaces).not.toContain(hardcoded)
    }
    expect(composer).toContain("t('composer.placeholder')")
    expect(feedComponent).toContain("t('feed.communitiesTitle')")
    expect(postCard).toContain("t('post.restrictedTitle')")
  })

  it('localizes the Hub while preserving the EntreUS brand', () => {
    const english = localizeNavigationItems(HUB_ITEMS, 'en')
    const spanish = localizeNavigationItems(HUB_ITEMS, 'es')
    expect(english.find(({ id }) => id === 'messages')?.title).toBe('Messages')
    expect(spanish.find(({ id }) => id === 'messages')?.title).toBe('Mensajes')
    expect(spanish.find(({ id }) => id === 'lab')?.title).toBe('EntreUS Lab')
    for (const [locale, title] of [
      ['fr', 'Accueil'],
      ['id', 'Beranda'],
      ['ko', '홈'],
      ['ja', 'ホーム'],
      ['zh-CN', '首页'],
    ] as const) {
      const localized = localizeNavigationItems(HUB_ITEMS, locale)
      expect(localized.find(({ id }) => id === 'feed')?.title).toBe(title)
      expect(localized.find(({ id }) => id === 'feed')?.description)
        .not.toBe(HUB_ITEMS.find(({ id }) => id === 'feed')?.description)
    }
  })

  it('provides a complete ISO country selector and non-binding locale suggestions', () => {
    expect(countryOptions('pt-BR').length).toBeGreaterThanOrEqual(240)
    expect(suggestedLocaleForCountry('BR')).toBe('pt-BR')
    expect(suggestedLocaleForCountry('US')).toBe('en')
    expect(suggestedLocaleForCountry('MX')).toBe('es')
    expect(suggestedLocaleForCountry('ID')).toBe('id')
    expect(suggestedLocaleForCountry('KR')).toBe('ko')
    expect(suggestedLocaleForCountry('JP')).toBe('ja')
    expect(suggestedLocaleForCountry('CN')).toBe('zh-CN')
  })

  it('validates profile preference inputs and normalizes country codes', () => {
    expect(isLocaleProfileInput({ interfaceLocale: 'es', countryCode: 'br' })).toBe(true)
    for (const locale of SUPPORTED_LOCALES) {
      expect(isLocaleProfileInput({ interfaceLocale: locale })).toBe(true)
    }
    expect(isLocaleProfileInput({ interfaceLocale: 'de-DE' })).toBe(false)
    expect(normalizeCountryCode('br')).toBe('BR')
    expect(buildLocaleProfileUpdate('en', 'us')).toMatchObject({
      interface_locale: 'en',
      country_code: 'US',
    })
  })

  it('detects only sufficiently confident content language', () => {
    expect(detectContentLocale('Esta é uma publicação que você pode ler com calma.')).toBe('pt-BR')
    expect(detectContentLocale('This is the post that you can read in the app.')).toBe('en')
    expect(detectContentLocale('Esta es la publicación que puedes leer en la aplicación.')).toBe('es')
    expect(detectContentLocale('Hello')).toBeNull()
  })

  it('resolves locale on the server and hydrates the client with the same value', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8')
    const provider = readFileSync('app/components/LanguageProvider.tsx', 'utf8')
    expect(layout).toContain("cookies()")
    expect(layout).toContain("headers()")
    expect(layout).toContain('<html lang={locale}')
    expect(layout).toContain('<LanguageProvider initialLocale={locale}>')
    expect(provider).toContain('LOCALE_COOKIE')
    expect(provider).toContain("select('interface_locale')")
    expect(provider).not.toContain("useState<Locale>('pt-BR')")
  })

  it('uses explicit choice, profile, cookie, browser, and pt-BR in that order', () => {
    expect(resolveLocalePreference({
      explicitLocale: 'es',
      profileLocale: 'en',
      cookieLocale: 'pt-BR',
      acceptLanguage: 'pt-BR',
      authenticated: true,
    })).toBe('es')
    expect(resolveLocalePreference({
      profileLocale: 'en',
      cookieLocale: 'es',
      acceptLanguage: 'pt-BR',
      authenticated: true,
    })).toBe('en')
    expect(resolveLocalePreference({
      profileLocale: 'en',
      cookieLocale: 'es',
      acceptLanguage: 'en-US',
      authenticated: false,
    })).toBe('es')
    expect(resolveLocalePreference({
      acceptLanguage: 'es-MX,es;q=0.9',
      authenticated: false,
    })).toBe('es')
    expect(resolveLocalePreference({ authenticated: false })).toBe('pt-BR')
  })

  it('invalidates an old profile resolution after an explicit locale change', () => {
    expect(shouldApplyResolvedLocale(0, 0)).toBe(true)
    expect(shouldApplyResolvedLocale(0, 1)).toBe(false)
  })

  it('refreshes Server Components only after authenticated persistence succeeds', async () => {
    const calls: string[] = []
    const saved = await persistLocaleSelection({
      locale: 'en',
      accessToken: 'token',
      request: async ({ locale, accessToken }) => {
        calls.push(`persist:${locale}:${accessToken}`)
        return { synced: true }
      },
      refresh: () => calls.push('refresh'),
    })

    expect(saved).toMatchObject({ ok: true, locale: 'en', synced: true })
    expect(calls).toEqual(['persist:en:token', 'refresh'])
  })

  it('keeps the local locale and refreshes when authenticated synchronization fails', async () => {
    const calls: string[] = []
    const saved = await persistLocaleSelection({
      locale: 'es',
      accessToken: 'token',
      request: async () => {
        calls.push('persist')
        return { synced: false, reason: 'remote_unavailable' }
      },
      refresh: () => calls.push('refresh'),
    })

    expect(saved).toMatchObject({
      ok: true,
      locale: 'es',
      synced: false,
      reason: 'remote_unavailable',
    })
    expect(calls).toEqual(['persist', 'refresh'])
  })

  it('updates localStorage, cookie, and html lang together', () => {
    const calls: string[] = []
    expect(persistLocaleLocally('ja', {
      setStorage: (locale) => calls.push(`storage:${locale}`),
      setCookie: (locale) => calls.push(`cookie:${locale}`),
      setDocumentLanguage: (locale) => calls.push(`html:${locale}`),
    })).toBe(true)
    expect(calls).toEqual(['storage:ja', 'cookie:ja', 'html:ja'])
  })

  it('reports a local persistence failure without pretending it was saved', () => {
    expect(persistLocaleLocally('fr', {
      setStorage: () => {
        throw new Error('storage blocked')
      },
      setCookie: () => undefined,
      setDocumentLanguage: () => undefined,
    })).toBe(false)
  })

  it('keeps provider translations reactive without rolling back a remote sync failure', () => {
    const provider = readFileSync('app/components/LanguageProvider.tsx', 'utf8')
    const settings = readFileSync('app/settings/page.tsx', 'utf8')
    expect(provider).toContain('setLanguageState(locale)')
    expect(provider).toContain('translate(language, key, values)')
    expect(provider).toContain('[language, setLanguage]')
    expect(provider).toContain('markLocaleSyncPending(nextLanguage, !saved.synced)')
    expect(provider).not.toContain('applyLocale(previous)')
    expect(provider).toContain('persistLocaleSelection({')
    expect(settings).toContain('value={language}')
    expect(settings).toContain('onChange={(event) => void saveLocale(')
    expect(settings).not.toContain('selectedLocale')
  })

  it('persists only the authenticated profile through a private route', () => {
    const route = readFileSync('app/api/profile/locale/route.ts', 'utf8')
    expect(route).toContain('PRIVATE_NO_STORE_HEADERS')
    expect(route).toContain('client.auth.getUser()')
    expect(route).toContain(".eq('id', user.id)")
    expect(route).not.toContain('service_role')
    expect(route).toContain("'invalid_locale'")
    expect(route).toContain("'not_authenticated'")
    expect(route).toContain("reason: 'migration_missing'")
    expect(route).toContain('synced: true')
    expect(route).toContain('synced: false')
  })

  it('keeps translation behind authentication, RLS, limits, and resource IDs', () => {
    const route = readFileSync('app/api/translate/route.ts', 'utf8')
    const button = readFileSync('app/components/TranslatePostButton.tsx', 'utf8')
    expect(route).toContain('parseBearerAuthorization')
    expect(route).toContain('client.auth.getUser()')
    expect(route).toContain(".from(table)")
    expect(route).toContain('isRateLimited(user.id)')
    expect(route).toContain('AbortSignal.timeout(8_000)')
    expect(route).not.toContain("body?.text")
    expect(button).toContain("contentType: 'post'")
    expect(button).toContain('contentId: postId')
    expect(button).toContain('inFlightRef.current')
    expect(button).toContain('sessionTranslationCache')
    expect(button).toContain("t('translate.original')")
  })

  it('defines an incremental migration with constrained defaults and no new RLS bypass', () => {
    const migration = readFileSync('supabase/migrations/20260719_add_profile_locale_and_country.sql', 'utf8')
    const compatibilityMigration = readFileSync('supabase/migrations/20260719_expand_profile_locale_constraint.sql', 'utf8')
    expect(migration).toContain('add column if not exists interface_locale')
    expect(migration).toContain("default 'pt-BR'")
    expect(migration).toContain("interface_locale in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN')")
    expect(migration).toContain("country_code ~ '^[A-Z]{2}$'")
    expect(migration).not.toMatch(/disable row level security|service_role|grant all/i)
    expect(compatibilityMigration).toContain('information_schema.columns')
    expect(compatibilityMigration).toContain("interface_locale in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN')")
    expect(compatibilityMigration).not.toMatch(/disable row level security|service_role|grant all/i)
  })
})
