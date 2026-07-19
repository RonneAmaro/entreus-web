import 'server-only'

import { cookies, headers } from 'next/headers'
import { isLocale, localeFromAcceptLanguage, type Locale } from './config'

export async function getRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const cookieLocale = cookieStore.get('entreus-locale')?.value
  return isLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage(headerStore.get('accept-language'))
}

